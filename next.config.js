/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output for Railway deployment
  output: 'standalone',

  // Allow GHL and Supabase image domains
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.leadconnectorhq.com' },
    ],
  },

  // Strict mode for better error detection
  reactStrictMode: true,

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
