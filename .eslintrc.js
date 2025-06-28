/** @type {import('eslint').Linter.Config} */
module.exports = {
  env: {
    browser: false,
    es2022: true,
    node: false,
    worker: true,
    serviceworker: true,
  },
  extends: [
    'eslint:recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // TypeScript specific rules
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    
    // General rules
    'no-console': 'off', // Console is useful for Worker debugging
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    
    // Cloudflare Worker specific
    'no-restricted-globals': [
      'error',
      {
        name: 'window',
        message: 'window is not available in Cloudflare Workers',
      },
      {
        name: 'document',
        message: 'document is not available in Cloudflare Workers',
      },
      {
        name: 'localStorage',
        message: 'localStorage is not available in Cloudflare Workers',
      },
    ],
  },
  globals: {
    // Cloudflare Worker globals
    'ExecutionContext': 'readonly',
    'Request': 'readonly',
    'Response': 'readonly',
    'Headers': 'readonly',
    'URL': 'readonly',
    'URLSearchParams': 'readonly',
    'fetch': 'readonly',
    'crypto': 'readonly',
    'setTimeout': 'readonly',
    'clearTimeout': 'readonly',
    'setInterval': 'readonly',
    'clearInterval': 'readonly',
    'console': 'readonly',
  },
}; 