import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      user?: {
        id?: number;
      };
    } | null;
  }
}
