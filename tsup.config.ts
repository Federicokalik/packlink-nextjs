import { defineConfig } from "tsup";

export default defineConfig([
  // Server-side code: the API client, checkout helpers, status sync and route handlers.
  {
    entry: {
      index: "src/index.ts",
      "next/index": "src/next/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    target: "es2022",
  },
  // Client components. The directive is added as a banner because esbuild drops
  // module-level directives found in the sources when it bundles them.
  {
    entry: {
      "react/index": "src/react/index.ts",
      "map/index": "src/map/index.tsx",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    target: "es2022",
    external: ["react", "leaflet"],
    banner: { js: '"use client";' },
  },
]);
