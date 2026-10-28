// A small client for the BeyondPlay creator MCP: OAuth sign-in through the
// browser (PKCE, dynamic client registration, a loopback callback on this
// machine), tokens kept in ~/.config/beyondplay-skills/mcp-auth.json, and two
// calls the agent runner needs: listTools() and callTool(name, args).
//
//   node scripts/mcp-client.mjs login          # sign in (opens the browser)
//   node scripts/mcp-client.mjs whoami         # the account the token belongs to
//   node scripts/mcp-client.mjs logout         # forget the token
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';

export const MCP_URL = process.env.BEYONDPLAY_MCP_URL ?? 'https://app.beyondplay.xyz/api/mcp';
const CALLBACK_PORT = Number(process.env.BEYONDPLAY_CALLBACK_PORT ?? 17917);
const STORE_DIR = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'beyondplay-skills');
const STORE = join(STORE_DIR, 'mcp-auth.json');

function readStore() {
  try { return JSON.parse(readFileSync(STORE, 'utf8')); } catch { return {}; }
}
function writeStore(data) {
  mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE, JSON.stringify(data, null, 2));
  try { chmodSync(STORE, 0o600); } catch { /* windows */ }
}
export function forgetAuth() {
  if (existsSync(STORE)) writeStore({});
}

/** The OAuth provider the SDK drives; it keeps what it learns in the store. */
class FileAuthProvider {
  constructor() { this.store = readStore(); this.pending = null; }
  get redirectUrl() { return `http://127.0.0.1:${CALLBACK_PORT}/callback`; }
  get clientMetadata() {
    return {
      client_name: 'beyondplay-skills agent runner',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }
  clientInformation() {
    // A registration is only good for the redirect it was made with.
    if (this.store.client && this.store.client.redirectUrl === this.redirectUrl) return this.store.client.info;
    return undefined;
  }
  saveClientInformation(info) { this.store.client = { redirectUrl: this.redirectUrl, info }; writeStore(this.store); }
  tokens() { return this.store.tokens; }
  saveTokens(tokens) { this.store.tokens = tokens; writeStore(this.store); }
  saveCodeVerifier(v) { this.store.codeVerifier = v; writeStore(this.store); }
  codeVerifier() { return this.store.codeVerifier; }
  invalidateCredentials(scope) {
    if (scope === 'all' || scope === 'tokens') delete this.store.tokens;
    if (scope === 'all' || scope === 'client') delete this.store.client;
    if (scope === 'all' || scope === 'verifier') delete this.store.codeVerifier;
    writeStore(this.store);
  }
  redirectToAuthorization(url) {
    const href = url.toString();
    console.log('\nSign in to BeyondPlay in your browser (the account you create games with):\n  ' + href + '\n');
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', href] : [href];
    try { spawn(opener, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* no opener; the URL is printed */ }
  }
}

/** One loopback server that resolves with the authorization code the browser brings back. */
function waitForCallback(timeoutMs = 10 * 60_000) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${CALLBACK_PORT}`);
      if (url.pathname !== '/callback') { res.statusCode = 404; res.end('not found'); return; }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.setHeader('content-type', 'text/html; charset=utf-8');
      if (code) {
        res.end('<p style="font:16px system-ui;padding:24px">Signed in. You can close this tab and return to the terminal.</p>');
        clearTimeout(timer); server.close(); resolve(code);
      } else {
        res.statusCode = 400;
        res.end(`<p style="font:16px system-ui;padding:24px">Sign-in failed: ${error ?? 'no code'}.</p>`);
        clearTimeout(timer); server.close(); reject(new Error(`sign-in failed: ${error ?? 'no code'}`));
      }
    });
    const timer = setTimeout(() => { server.close(); reject(new Error('sign-in timed out after ten minutes')); }, timeoutMs);
    server.on('error', (e) => { clearTimeout(timer); reject(new Error(`callback port ${CALLBACK_PORT} unavailable: ${e.message}`)); });
    server.listen(CALLBACK_PORT, '127.0.0.1');
  });
}

/** Connect, signing in through the browser when the server asks for it. Returns the SDK client. */
export async function connect({ interactive = true } = {}) {
  const provider = new FileAuthProvider();
  const make = () => new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider });
  const newClient = () => new Client({ name: 'beyondplay-skills-agent', version: '0.1.0' });
  // The callback server is up before the first attempt: when the server asks for
  // sign-in, the SDK registers the client, opens the browser and throws; the
  // browser then lands on the callback with the code.
  const pendingCode = interactive ? waitForCallback() : null;
  pendingCode?.catch(() => {});
  const transport = make();
  try {
    const client = newClient();
    await client.connect(transport);
    pendingCode?.then(() => {}, () => {});
    return client;
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) throw err;
    if (!interactive) throw new Error('not signed in; run: node scripts/mcp-client.mjs login');
  }
  const code = await pendingCode;
  await transport.finishAuth(code);
  const client = newClient();
  await client.connect(make());
  return client;
}

/** The tool list as the model sees it: name, description, input schema. */
export async function listTools(client) {
  const { tools } = await client.listTools();
  return tools.map((t) => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema }));
}

/** Call one tool; returns { isError, text } with the JSON text the server sends. */
export async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args ?? {} });
  const text = (result.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return { isError: !!result.isError, text };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const cmd = process.argv[2] ?? 'whoami';
  if (cmd === 'logout') { forgetAuth(); console.log('forgot the BeyondPlay sign-in'); process.exit(0); }
  const client = await connect({ interactive: true });
  const r = await callTool(client, 'whoami', {});
  console.log(r.text);
  await client.close();
  process.exit(r.isError ? 1 : 0);
}
