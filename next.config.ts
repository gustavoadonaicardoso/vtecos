import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Fix Turbopack usando o diretório errado do workspace (detectava package-lock.json do C:\Users\Gustavo)
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Impede que o Supabase seja re-bundled no servidor (evita leitura de .map cloud-only)
  serverExternalPackages: [
    "@supabase/supabase-js",
    "@supabase/postgrest-js",
    "@supabase/realtime-js",
    "@supabase/storage-js",
    "@supabase/auth-js",
    "@supabase/functions-js",
  ],

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
