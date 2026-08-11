import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables the forbidden() / unauthorized() APIs used by src/lib/session.ts
    // and rendered by src/app/forbidden.tsx. Without this flag, calling
    // forbidden() throws instead of rendering the 403 boundary.
    authInterrupts: true,
  },
};

export default nextConfig;
