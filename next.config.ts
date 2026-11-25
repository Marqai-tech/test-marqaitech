// Build: task152-152fix-cachebust-2026-10-25 (fresh build cache for missing API routes)
// Build: 3boxes-hrms-favicon-fix-2026-08-06
import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // BUG FIX: allow dev origins — Next.js 16 blocks requests from unknown
  // origins in dev mode. Add all Vercel deployment URLs + localhost.
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    // Local LAN/WSL adapter IPs — browsing via "Network:" URL (e.g.
    // http://172.22.144.1:3000) without these makes Next.js 16 block dev
    // resources, which kills client-side hydration and the login form
    // silently falls back to a native GET submit (GET /login?) that reloads
    // the page instead of calling the API.
    'http://172.22.144.1:3000',
    '172.22.144.1',
    'https://test-marqaitech.vercel.app',
    'https://test-marqaitech-marshshaik-5449s-projects.vercel.app',
    'https://test-marqaitech-git-main-marshshaik-5449s-projects.vercel.app',
  ],
  // FIX: pin the Turbopack workspace root. A stray package-lock.json in
  // C:\Users\User made Turbopack infer the wrong root on Windows dev machines.
  turbopack: {
    root: __dirname,
  },
  // Allow all subdomains of 3boxeshrms.com for image optimization and links
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.3boxeshrms.com',
      },
      {
        protocol: 'https',
        hostname: '3boxeshrms.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800",
          },
        ],
      },
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/icons/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      // Security headers for all pages
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
