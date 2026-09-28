import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import auth from '../auth/auth';
import {
  addComment,
  createArticle,
  deleteArticle,
  deleteComment,
  favoriteArticle,
  getArticle,
  getArticles,
  getCommentsByArticle,
  getFeed,
  unfavoriteArticle,
  updateArticle,
} from './article.service';

type ArticlesQuery = Record<string, unknown> & { offset?: string; limit?: string };
type SlugRequest = FastifyRequest<{ Params: { slug: string } }>;
type ArticleBodyRequest = FastifyRequest<{
  Params: { slug: string };
  Body: { article: Record<string, unknown> };
}>;

const articlesController = async (fastify: FastifyInstance) => {
  /**
   * Get paginated articles
   * @auth optional
   * @route {GET} /articles
   * @queryparam offset number of articles dismissed from the first one
   * @queryparam limit number of articles returned
   * @queryparam tag
   * @queryparam author
   * @queryparam favorited
   * @returns articles: list of articles
   */
  fastify.get(
    '/articles',
    { preHandler: auth.optional },
    async (req: FastifyRequest<{ Querystring: ArticlesQuery }>, reply: FastifyReply) => {
      const result = await getArticles(req.query, req.auth?.user?.id);
      return reply.send(result);
    },
  );

  /**
   * Get paginated feed articles
   * @auth required
   * @route {GET} /articles/feed
   * @returns articles list of articles
   */
  fastify.get(
    '/articles/feed',
    { preHandler: auth.required },
    async (req: FastifyRequest<{ Querystring: ArticlesQuery }>, reply: FastifyReply) => {
      const result = await getFeed(
        Number(req.query.offset),
        Number(req.query.limit),
        req.auth?.user?.id,
      );
      return reply.send(result);
    },
  );

  /**
   * Create article
   * @route {POST} /articles
   * @bodyparam  title
   * @bodyparam  description
   * @bodyparam  body
   * @bodyparam  tagList list of tags
   * @returns article created article
   */
  fastify.post(
    '/articles',
    { preHandler: auth.required },
    async (req: ArticleBodyRequest, reply: FastifyReply) => {
      const article = await createArticle(req.body.article, req.auth?.user?.id);
      return reply.status(201).send({ article });
    },
  );

  /**
   * Get unique article
   * @auth optional
   * @route {GET} /article/:slug
   * @param slug slug of the article (based on the title)
   * @returns article
   */
  fastify.get(
    '/articles/:slug',
    { preHandler: auth.optional },
    async (req: SlugRequest, reply: FastifyReply) => {
      const article = await getArticle(req.params.slug, req.auth?.user?.id);
      return reply.send({ article });
    },
  );

  /**
   * Update article
   * @auth required
   * @route {PUT} /articles/:slug
   * @param slug slug of the article (based on the title)
   * @bodyparam title new title
   * @bodyparam description new description
   * @bodyparam body new content
   * @returns article updated article
   */
  fastify.put(
    '/articles/:slug',
    { preHandler: auth.required },
    async (req: ArticleBodyRequest, reply: FastifyReply) => {
      const article = await updateArticle(req.body.article, req.params.slug, req.auth?.user?.id);
      return reply.send({ article });
    },
  );

  /**
   * Delete article
   * @auth required
   * @route {DELETE} /article/:id
   * @param slug slug of the article
   */
  fastify.delete(
    '/articles/:slug',
    { preHandler: auth.required },
    async (req: SlugRequest, reply: FastifyReply) => {
      await deleteArticle(req.params.slug, req.auth?.user!.id);
      // Express's res.sendStatus(204) sent (and hashed for the ETag) this body.
      return reply.status(204).send('No Content');
    },
  );

  /**
   * Get comments from an article
   * @auth optional
   * @route {GET} /articles/:slug/comments
   * @param slug slug of the article (based on the title)
   * @returns comments list of comments
   */
  fastify.get(
    '/articles/:slug/comments',
    { preHandler: auth.optional },
    async (req: SlugRequest, reply: FastifyReply) => {
      const comments = await getCommentsByArticle(req.params.slug, req.auth?.user?.id);
      return reply.send({ comments });
    },
  );

  /**
   * Add comment to article
   * @auth required
   * @route {POST} /articles/:slug/comments
   * @param slug slug of the article (based on the title)
   * @bodyparam body content of the comment
   * @returns comment created comment
   */
  fastify.post(
    '/articles/:slug/comments',
    { preHandler: auth.required },
    async (
      req: FastifyRequest<{ Params: { slug: string }; Body: { comment: { body: string } } }>,
      reply: FastifyReply,
    ) => {
      const comment = await addComment(req.body.comment.body, req.params.slug, req.auth?.user?.id);
      return reply.send({ comment });
    },
  );

  /**
   * Delete comment
   * @auth required
   * @route {DELETE} /articles/:slug/comments/:id
   * @param slug slug of the article (based on the title)
   * @param id id of the comment
   */
  fastify.delete(
    '/articles/:slug/comments/:id',
    { preHandler: auth.required },
    async (req: FastifyRequest<{ Params: { slug: string; id: string } }>, reply: FastifyReply) => {
      await deleteComment(Number(req.params.id), req.auth?.user?.id);
      return reply.status(200).send({});
    },
  );

  /**
   * Favorite article
   * @auth required
   * @route {POST} /articles/:slug/favorite
   * @param slug slug of the article (based on the title)
   * @returns article favorited article
   */
  fastify.post(
    '/articles/:slug/favorite',
    { preHandler: auth.required },
    async (req: SlugRequest, reply: FastifyReply) => {
      const article = await favoriteArticle(req.params.slug, req.auth?.user?.id);
      return reply.send({ article });
    },
  );

  /**
   * Unfavorite article
   * @auth required
   * @route {DELETE} /articles/:slug/favorite
   * @param slug slug of the article (based on the title)
   * @returns article unfavorited article
   */
  fastify.delete(
    '/articles/:slug/favorite',
    { preHandler: auth.required },
    async (req: SlugRequest, reply: FastifyReply) => {
      const article = await unfavoriteArticle(req.params.slug, req.auth?.user?.id);
      return reply.send({ article });
    },
  );
};

export default articlesController;
