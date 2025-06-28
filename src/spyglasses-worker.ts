/// <reference types="@cloudflare/workers-types" />

import { Spyglasses } from '@spyglasses/sdk';

export interface SpyglassesWorkerConfig {
  apiKey?: string;
  debug?: boolean;
  collectEndpoint?: string;
  cacheTime?: number;
  excludePaths?: (string | RegExp)[];
  platformType?: string;
  originUrl?: string;
  blockingTimeout?: number;
  awaitBlockedLogging?: boolean;
}

export interface SpyglassesWorkerEnv {
  ORIGIN_URL?: string;
  [key: string]: string | undefined;
}

export class SpyglassesWorker {
  private spyglasses: Spyglasses;
  private config: SpyglassesWorkerConfig;

  constructor(config: SpyglassesWorkerConfig) {
    this.config = config;
    this.spyglasses = new Spyglasses({
      apiKey: config.apiKey,
      debug: config.debug || false,
      collectEndpoint: config.collectEndpoint,
      platformType: config.platformType || 'cloudflare-worker',
      autoSync: true,
    });
  }

  /**
   * Handle the incoming request
   */
  async handleRequest(
    request: Request,
    env: SpyglassesWorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    
    if (this.config.debug) {
      console.log(`Spyglasses: Processing request to ${url.pathname}`);
    }

    // Check if path should be excluded
    if (this.shouldExcludePath(url.pathname)) {
      if (this.config.debug) {
        console.log(`Spyglasses: Excluding path: ${url.pathname}`);
      }
      return this.forwardToOrigin(request, env);
    }

    // Get user-agent and referrer
    const userAgent = request.headers.get('user-agent') || '';
    const referrer = request.headers.get('referer') || request.headers.get('referrer') || '';
    
    if (this.config.debug) {
      console.log(`Spyglasses: User-Agent: ${userAgent.substring(0, 100)}${userAgent.length > 100 ? '...' : ''}`);
      if (referrer) {
        console.log(`Spyglasses: Referrer: ${referrer}`);
      }
    }

    // Detect if it's a bot or AI referrer
    const detectionResult = this.spyglasses.detect(userAgent, referrer);

    if (this.config.debug && detectionResult.sourceType !== 'none') {
      console.log(`Spyglasses: Detection result:`, {
        sourceType: detectionResult.sourceType,
        isBot: detectionResult.isBot,
        shouldBlock: detectionResult.shouldBlock,
        matchedPattern: detectionResult.matchedPattern,
        info: detectionResult.info
      });
    }

    // Handle detection results
    if (detectionResult.sourceType !== 'none' && this.spyglasses.hasApiKey()) {
      if (detectionResult.shouldBlock) {
        if (this.config.debug) {
          console.log(`Spyglasses: Blocking request from ${detectionResult.sourceType}: ${detectionResult.matchedPattern}`);
        }

        // Log the blocked request with timeout protection
        const logBlockedRequest = async () => {
          try {
            const timeoutMs = this.config.blockingTimeout || 2000;
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Logging timeout')), timeoutMs)
            );

            await Promise.race([
              this.spyglasses.logRequest(detectionResult, {
                url: request.url,
                method: request.method,
                path: url.pathname,
                query: url.search,
                userAgent,
                referrer,
                ip: this.getClientIP(request),
                headers: this.getRequestHeaders(request),
                responseStatus: 403
              }),
              timeoutPromise
            ]);

            if (this.config.debug) {
              console.log(`Spyglasses: ✅ Successfully logged blocked ${detectionResult.sourceType} visit`);
            }
          } catch (error: unknown) {
            if (this.config.debug) {
              console.error(`Spyglasses: ❌ Error logging blocked ${detectionResult.sourceType} visit:`, error);
            }
          }
        };

        // Await logging if configured to do so
        if (this.config.awaitBlockedLogging !== false) {
          await logBlockedRequest();
        } else {
          // Fire and forget
          ctx.waitUntil(logBlockedRequest());
        }

        // Return 403 Forbidden
        return new Response('Access Denied', {
          status: 403,
          headers: {
            'Content-Type': 'text/plain',
            'X-Spyglasses-Blocked': 'true',
            'X-Spyglasses-Reason': detectionResult.sourceType,
          }
        });
      }

      if (this.config.debug) {
        console.log(`Spyglasses: Logging ${detectionResult.sourceType} visit: ${detectionResult.matchedPattern}`);
      }

      // For non-blocked requests, use fire-and-forget logging
      const logPromise = this.spyglasses.logRequest(detectionResult, {
        url: request.url,
        method: request.method,
        path: url.pathname,
        query: url.search,
        userAgent,
        referrer,
        ip: this.getClientIP(request),
        headers: this.getRequestHeaders(request),
        responseStatus: 200
      });

      // Use waitUntil to ensure the promise completes
      ctx.waitUntil(
        logPromise
          .then(() => {
            if (this.config.debug) {
              console.log(`Spyglasses: ✅ Successfully logged ${detectionResult.sourceType} visit`);
            }
          })
          .catch((error: unknown) => {
            if (this.config.debug) {
              console.error(`Spyglasses: ❌ Error logging ${detectionResult.sourceType} visit:`, error);
            }
          })
      );
    }

    // Forward to origin
    return this.forwardToOrigin(request, env);
  }

  /**
   * Check if a path should be excluded from processing
   */
  private shouldExcludePath(path: string): boolean {
    if (!this.config.excludePaths) {
      return false;
    }

    return this.config.excludePaths.some(pattern => {
      if (typeof pattern === 'string') {
        return path.includes(pattern);
      } else if (pattern instanceof RegExp) {
        return pattern.test(path);
      }
      return false;
    });
  }

  /**
   * Forward the request to the origin server
   */
  private async forwardToOrigin(request: Request, env: SpyglassesWorkerEnv): Promise<Response> {
    const originUrl = this.config.originUrl || env.ORIGIN_URL;
    
    if (!originUrl) {
      if (this.config.debug) {
        console.error('Spyglasses: No origin URL configured. Set ORIGIN_URL environment variable or config.originUrl');
      }
      return new Response('Origin URL not configured', { status: 500 });
    }

    try {
      // Create a new URL with the origin
      const url = new URL(request.url);
      const originURL = new URL(originUrl);
      
      // Preserve the path and query parameters but use the origin's host
      url.hostname = originURL.hostname;
      url.port = originURL.port;
      url.protocol = originURL.protocol;

      // Create a new request with the modified URL
      const modifiedRequest = new Request(url.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      // Forward the request
      const response = await fetch(modifiedRequest);
      
      // Add Spyglasses headers to indicate processing
      const modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      
      modifiedResponse.headers.set('X-Spyglasses-Processed', 'true');
      
      return modifiedResponse;
    } catch (error: unknown) {
      if (this.config.debug) {
        console.error('Spyglasses: Error forwarding to origin:', error);
      }
      return new Response('Error forwarding request', { status: 502 });
    }
  }

  /**
   * Extract client IP from request
   */
  private getClientIP(request: Request): string {
    return request.headers.get('cf-connecting-ip') ||
           request.headers.get('x-forwarded-for') ||
           request.headers.get('x-real-ip') ||
           '';
  }

  /**
   * Convert request headers to record
   */
  private getRequestHeaders(request: Request): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [key, value] of request.headers) {
      headers[key] = value;
    }
    return headers;
  }
}

/**
 * Factory function to create a SpyglassesWorker instance
 */
export function createSpyglassesWorker(config: SpyglassesWorkerConfig): SpyglassesWorker {
  return new SpyglassesWorker(config);
} 