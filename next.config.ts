import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@zilliz/milvus2-sdk-node'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
