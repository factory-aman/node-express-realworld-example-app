import { IncomingMessage } from 'http';
import encodeUrl from 'encodeurl';
import escapeHtml from 'escape-html';
import parseUrl from 'parseurl';
import { FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import { skipEtag } from './etag';

// Express mounted the API with Router().use('/api', …). The mount matched
// the parsed path (so it also consumed a slash right after '/api'), then cut
// that many characters from the raw URL and the API router parsed the rest
// again: '/api//tags' reached '/tags', while '/api\tags#x' became '//tags'.
const API_MOUNT = /^\/api\/?(?=\/|$)/i;

const parse = (url: string) => parseUrl({ url } as IncomingMessage);

// Scheme and host of an absolute-form request target, kept by Express when
// it trimmed a mount path.
const getProtohost = (url: string): string => {
  if (url.length === 0 || url[0] === '/') {
    return '';
  }
  const searchIndex = url.indexOf('?');
  const pathLength = searchIndex !== -1 ? searchIndex : url.length;
  const fqdnIndex = url.slice(0, pathLength).indexOf('://');
  return fqdnIndex !== -1 ? url.substring(0, url.indexOf('/', 3 + fqdnIndex)) : '';
};

/** The path Express's routers matched for a raw request URL, and its query. */
export const expressRoute = (rawUrl: string): { pathname: string; search: string } => {
  const outer = parse(rawUrl);
  const pathname = outer?.pathname || '/';
  const search = outer?.search || '';

  const mount = API_MOUNT.exec(pathname);
  if (!mount) {
    return { pathname, search };
  }

  const protohost = getProtohost(rawUrl);
  let rest = protohost + rawUrl.slice(protohost.length + mount[0].length);
  if (!protohost && rest[0] !== '/') {
    rest = '/' + rest;
  }
  return { pathname: '/api' + (parse(rest)?.pathname || '/'), search };
};

/*
 * Express matched routes against the raw (still percent-encoded) path and
 * decoded each route parameter once. find-my-way decodes the path before
 * matching, so every '%' is escaped here to keep it matching the raw path;
 * decodeParamsHook then decodes parameters the way Express did.
 */
export const rewriteUrl = (req: IncomingMessage): string => {
  const { pathname, search } = expressRoute(req.url || '/');
  return pathname.replace(/%/g, '%25') + search;
};

/** Raised when find-my-way matched a route that Express's router would not. */
export class RouteNotMatchedError extends Error {}

export const originalPathname = (request: FastifyRequest): string =>
  parseUrl.original(request.raw)?.pathname || '';

const decodeParam = (val: string): string => {
  if (typeof val !== 'string' || val.length === 0) {
    return val;
  }

  try {
    return decodeURIComponent(val);
  } catch (err) {
    if (err instanceof URIError) {
      err.message = `Failed to decode param '${val}'`;
    }
    throw err;
  }
};

export const decodeParamsHook = async (request: FastifyRequest): Promise<void> => {
  const params = request.params as Record<string, string> | undefined;
  if (!params) {
    return;
  }

  const keys = Object.keys(params).filter((key) => key !== '*');
  // Express parameters matched one or more characters; find-my-way also
  // matches an empty segment ('/api/articles//comments').
  if (keys.some((key) => params[key] === '')) {
    throw new RouteNotMatchedError();
  }

  for (const key of keys) {
    params[key] = decodeParam(params[key]);
  }
};

/*
 * Express decoded the parameters of every route whose path matched, whatever
 * its method, so a malformed escape in a parameter segment was a decode error
 * (500) rather than a 404 even when no route handled the method.
 */
const routePatterns: RegExp[] = [];

const toExpressRegExp = (url: string): RegExp => {
  const source = url
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? '([^/]+?)' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('\\/');
  return new RegExp(`^${source}\\/?$`, 'i');
};

export const collectRoute = (routeOptions: RouteOptions): void => {
  if (routeOptions.url.includes(':')) {
    routePatterns.push(toExpressRegExp(routeOptions.url));
  }
};

const createHtmlDocument = (message: string): string => {
  const body = escapeHtml(message).replace(/\n/g, '<br>').replace(/\x20{2}/g, ' &nbsp;');

  return (
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<title>Error</title>\n' +
    '</head>\n' +
    '<body>\n' +
    '<pre>' +
    body +
    '</pre>\n' +
    '</body>\n' +
    '</html>\n'
  );
};

/** The page Express's finalhandler sent when no route handled a request. */
export const sendNotFoundPage = (request: FastifyRequest, reply: FastifyReply) =>
  skipEtag(reply)
    .code(404)
    .header('Content-Security-Policy', "default-src 'none'")
    .header('X-Content-Type-Options', 'nosniff')
    .type('text/html; charset=utf-8')
    .send(createHtmlDocument(`Cannot ${request.method} ${encodeUrl(originalPathname(request))}`));

export const notFoundHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const { pathname } = expressRoute(request.originalUrl || '/');

  for (const pattern of routePatterns) {
    const match = pattern.exec(pathname);
    if (match) {
      match.slice(1).forEach(decodeParam);
    }
  }

  return sendNotFoundPage(request, reply);
};
