import etag from 'etag';
import fresh from 'fresh';
import { FastifyReply, FastifyRequest } from 'fastify';

/*
 * Reproduces what Express's res.send() did for every JSON/text response:
 * a weak ETag over the body bytes, conditional GET (304) handling, and
 * stripping of body headers for 204/304.
 */

// Replies written the way Express wrote them with res.end() (404 page,
// directory redirects, CORS preflight) never had an ETag.
const withoutEtag = new WeakSet<FastifyReply>();

export const skipEtag = (reply: FastifyReply): FastifyReply => {
  withoutEtag.add(reply);
  return reply;
};

const isFresh = (request: FastifyRequest, reply: FastifyReply): boolean => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false;
  }

  const status = reply.statusCode;
  if ((status >= 200 && status < 300) || status === 304) {
    return fresh(request.headers, {
      etag: reply.getHeader('etag') as string | undefined,
      'last-modified': reply.getHeader('last-modified') as string | undefined,
    });
  }

  return false;
};

export const etagHook = async (
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
): Promise<unknown> => {
  if (withoutEtag.has(reply) || (typeof payload !== 'string' && !Buffer.isBuffer(payload))) {
    return payload;
  }

  if (!reply.hasHeader('etag')) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    reply.header('ETag', etag(body, { weak: true }));
  }

  if (isFresh(request, reply)) {
    reply.code(304);
  }

  if (reply.statusCode === 204 || reply.statusCode === 304) {
    reply.removeHeader('content-type');
    reply.removeHeader('content-length');
    reply.removeHeader('transfer-encoding');
    return null;
  }

  return payload;
};
