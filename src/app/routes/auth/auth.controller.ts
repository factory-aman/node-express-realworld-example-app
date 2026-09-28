import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import auth from './auth';
import { createUser, getCurrentUser, login, updateUser } from './auth.service';
import { RegisterInput } from './register-input.model';

type UserBodyRequest = FastifyRequest<{ Body: { user: RegisterInput } }>;

const authController = async (fastify: FastifyInstance) => {
  /**
   * Create an user
   * @auth none
   * @route {POST} /users
   * @bodyparam user User
   * @returns user User
   */
  fastify.post('/users', async (req: UserBodyRequest, reply: FastifyReply) => {
    const user = await createUser({ ...req.body.user, demo: false });
    return reply.status(201).send({ user });
  });

  /**
   * Login
   * @auth none
   * @route {POST} /users/login
   * @bodyparam user User
   * @returns user User
   */
  fastify.post('/users/login', async (req: UserBodyRequest, reply: FastifyReply) => {
    const user = await login(req.body.user);
    return reply.send({ user });
  });

  /**
   * Get current user
   * @auth required
   * @route {GET} /user
   * @returns user User
   */
  fastify.get(
    '/user',
    { preHandler: auth.required },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = await getCurrentUser(req.auth?.user?.id);
      return reply.send({ user });
    },
  );

  /**
   * Update user
   * @auth required
   * @route {PUT} /user
   * @bodyparam user User
   * @returns user User
   */
  fastify.put(
    '/user',
    { preHandler: auth.required },
    async (req: UserBodyRequest, reply: FastifyReply) => {
      const user = await updateUser(req.body.user, req.auth?.user?.id);
      return reply.send({ user });
    },
  );
};

export default authController;
