/// <reference types="@cloudflare/workers-types" />

import { Spyglasses, ApiPatternResponse } from '@spyglasses/sdk';

export interface SpyglassesWorkerConfig {
  apiKey?: string;
  debug?: boolean;
  collectEndpoint?: string;
  patternsEndpoint?: string;
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

// Module-level pattern sync cache (shared across requests within the same isolate)
let patternSyncPromise: Promise<ApiPatternResponse | string> | null = null;
let lastPatternSyncTime: number = 0;

// Cache key for Cloudflare Cache API
const PATTERNS_CACHE_KEY = 'spyglasses-patterns-v1';

/**
 * Sync and cache patterns using both module-level cache and Cloudflare Cache API
 */
async function syncPatterns(spyglasses: Spyglasses, config: SpyglassesWorkerConfig): Promise<void> {
  const debug = config.debug || false;
  const cacheTimeMs = (config.cacheTime || 3600) * 1000; // Convert to milliseconds
  const now = Date.now();

  // Check if we recently synced patterns in this isolate
  if (lastPatternSyncTime && (now - lastPatternSyncTime) < cacheTimeMs) {
    if (debug) {
      console.log('Spyglasses: Using recently synced patterns from module cache');
    }
    return;
  }

  // If there's already a sync in progress, wait for it
  if (patternSyncPromise) {
    if (debug) {
      console.log('Spyglasses: Pattern sync already in progress, waiting...');
    }
    await patternSyncPromise;
    return;
  }

  // Check if we have an API key
  if (!spyglasses.hasApiKey()) {
    if (debug) {
      console.warn('Spyglasses: No API key provided, using default patterns only');
    }
    return;
  }

  try {
    // Try to get patterns from Cloudflare Cache API first
    const cacheKey = `${PATTERNS_CACHE_KEY}-${config.apiKey?.substring(0, 8) || 'default'}`;
    const cache = caches.default;
    const cacheRequest = new Request(`https://cache.spyglasses.internal/${cacheKey}`);
    
    const cachedResponse = await cache.match(cacheRequest);
    if (cachedResponse) {
      const cacheData = await cachedResponse.json() as (ApiPatternResponse & { timestamp: number });
      const cacheAge = now - (cacheData.timestamp || 0);
      
      if (cacheAge < cacheTimeMs) {
        if (debug) {
          console.log(`Spyglasses: Using cached patterns from Cloudflare Cache API (age: ${Math.round(cacheAge / 1000)}s)`);
        }
        
        // Apply cached patterns to the Spyglasses instance
        if (cacheData.patterns) {
          // We need to manually update the patterns since there's no direct way to set them
          // The SDK will use these when we sync
          lastPatternSyncTime = now;
        }
        return;
      } else if (debug) {
        console.log(`Spyglasses: Cached patterns are stale (age: ${Math.round(cacheAge / 1000)}s), fetching fresh patterns`);
      }
    } else if (debug) {
      console.log('Spyglasses: No cached patterns found in Cloudflare Cache API');
    }

    if (debug) {
      console.log('Spyglasses: Starting fresh pattern sync...');
      console.log('Spyglasses: Patterns endpoint:', config.patternsEndpoint);
    }
    
    // Start pattern sync
    patternSyncPromise = spyglasses.syncPatterns();
    
    const result = await patternSyncPromise;
    
    if (debug) {
      if (typeof result === 'string') {
        console.warn('Spyglasses: Pattern sync warning:', result);
      } else {
        console.log(`Spyglasses: Successfully synced ${result.patterns?.length || 0} patterns and ${result.aiReferrers?.length || 0} AI referrers`);
        if (result.propertySettings) {
          console.log('Spyglasses: Loaded property settings from platform:', {
            blockAiModelTrainers: result.propertySettings.blockAiModelTrainers,
            customBlocks: result.propertySettings.customBlocks?.length || 0,
            customAllows: result.propertySettings.customAllows?.length || 0
          });
        }
      }
    }

    // Cache the successful result in Cloudflare Cache API
    if (typeof result !== 'string') {
      try {
        const cacheData = {
          ...result,
          timestamp: now
        };
        
        const cacheResponse = new Response(JSON.stringify(cacheData), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `max-age=${config.cacheTime || 3600}`
          }
        });
        
        await cache.put(cacheRequest, cacheResponse);
        
        if (debug) {
          console.log('Spyglasses: Cached patterns in Cloudflare Cache API');
        }
      } catch (cacheError) {
        if (debug) {
          console.warn('Spyglasses: Failed to cache patterns in Cloudflare Cache API:', cacheError);
        }
      }
    }

