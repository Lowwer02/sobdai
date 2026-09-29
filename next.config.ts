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
    // Org logos, user avatars, and existing covers are served from Supabase Storage.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "assets.sobdai.com",
        port: "",
        pathname: "/news/*/cover/**",
        search: "",
      },
      {
        protocol: "https",
        hostname: "assets.sobdai.com",
        port: "",
        pathname: "/articles/*/cover/**",
        search: "",
      },
    ],
    // Prefer modern formats when the browser supports them.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2_678_400,
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
  // The payment analyzer is Node-only: tesseract.js uses worker_threads and
  // local WASM/model files. Keep those packages out of Edge/client graphs and
  // make Next's server output tracing include their installed assets.
  serverExternalPackages: [
    'tesseract.js',
    'tesseract.js-core',
  ],
  outputFileTracingIncludes: {
    // OCR is executed only by the upload analyzer route and the explicit
    // admin resume action. These are the only explicit includes; the admin
    // orders list may still inherit the files through its shared server-action
    // module, which is documented as bounded LOW trace overhead.
    '/api/payment/manual/slip': [
      'node_modules/tesseract.js-core/**/*',
      'node_modules/tesseract.js/src/worker-script/node/index.js',
      'vendor/tessdata_fast/4.0.0/eng.traineddata.gz',
      'vendor/tessdata_fast/4.0.0/tha.traineddata.gz',
    ],
    '/admin/orders/[id]': [
      'node_modules/tesseract.js-core/**/*',
      'node_modules/tesseract.js/src/worker-script/node/index.js',
      'vendor/tessdata_fast/4.0.0/eng.traineddata.gz',
      'vendor/tessdata_fast/4.0.0/tha.traineddata.gz',
    ],
  },
};

export default nextConfig;
