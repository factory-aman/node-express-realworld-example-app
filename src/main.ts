import * as qs from 'qs';
import fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import routes from './app/routes/routes';
import { bodyParserHook } from './app/http/body-parser';
import { etagHook } from './app/http/etag';
import { errorHandler } from './app/http/error-handler';
import {
  collectRoute,
  decodeParamsHook,
  notFoundHandler,
  originalPathname,
  rewriteUrl,
} from './app/http/routing';
import { staticHandler } from './app/http/static';

const app = fastify({
  logger: false,
  exposeHeadRoutes: false,
  rewriteUrl,
  routerOptions: {
    caseSensitive: false,
    ignoreTrailingSlash: true,
    // Slugs are derived from article titles and can be long.
    maxParamLength: 65535,
    querystringParser: (str: string) => qs.parse(str, { allowPrototypes: true }),
  },
});

/**
 * App Configuration
 */

// Malformed HTTP requests get Node's plain 400 response, as they did under
// Express, instead of Fastify's JSON one.
app.server.removeAllListeners('clientError');

// Request bodies are read by bodyParserHook for every method, as body-parser
// did, so Fastify's own content-type parsing is switched off.
for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
  app.addHttpMethod(method, { hasBody: false, overrideExisting: true });
}

app.addHook('onRoute', (routeOptions) => {
  // Express answered HEAD with the GET handler, headers included.
  if (routeOptions.method === 'GET') {
    routeOptions.method = ['GET', 'HEAD'];
  }
  collectRoute(routeOptions);
});

app.register(cors, {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  strictPreflight: false,
});
app.addHook('preValidation', bodyParserHook);
app.addHook('preValidation', decodeParamsHook);
app.addHook('onSend', etagHook);

app.register(routes, { prefix: '/api' });

// Serves images
app.get('/*', staticHandler(__dirname + '/assets'));

app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
  // ignoreTrailingSlash also maps '//' here; Express only matched '/'.
  if (originalPathname(req) !== '/') {
    return reply.callNotFound();
  }
  return reply.send({ status: 'API is running on /api' });
});

app.setNotFoundHandler(notFoundHandler);
app.setErrorHandler(errorHandler);

/**
 * Server activation
 */

const PORT = process.env.PORT || 3000;

// Listening through Node directly keeps Express's app.listen(PORT) binding:
// all interfaces, IPv6 when available and IPv4 otherwise. Fastify's listen()
// always picks a host.
app.ready().then(
  () => {
    app.server.listen(PORT, () => {
      console.info(`server up on port ${PORT}`);
    });
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
