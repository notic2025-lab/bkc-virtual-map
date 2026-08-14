#!/usr/bin/env node
// BKC現地調査用: 静的配信 + ngrok HTTPS + スマホ状態のPC自動バックアップ。
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_DIR = process.env.BKC_SURVEY_BACKUP_DIR
  ? resolve(process.env.BKC_SURVEY_BACKUP_DIR) : join(ROOT, 'survey-backups');
const portArg = Number(process.argv[2] ?? 8931);
const PORT = Number.isInteger(portArg) && portArg >= 1024 && portArg <= 65535 ? portArg : 8931;
const NO_TUNNEL = process.argv.includes('--no-tunnel');
const TOKEN = randomBytes(24).toString('hex');
const MAX_BODY = 8 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function tokenMatches(value) {
  if (typeof value !== 'string' || value.length !== TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(TOKEN));
}

function send(res, status, body = '', headers = {}) {
  res.writeHead(status, {
    'Cache-Control': status === 200 ? 'no-cache' : 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers,
  });
  res.end(body);
}

async function saveBackup(req, res, url) {
  if (!tokenMatches(url.searchParams.get('token'))) return send(res, 403, 'Forbidden');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return send(res, 413, 'Backup too large');
    chunks.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return send(res, 400, 'Invalid JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || !data.nodes || typeof data.nodes !== 'object'
      || !Array.isArray(data.edges) || !Array.isArray(data.tracks)) {
    return send(res, 422, 'Invalid survey state');
  }
  await mkdir(BACKUP_DIR, { recursive: true });
  const payload = JSON.stringify(data, null, 2);
  const temporary = join(BACKUP_DIR, '.latest-state.tmp');
  const destination = join(BACKUP_DIR, 'latest-state.json');
  await writeFile(temporary, payload, { mode: 0o600 });
  await rename(temporary, destination);
  send(res, 204);
}

async function loadBackup(res, url) {
  if (!tokenMatches(url.searchParams.get('token'))) return send(res, 403, 'Forbidden');
  try {
    const body = await readFile(join(BACKUP_DIR, 'latest-state.json'));
    send(res, 200, body, { 'Content-Type': 'application/json; charset=utf-8' });
  } catch {
    send(res, 404, 'No backup');
  }
}

async function serveStatic(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return send(res, 400, 'Bad path'); }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const allowed = relative === 'index.html' || relative === 'manifest.webmanifest' || relative === 'sw.js'
    || /^(css|js|vendor|assets)\//.test(relative);
  if (!allowed || relative.split('/').some(part => part.startsWith('.'))) return send(res, 403, 'Forbidden');
  const target = resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return send(res, 403, 'Forbidden');
  let info;
  try { info = await stat(target); } catch { return send(res, 404, 'Not found'); }
  if (!info.isFile()) return send(res, 404, 'Not found');
  const body = await readFile(target);
  send(res, 200, body, { 'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream' });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === 'PUT' && url.pathname === '/api/survey-backup') return await saveBackup(req, res, url);
    if (req.method === 'GET' && url.pathname === '/api/survey-backup') return await loadBackup(res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD, PUT' });
    await serveStatic(req, res, url);
  } catch (error) {
    console.error('request failed:', error.message);
    send(res, 500, 'Internal server error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`調査サーバー: http://127.0.0.1:${PORT}/?survey&sync=${TOKEN}`);
  console.log(NO_TUNNEL ? 'ローカル検証モード（ngrokなし）' : 'ngrokのHTTPS URLを取得しています…');
});

const tunnel = NO_TUNNEL ? null : spawn(
  'ngrok', ['http', `http://127.0.0.1:${PORT}`, '--log', 'stdout', '--log-format', 'json'],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
tunnel?.stderr.on('data', chunk => process.stderr.write(chunk));
tunnel?.on('exit', code => {
  if (code) console.error(`ngrokが終了しました (code ${code})。ngrok config add-authtoken の設定を確認してください。`);
});

let announced = false;
const started = Date.now();
const timer = setInterval(async () => {
  if (NO_TUNNEL) return;
  if (announced) return;
  try {
    const response = await fetch('http://127.0.0.1:4040/api/tunnels');
    const data = await response.json();
    const https = data.tunnels?.find(t => t.proto === 'https')?.public_url;
    if (https) {
      announced = true;
      console.log('\nスマホで次のURLを開いてください:');
      console.log(`${https}/?survey&sync=${TOKEN}`);
      console.log(`\nPC自動バックアップ先: ${join(BACKUP_DIR, 'latest-state.json')}`);
      console.log('調査中はこの画面とPCを起動したままにしてください。終了は Ctrl+C です。\n');
    }
  } catch { /* ngrok APIの起動待ち */ }
  if (Date.now() - started > 20_000 && !announced) {
    announced = true;
    console.error('ngrok URLを取得できません。認証設定または既存ngrokプロセスを確認してください。');
  }
}, 500);

function shutdown() {
  clearInterval(timer);
  tunnel?.kill('SIGTERM');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
