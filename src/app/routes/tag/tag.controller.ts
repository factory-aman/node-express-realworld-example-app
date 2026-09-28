import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import auth from '../auth/auth';
import getTags from './tag.service';

const tagsController = async (fastify: FastifyInstance) => {
  /**
   * Get top 10 popular tags
   * @auth optional
   * @route {GET} /api/tags
   * @returns tags list of tag names
   */
  fastify.get(
    '/tags',
    { preHandler: auth.optional },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const tags = await getTags(req.auth?.user?.id);
      return reply.send({ tags });
    },
  );
};

export default tagsController;
