import { IncomingMessage } from 'http';
import { Readable } from 'stream';
import * as zlib from 'zlib';
import * as contentType from 'content-type';
import * as qs from 'qs';
import getRawBody from 'raw-body';
import typeis from 'type-is';
import { FastifyRequest } from 'fastify';

/*
 * Request body parsing with the semantics of body-parser 1.20.2 as the API
 * used it (`json()` followed by `urlencoded({ extended: true })`): every
 * request gets `{}` by default, bodies are read for every HTTP method, and
 * errors carry the same messages. Adapted from body-parser (MIT).
 */

const LIMIT = 100 * 1024;
const PARAMETER_LIMIT = 1000;

class BodyParserError extends Error {
  status: number;
  type?: string;
  constructor(status: number, message: string, type?: string) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

const getCharset = (req: IncomingMessage): string | undefined => {
  try {
    return (contentType.parse(req).parameters.charset || '').toLowerCase();
  } catch (e) {
    return undefined;
  }
};

const contentStream = (req: IncomingMessage): { stream: Readable; length?: string } => {
  const encoding = (req.headers['content-encoding'] || 'identity').toLowerCase();

  switch (encoding) {
    case 'deflate': {
      const stream = zlib.createInflate();
      req.pipe(stream);
      return { stream };
    }
    case 'gzip': {
      const stream = zlib.createGunzip();
      req.pipe(stream);
      return { stream };
    }
    case 'identity':
      return { stream: req, length: req.headers['content-length'] };
    default:
      throw new BodyParserError(
        415,
        `unsupported content encoding "${encoding}"`,
        'encoding.unsupported',
      );
  }
};

// Waits until the whole request has been received, so the response is only
// sent once the client has finished uploading (as body-parser does).
const dump = (req: IncomingMessage): Promise<void> =>
  new Promise((resolve) => {
    if (req.complete || req.readableEnded || req.destroyed) {
      resolve();
      return;
    }
    const done = () => resolve();
    req.once('end', done);
    req.once('close', done);
    req.resume();
  });

const read = async (
  req: IncomingMessage,
  encoding: string,
  parse: (body: string) => unknown,
): Promise<unknown> => {
  const { stream, length } = contentStream(req);

  let body: string;
  try {
    body = await getRawBody(stream, { encoding, limit: LIMIT, length });
  } catch (error) {
    const err = error as Error & { type?: string };
    const message =
      err.type === 'encoding.unsupported'
        ? `unsupported charset "${encoding.toUpperCase()}"`
        : err.message;
    if (stream !== req) {
      req.unpipe();
      stream.destroy();
    }
    await dump(req);
    throw new BodyParserError(400, message, err.type);
  }

  return parse(body);
};

/* JSON */

const FIRST_CHAR_REGEXP = /^[\x20\x09\x0a\x0d]*([^\x20\x09\x0a\x0d])/; // eslint-disable-line no-control-regex
const JSON_SYNTAX_CHAR = '#';
const JSON_SYNTAX_REGEXP = /#+/g;

const firstChar = (str: string): string | undefined => {
  const match = FIRST_CHAR_REGEXP.exec(str);
  return match ? match[1] : undefined;
};

const normalizeJsonSyntaxError = (error: Error, obj: { message: string; stack?: string }) => {
  for (const key of Object.getOwnPropertyNames(error)) {
    if (key !== 'stack' && key !== 'message') {
      delete (error as unknown as Record<string, unknown>)[key];
    }
  }
  error.stack = obj.stack?.replace(error.message, obj.message);
  error.message = obj.message;
  return error;
};

const createStrictSyntaxError = (str: string, char: string | undefined): Error => {
  const index = char === undefined ? -1 : str.indexOf(char);
  let partial = '';

  if (index !== -1) {
    partial = str.substring(0, index) + JSON_SYNTAX_CHAR;
    for (let i = index + 1; i < str.length; i++) {
      partial += JSON_SYNTAX_CHAR;
    }
  }

  try {
    JSON.parse(partial);
    throw new SyntaxError('strict violation');
  } catch (e) {
    const error = e as Error;
    return normalizeJsonSyntaxError(error, {
      message: error.message.replace(JSON_SYNTAX_REGEXP, (placeholder) =>
        str.substring(index, index + placeholder.length),
      ),
      stack: error.stack,
    });
  }
};

const parseJson = (body: string): unknown => {
  if (body.length === 0) {
    return {};
  }

  const first = firstChar(body);
  if (first !== '{' && first !== '[') {
    throw createStrictSyntaxError(body, first);
  }

  try {
    return JSON.parse(body);
  } catch (e) {
    const error = e as Error;
    throw normalizeJsonSyntaxError(error, { message: error.message, stack: error.stack });
  }
};

/* urlencoded (extended) */

const parameterCount = (body: string, limit: number): number | undefined => {
  let count = 0;
  let index = 0;

  while ((index = body.indexOf('&', index)) !== -1) {
    count++;
    index++;
    if (count === limit) {
      return undefined;
    }
  }

  return count;
};

const parseUrlencoded = (body: string): unknown => {
  if (!body.length) {
    return {};
  }

  const paramCount = parameterCount(body, PARAMETER_LIMIT);
  if (paramCount === undefined) {
    throw new BodyParserError(413, 'too many parameters', 'parameters.too.many');
  }

  return qs.parse(body, {
    allowPrototypes: true,
    arrayLimit: Math.max(100, paramCount),
    depth: Infinity,
    parameterLimit: PARAMETER_LIMIT,
  });
};

const parseBody = async (req: IncomingMessage): Promise<unknown> => {
  if (!typeis.hasBody(req)) {
    return {};
  }

  if (typeis(req, ['application/json'])) {
    const charset = getCharset(req) || 'utf-8';
    if (charset.slice(0, 4) !== 'utf-') {
      throw new BodyParserError(415, `unsupported charset "${charset.toUpperCase()}"`);
    }
    return read(req, charset, parseJson);
  }

  if (typeis(req, ['application/x-www-form-urlencoded'])) {
    const charset = getCharset(req) || 'utf-8';
    if (charset !== 'utf-8') {
      throw new BodyParserError(415, `unsupported charset "${charset.toUpperCase()}"`);
    }
    return read(req, charset, parseUrlencoded);
  }

  return {};
};

/**
 * preValidation hook: Fastify is configured to treat every method as bodyless,
 * so the raw request stream is still unread here.
 */
export const bodyParserHook = async (request: FastifyRequest): Promise<void> => {
  request.body = await parseBody(request.raw);
};
