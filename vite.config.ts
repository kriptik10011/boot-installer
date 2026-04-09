/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
// Build variant: set VITE_DEBUG_BUILD=true for debug installer
const isTesting = !!process.env.VITEST;

export default defineConfig(({ mode }) => {
  // Load .env files so VITE_DEBUG_BUILD is available in config (not just import.meta.env)
  const env = loadEnv(mode, process.cwd());
  const isDebugBuild = env.VITE_DEBUG_BUILD === 'true' || process.env.VITE_DEBUG_BUILD === 'true';

  return {
  plugins: [
    // Skip react() + tailwind() during tests — saves memory
    ...(!isTesting ? [react(), tailwindcss()] : []),
  ],
  define: {
    // Compile-time constant — enables tree-shaking of debug code in production builds
    __DEBUG_BUILD__: JSON.stringify(isDebugBuild),
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
        minForks: 1,
        execArgv: ['--max-old-space-size=4096'],
      },
    },
    testTimeout: 15000,
    teardownTimeout: 5000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    // Drop console.* and debugger statements in production builds (not debug variant)
    drop: (process.env.NODE_ENV === 'production' && !isDebugBuild) ? ['console', 'debugger'] : [],
  },
  // Tauri expects a fixed port
  server: {
    port: 5173,
    strictPort: true,
  },
  // Only expose VITE_ vars to client bundle (TAURI_ vars used in build config via process.env, not import.meta.env)
  envPrefix: ['VITE_'],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-three': ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
          'vendor-framer': ['framer-motion'],
          'vendor-recharts': ['recharts'],
        },
      },
    },
  },
  };
});
