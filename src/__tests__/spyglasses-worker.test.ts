import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSpyglassesWorker, SpyglassesWorker, _resetPatternCache } from '../spyglasses-worker';

// Mock the SDK
vi.mock('@spyglasses/sdk', () => {
  const mockDetect = vi.fn();
  const mockLogRequest = vi.fn();
  const mockSyncPatterns = vi.fn();
  const mockHasApiKey = vi.fn();

  return {
    Spyglasses: vi.fn().mockImplementation((config) => {
      return {
        apiKey: config.apiKey,
        debug: config.debug,
        detect: mockDetect,
        logRequest: mockLogRequest,
        syncPatterns: mockSyncPatterns,
        hasApiKey: mockHasApiKey
      };
    }),
    // Export mock functions for test access
    _mocks: {
      detect: mockDetect,
      logRequest: mockLogRequest,
      syncPatterns: mockSyncPatterns,
      hasApiKey: mockHasApiKey
    }
  };
});

// Mock Cloudflare Cache API
const mockCacheMatch = vi.fn();
const mockCachePut = vi.fn();
const mockCache = {
  match: mockCacheMatch,
  put: mockCachePut
};

// Mock global caches
Object.defineProperty(globalThis, 'caches', {
  value: {
    default: mockCache
  },
  writable: true
});

// Mock ExecutionContext
function createMockExecutionContext() {
  const waitUntilPromises: Promise<any>[] = [];
  
  return {
    waitUntil: vi.fn((promise: Promise<any>) => {
      waitUntilPromises.push(promise);
    }),
    passThroughOnException: vi.fn(),
    // Helper to get promises passed to waitUntil for testing
    _getWaitUntilPromises: () => waitUntilPromises
  };
}

