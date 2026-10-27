import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API runs separately; proxying it keeps everything on one
// origin so the httpOnly SameSite=Strict auth cookies just work.
const apiTarget = process.env.VITE_API_PROXY ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Long-term cacheable vendor chunks, separate from the app code.
        codeSplitting: {
          groups: [
            { name: 'mui', test: /node_modules[\\/](@mui|@emotion)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: 'socket', test: /node_modules[\\/](socket\.io-client|engine\.io-client|socket\.io-parser)[\\/]/ },
          ],
        },
      },
    },
  },
});
