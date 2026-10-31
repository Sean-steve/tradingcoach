import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Vendor-independent TanStack Start server build; works locally and with Node.
export default defineConfig({
  server: { port: 8080, host: "127.0.0.1", strictPort: true },
  plugins: [
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    viteReact(),
    tsconfigPaths(),
    nitro({ preset: "node-server" }),
  ],
});
