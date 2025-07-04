import { createSpyglassesWorker, SpyglassesWorkerConfig } from './spyglasses-worker';

// Environment variables interface
export interface Env {
  SPYGLASSES_API_KEY?: string;
  SPYGLASSES_DEBUG?: string;
  SPYGLASSES_COLLECTOR_ENDPOINT?: string;
  SPYGLASSES_CACHE_TTL?: string;
  ORIGIN_URL?: string;
  [key: string]: string | undefined;
}

// Default configuration
const defaultConfig: SpyglassesWorkerConfig = {
  debug: false,
  excludePaths: [
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/_next/',
    '/api/',
    '/admin/',
    '/wp-admin/',
    '/.well-known/',
  ],
  // Default to blocking AI model trainers but allowing AI assistants
  platformType: 'cloudflare-worker',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Get configuration from environment
    const config: SpyglassesWorkerConfig = {
      ...defaultConfig,
      apiKey: env.SPYGLASSES_API_KEY,
      debug: env.SPYGLASSES_DEBUG === 'true',
      collectEndpoint: env.SPYGLASSES_COLLECTOR_ENDPOINT,
      patternsEndpoint: env.SPYGLASSES_PATTERNS_ENDPOINT,
      cacheTime: env.SPYGLASSES_CACHE_TTL ? parseInt(env.SPYGLASSES_CACHE_TTL, 10) : undefined,
    };

    // Create Spyglasses Worker instance
    const spyglassesWorker = createSpyglassesWorker(config);

    // Process the request
    return await spyglassesWorker.handleRequest(request, env, ctx);
  },
};

// Export types and utilities for advanced users
export { createSpyglassesWorker, type SpyglassesWorkerConfig } from './spyglasses-worker'; 