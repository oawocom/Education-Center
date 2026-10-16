/** @type {import('next').NextConfig} */
// The browser talks only to this app; /api/* is passed on to the backend (API_URL, read at build time).
const api = process.env.API_URL || 'http://localhost:8080';

module.exports = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: api + '/api/:path*' }];
  },
};
