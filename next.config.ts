import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite carga archivos WebAssembly propios: se usa desde node_modules, sin empaquetar.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
