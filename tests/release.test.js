import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { respond } from '../js/receptionist.js';
import { demoKnowledge } from '../js/demo-knowledge.js';
const root = new URL('../', import.meta.url);
const release = JSON.parse(readFileSync(new URL('release-manifest.json', root)));
const cases = [
  ['What time does your shop close?', 'Friday: 09:00–18:00'],
  ['Can you fix Samsung phones?', 'Samsung phone repair: Demo estimate: from PKR 3,000'],
  ['Where is your shop?', '123 Example Lane, Demo City'],
  ['Are you open on Friday?', 'Friday: 09:00–18:00\nRegular weekly hours'],
  ['How much for battery replacement?', 'Battery replacement: Demo price: PKR 2,500'],
  ['What services do you provide?', 'Screen replacement: Demo price: PKR 6,000'],
];
for (const [question, expected] of cases) test(`production regression: ${question}`, () => {
  const reply = respond(demoKnowledge, question);
  assert.equal(reply.status, 'answered'); assert.ok(reply.answer.includes(expected));
});
test('provide-services variation does not invent services or bypass owner escalation', () => {
  assert.equal(respond({ ...demoKnowledge, services: [] }, 'What services do you provide?').status, 'unknown');
  assert.equal(respond(demoKnowledge, 'What services do you provide and can I get a refund?').status, 'owner');
});
test('committed immutable release matches every current source and digest', () => {
  execFileSync(process.execPath, ['scripts/build-release.mjs', '--check'], { cwd: root });
  for (const asset of release.assets) {
    const bytes = readFileSync(new URL(asset.url === './' ? './index.html' : asset.url, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.url);
  }
});
test('all released JavaScript imports stay inside the same immutable release', () => {
  const base = `./assets/${release.build}/`;
  const urls = new Set(release.assets.map(a => new URL(a.url, 'https://example.test/project/').href));
  for (const asset of release.assets.filter(a => a.url.endsWith('.js'))) {
    assert.ok(asset.url.startsWith(base), asset.url);
    const source = readFileSync(new URL(asset.url, root), 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      const url = new URL(match[1], new URL(asset.url, 'https://example.test/project/')).href;
      assert.ok(url.includes(`/assets/${release.build}/`), url);
      assert.ok(urls.has(url), url);
    }
  }
  for (const page of ['index.html', 'demo.html']) {
    const html = readFileSync(new URL(page, root), 'utf8');
    assert.ok(html.includes(`src="${base}js/`)); assert.ok(html.includes(`href="${base}styles.css"`));
    assert.ok(html.includes('id="build-info"'));
  }
});