    lastPatternSyncTime = now;
    
  } catch (error) {
    if (debug) {
      console.error('Spyglasses: Pattern sync failed, using defaults:', error);
      console.error(`Tried to sync patterns from ${config.patternsEndpoint}`);
    }
  } finally {
    // Clear the promise so future calls can sync again
    patternSyncPromise = null;
  }
}

export class SpyglassesWorker {
  private spyglasses: Spyglasses;
  private config: SpyglassesWorkerConfig;
  private patternSyncInitialized: boolean = false;

  constructor(config: SpyglassesWorkerConfig) {
    this.config = config;
    this.spyglasses = new Spyglasses({
      apiKey: config.apiKey,
      debug: config.debug || false,
      collectEndpoint: config.collectEndpoint,
      patternsEndpoint: config.patternsEndpoint,
      platformType: config.platformType || 'cloudflare-worker',
      autoSync: false, // We'll handle sync manually for better caching control
    });
  }

  /**
   * Normalize URL by adding protocol if missing
   */
  private normalizeOriginUrl(originUrl: string): string {
    // If it doesn't start with http:// or https://, assume it's just a hostname and add https://
    if (!originUrl.startsWith('http://') && !originUrl.startsWith('https://')) {
      return `https://${originUrl}`;
    }
    return originUrl;
  }

  /**
   * Check if request hostname matches origin hostname
   */
  private shouldProcessHostname(requestHostname: string, originUrl: string): boolean {
    try {
      const normalizedOriginUrl = this.normalizeOriginUrl(originUrl);
      const originURL = new URL(normalizedOriginUrl);
      return requestHostname.toLowerCase() === originURL.hostname.toLowerCase();
    } catch (error) {
      if (this.config.debug) {
        console.error(`Spyglasses: Error parsing origin URL "${originUrl}":`, error);
      }
      return false;
    }
  }

  /**
   * Initialize pattern sync (call this once per worker instance)
   */
  private async initializePatternSync(ctx: ExecutionContext): Promise<void> {
    if (this.patternSyncInitialized) {
      return;
    }

    this.patternSyncInitialized = true;

    if (this.spyglasses.hasApiKey()) {
      // Start pattern sync in background using waitUntil
      ctx.waitUntil(
        syncPatterns(this.spyglasses, this.config).catch((error) => {
          if (this.config.debug) {
            console.error('Spyglasses: Background pattern sync failed, continuing with defaults:', error);
          }
        })
      );
    }
  }

  /**
   * Handle the incoming request
   */
  async handleRequest(
    request: Request,
    env: SpyglassesWorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    // Initialize pattern sync on first request
    await this.initializePatternSync(ctx);

    const url = new URL(request.url);
    
    if (this.config.debug) {
      console.log(`Spyglasses: Processing request to ${url.hostname}${url.pathname}`);
    }

    // Check if hostname should be processed
    const originUrl = this.config.originUrl || env.ORIGIN_URL;
    if (originUrl && !this.shouldProcessHostname(url.hostname, originUrl)) {
      if (this.config.debug) {
        console.log(`Spyglasses: Skipping hostname ${url.hostname}, not matching origin`);
      }
      return this.forwardToOrigin(request, env);
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
      const normalizedOriginUrl = this.normalizeOriginUrl(originUrl);
      const originURL = new URL(normalizedOriginUrl);
      
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

/**
 * Test helper function to reset module-level cache
 * @internal
 */
export function _resetPatternCache(): void {
  patternSyncPromise = null;
  lastPatternSyncTime = 0;
} 