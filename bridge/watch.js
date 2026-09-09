import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(ROOT, 'server.js');

let child = null;
let restartTimer = null;
let shuttingDown = false;

function startBridge() {
  if (shuttingDown) return;

  child = spawn(process.execPath, [ENTRY], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: false,
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (restartTimer) return;
    console.log(`[Professor Ask] Bridge arrete (${code ?? signal ?? 'inconnu'}). Redemarrage dans 1 s...`);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      startBridge();
    }, 1000);
  });
}

function restartBridge(reason) {
  if (shuttingDown) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    console.log(`[Professor Ask] Changement detecte (${reason}). Redemarrage du bridge...`);
    if (child && !child.killed) {
      child.once('exit', () => startBridge());
      child.kill();
    } else {
      startBridge();
    }
  }, 300);
}

const watcher = watch(ROOT, { recursive: true }, (_eventType, filename) => {
  const name = String(filename || '').replaceAll('\\', '/');
  if (!name) return;
  if (name.startsWith('node_modules/')) return;
  if (name.endsWith('.log')) return;
  if (name === '.professor-ask-secrets.json') return;
  if (!/\.(?:js|json|bat|cmd)$/i.test(name)) return;
  restartBridge(name);
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  watcher.close();
  clearTimeout(restartTimer);
  if (child && !child.killed) child.kill();
  setTimeout(() => process.exit(0), 100).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[Professor Ask] Auto-reload portable actif.');
console.log(`[Professor Ask] Node ${process.version} - watcher PID ${process.pid}`);
startBridge();
