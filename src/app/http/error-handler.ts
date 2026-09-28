import * as contentType from 'content-type';
import { FastifyReply, FastifyRequest } from 'fastify';
import HttpException from '../models/http-exception.model';
import { RouteNotMatchedError, sendNotFoundPage } from './routing';
import { StaticFileError } from './static';

// Express's res.json() only set application/json when no Content-Type was set
// yet, and res.send() then added the utf-8 charset to whatever type was set.
const withUtf8 = (type: string): string => {
  const parsed = contentType.parse(type);
  parsed.parameters.charset = 'utf-8';
  return contentType.format(parsed);
};

// res.json() serialized strings too, so error messages go out as JSON strings
// rather than text/plain.
const sendJson = (reply: FastifyReply, value: unknown, presetType?: string) =>
  reply
    .type(presetType ? withUtf8(presetType) : 'application/json; charset=utf-8')
    .send(JSON.stringify(value));

export const errorHandler = (
  err: Error | HttpException,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (err instanceof RouteNotMatchedError) {
    return sendNotFoundPage(request, reply);
  }

  let presetType: string | undefined;
  if (err instanceof StaticFileError) {
    for (const [name, value] of Object.entries(err.responseHeaders)) {
      if (name.toLowerCase() === 'content-type') {
        presetType = value;
      } else {
        reply.header(name, value);
      }
    }
  }

  if (err && err.name === 'UnauthorizedError') {
    return reply.status(401).send({
      status: 'error',
      message: 'missing authorization credentials',
    });
  } else if (err && (err as HttpException).errorCode) {
    return sendJson(reply.status((err as HttpException).errorCode), err.message, presetType);
  }

  return sendJson(reply.status(500), err?.message, presetType);
};
