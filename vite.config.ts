import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const isHmrDisabled = process.env.DISABLE_HMR === 'true';

  const base =
    process.env.VITE_BASE_PATH ||
    (process.env.GITHUB_PAGES === 'true'
      ? '/AI-Code-Reviewer/'
      : '/');

  return {
    base,

    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      // Allow the Render hostname to access the Vite server
      allowedHosts: [
        'ai-code-reviewer-1hx0.onrender.com',
      ],

      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: isHmrDisabled ? false : undefined,

      // Disable file watching when DISABLE_HMR is true.
      watch: isHmrDisabled ? null : {},
    },
  };
});
