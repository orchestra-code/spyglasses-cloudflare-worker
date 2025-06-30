# @spyglasses/cloudflare-worker

## 1.1.0

### Minor Changes

- **🚀 Pattern Caching System** - Intelligent multi-tier caching for optimal performance
  - Module-level cache for sub-millisecond response times within Worker isolates
  - Cloudflare Cache API integration for persistence across edge locations
  - Background pattern synchronization with `ctx.waitUntil()` for non-blocking requests
  - Configurable cache TTL via `SPYGLASSES_CACHE_TTL` environment variable

- **🌐 URL Normalization** - User-friendly origin URL configuration
  - Automatically detects hostname-only URLs (e.g., `webflow.spyglasses.io`) and adds `https://` protocol
  - Maintains backward compatibility with full URLs
  - Improved error handling for malformed URLs

- **🎯 Hostname Filtering** - Selective processing for multi-site deployments
  - Only processes requests matching the configured origin hostname
  - Prevents unintended processing when Cloudflare routes multiple domains through the same Worker
  - Case-insensitive hostname matching for robustness
  - Bypasses processing gracefully for non-matching domains

- **🔧 Custom Patterns Endpoint** - Enhanced development and testing capabilities
  - Support for `patternsEndpoint` configuration option and `SPYGLASSES_PATTERNS_ENDPOINT` environment variable
  - Enables pointing to development/staging API endpoints for testing
  - Matches Ruby gem functionality for consistent developer experience across platforms
  - Configurable via both environment variables and direct configuration

### Improvements

- **🧪 Comprehensive Test Suite** - 32 test cases covering all functionality
  - Pattern caching behavior testing with mock Cloudflare Cache API
  - URL normalization and hostname filtering validation
  - Enhanced debugging capabilities for cache operations
  - Background operation testing using ExecutionContext mocks

- **📊 Enhanced Debug Logging** - Better visibility into Worker operations
  - Cache hit/miss status with age information
  - Hostname matching decisions
  - Pattern sync timing and success/failure states
  - Clear indication of when requests are skipped vs processed

- **🔧 Developer Experience** - Improved configuration and debugging
  - Test helper function `_resetPatternCache()` for unit testing
  - Better error messages for configuration issues
  - Comprehensive debug output for troubleshooting

### Performance

- **Cache Performance**: Sub-millisecond responses for cached patterns
- **Memory Efficiency**: Smart caching reduces redundant API calls
- **Edge Optimization**: Persistent caching across Cloudflare edge locations
- **Background Processing**: Non-blocking pattern updates and logging

## 1.0.0

### Major Changes

- **Initial Release** - Complete Cloudflare Worker implementation for Spyglasses bot detection and AI referrer tracking
- **Edge Performance** - Sub-millisecond bot detection with minimal latency impact
- **Full SDK Integration** - Reuses all existing Spyglasses patterns and detection logic
- **Production Ready** - Comprehensive error handling, logging, and monitoring

### Features

- 🤖 **Advanced Bot Detection** - Identify 1,000+ bot patterns including AI model trainers
- 🧠 **AI Referrer Tracking** - Track visitors from ChatGPT, Claude, Perplexity, and other AI platforms
- 🚀 **Edge Processing** - Intercepts requests before they reach origin servers
- 🛡️ **Configurable Blocking** - Block specific bot types while allowing legitimate crawlers
- 📊 **Analytics Integration** - Optional logging to Spyglasses dashboard
- 🎯 **Path Exclusions** - Skip processing for static assets and admin routes
- 🔧 **Zero Configuration** - Works out of the box with sensible defaults

### Infrastructure

- **TypeScript Support** - Full TypeScript implementation with strict typing
- **Code Quality** - ESLint, Prettier, and comprehensive linting
- **Git Hooks** - Automated linting and commit message validation
- **Changesets** - Professional version management and changelog generation
- **Testing Ready** - Vitest configuration for comprehensive testing

### Performance

- **Bundle Size**: 66.47 KiB total, 13.15 KiB gzipped
- **Edge Distribution**: Global deployment via Cloudflare Workers
- **Background Logging**: Non-blocking request processing
- **Smart Caching**: Efficient pattern and configuration caching

### Documentation

- **Comprehensive README** - Complete setup and configuration guide
- **Multiple Examples** - Basic, advanced, and e-commerce use cases
- **Type Definitions** - Full TypeScript support with detailed interfaces
- **API Documentation** - Complete configuration options and methods 