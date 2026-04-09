/**
 * Application Configuration
 *
 * Centralizes all environment-based configuration.
 * Uses Vite's import.meta.env for environment variables.
 */

// API Configuration
// Default: port 8000 (production)
// Set VITE_API_PORT in .env.development to override during development
const API_PORT = import.meta.env.VITE_API_PORT || '8000';
const API_HOST = import.meta.env.VITE_API_HOST || 'localhost';

export const config = {
  api: {
    baseUrl: `http://${API_HOST}:${API_PORT}/api`,
    port: API_PORT,
    host: API_HOST,
  },
} as const;

// Type-safe config access
export type Config = typeof config;
