import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Org logos + user avatars are served from Supabase Storage.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Prefer modern formats when the browser supports them.
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // lucide-react ships many named exports; this keeps imports tree-shaken
    // and avoids pulling the whole icon set into bundles.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
