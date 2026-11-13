/**
 * Security / privacy regression tests.
 *
 * These guard the promises made in docs/ARCHITECTURE.md: no dynamic code
 * evaluation, no unsafe HTML sinks for user data, no network access, no
 * third-party requests, no secrets in the sources.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAIN = path.resolve(HERE, '../../main');

async function walk(dir, extension = '.js') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full, extension)));
    else if (entry.name.endsWith(extension)) files.push(full);
  }
  return files;
}

test('no dynamic code evaluation anywhere in the web app', async () => {
  const files = [...(await walk(path.join(MAIN, 'js'))), path.join(MAIN, 'index.html')];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.equal(/\beval\s*\(/.test(source), false, `eval() in ${file}`);
    assert.equal(/new\s+Function\s*\(/.test(source), false, `new Function in ${file}`);
    assert.equal(/setTimeout\s*\(\s*['"`]/.test(source), false, `string timer in ${file}`);
    assert.equal(/document\.write\s*\(/.test(source), false, `document.write in ${file}`);
  }
});

test('innerHTML is only used for static, author-authored SVG icons', async () => {
  const allowed = new Set([path.join(MAIN, 'js/core/dom.js'), path.join(MAIN, 'js/core/icons.js')]);
  const files = await walk(path.join(MAIN, 'js'));
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (!source.includes('innerHTML')) continue;
    assert.ok(allowed.has(file), `unexpected innerHTML in ${file}`);
  }
});

test('the web app performs no network requests of its own', async () => {
  // sw.js is the offline cache: it only ever fetches same-origin requests (the
  // origin is checked before fetch), so it is excluded from this scan and
  // covered by the dedicated assertion below.
  const files = [...(await walk(path.join(MAIN, 'js'))), path.join(MAIN, 'index.html')];
  const forbidden = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /\bWebSocket\b/,
    /sendBeacon/,
    /import\s*\(\s*['"]https?:/,
    /<script[^>]+src=["']https?:/i,
    /@import\s+url\(\s*['"]?https?:/i
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbidden) {
      assert.equal(pattern.test(source), false, `${pattern} found in ${file}`);
    }
  }
});

test('the service worker only handles same-origin requests', async () => {
  const sw = await readFile(path.join(MAIN, 'sw.js'), 'utf8');
  assert.match(sw, /url\.origin !== self\.location\.origin/, 'cross-origin requests are ignored');
  assert.equal(/importScripts\s*\(/.test(sw), false, 'no third-party worker scripts');
});

test('no external hosts are referenced by the app shell or its styles', async () => {
  const files = [
    ...(await walk(path.join(MAIN, 'js'))),
    ...(await walk(path.join(MAIN, 'css'), '.css')),
    path.join(MAIN, 'index.html'),
    path.join(MAIN, 'assets/manifest.webmanifest')
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const matches = source.match(/https?:\/\/[^\s"'()<>]+/g) || [];
    const external = matches.filter((url) => !url.startsWith('http://www.w3.org/'));
    assert.deepEqual(external, [], `external URL in ${file}: ${external.join(', ')}`);
  }
});

test('no secrets or credentials in the sources', async () => {
  const files = [...(await walk(MAIN)), path.join(MAIN, 'index.html'), path.join(MAIN, 'sw.js')];
  const patterns = [
    /api[_-]?key\s*[:=]\s*['"][^'"]{8,}/i,
    /secret\s*[:=]\s*['"][^'"]{8,}/i,
    /password\s*[:=]\s*['"][^'"]{4,}/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /ghp_[A-Za-z0-9]{20,}/
  ];
  for (const file of files) {
    let source;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue; // binary assets
    }
    for (const pattern of patterns) {
      assert.equal(pattern.test(source), false, `possible secret in ${file}`);
    }
  }
});

test('the HTML shell ships a restrictive, explicit document policy', async () => {
  const html = await readFile(path.join(MAIN, 'index.html'), 'utf8');
  assert.match(html, /<meta charset="utf-8">/, 'charset declared');
  assert.match(html, /name="viewport"/, 'viewport declared');
  assert.match(html, /name="referrer" content="no-referrer"/, 'referrer policy declared');
  assert.equal(/onclick=/.test(html), false, 'no inline event handlers');
});
