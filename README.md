# Spyglasses Cloudflare Worker

> 🔍 Bot detection and AI referrer tracking for Cloudflare Workers

[![npm version](https://badge.fury.io/js/%40spyglasses%2Fcloudflare-worker.svg)](https://badge.fury.io/js/%40spyglasses%2Fcloudflare-worker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Spyglasses Cloudflare Worker enables edge-based bot detection and AI referrer tracking for any origin server. Perfect for Webflow sites, e-commerce platforms, and any application that needs to understand and control bot traffic at the edge. Spyglasses enables you to detect AI Agents, bots, crawlers, and referrers in your Next.js web applications. It provides comprehensive [AI SEO](https://www.spyglasses.io), shows you when your site features in ChatGPT, Claude, Perplexity, and other AI assistant chat platforms. It can also prevent your site's content from being used for training AI by blocking the crawlers that scrape your content for training.

## ✨ Features

- 🤖 **Advanced Bot Detection** - Identify 1,000+ bot patterns including AI model trainers
- 🧠 **AI Referrer Tracking** - Track visitors from ChatGPT, Claude, Perplexity, and other AI platforms  
- 🚀 **Edge Performance** - Sub-millisecond detection with intelligent caching
- 🛡️ **Configurable Blocking** - Block specific bot types while allowing legitimate crawlers
- 📊 **Real-time Analytics** - Optional logging to Spyglasses dashboard
- 🎯 **Selective Processing** - Hostname filtering for multi-site deployments
- 🌐 **URL Normalization** - Flexible origin URL configuration (with or without protocol)
- ⚡ **Smart Caching** - Multi-tier pattern caching for optimal performance
- 🔧 **Zero Configuration** - Works out of the box with sensible defaults

## 🚀 Quick Start

### 1. Install the Package

```bash
npm install @spyglasses/cloudflare-worker
```

### 2. Create Your Worker

Create a new `src/index.ts` file:

```typescript
import worker from '@spyglasses/cloudflare-worker';

export default worker;
```

### 3. Configure Your Worker

In your `wrangler.toml`:

```toml
name = "my-spyglasses-worker"
main = "src/index.ts"
compatibility_date = "2024-12-30"
compatibility_flags = ["nodejs_compat"]

[vars]
SPYGLASSES_DEBUG = "false"

# Configure Workers Routes
[[routes]]
pattern = "*your-domain.com/*"
zone_name = "your-domain.com"
```

### 4. Set Your API Key (Optional)

For analytics and enhanced patterns:

```bash
npx wrangler secret put SPYGLASSES_API_KEY
# Enter your API key when prompted
```

### 5. Deploy

```bash
npx wrangler deploy
```

## 🛠️ Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `SPYGLASSES_API_KEY` | ❌ | API key for analytics and updates | - |
| `SPYGLASSES_DEBUG` | ❌ | Enable debug logging | `false` |
| `SPYGLASSES_COLLECTOR_ENDPOINT` | ❌ | Custom analytics endpoint | Spyglasses default |
| `SPYGLASSES_PATTERNS_ENDPOINT` | ❌ | Custom patterns endpoint | Spyglasses default |
| `SPYGLASSES_CACHE_TTL` | ❌ | Pattern cache TTL in seconds | `3600` |

**Note**: Routing is handled by [Cloudflare Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/).

### Advanced Configuration

For custom configuration, create your own worker:

```typescript
import { createSpyglassesWorker, SpyglassesWorkerConfig } from '@spyglasses/cloudflare-worker';

const config: SpyglassesWorkerConfig = {
  debug: true,
  collectEndpoint: 'https://dev.spyglasses.io/api/collect', // Custom endpoints for development
  patternsEndpoint: 'https://dev.spyglasses.io/api/patterns',
  excludePaths: [
    '/api/',
    '/admin/',
    '/_next/',
    /\.(css|js|png|jpg|gif|svg|ico)$/i, // Regex patterns supported
  ],
  platformType: 'my-platform',
  blockingTimeout: 1000, // Max time to wait for logging blocked requests
  awaitBlockedLogging: false, // Don't block response on logging
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
```

## 🛣️ Setting Up Workers Routes

Cloudflare Workers Routes determine which requests are sent to your Worker. Configure routes either in the dashboard or `wrangler.toml`:

### Dashboard Configuration
1. Go to your domain in Cloudflare dashboard
2. Navigate to **Workers Routes** in the sidebar  
3. Click **Add route**
4. Set pattern (e.g., `*your-domain.com/*`) and select your Worker

### Wrangler Configuration
```toml
[[routes]]
pattern = "*your-domain.com/*"
zone_name = "your-domain.com"
```

**Common Patterns:**
- `*example.com/*` - All requests to example.com
- `api.example.com/*` - Only API subdomain requests
- `example.com/blog/*` - Only blog path requests
- `*.example.com/*` - All subdomain requests

## 🎯 Use Cases

### Webflow Sites

Perfect for Webflow sites that need bot protection:

```toml
[[routes]]
pattern = "*your-site.webflow.io/*"
zone_name = "webflow.io"
```

The route pattern ensures only requests to your specific Webflow site are processed by the Worker.

### E-commerce Protection

Protect product pages from aggressive scrapers:

```typescript
const config: SpyglassesWorkerConfig = {
  excludePaths: [
    '/cart',
    '/checkout',
    '/account',
    '/admin',
  ],
  // Block AI model trainers but allow price comparison bots
};
```

### API Protection

Use with API routes:

```typescript
const config: SpyglassesWorkerConfig = {
  excludePaths: [
    '/health',
    '/status',
  ],
  // Block all automated access to sensitive endpoints
};
```

## 📊 Understanding Detection Results

The worker adds custom headers to help you understand what's happening:

```
X-Spyglasses-Processed: true
X-Spyglasses-Blocked: true (if blocked)
X-Spyglasses-Reason: bot|ai_referrer (if blocked)
```

### Detection Types

- **🤖 Bot Detection**: Identifies crawlers, scrapers, and AI trainers
- **🧠 AI Referrers**: Tracks human visitors from AI platforms
- **✅ Legitimate Traffic**: Passes through unmodified

### Blocking Behavior

- **Blocked bots** receive a `403 Forbidden` response
- **AI referrers** are logged but never blocked (they're human visitors)
- **Regular visitors** pass through normally

## 🔍 Debugging

Enable debug mode to see detailed logging:

```toml
[vars]
SPYGLASSES_DEBUG = "true"
```

Check your Worker logs:

```bash
npx wrangler tail
```

You'll see detailed information about:
- Which patterns matched
- Why requests were blocked or allowed
- Logging success/failure
- Performance metrics

## 📈 Analytics

With a Spyglasses API key, you get:

- **Real-time bot detection metrics**
- **AI referrer tracking dashboard**
- **Automatic pattern updates**
- **Historical trend analysis**

[Sign up for an API key →](https://www.spyglasses.io)

## 🛡️ Security Best Practices

1. **Use Secrets**: Store your API key as a secret, not a variable
   ```bash
   npx wrangler secret put SPYGLASSES_API_KEY
   ```

2. **Limit Scope**: Use path exclusions to avoid processing sensitive routes

3. **Monitor Logs**: Enable debug mode in staging to verify behavior

4. **Test Thoroughly**: Use `--dry-run` to test deployments

## 🚀 Performance

- **Sub-millisecond detection** using compiled regex patterns
- **Minimal memory footprint** with smart caching
- **Background logging** to avoid blocking responses
- **Edge distribution** for global low latency

## ⚡ Pattern Caching & Synchronization

The Cloudflare Worker includes intelligent pattern caching to ensure optimal performance while keeping detection patterns up-to-date.

### How It Works

1. **First Request**: Worker fetches latest patterns from Spyglasses API (if API key provided)
2. **Module-Level Cache**: Patterns cached in memory within the Worker isolate
3. **Cloudflare Cache API**: Patterns stored in Cloudflare's edge cache for persistence
4. **Automatic Updates**: Patterns refreshed based on `SPYGLASSES_CACHE_TTL` setting

### Cache Layers

```
Request → Module Cache → Cloudflare Cache → Spyglasses API
         ↓ Hit         ↓ Hit            ↓ Miss
    Sub-ms response   Fast response    Fresh patterns
```

### Cache Behavior

- **Without API Key**: Uses 9 built-in patterns (AI assistants + major crawlers)
- **With API Key**: Downloads 1,000+ patterns plus your custom blocking rules
- **Cache Duration**: Configurable via `SPYGLASSES_CACHE_TTL` (default: 1 hour)
- **Background Sync**: Pattern updates don't block request processing

### Debug Caching

Enable debug mode to see caching behavior:

```bash
npx wrangler tail --debug
```

Look for these log messages:
```
Spyglasses: Using recently synced patterns from module cache
Spyglasses: Using cached patterns from Cloudflare Cache API (age: 45s)
Spyglasses: Starting fresh pattern sync...
Spyglasses: Successfully synced 1247 patterns and 5 AI referrers
```

### Cache Performance

| Cache Source | Response Time | Pattern Count | Updates |
|--------------|---------------|---------------|---------|
| Module Cache | < 1ms | Full | Per isolate |
| Cloudflare Cache | < 10ms | Full | Per edge location |
| API Fetch | 50-200ms | Latest | Real-time |

## 🔧 Development

### Local Development

```bash
git clone <repository>
cd spyglasses-cloudflare-worker
npm install
npm run dev
```

### Building

```bash
npm run build # Test build
npm run deploy # Deploy to Cloudflare
```

### Testing

```bash
npm test # Run test suite
npm run test:watch # Watch mode
```

## 🤝 Support

- 📖 [Documentation](https://www.spyglasses.io/docs/platforms/cloudflare-workers)
- 🐛 [Report Issues](https://github.com/orchestra-code/spyglasses-cloudflare-worker/issues)
- 📧 [Email Support](mailto:support@spyglasses.io)

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

Made with ❤️ by the [Spyglasses](https://www.spyglasses.io) team