// Mock fetch for origin forwarding
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('Spyglasses Cloudflare Worker', () => {
  let mockDetect: any;
  let mockLogRequest: any;
  let mockSyncPatterns: any;
  let mockHasApiKey: any;
  let mockCtx: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Reset module-level pattern cache between tests
    _resetPatternCache();
    
    // Get the mocks from the mocked module
    const { _mocks } = await import('@spyglasses/sdk') as any;
    mockDetect = _mocks.detect;
    mockLogRequest = _mocks.logRequest;
    mockSyncPatterns = _mocks.syncPatterns;
    mockHasApiKey = _mocks.hasApiKey;
    
    // Create fresh mock context for each test
    mockCtx = createMockExecutionContext();
    
    // Set up default mock implementations
    mockHasApiKey.mockReturnValue(true);
    mockSyncPatterns.mockResolvedValue({
      version: '1.0.0',
      patterns: [
        { pattern: 'Googlebot', type: 'googlebot', category: 'Search Crawler' }
      ],
      aiReferrers: [
        { id: 'chatgpt', name: 'ChatGPT', patterns: ['chat.openai.com'] }
      ],
      propertySettings: {
        blockAiModelTrainers: false,
        customBlocks: [],
        customAllows: []
      }
    });
    mockLogRequest.mockResolvedValue(new Response('OK'));
    
    // Default detection result: non-bot, no blocking
    mockDetect.mockReturnValue({
      isBot: false,
      shouldBlock: false,
      sourceType: 'none'
    });
    
    // Mock cache responses
    mockCacheMatch.mockResolvedValue(null);
    mockCachePut.mockResolvedValue(undefined);
    
    // Mock fetch for origin forwarding
    mockFetch.mockResolvedValue(new Response('Origin Response', { status: 200 }));
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Worker Creation', () => {
    it('creates worker with default config', () => {
      const worker = createSpyglassesWorker({});
      expect(worker).toBeInstanceOf(SpyglassesWorker);
    });

    it('creates worker with custom config', () => {
      const config = {
        apiKey: 'test-key',
        debug: true,
        excludePaths: ['/admin'],
        blockingTimeout: 5000
      };
      
      const worker = createSpyglassesWorker(config);
      expect(worker).toBeInstanceOf(SpyglassesWorker);
    });

    it('creates worker with custom endpoints', async () => {
      const config = {
        apiKey: 'test-key',
        collectEndpoint: 'https://dev.spyglasses.io/api/collect',
        patternsEndpoint: 'https://dev.spyglasses.io/api/patterns'
      };
      
      const worker = createSpyglassesWorker(config);
      expect(worker).toBeInstanceOf(SpyglassesWorker);
      
      // Verify the Spyglasses SDK was created with custom endpoints
      const { Spyglasses } = await import('@spyglasses/sdk');
      expect(Spyglasses).toHaveBeenCalledWith(expect.objectContaining({
        collectEndpoint: 'https://dev.spyglasses.io/api/collect',
        patternsEndpoint: 'https://dev.spyglasses.io/api/patterns'
      }));
    });
  });

  describe('Pattern Caching', () => {
    it('initializes pattern sync on first request with API key', async () => {
      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://example.com');
      const env = { ORIGIN_URL: 'https://origin.com' };
      
      await worker.handleRequest(request, env, mockCtx);
      
      // Should start pattern sync in background
      expect(mockCtx.waitUntil).toHaveBeenCalled();
      expect(mockSyncPatterns).toHaveBeenCalled();
    });

    it('skips pattern sync when no API key', async () => {
      mockHasApiKey.mockReturnValue(false);
      
      const worker = createSpyglassesWorker({});
      const request = new Request('https://example.com');
      const env = { ORIGIN_URL: 'https://origin.com' };
      
      await worker.handleRequest(request, env, mockCtx);
      
      expect(mockSyncPatterns).not.toHaveBeenCalled();
    });

    it('uses cached patterns from Cloudflare Cache API', async () => {
      const cachedData = {
        patterns: [{ pattern: 'CachedBot', type: 'cached' }],
        aiReferrers: [],
        timestamp: Date.now() - 1000 // 1 second ago
      };
      
      mockCacheMatch.mockResolvedValue(
        new Response(JSON.stringify(cachedData), {
          headers: { 'Content-Type': 'application/json' }
        })
      );
      
      const worker = createSpyglassesWorker({ 
        apiKey: 'test-key',
        debug: true,
        cacheTime: 3600 
      });
      const request = new Request('https://example.com');
      const env = { ORIGIN_URL: 'https://origin.com' };
      
      await worker.handleRequest(request, env, mockCtx);
      
      // Should not call API since we have fresh cached data
      expect(mockSyncPatterns).not.toHaveBeenCalled();
    });

    it('fetches fresh patterns when cache is stale', async () => {
      const staleData = {
        patterns: [{ pattern: 'StaleBot', type: 'stale' }],
        timestamp: Date.now() - 7200000 // 2 hours ago
      };
      
      mockCacheMatch.mockResolvedValue(
        new Response(JSON.stringify(staleData))
      );
      
      const worker = createSpyglassesWorker({ 
        apiKey: 'test-key',
        cacheTime: 3600 // 1 hour
      });
      const request = new Request('https://example.com');
      const env = { ORIGIN_URL: 'https://origin.com' };
      
      await worker.handleRequest(request, env, mockCtx);
      
      // Wait for background sync to complete
      const waitUntilPromises = (mockCtx as any)._getWaitUntilPromises();
      await Promise.all(waitUntilPromises);
      
      // Should fetch fresh patterns since cache is stale
      expect(mockSyncPatterns).toHaveBeenCalled();
    });

    it('caches successful pattern sync results', async () => {
      const worker = createSpyglassesWorker({ 
        apiKey: 'test-key',
        cacheTime: 3600
      });
      const request = new Request('https://example.com');
      const env = { ORIGIN_URL: 'https://origin.com' };
      
      await worker.handleRequest(request, env, mockCtx);
      
      // Wait for background sync to complete
      const waitUntilPromises = (mockCtx as any)._getWaitUntilPromises();
      await Promise.all(waitUntilPromises);
      
      // Should cache the result
      expect(mockCachePut).toHaveBeenCalled();
    });
  });

  describe('Path Exclusions', () => {
    it('excludes default paths', async () => {
      const worker = createSpyglassesWorker({
        excludePaths: [
          '/favicon.ico',
          '/robots.txt',
          '/sitemap.xml',
          '/_next/',
          '/api/',
          '/admin/',
          '/wp-admin/',
          '/.well-known/',
        ]
      });
      const env = { ORIGIN_URL: 'https://origin.com' };
      
      const testPaths = [
        '/favicon.ico',
        '/robots.txt',
        '/_next/static/test.js',
        '/api/endpoint',
        '/admin/dashboard'
      ];
      
      for (const path of testPaths) {
        const request = new Request(`https://example.com${path}`);
        await worker.handleRequest(request, env, mockCtx);
      }
      
      // Detection should not be called for excluded paths
      expect(mockDetect).not.toHaveBeenCalled();
      
      // Should forward all requests to origin
      expect(mockFetch).toHaveBeenCalledTimes(testPaths.length);
    });

    it('excludes custom paths', async () => {
      const worker = createSpyglassesWorker({
        excludePaths: ['/custom', /^\/private\/.*/]
      });
      const env = { ORIGIN_URL: 'https://origin.com' };
      
      const customRequest = new Request('https://example.com/custom/page');
      const privateRequest = new Request('https://example.com/private/data');
      
      await worker.handleRequest(customRequest, env, mockCtx);
      await worker.handleRequest(privateRequest, env, mockCtx);
      
      expect(mockDetect).not.toHaveBeenCalled();
    });

    it('processes non-excluded paths', async () => {
      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://example.com/about');
      const env = { ORIGIN_URL: 'https://example.com' };
      
      await worker.handleRequest(request, env, mockCtx);
      
      expect(mockDetect).toHaveBeenCalled();
    });
  });

  describe('Bot Detection and Logging', () => {
    it('processes regular traffic without logging', async () => {
      mockDetect.mockReturnValue({
        isBot: false,
        shouldBlock: false,
        sourceType: 'none'
      });

      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://example.com', {
        headers: { 'user-agent': 'Mozilla/5.0' }
      });
      const env = { ORIGIN_URL: 'https://example.com' };

      const response = await worker.handleRequest(request, env, mockCtx);
      
      expect(response.status).toBe(200);
      expect(mockDetect).toHaveBeenCalledWith('Mozilla/5.0', '');
      expect(mockLogRequest).not.toHaveBeenCalled();
    });

    it('logs bot traffic when detected', async () => {
      mockDetect.mockReturnValue({
        isBot: true,
        shouldBlock: false,
        sourceType: 'bot',
        matchedPattern: 'Googlebot',
        info: {
          type: 'googlebot',
          category: 'Search Crawler',
          company: 'Google'
        }
      });

      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://example.com', {
        headers: { 
          'user-agent': 'Googlebot/2.1',
          'referer': 'https://google.com'
        }
      });
      const env = { ORIGIN_URL: 'https://example.com' };

      await worker.handleRequest(request, env, mockCtx);
      
      // Should use waitUntil for background logging
      expect(mockCtx.waitUntil).toHaveBeenCalled();
      
      // Wait for background logging
      const waitUntilPromises = (mockCtx as any)._getWaitUntilPromises();
      await Promise.all(waitUntilPromises);
      
      expect(mockLogRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          isBot: true,
          sourceType: 'bot'
        }),
        expect.objectContaining({
          url: 'https://example.com/',
          userAgent: 'Googlebot/2.1',
          referrer: 'https://google.com',
          responseStatus: 200
        })
      );
    });

    it('logs AI referrer traffic', async () => {
      mockDetect.mockReturnValue({
        isBot: false,
        shouldBlock: false,
        sourceType: 'ai_referrer',
        matchedPattern: 'chat.openai.com',
        info: {
          id: 'chatgpt',
          name: 'ChatGPT',
          company: 'OpenAI'
        }
      });

      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://example.com', {
        headers: { 
          'user-agent': 'Mozilla/5.0',
          'referer': 'https://chat.openai.com'
        }
      });
      const env = { ORIGIN_URL: 'https://example.com' };

      await worker.handleRequest(request, env, mockCtx);
      
      // Wait for background logging
      const waitUntilPromises = (mockCtx as any)._getWaitUntilPromises();
      await Promise.all(waitUntilPromises);
      
      expect(mockLogRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'ai_referrer'
        }),
        expect.objectContaining({
          referrer: 'https://chat.openai.com'
        })
      );
    });

    it('handles logging errors gracefully', async () => {
      mockDetect.mockReturnValue({
        isBot: true,
        shouldBlock: false,
        sourceType: 'bot'
      });
      mockLogRequest.mockRejectedValue(new Error('Logging failed'));

      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://example.com', {
        headers: { 'user-agent': 'Googlebot' }
      });
      const env = { ORIGIN_URL: 'https://origin.com' };

      // Should not throw an error
      const response = await worker.handleRequest(request, env, mockCtx);
      expect(response.status).toBe(200);
    });
  });

  describe('Blocking Behavior', () => {
    it('blocks traffic when shouldBlock is true', async () => {
      mockDetect.mockReturnValue({
        isBot: true,
        shouldBlock: true,
        sourceType: 'bot',
        matchedPattern: 'AITrainer/1.0'
      });

      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://example.com', {
        headers: { 'user-agent': 'AITrainer/1.0' }
      });
      const env = { ORIGIN_URL: 'https://example.com' };

      const response = await worker.handleRequest(request, env, mockCtx);
      
      expect(response.status).toBe(403);
      expect(await response.text()).toBe('Access Denied');
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      expect(response.headers.get('X-Spyglasses-Blocked')).toBe('true');
      expect(response.headers.get('X-Spyglasses-Reason')).toBe('bot');
    });

    it('logs blocked visits with 403 status', async () => {
      mockDetect.mockReturnValue({
        isBot: true,
        shouldBlock: true,
        sourceType: 'bot'
      });

      const worker = createSpyglassesWorker({ 
        apiKey: 'test-key',
        awaitBlockedLogging: true // Wait for blocked logging
      });
      const request = new Request('https://example.com');
      const env = { ORIGIN_URL: 'https://example.com' };

      await worker.handleRequest(request, env, mockCtx);
      
      expect(mockLogRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          shouldBlock: true
        }),
        expect.objectContaining({
          responseStatus: 403
        })
      );
    });

    it('uses fire-and-forget logging for blocked requests by default', async () => {
      mockDetect.mockReturnValue({
        isBot: true,
        shouldBlock: true,
        sourceType: 'bot'
      });

      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://example.com');
      const env = { ORIGIN_URL: 'https://origin.com' };

      await worker.handleRequest(request, env, mockCtx);
      
      // Should use waitUntil for fire-and-forget logging
      expect(mockCtx.waitUntil).toHaveBeenCalled();
    });

    it('respects blocking timeout', async () => {
      mockDetect.mockReturnValue({
        isBot: true,
        shouldBlock: true,
        sourceType: 'bot'
      });
      
      // Make logging hang longer than timeout
      mockLogRequest.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 3000))
      );

      const worker = createSpyglassesWorker({ 
        apiKey: 'test-key',
        blockingTimeout: 1000,
        awaitBlockedLogging: true
      });
      const request = new Request('https://example.com');
      const env = { ORIGIN_URL: 'https://example.com' };

      const start = Date.now();
      const response = await worker.handleRequest(request, env, mockCtx);
      const duration = Date.now() - start;
      
      // Should still block even if logging times out
      expect(response.status).toBe(403);
      expect(duration).toBeLessThan(2000); // Should timeout before 2 seconds
    });
  });

  describe('Origin Forwarding', () => {
    it('forwards requests to configured origin', async () => {
      const worker = createSpyglassesWorker({});
      const request = new Request('https://example.com/test?param=value', {
        method: 'GET',
        headers: { 'user-agent': 'TestAgent' }
      });
      const env = { ORIGIN_URL: 'https://origin.com' };

      await worker.handleRequest(request, env, mockCtx);
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(Request)
      );
      
      // Check that URL was correctly modified
      const fetchCall = mockFetch.mock.calls[0];
      const fetchedRequest = fetchCall[0] as Request;
      expect(fetchedRequest.url).toBe('https://origin.com/test?param=value');
    });

    it('uses originUrl config over environment variable', async () => {
      const worker = createSpyglassesWorker({
        originUrl: 'https://config-origin.com'
      });
      const request = new Request('https://example.com/test');
      const env = { ORIGIN_URL: 'https://env-origin.com' };

      await worker.handleRequest(request, env, mockCtx);
      
      const fetchCall = mockFetch.mock.calls[0];
      const fetchedRequest = fetchCall[0] as Request;
      expect(fetchedRequest.url).toBe('https://config-origin.com/test');
    });

    it('returns error when no origin URL configured', async () => {
      const worker = createSpyglassesWorker({});
      const request = new Request('https://example.com');
      const env = {}; // No ORIGIN_URL

      const response = await worker.handleRequest(request, env, mockCtx);
      
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Origin URL not configured');
    });

    it('handles origin fetch errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const worker = createSpyglassesWorker({});
      const request = new Request('https://example.com');
      const env = { ORIGIN_URL: 'https://origin.com' };

      const response = await worker.handleRequest(request, env, mockCtx);
      
      expect(response.status).toBe(502);
      expect(await response.text()).toBe('Error forwarding request');
    });

    it('adds processing headers to response', async () => {
      const worker = createSpyglassesWorker({});
      const request = new Request('https://example.com');
      const env = { ORIGIN_URL: 'https://origin.com' };

      const response = await worker.handleRequest(request, env, mockCtx);
      
      expect(response.headers.get('X-Spyglasses-Processed')).toBe('true');
    });
  });

  describe('URL Normalization', () => {
    it('normalizes hostname-only origin URLs', async () => {
      const worker = createSpyglassesWorker({});
      const request = new Request('https://example.com/test');
      const env = { ORIGIN_URL: 'origin.com' }; // Just hostname, no protocol

      await worker.handleRequest(request, env, mockCtx);
      
      // Check that fetch was called with normalized URL
      const fetchCall = mockFetch.mock.calls[0];
      const fetchedRequest = fetchCall[0] as Request;
      expect(fetchedRequest.url).toBe('https://origin.com/test');
    });

    it('preserves existing protocol in origin URLs', async () => {
      const worker = createSpyglassesWorker({});
      const request = new Request('https://example.com/test');
      const env = { ORIGIN_URL: 'http://origin.com' }; // Already has protocol

      await worker.handleRequest(request, env, mockCtx);
      
      // Check that fetch was called with original protocol
      const fetchCall = mockFetch.mock.calls[0];
      const fetchedRequest = fetchCall[0] as Request;
      expect(fetchedRequest.url).toBe('http://origin.com/test');
    });
  });

  describe('Hostname Filtering', () => {
    it('processes requests for matching hostname', async () => {
      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://example.com/test', {
        headers: { 'user-agent': 'TestAgent' }
      });
      const env = { ORIGIN_URL: 'https://example.com' };

      await worker.handleRequest(request, env, mockCtx);
      
      // Should process the request (call detect)
      expect(mockDetect).toHaveBeenCalledWith('TestAgent', '');
    });

    it('skips processing for non-matching hostname', async () => {
      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://different.com/test', {
        headers: { 'user-agent': 'TestAgent' }
      });
      const env = { ORIGIN_URL: 'https://example.com' };

      await worker.handleRequest(request, env, mockCtx);
      
      // Should not process the request (skip detect)
      expect(mockDetect).not.toHaveBeenCalled();
      
      // Should still forward to origin
      expect(mockFetch).toHaveBeenCalled();
    });

    it('handles hostname comparison case-insensitively', async () => {
      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://EXAMPLE.COM/test', {
        headers: { 'user-agent': 'TestAgent' }
      });
      const env = { ORIGIN_URL: 'https://example.com' };

      await worker.handleRequest(request, env, mockCtx);
      
      // Should process the request despite case difference
      expect(mockDetect).toHaveBeenCalledWith('TestAgent', '');
    });

    it('works with hostname-only origin URLs', async () => {
      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://example.com/test', {
        headers: { 'user-agent': 'TestAgent' }
      });
      const env = { ORIGIN_URL: 'example.com' }; // Just hostname

      await worker.handleRequest(request, env, mockCtx);
      
      // Should process the request
      expect(mockDetect).toHaveBeenCalledWith('TestAgent', '');
    });

    it('processes all requests when no origin URL configured', async () => {
      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://any-domain.com/test', {
        headers: { 'user-agent': 'TestAgent' }
      });
      const env = {}; // No ORIGIN_URL

      await worker.handleRequest(request, env, mockCtx);
      
      // Should process since no hostname filtering when no origin URL
      expect(mockDetect).toHaveBeenCalledWith('TestAgent', '');
    });
  });

  describe('Header Processing', () => {
    it('extracts client IP from Cloudflare headers', async () => {
      mockDetect.mockReturnValue({
        isBot: true,
        shouldBlock: false,
        sourceType: 'bot'
      });

      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      const request = new Request('https://example.com', {
        headers: { 
          'user-agent': 'Googlebot',
          'cf-connecting-ip': '1.2.3.4',
          'x-forwarded-for': '5.6.7.8'
        }
      });
      const env = { ORIGIN_URL: 'https://example.com' };

      await worker.handleRequest(request, env, mockCtx);
      
      // Wait for background logging
      const waitUntilPromises = (mockCtx as any)._getWaitUntilPromises();
      await Promise.all(waitUntilPromises);
      
      expect(mockLogRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          ip: '1.2.3.4' // Should prefer cf-connecting-ip
        })
      );
    });

    it('handles both referer and referrer headers', async () => {
      const worker = createSpyglassesWorker({ apiKey: 'test-key' });
      
      // Test with 'referer' header
      const request1 = new Request('https://example.com', {
        headers: { 
          'user-agent': 'Mozilla/5.0',
          'referer': 'https://example.referrer.com'
        }
      });
      const env = { ORIGIN_URL: 'https://example.com' };

      await worker.handleRequest(request1, env, mockCtx);
      
      expect(mockDetect).toHaveBeenCalledWith(
        'Mozilla/5.0',
        'https://example.referrer.com'
      );

      // Test with 'referrer' header
      const request2 = new Request('https://example.com', {
        headers: { 
          'user-agent': 'Mozilla/5.0',
          'referrer': 'https://example.referrer2.com'
        }
      });

      await worker.handleRequest(request2, env, mockCtx);
      
      expect(mockDetect).toHaveBeenCalledWith(
        'Mozilla/5.0',
        'https://example.referrer2.com'
      );
    });
  });
}); 