import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/solid-tours/",
  plugins: [react()],
  build: {
    outDir: "build",
    emptyOutDir: true,
  },
});
