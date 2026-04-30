import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173 },
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    include: ["buffer", "@solana/web3.js"],
  },
});
