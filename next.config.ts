import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables the forbidden() / unauthorized() APIs used by src/lib/session.ts
    // and rendered by src/app/forbidden.tsx. Without this flag, calling
    // forbidden() throws instead of rendering the 403 boundary.
    authInterrupts: true,
    // Next.js caps Server Action request bodies at 1MB regardless of host —
    // that's not a Vercel-specific limit, so it still needs raising even
    // though One-Lot Project Docs uploads never run on Vercel (see
    // docs/DOCUMENTS.md). Matches the action's own MAX_FILE_SIZE_BYTES.
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
