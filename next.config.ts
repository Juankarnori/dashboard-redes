import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Miniaturas de contenido vienen de los CDN de Meta.
    remotePatterns: [
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "*.fbcdn.net" },
      { protocol: "https", hostname: "scontent*.xx.fbcdn.net" },
    ],
  },
};

export default nextConfig;
