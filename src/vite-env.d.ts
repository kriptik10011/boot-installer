/// <reference types="vite/client" />

/**
 * Compile-time constant injected by Vite define.
 * true in debug build variant, false in production.
 * Debug code guarded by this is tree-shaken out of production builds.
 */
declare const __DEBUG_BUILD__: boolean;

interface ImportMetaEnv {
  readonly VITE_API_PORT?: string;
  readonly VITE_API_HOST?: string;
  readonly VITE_DEBUG_BUILD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
