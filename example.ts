/**
 * Example Spyglasses Cloudflare Worker implementations
 * 
 * These examples show different ways to use the Spyglasses Worker
 * for various use cases.
 * 
 * Note: With Workers Routes, you no longer need to configure origin URLs.
 * Cloudflare Routes handle which requests reach your Worker.
 */

// Example 1: Simple setup (recommended for most users)
import worker from '@spyglasses/cloudflare-worker';

export default worker;

// Example 2: Custom configuration
/*
import { createSpyglassesWorker, SpyglassesWorkerConfig } from '@spyglasses/cloudflare-worker';

const config: SpyglassesWorkerConfig = {
  debug: false,
  excludePaths: [
    // Static assets
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    
    // Application paths
    '/api/',
    '/admin/',
    '/_next/',
    
    // File extensions (regex)
    /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i,
  ],
  platformType: 'webflow-site',
  blockingTimeout: 2000,
  awaitBlockedLogging: false,
};

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const spyglassesWorker = createSpyglassesWorker({
      ...config,
      apiKey: env.SPYGLASSES_API_KEY,
      debug: env.SPYGLASSES_DEBUG === 'true',
    });

    return await spyglassesWorker.handleRequest(request, env, ctx);
  },
};
*/

// Example 3: E-commerce site with custom rules
/*
import { createSpyglassesWorker, SpyglassesWorkerConfig } from '@spyglasses/cloudflare-worker';

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    // Different configs for different paths
    const url = new URL(request.url);
    
    let config: SpyglassesWorkerConfig;
    
    if (url.pathname.startsWith('/products/')) {
      // Stricter protection for product pages
      config = {
        excludePaths: ['/cart', '/checkout', '/account'],
        platformType: 'ecommerce-products',
        blockingTimeout: 1000,
      };
    } else if (url.pathname.startsWith('/api/')) {
      // API protection
      config = {
        excludePaths: ['/api/health', '/api/status'],
        platformType: 'api-routes',
        blockingTimeout: 500,
      };
    } else {
      // Default protection
      config = {
        excludePaths: ['/admin/', '/_next/', '/static/'],
        platformType: 'general-site',
      };
    }

    const spyglassesWorker = createSpyglassesWorker({
      ...config,
      apiKey: env.SPYGLASSES_API_KEY,
      debug: env.SPYGLASSES_DEBUG === 'true',
    });

    return await spyglassesWorker.handleRequest(request, env, ctx);
  },
};
*/

// Example 4: Advanced logging and monitoring
/*
import { createSpyglassesWorker, SpyglassesWorkerConfig } from '@spyglasses/cloudflare-worker';

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    
    const config: SpyglassesWorkerConfig = {
      debug: env.ENVIRONMENT === 'staging',
      excludePaths: [
        '/health',
        '/metrics',
        '/favicon.ico',
        /\.(css|js|png|jpg|gif|svg)$/i,
      ],
      platformType: 'monitored-app',
      blockingTimeout: 1500,
      awaitBlockedLogging: true, // Wait for logging in critical apps
    };

    const spyglassesWorker = createSpyglassesWorker({
      ...config,
      apiKey: env.SPYGLASSES_API_KEY,
    });

    try {
      const response = await spyglassesWorker.handleRequest(request, env, ctx);
      
      // Custom metrics
      const processingTime = Date.now() - startTime;
      if (processingTime > 100) {
        console.log(`Slow request detected: ${processingTime}ms for ${request.url}`);
      }
      
      return response;
    } catch (error) {
      console.error('Spyglasses Worker error:', error);
      // Fallback: forward directly to origin
      return fetch(request);
    }
  },
};
*/ 