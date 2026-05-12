import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @mizrahitality/contracts is consumed as TypeScript source — Next must transpile it.
  transpilePackages: ['@mizrahitality/contracts'],
  // Linting is centralized in the root flat config and run via `pnpm lint` / `pnpm -r lint`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
