import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { patchCssModules } from "vite-css-modules";

export default defineConfig({
  plugins: [
    patchCssModules({
      // Only export an object with the class names, so that special characters
      // work without much hassle (like having to use es2022 or up).
      exportMode: "default",
      // Generate TypeScript types (*.d.ts files) for the CSS modules.
      generateSourceTypes: true,
    }),
    solidPlugin(),
  ],
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
  },
});
