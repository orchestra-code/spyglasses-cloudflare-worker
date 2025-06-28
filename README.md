# Spyglasses Cloudflare Worker

> 🔍 Bot detection and AI referrer tracking for Cloudflare Workers

[![npm version](https://badge.fury.io/js/%40spyglasses%2Fcloudflare-worker.svg)](https://badge.fury.io/js/%40spyglasses%2Fcloudflare-worker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Spyglasses Cloudflare Worker enables edge-based bot detection and AI referrer tracking for any origin server. Perfect for Webflow sites, e-commerce platforms, and any application that needs to understand and control bot traffic at the edge. Spyglasses enables you to detect AI Agents, bots, crawlers, and referrers in your Next.js web applications. It provides comprehensive [AI SEO](https://www.spyglasses.io), shows you when your site features in ChatGPT, Claude, Perplexity, and other AI assistant chat platforms. It can also prevent your site's content from being used for training AI by blocking the crawlers that scrape your content for training.

## ✨ Features

- 🤖 **Advanced Bot Detection** - Identify 1,000+ bot patterns including AI model trainers
- 🧠 **AI Referrer Tracking** - Track visitors from ChatGPT, Claude, Perplexity, and other AI platforms  
- 🚀 **Edge Performance** - Sub-millisecond detection with minimal latency
- 🛡️ **Configurable Blocking** - Block specific bot types while allowing legitimate crawlers
- 📊 **Real-time Analytics** - Optional logging to Spyglasses dashboard
- 🎯 **Path Exclusions** - Skip processing for static assets and admin routes
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

### 3. Configure Environment Variables

In your `wrangler.toml`:

```toml
name = "my-spyglasses-worker"
main = "src/index.ts"
compatibility_date = "2024-12-30"
compatibility_flags = ["nodejs_compat"]

[vars]
ORIGIN_URL = "https://your-origin-server.com"
SPYGLASSES_DEBUG = "false"
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
| `ORIGIN_URL` | ✅ | Your origin server URL | - |
| `SPYGLASSES_API_KEY` | ❌ | API key for analytics and updates | - |
| `SPYGLASSES_DEBUG` | ❌ | Enable debug logging | `false` |
| `SPYGLASSES_COLLECTOR_ENDPOINT` | ❌ | Custom analytics endpoint | Spyglasses default |
| `SPYGLASSES_CACHE_TTL` | ❌ | Pattern cache TTL in seconds | `3600` |

### Advanced Configuration

For custom configuration, create your own worker:

```typescript
import { createSpyglassesWorker, SpyglassesWorkerConfig } from '@spyglasses/cloudflare-worker';

const config: SpyglassesWorkerConfig = {
  debug: true,
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
      originUrl: env.ORIGIN_URL,
    });

    return await spyglassesWorker.handleRequest(request, env, ctx);
  },
};
```

## 🎯 Use Cases

### Webflow Sites

Perfect for Webflow sites that need bot protection:

```toml
[vars]
ORIGIN_URL = "https://your-site.webflow.io"
```

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

- 📖 [Documentation](https://docs.spyglasses.io)
- 💬 [Discord Community](https://discord.gg/spyglasses)
- 🐛 [Report Issues](https://github.com/spyglasses/cloudflare-worker/issues)
- 📧 [Email Support](mailto:support@spyglasses.io)

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

Made with ❤️ by the [Spyglasses](https://www.spyglasses.io) team 