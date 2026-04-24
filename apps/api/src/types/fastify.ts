import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    workspaceId: string;
  }
}

export {};
