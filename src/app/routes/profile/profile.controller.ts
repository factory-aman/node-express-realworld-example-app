import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import auth from '../auth/auth';
import { followUser, getProfile, unfollowUser } from './profile.service';

type ProfileRequest = FastifyRequest<{ Params: { username: string } }>;

const profileController = async (fastify: FastifyInstance) => {
  /**
   * Get profile
   * @auth optional
   * @route {GET} /profiles/:username
   * @param username string
   * @returns profile
   */
  fastify.get(
    '/profiles/:username',
    { preHandler: auth.optional },
    async (req: ProfileRequest, reply: FastifyReply) => {
      const profile = await getProfile(req.params.username, req.auth?.user?.id);
      return reply.send({ profile });
    },
  );

  /**
   * Follow user
   * @auth required
   * @route {POST} /profiles/:username/follow
   * @param username string
   * @returns profile
   */
  fastify.post(
    '/profiles/:username/follow',
    { preHandler: auth.required },
    async (req: ProfileRequest, reply: FastifyReply) => {
      const profile = await followUser(req.params?.username, req.auth?.user?.id);
      return reply.send({ profile });
    },
  );

  /**
   * Unfollow user
   * @auth required
   * @route {DELETE} /profiles/:username/follow
   * @param username string
   * @returns profiles
   */
  fastify.delete(
    '/profiles/:username/follow',
    { preHandler: auth.required },
    async (req: ProfileRequest, reply: FastifyReply) => {
      const profile = await unfollowUser(req.params.username, req.auth?.user?.id);
      return reply.send({ profile });
    },
  );
};

export default profileController;
