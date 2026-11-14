import { defineConfig } from "vite";

export default defineConfig({
  base: "/english/",
  build: {
    target: "es2022",
    sourcemap: false
  }
});
