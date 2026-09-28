import * as jwt from 'jsonwebtoken';
import { FastifyRequest } from 'fastify';

const getTokenFromHeaders = (req: FastifyRequest): string | null => {
  if (
    (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Token') ||
    (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer')
  ) {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

export class UnauthorizedError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'UnauthorizedError';
    this.code = code;
  }
}

const secret = process.env.JWT_SECRET || 'superSecret';

// Same verification flow as express-jwt 8, which delegated to jsonwebtoken.
const authenticate =
  (credentialsRequired: boolean) =>
  async (req: FastifyRequest): Promise<void> => {
    const token = getTokenFromHeaders(req);

    if (!token) {
      if (credentialsRequired) {
        throw new UnauthorizedError('credentials_required', 'No authorization token was found');
      }
      return;
    }

    let decodedToken: jwt.Jwt | null;
    try {
      decodedToken = jwt.decode(token, { complete: true });
      jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch (err) {
      throw new UnauthorizedError('invalid_token', (err as Error).message);
    }

    req.auth = decodedToken?.payload as FastifyRequest['auth'];
  };

const auth = {
  required: authenticate(true),
  optional: authenticate(false),
};

export default auth;
