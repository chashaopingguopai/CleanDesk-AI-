import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // 1420 is commonly retained by a stale Vite process on Windows. Keep
  // CleanDesk's development server isolated; this does not affect releases.
  server: {
    port: 1421,
    strictPort: true,
    // Rust continuously writes and locks DLLs below target while Tauri builds.
    // Those files are not frontend source and must never be watched by Vite.
    watch: { ignored: ["**/src-tauri/target/**"] }
  },
  envPrefix: ["VITE_", "TAURI_"]
});
