import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /downloads is an unfinished surface (กำลังพัฒนา placeholder). Until the
  // learning-media feature ships, send visitors to the public /articles hub.
  // TEMPORARY (307) on purpose — the route returns once the feature is real;
  // restoration is just deleting this entry (the page source is untouched).
  async redirects() {
    return [
      {
        source: "/downloads",
        destination: "/articles",
        permanent: false,
      },
    ];
  },
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
    // Enables the `forbidden()` (and `unauthorized()`) auth interrupts from
    // `next/navigation`, used by the admin staff boundary in app/admin/layout.tsx.
    // Required by Next.js for forbidden() to render the app/forbidden.tsx UI.
    authInterrupts: true,
  },
};

export default nextConfig;
