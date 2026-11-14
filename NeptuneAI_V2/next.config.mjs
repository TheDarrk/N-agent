import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["near-api-js"],
  transpilePackages: ["@hot-labs/kit", "@hot-labs/near-connect"],
  compiler: {
    styledComponents: true,
  },
  async headers() {
    const longCache = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    return [
      { source: "/images/:path*", headers: longCache },
      { source: "/agents/:path*", headers: longCache },
      { source: "/neptune-logo.png", headers: longCache },
      { source: "/favicon.png", headers: longCache },
    ];
  },
  logging: {
    fetches: {
      fullUrl: false
    }
  }
};

export default nextConfig;
