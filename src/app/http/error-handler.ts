import { FastifyReply, FastifyRequest } from 'fastify';
import HttpException from '../models/http-exception.model';

// Express's res.json() serialized strings too, so error messages go out as
// JSON strings rather than text/plain.
const sendJson = (reply: FastifyReply, value: unknown) =>
  reply.type('application/json; charset=utf-8').send(JSON.stringify(value));

export const errorHandler = (
  err: Error | HttpException,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (err && err.name === 'UnauthorizedError') {
    return reply.status(401).send({
      status: 'error',
      message: 'missing authorization credentials',
    });
  } else if (err && (err as HttpException).errorCode) {
    return sendJson(reply.status((err as HttpException).errorCode), err.message);
  }

  return sendJson(reply.status(500), err?.message);
};
