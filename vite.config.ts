import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "physics",
              test: /node_modules[\\/]@dimforge[\\/]rapier3d/,
            },
            { name: "engine", test: /node_modules[\\/]three[\\/]/ },
          ],
        },
      },
    },
  },
});
