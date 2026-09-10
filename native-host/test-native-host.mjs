import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['host.js'], {
  cwd: new URL('.', import.meta.url),
  stdio: ['pipe', 'pipe', 'pipe'],
});

const request = Buffer.from(JSON.stringify({ id: 'test-1', action: 'health' }), 'utf8');
const header = Buffer.alloc(4);
header.writeUInt32LE(request.length, 0);
child.stdin.write(Buffer.concat([header, request]));

let buffer = Buffer.alloc(0);
const timeout = setTimeout(() => {
  child.kill();
  console.error('Native host smoke test timed out.');
  process.exit(1);
}, 5000);

child.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length < 4) return;

  const length = buffer.readUInt32LE(0);
  if (buffer.length < 4 + length) return;

  clearTimeout(timeout);
  const response = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
  child.kill();

  if (!response.ok) throw new Error(response.error || 'Native host returned an error.');
  if (response.id !== 'test-1') throw new Error('Unexpected Native Messaging response id.');
  if (response.data?.transport !== 'chrome-native-messaging') throw new Error('Unexpected transport.');
  if (!Array.isArray(response.data?.providers) || response.data.providers.length !== 1 || response.data.providers[0] !== 'antigravity') {
    throw new Error('Native host must expose only Antigravity.');
  }

  console.log(`Native Messaging health OK (v${response.data.version}).`);
  process.exit(0);
});

child.stderr.on('data', chunk => process.stderr.write(chunk));
child.on('error', error => {
  clearTimeout(timeout);
  throw error;
});
