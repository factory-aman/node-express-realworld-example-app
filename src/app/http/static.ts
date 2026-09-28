import { IncomingMessage } from 'http';
import { format } from 'url';
import { send } from '@fastify/send';
import encodeUrl from 'encodeurl';
import escapeHtml from 'escape-html';
import parseUrl from 'parseurl';
import { FastifyReply, FastifyRequest } from 'fastify';
import { skipEtag } from './etag';

/*
 * Serves files the way express.static (serve-static 1.15) did when mounted
 * after the API routes: GET/HEAD only, directories without a trailing slash
 * redirect, and anything that is not a file falls through to the 404 page.
 */

/**
 * An error raised after the file was found. send had already set the file's
 * headers by then, and Express's error response kept them.
 */
export class StaticFileError extends Error {
  readonly responseHeaders: Record<string, string>;
  constructor(message: string, responseHeaders: Record<string, string>) {
    super(message);
    this.responseHeaders = responseHeaders;
  }
}

const collapseLeadingSlashes = (str: string): string => {
  let i = 0;
  while (i < str.length && str.charCodeAt(i) === 0x2f) {
    i++;
  }
  return i > 1 ? '/' + str.slice(i) : str;
};

const redirectDocument = (loc: string): string =>
  '<!DOCTYPE html>\n' +
  '<html lang="en">\n' +
  '<head>\n' +
  '<meta charset="utf-8">\n' +
  '<title>Redirecting</title>\n' +
  '</head>\n' +
  '<body>\n' +
  '<pre>Redirecting to <a href="' +
  escapeHtml(loc) +
  '">' +
  escapeHtml(loc) +
  '</a></pre>\n' +
  '</body>\n' +
  '</html>\n';

const fileHeaders = async (root: string, pathname: string): Promise<Record<string, string>> => {
  const probe = { method: 'HEAD', headers: {} } as IncomingMessage;
  const { headers, stream } = await send(probe, pathname, { root, maxAge: 0 });
  stream.resume();
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== 'content-length') {
      result[name] = String(value);
    }
  }
  return result;
};

export const staticHandler =
  (root: string) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    const originalUrl = parseUrl.original(request.raw);
    const pathname = originalUrl?.pathname || '/';

    const result = await send(request.raw, pathname, { root, maxAge: 0 });

    if (result.type === 'directory') {
      const location = { ...originalUrl, path: null, pathname: collapseLeadingSlashes(pathname + '/') };
      const loc = encodeUrl(format(location));
      const doc = redirectDocument(loc);
      result.stream.resume();
      return skipEtag(reply)
        .code(301)
        .header('Content-Type', 'text/html; charset=UTF-8')
        .header('Content-Length', Buffer.byteLength(doc))
        .header('Content-Security-Policy', "default-src 'none'")
        .header('X-Content-Type-Options', 'nosniff')
        .header('Location', loc)
        .send(doc);
    }

    if (result.type === 'error') {
      result.stream.resume();
      const { statusCode } = result;
      // serve-static fell through on client errors raised before a file was
      // found; precondition and range failures (and 5xx) went to the app's
      // error handler.
      if (statusCode < 500 && statusCode !== 412 && statusCode !== 416) {
        reply.callNotFound();
        return reply;
      }
      const headers = statusCode >= 500 ? {} : await fileHeaders(root, pathname);
      if (statusCode === 416 && result.headers['Content-Range']) {
        headers['Content-Range'] = String(result.headers['Content-Range']);
      }
      throw new StaticFileError(result.metadata.error.message, headers);
    }

    return skipEtag(reply).code(result.statusCode).headers(result.headers).send(result.stream);
  };
