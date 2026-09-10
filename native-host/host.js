import { AntigravityProvider } from './providers/antigravity.js';

const VERSION = '0.7.0';
const MAX_MESSAGE_SIZE = 64 * 1024 * 1024;
const providers = new Map([['antigravity', new AntigravityProvider()]]);

let inputBuffer = Buffer.alloc(0);

function send(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(header);
  process.stdout.write(payload);
}

function getProvider(id) {
  const provider = providers.get(id);
  if (!provider) throw new Error(`Fournisseur natif inconnu: ${id}`);
  return provider;
}

async function handle(request) {
  const action = request?.action;

  if (action === 'health') {
    return {
      version: VERSION,
      pid: process.pid,
      node: process.version,
      transport: 'chrome-native-messaging',
      providers: [...providers.keys()],
    };
  }

  if (action === 'provider.status') return getProvider(request.provider).status();
  if (action === 'provider.models') return getProvider(request.provider).models();
  if (action === 'provider.login') return getProvider(request.provider).login();
  if (action === 'provider.logout') return getProvider(request.provider).logout();

  if (action === 'chat') {
    const payload = request.payload || {};
    if (!payload.question || !payload.videoId) throw new Error('Question ou videoId manquant.');
    if (payload.provider !== 'antigravity') throw new Error('Le companion natif est réservé à Antigravity.');
    return { provider: 'antigravity', ...(await getProvider('antigravity').chat(payload)) };
  }

  throw new Error(`Action Native Messaging inconnue: ${action || '(vide)'}`);
}

async function processMessage(message) {
  const id = String(message?.id ?? '');
  try {
    send({ id, ok: true, data: await handle(message) });
  } catch (error) {
    send({ id, ok: false, error: error?.message || String(error) });
  }
}

function consume() {
  while (inputBuffer.length >= 4) {
    const length = inputBuffer.readUInt32LE(0);
    if (length <= 0 || length > MAX_MESSAGE_SIZE) {
      send({ id: '', ok: false, error: 'Message Native Messaging invalide ou trop volumineux.' });
      process.exit(1);
      return;
    }
    if (inputBuffer.length < 4 + length) return;

    const payload = inputBuffer.subarray(4, 4 + length);
    inputBuffer = inputBuffer.subarray(4 + length);

    let message;
    try {
      message = JSON.parse(payload.toString('utf8'));
    } catch {
      send({ id: '', ok: false, error: 'JSON Native Messaging invalide.' });
      continue;
    }

    processMessage(message).catch(error => {
      send({ id: String(message?.id ?? ''), ok: false, error: error?.message || String(error) });
    });
  }
}

process.stdin.on('data', chunk => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  consume();
});
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
