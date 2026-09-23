import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname: on Windows .pathname yields "/C:/..." which
// readdir cannot open.
const SIM_DIR = fileURLToPath(new URL('../src/sim/', import.meta.url));

/**
 * A single Math.random or Date.now in src/sim silently destroys determinism,
 * and the failure surfaces much later as a bug nobody can reproduce. This
 * enforces the architecture's central rule rather than merely documenting it.
 *
 * Comments are stripped before scanning, so a doc comment may name a banned
 * call to explain why it is banned.
 */
const FORBIDDEN = [
  { pattern: /Math\.random\s*\(/, why: 'breaks determinism — use makeRng()' },
  { pattern: /Date\.now\s*\(/, why: 'breaks determinism — the day carries its own clock' },
  { pattern: /\bnew Date\b/, why: 'breaks determinism — the day carries its own clock' },
  { pattern: /\bdocument\b/, why: 'the simulation must not touch the DOM' },
  { pattern: /\bwindow\b/, why: 'the simulation must not touch the browser' },
  { pattern: /from\s+['"]\.\.\/(render|ui|audio)\//, why: 'the simulation must not import presentation code' },
];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

// Note for whoever trips this next: the check is a regex over source
// text, so PROSE can set it off. An event whose prompt was about a
// neighbour's broken windows failed on /window/ once. The guard is
// deliberately not clever about string literals -- the rule it protects
// matters more than the occasional reworded sentence.
test('no simulation module breaks purity', async () => {
  const files = (await readdir(SIM_DIR)).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0, 'expected simulation modules to exist');

  const violations = [];
  for (const file of files) {
    const source = stripComments(await readFile(join(SIM_DIR, file), 'utf8'));
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(source)) violations.push(`${file}: ${pattern} — ${why}`);
    }
  }
  assert.deepEqual(violations, [], `purity violations:\n${violations.join('\n')}`);
});

test('every simulation module is reachable and parses', async () => {
  const files = (await readdir(SIM_DIR)).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    // A module that throws on import would otherwise only be caught by
    // whichever test happens to use it.
    await import(new URL(`../src/sim/${file}`, import.meta.url).href);
  }
});
