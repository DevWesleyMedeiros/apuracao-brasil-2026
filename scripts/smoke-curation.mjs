import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Read-only HTTP smoke. Start `pnpm admin:pesquisas` in another terminal first.
const base = 'http://127.0.0.1:4179';
const response = await fetch(base, { headers: { Origin: 'https://example.test' } });
assert.equal(response.status, 200);
assert.equal(response.headers.has('access-control-allow-origin'), false);
assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
assert.match(await response.text(), /lang="pt-BR"/);
for (const name of ['main.tsx', 'App.tsx', 'Configuration.tsx', 'PollEditor.tsx', 'Transfer.tsx', 'fields.tsx', 'style.css']) {
  const result = await fetch(`${base}/${name}`);
  assert.equal(result.status, 200, name);
  const text = await result.text();
  assert.doesNotMatch(text, /Internal Server Error/);
}
const shared = fileURLToPath(new URL('../lib/forecast/curation.ts', import.meta.url));
assert.equal((await fetch(`${base}/@fs${shared}`)).status, 200, 'real domain module accessible');
for (const file of ['data/forecast/polls.json', 'app/page.tsx', 'vite.config.ts', 'package.json']) {
  const absolute = fileURLToPath(new URL(`../${file}`, import.meta.url));
  const result = await fetch(`${base}/@fs${absolute}`);
  assert.equal(result.status, 403, `outside the allowlist: ${file}`);
}
const post = await fetch(`${base}/api/polls`, { method: 'POST', body: '{}' });
assert.equal(post.status, 404, 'no application write API');
console.log('Passed: local Vite HTTP, TSX/CSS transforms, no cross-origin CORS header, shared domain access, restricted filesystem, no write API. Not a browser interaction test.');
