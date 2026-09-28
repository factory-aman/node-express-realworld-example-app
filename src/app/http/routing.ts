import { IncomingMessage } from 'http';
import encodeUrl from 'encodeurl';
import escapeHtml from 'escape-html';
import parseUrl from 'parseurl';
import { FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import { skipEtag } from './etag';

// Characters that made parseurl fall back to url.parse, which drops a
// '#fragment' from both the path and the query.
const PARSEURL_FALLBACK = /[\x09\x0a\x0c\x0d\x20#\u00a0\ufeff]/; // eslint-disable-line no-control-regex

// Express mounted the API with Router().use('/api', …), whose prefix match
// also consumed a slash right after '/api', so '/api//tags' reached '/tags'.
const API_MOUNT_EXTRA_SLASH = /^\/api\/(?=\/)/i;

export const expressRoutingPath = (pathname: string): string =>
  API_MOUNT_EXTRA_SLASH.test(pathname) ? pathname.slice(0, 4) + pathname.slice(5) : pathname;

/*
 * Express matched routes against the raw (still percent-encoded) path and
 * decoded each route parameter once. find-my-way decodes the path before
 * matching, so every '%' is escaped here to keep it matching the raw path;
 * decodeParamsHook then decodes parameters the way Express did.
 */
export const rewriteUrl = (req: IncomingMessage): string => {
  let url = req.url || '/';
  if (PARSEURL_FALLBACK.test(url)) {
    const parsed = parseUrl(req);
    url = (parsed?.pathname || '/') + (parsed?.search || '');
  }

  const queryIndex = url.indexOf('?');
  const query = queryIndex === -1 ? '' : url.slice(queryIndex);
  const pathname = expressRoutingPath(queryIndex === -1 ? url : url.slice(0, queryIndex));

  return pathname.replace(/%/g, '%25') + query;
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
  const pathname = expressRoutingPath(originalPathname(request));

  for (const pattern of routePatterns) {
    const match = pattern.exec(pathname);
    if (match) {
      match.slice(1).forEach(decodeParam);
    }
  }

  return sendNotFoundPage(request, reply);
};
