import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // FIX #15: Headers de segurança (CSP, X-Frame-Options, etc.)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  // FIX #15: Domínios externos permitidos para imagens (logos, avatares do Supabase Storage)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ftqgkqchiinlqwfdwbbb.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
