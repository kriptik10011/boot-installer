#!/usr/bin/env node
/**
 * dev-full — Start frontend (Vite) + backend (FastAPI) together.
 *
 * Spawns both processes and ensures clean shutdown on exit.
 * Backend uses the venv Python and runs on port 8000 (matches .env.development).
 * Frontend runs Vite on port 5173.
 *
 * Usage: node scripts/dev-full.js
 */

import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { platform } from 'os';

const ROOT = resolve(import.meta.dirname, '..');
const BACKEND_DIR = join(ROOT, 'backend');
const IS_WIN = platform() === 'win32';

// Resolve venv Python path
const venvPython = IS_WIN
  ? join(BACKEND_DIR, 'venv', 'Scripts', 'python.exe')
  : join(BACKEND_DIR, 'venv', 'bin', 'python');

if (!existsSync(venvPython)) {
  console.error(`[dev-full] Python venv not found at ${venvPython}`);
  console.error('[dev-full] Run: cd backend && python -m venv venv && venv\\Scripts\\pip install -r requirements.txt');
  process.exit(1);
}

// Pre-flight: verify critical Python dependencies are installed
console.log('[dev-full] Checking critical Python dependencies...');
const depCheck = spawnSync(venvPython, [
  '-c', 'import sqlcipher3; import argon2; import dateutil; import platformdirs; import recipe_scrapers; from bs4 import BeautifulSoup; print("deps-ok")'
], { cwd: BACKEND_DIR, encoding: 'utf-8', timeout: 10000 });

if (depCheck.status !== 0 || !depCheck.stdout.includes('deps-ok')) {
  console.error('[dev-full] Missing required Python packages!');
  console.error('[dev-full] Run: cd backend && venv\\Scripts\\pip install -r requirements.txt');
  if (depCheck.stderr) console.error(depCheck.stderr.trim());
  process.exit(1);
}
console.log('[dev-full] Dependencies OK');

const children = [];

function killAll() {
  for (const child of children) {
    if (!child.killed) {
      try {
        // On Windows, kill the process tree to avoid orphans
        if (IS_WIN) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        // Process already dead
      }
    }
  }
}

// Kill any stale backend on port 8000 before starting a new one.
// Prevents duplicate backends fighting over the same SQLite DB,
// which causes "database is locked" → PendingRollbackError cascades.
function killStaleBackends() {
  if (IS_WIN) {
    try {
      const result = spawnSync('netstat', ['-ano'], { encoding: 'utf-8', timeout: 5000 });
      if (result.stdout) {
        const lines = result.stdout.split('\n').filter(l => l.includes(':8000') && l.includes('LISTENING'));
        const pids = new Set();
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
        }
        for (const pid of pids) {
          console.log(`[dev-full] Killing stale backend on port 8000 (PID ${pid})`);
          spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' });
        }
        if (pids.size > 0) {
          // Brief pause to let the port release
          spawnSync(IS_WIN ? 'timeout' : 'sleep', IS_WIN ? ['/t', '1', '/nobreak'] : ['1'], { stdio: 'ignore' });
        }
      }
    } catch {
      // Best-effort — proceed anyway
    }
  } else {
    try {
      const result = spawnSync('lsof', ['-ti', ':8000'], { encoding: 'utf-8', timeout: 5000 });
      if (result.stdout) {
        const pids = result.stdout.trim().split('\n').filter(Boolean);
        for (const pid of pids) {
          console.log(`[dev-full] Killing stale backend on port 8000 (PID ${pid})`);
          spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
        }
      }
    } catch {
      // Best-effort
    }
  }
}

// Cleanup on any exit signal
process.on('SIGINT', () => { killAll(); process.exit(0); });
process.on('SIGTERM', () => { killAll(); process.exit(0); });
process.on('exit', killAll);

// 0. Kill any stale backend before starting
killStaleBackends();

// 1. Start backend
console.log('[dev-full] Starting backend on port 8000...');
const backend = spawn(
  venvPython,
  ['run.py', '--port', '8000', '--no-reload'],
  {
    cwd: BACKEND_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WEEKLY_REVIEW_DEV_MODE: 'true' },
  }
);
children.push(backend);

backend.stdout.on('data', (data) => {
  process.stdout.write(`[backend] ${data}`);
});
backend.stderr.on('data', (data) => {
  process.stderr.write(`[backend] ${data}`);
});
backend.on('exit', (code) => {
  console.log(`[dev-full] Backend exited with code ${code}`);
});

// 2. Start frontend (after short delay for backend to bind)
setTimeout(() => {
  console.log('[dev-full] Starting frontend (Vite)...');
  const frontend = spawn(
    IS_WIN ? 'npx.cmd' : 'npx',
    ['vite'],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: IS_WIN,
    }
  );
  children.push(frontend);

  frontend.stdout.on('data', (data) => {
    process.stdout.write(`[frontend] ${data}`);
  });
  frontend.stderr.on('data', (data) => {
    process.stderr.write(`[frontend] ${data}`);
  });
  frontend.on('exit', (code) => {
    console.log(`[dev-full] Frontend exited with code ${code}`);
    killAll();
    process.exit(code ?? 0);
  });
}, 1500);
