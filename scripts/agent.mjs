// Run any OpenAI-compatible model (xAI's Grok by default) as the creator's
// agent: it reads the skill, scaffolds a game in this kit, replaces the
// engine and the shell, runs the ladder until it passes, renders the icon,
// packs the archive and takes it through the creator MCP to an unlisted
// publish. The model sees the same tools a person would use: the files, the
// kit's npm scripts, and the MCP.
//
//   XAI_API_KEY=... npm run agent -- "a one-thumb game about catching falling fruit"
//   options: --model grok-4  --slug fruit-catch  --steps 80  --no-publish  --submit
//            --base-url https://api.x.ai/v1   (any OpenAI-compatible chat endpoint)
//            --api-key-env XAI_API_KEY         (the variable the key is read from)
//            --offline                         (build and check only; no sign-in, no MCP)
//
// Sign in once first (opens the browser): node scripts/mcp-client.mjs login
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { KIT_ROOT, SLUG_RE } from './kit.mjs';
import { callTool, connect, listTools } from './mcp-client.mjs';

// ── arguments ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const has = (name) => argv.includes(name);
const BOOL_FLAGS = ['--no-publish', '--submit', '--offline'];
const idea = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !BOOL_FLAGS.includes(argv[i - 1]))).join(' ').trim();
const MODEL = flag('--model', process.env.XAI_MODEL ?? 'grok-4');
const BASE_URL = (flag('--base-url', process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1')).replace(/\/$/, '');
const API_KEY_ENV = flag('--api-key-env', 'XAI_API_KEY');
const MAX_STEPS = Number(flag('--steps', 80));
const PUBLISH = !has('--no-publish');
const SUBMIT = has('--submit');
const OFFLINE = has('--offline');
let slug = flag('--slug', null);
if (!idea) { console.error('usage: npm run agent -- "<what the game is>" [--slug <slug>] [--model grok-4] [--steps 80] [--no-publish] [--submit]'); process.exit(2); }
if (slug && !SLUG_RE.test(slug)) { console.error(`bad slug ${slug}`); process.exit(2); }
const API_KEY = process.env[API_KEY_ENV];
if (!API_KEY) { console.error(`${API_KEY_ENV} is not set; export it in this shell (never paste it into a chat)`); process.exit(2); }

mkdirSync(join(KIT_ROOT, 'out'), { recursive: true });
const LOG = join(KIT_ROOT, 'out', `agent-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
const log = (line) => { appendFileSync(LOG, line + '\n'); };
const say = (line) => { console.log(line); log(line); };

// ── the kit's tools, sandboxed to this checkout ─────────────────────────────
const ALLOWED_SCRIPTS = new Set(['new-game', 'build', 'check', 'check-build', 'smoke:render', 'smoke:seed', 'conformance', 'smoke:idle', 'typecheck', 'ladder', 'render-icon', 'render-banner', 'pack']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out']);
const clip = (s, n = 12000) => (s.length > n ? s.slice(0, n / 2) + `\n…[${s.length - n} chars cut]…\n` + s.slice(-n / 2) : s);

function safePath(p, { write = false } = {}) {
  const abs = resolve(KIT_ROOT, p);
  const rel = relative(KIT_ROOT, abs);
  if (rel.startsWith('..') || rel === '') throw new Error(`path ${p} is outside the kit`);
  if (rel.split(/[\\/]/).some((part) => SKIP_DIRS.has(part))) throw new Error(`path ${p} is not readable through this tool`);
  if (write && !(rel.startsWith('games/') && rel.split(/[\\/]/).length >= 3)) throw new Error('writes are allowed only inside games/<slug>/');
  return abs;
}

const tools = {
  list_files: {
    description: 'List files under a path in the kit (default: the game folder). Directories end with /.',
    parameters: { type: 'object', properties: { path: { type: 'string' } } },
    run({ path = slug ? `games/${slug}` : '.' }) {
      const abs = safePath(path);
      const out = [];
      const walk = (dir, depth) => {
        for (const name of readdirSync(dir).sort()) {
          if (SKIP_DIRS.has(name)) continue;
          const full = join(dir, name);
          const rel = relative(KIT_ROOT, full);
          if (statSync(full).isDirectory()) { out.push(rel + '/'); if (depth < 4) walk(full, depth + 1); } else out.push(`${rel} (${statSync(full).size} bytes)`);
        }
      };
      walk(abs, 0);
      return out.join('\n') || '(empty)';
    },
  },
  read_file: {
    description: 'Read a text file in the kit: the skill (skills/beyondplay-game/SKILL.md and its references/), the template (template/), or the game folder.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    run({ path }) { return clip(readFileSync(safePath(path), 'utf8'), 60000); },
  },
  write_file: {
    description: 'Write a text file inside games/<slug>/. Creates folders as needed. Never write the platform-owned files (index.html except <title>, src/main.tsx, src/beyondplay-kit.ts).',
    parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    run({ path, content }) {
      const abs = safePath(path, { write: true });
      const rel = relative(KIT_ROOT, abs).split(/[\\/]/).slice(2).join('/');
      if (['src/main.tsx', 'src/beyondplay-kit.ts'].includes(rel)) throw new Error(`${rel} is platform-owned; do not write it`);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
      return `wrote ${relative(KIT_ROOT, abs)} (${Buffer.byteLength(content)} bytes)`;
    },
  },
  run_script: {
    description: `Run one of the kit's npm scripts with arguments, for example { "script": "ladder", "args": ["games/<slug>"] } or { "script": "new-game", "args": ["<slug>", "Display Name"] }. Scripts: ${[...ALLOWED_SCRIPTS].join(', ')}. Returns the output and the exit code.`,
    parameters: { type: 'object', properties: { script: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } }, required: ['script'] },
    run({ script, args = [] }) {
      if (!ALLOWED_SCRIPTS.has(script)) throw new Error(`script ${script} is not available; use one of ${[...ALLOWED_SCRIPTS].join(', ')}`);
      if (!args.every((a) => typeof a === 'string' && !/[;&|`$<>\n]/.test(a))) throw new Error('arguments may not contain shell characters');
      if (script === 'new-game') {
        if (!SLUG_RE.test(args[0] ?? '')) throw new Error('new-game needs a slug matching ^[a-z0-9][a-z0-9-]{2,40}$');
        if (slug && args[0] !== slug) throw new Error(`this run's slug is ${slug}`);
        slug = args[0];
      }
      const p = spawnSync('npm', ['run', script, '--', ...args], { cwd: KIT_ROOT, encoding: 'utf8', timeout: 15 * 60_000, shell: process.platform === 'win32', env: process.env });
      const out = (p.stdout ?? '') + (p.stderr ?? '');
      return `exit ${p.status ?? 'signal'}\n${clip(out)}`;
    },
  },
  mcp: {
    description: 'Call a BeyondPlay creator MCP tool by name with its JSON arguments, for example { "tool": "create_project", "args": { "title": "Fruit Catch", "idempotencyKey": "fruit-catch-1" } }. The tool list is in the system prompt.',
    parameters: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' } }, required: ['tool'] },
    async run({ tool, args = {} }) {
      if (OFFLINE) throw new Error('this run is offline (--offline): no MCP; finish after the ladder passes');
      if (tool === 'submit_for_review' && !SUBMIT) throw new Error('submit_for_review is off for this run (pass --submit to allow it); finish after publish_unlisted');
      if (tool === 'publish_unlisted' && !PUBLISH) throw new Error('publishing is off for this run (--no-publish); finish after the ladder passes');
      const r = await callTool(mcpClient, tool, args);
      return (r.isError ? 'TOOL ERROR\n' : '') + clip(r.text, 20000);
    },
  },
  upload_file: {
    description: 'PUT a file from the game folder or out/ to a signed URL the MCP handed out (request_upload_url, request_icon_upload_url), with the headers it gave. Returns the HTTP status.',
    parameters: { type: 'object', properties: { url: { type: 'string' }, path: { type: 'string' }, headers: { type: 'object' } }, required: ['url', 'path'] },
    async run({ url, path, headers = {} }) {
      if (OFFLINE) throw new Error('this run is offline (--offline): nothing to upload to');
      const abs = resolve(KIT_ROOT, path);
      const rel = relative(KIT_ROOT, abs);
      if (!(rel.startsWith('out/') || rel.startsWith('games/'))) throw new Error('only files under out/ or games/ can be uploaded');
      if (!/^https:\/\//.test(url)) throw new Error('the upload URL must be https');
      const body = readFileSync(abs);
      const res = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/octet-stream', ...headers }, body });
      return `HTTP ${res.status} (${body.byteLength} bytes sent)${res.ok ? '' : '\n' + clip(await res.text(), 2000)}`;
    },
  },
  finish: {
    description: 'Stop. Give the game name, the slug, the live URL if published, what passed, and anything a person should look at.',
    parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
    run({ summary }) { return summary; },
  },
};

// ── the model ───────────────────────────────────────────────────────────────
async function chat(messages, toolDefs) {
  const body = JSON.stringify({ model: MODEL, messages, tools: toolDefs, tool_choice: 'auto', temperature: 0.3 });
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` }, body });
      if (res.status === 429 || res.status >= 500) throw new Error(`model endpoint ${res.status}: ${clip(await res.text(), 600)}`);
      break;
    } catch (err) {
      // A long tool run lets the server drop the idle keep-alive socket; the
      // next request then fails before any reply. Try again, a few times.
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  if (!res.ok) throw new Error(`model endpoint ${res.status}: ${clip(await res.text(), 1500)}`);
  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error(`no choice in the model reply: ${clip(JSON.stringify(data), 1500)}`);
  return { message: choice.message, usage: data.usage };
}

function systemPrompt(mcpTools) {
  const skill = readFileSync(join(KIT_ROOT, 'skills/beyondplay-game/SKILL.md'), 'utf8');
  const toolList = mcpTools.map((t) => `- ${t.name}: ${t.description.split('\n')[0]} Input: ${JSON.stringify(t.inputSchema?.properties ?? {})}`).join('\n');
  return `You are a game developer working inside a checkout of the beyondplay-skills kit, through tools. You build one BeyondPlay mini-game and take it to an unlisted publish through the creator MCP. Work step by step, read before you write, and run the checks rather than assuming.

Rules for this run:
- Start by reading skills/beyondplay-game/references/contract.md and references/mobile-rules.md, then the template's src/game.ts, src/App.tsx and smoke.driver.mjs; they are the shape to keep.
- Scaffold with run_script new-game. Then replace src/game.ts (the deterministic engine), src/App.tsx (the React shell), src/beyondplay.config.ts (the declaration) and smoke.driver.mjs (how the checks play your game). Fill publish.config.json (name, tagline, description, four tags) and CREDITS.md. Draw the icon in assets/icon-source.html (512 x 512 canvas or HTML, no external files).
- Draw everything in code on the canvas; ship no image or audio files. Procedural sound only, if any.
- Run run_script ladder on the game folder and fix what fails until it prints LADDER-OK. Read the failing check's output; the references explain each failure. Never weaken a check or edit the platform-owned files.
- ${OFFLINE ? 'This run is offline: after LADDER-OK run run_script render-icon and run_script pack, then finish. Skip the MCP path below.' : ''}
- Then run_script render-icon, run_script pack, and the MCP path: whoami, create_project (with an idempotencyKey), request_upload_url, upload_file out/<slug>.tar.gz to its url with its headers, start_build, get_build every 20 seconds until passed or failed (fix and re-upload on failed), set_metadata, request_icon_upload_url (kind icon) + upload_file games/<slug>/assets/icon.png + set_icon, ${PUBLISH ? 'publish_unlisted with the slug, then get_project until publish.state is published or failed' : 'and stop before publish_unlisted (publishing is off for this run)'}. ${SUBMIT ? 'Then submit_for_review.' : 'Do not call submit_for_review; a person submits.'}
- Finish with the finish tool: name, slug, URL, what passed, anything a person should look at. If you are stuck after honest attempts, finish and say exactly what blocks you.

The creator MCP tools (call them through the mcp tool):
${toolList}

The skill you are following:

${skill}`;
}

// ── main ────────────────────────────────────────────────────────────────────
say(`agent: ${MODEL} at ${BASE_URL}; log ${relative(KIT_ROOT, LOG)}${OFFLINE ? '; offline' : ''}`);
const mcpClient = OFFLINE ? null : await connect({ interactive: true });
const mcpTools = OFFLINE ? [] : await listTools(mcpClient);
if (mcpClient) {
  const me = await callTool(mcpClient, 'whoami', {});
  say(`signed in: ${(() => { try { const j = JSON.parse(me.text); return `${j.name ?? ''} <${j.email}>`; } catch { return me.text.slice(0, 120); } })()}`);
}

const toolDefs = Object.entries(tools).map(([name, t]) => ({ type: 'function', function: { name, description: t.description, parameters: t.parameters } }));
const messages = [
  { role: 'system', content: systemPrompt(mcpTools) },
  { role: 'user', content: `Build this game: ${idea}${slug ? `\nUse the slug ${slug}.` : ''}` },
];
let finished = null;
let totalTokens = 0;
for (let step = 1; step <= MAX_STEPS && !finished; step++) {
  const { message, usage } = await chat(messages, toolDefs);
  totalTokens += usage?.total_tokens ?? 0;
  messages.push(message);
  if (message.content) say(`\n[${step}] ${message.content.trim().slice(0, 600)}`);
  const calls = message.tool_calls ?? [];
  if (!calls.length) {
    messages.push({ role: 'user', content: 'Continue with a tool call, or call finish.' });
    continue;
  }
  for (const call of calls) {
    const name = call.function?.name;
    let args = {};
    try { args = JSON.parse(call.function?.arguments || '{}'); } catch { args = {}; }
    let result;
    try {
      const t = tools[name];
      if (!t) throw new Error(`no tool ${name}`);
      result = await t.run(args);
      if (name === 'finish') finished = result;
    } catch (err) {
      result = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
    const argText = JSON.stringify(args);
    say(`[${step}] ${name} ${argText.length > 200 ? argText.slice(0, 200) + '…' : argText}`);
    log(`    -> ${String(result).slice(0, 4000)}`);
    const shown = name === 'write_file' ? String(result) : clip(String(result));
    if (shown.length > 160) console.log('    -> ' + shown.split('\n').slice(-3).join(' | ').slice(0, 300));
    messages.push({ role: 'tool', tool_call_id: call.id, content: String(result) });
  }
}
if (mcpClient) await mcpClient.close();
say(`\n${finished ? 'DONE' : 'STOPPED: step budget spent'} after ${messages.filter((m) => m.role === 'tool').length} tool calls, ${totalTokens} model tokens.\n${finished ?? ''}`);
process.exit(finished ? 0 : 1);
