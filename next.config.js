/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  /**
   * Do not bundle @react-pdf/renderer on the server. If webpack bundles it, the
   * package.json "browser" field swaps in react-pdf.browser.js and PDF rendering
   * breaks with “Component is not a constructor”. Loading it from node_modules at
   * runtime uses the real `main` entry (Node build). Do **not** alias `react` /
   * `react-dom` in webpack — that can split React and break App Router (useContext null).
   */
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
  },
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

