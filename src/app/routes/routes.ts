import { FastifyInstance } from 'fastify';
import tagsController from './tag/tag.controller';
import articlesController from './article/article.controller';
import authController from './auth/auth.controller';
import profileController from './profile/profile.controller';

const routes = async (fastify: FastifyInstance) => {
  await fastify.register(tagsController);
  await fastify.register(articlesController);
  await fastify.register(profileController);
  await fastify.register(authController);
};

export default routes;
