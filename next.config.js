/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  eslint: {
    // Let builds succeed even if eslint warnings exist (MVP).
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Let builds succeed even if type errors exist (MVP).
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['localhost'],
    unoptimized: true,
  },
};

module.exports = nextConfig;

