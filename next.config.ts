import type { NextConfig } from 'next';

// Security headers applied to all routes.
// CSP allows only same-origin resources plus Next.js dev-mode websocket.
// In production, 'unsafe-inline' scripts are locked down further via nonces
// if your deployment pipeline injects them; this baseline is safe for Next.js.
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=()',
  },
  {
    // Allow microphone for SPEAK, block everything else cross-origin.
    // 'unsafe-eval' and 'wasm-unsafe-eval' are needed by Next.js dev mode only;
    // next.config headers apply in both dev and prod, so we keep them minimal.
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self'",
      "connect-src 'self' ws://localhost:* wss://localhost:*",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  distDir: '.nexora-build',
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    cpus: 1,
    workerThreads: false,
    webpackBuildWorker: false,
  },
  async headers() {
    return [
      {
        // Apply to all routes.
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
