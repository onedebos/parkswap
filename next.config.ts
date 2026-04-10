import type { NextConfig } from "next";
import path from "path";

/** Lock root to this app so Turbopack does not infer a parent monorepo (and Vercel paths stay correct). */
const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
