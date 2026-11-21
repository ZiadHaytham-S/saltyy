import type { NextConfig } from 'next';
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';
const parsed = new URL(apiUrl);
if (
  !['http:', 'https:'].includes(parsed.protocol) ||
  parsed.username ||
  parsed.password ||
  parsed.search ||
  parsed.hash ||
  parsed.pathname !== '/'
) {
  throw new Error(
    'API_INTERNAL_URL must be an HTTP origin without credentials, path, query or fragment.',
  );
}
const config: NextConfig = {
  distDir: process.env.SALLTY_AUTH_TEST === '1' ? '.next-auth-test' : '.next',
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/preview/store',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: parsed.origin + '/:path*' },
    ];
  },
};
export default config;
