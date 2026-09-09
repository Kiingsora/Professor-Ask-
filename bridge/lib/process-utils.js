import { spawn } from 'node:child_process';

export function runCommand(command, args = [], { timeoutMs = 30000, cwd, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(reject, new Error(`Timeout: ${command} ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout?.on('data', chunk => { stdout += String(chunk); });
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    child.once('error', error => finish(reject, error));
    child.once('close', code => {
      if (code === 0) {
        finish(resolve, { stdout: stdout.trim(), stderr: stderr.trim(), code });
      } else {
        finish(reject, new Error((stderr || stdout || `${command} a quitté avec le code ${code}`).trim()));
      }
    });
  });
}

export async function commandExists(command, args = ['--version']) {
  try {
    await runCommand(command, args, { timeoutMs: 8000 });
    return true;
  } catch {
    return false;
  }
}

export function openExternal(url) {
  return new Promise((resolve, reject) => {
    let child;
    if (process.platform === 'win32') {
      child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
    } else if (process.platform === 'darwin') {
      child = spawn('open', [url], { detached: true, stdio: 'ignore' });
    } else {
      child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

export function launchInteractive(command, args = []) {
  return new Promise((resolve, reject) => {
    let child;

    if (process.platform === 'win32') {
      child = spawn('cmd.exe', ['/k', command, ...args], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
    } else if (process.platform === 'darwin') {
      const quoted = [command, ...args]
        .map(value => `'${String(value).replace(/'/g, `'\\''`)}'`)
        .join(' ');
      child = spawn('osascript', [
        '-e',
        `tell application "Terminal" to do script ${JSON.stringify(quoted)}`,
      ], { detached: true, stdio: 'ignore' });
    } else {
      child = spawn('x-terminal-emulator', ['-e', command, ...args], {
        detached: true,
        stdio: 'ignore',
      });
    }

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

export function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}
