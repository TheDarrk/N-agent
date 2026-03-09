/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {},
  serverExternalPackages: ["near-api-js"],
  logging: {
    fetches: {
      fullUrl: false
    }
  }
}

export default nextConfig
