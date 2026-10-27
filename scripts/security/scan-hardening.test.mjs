import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanPathAndContents, checkFiles } from './scan-secrets.mjs';

test('detects credential token types without including secret in findings', () => {
  const token = 'github_pat_' + 'A'.repeat(32);
  const findings = scanPathAndContents('source.ts', `const token = '${token}'`);
  assert.deepEqual(findings, ['token-value']);
  assert.equal(JSON.stringify(findings).includes(token), false);
});

test('rejects escaping paths and symbolic links without following them', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tradefirewall-secret-guard-'));
  writeFileSync(path.join(root, 'safe.txt'), 'public');
  symlinkSync(path.join(root, 'safe.txt'), path.join(root, 'link.txt'));
  assert.deepEqual(checkFiles(root, ['safe.txt']), []);
  assert.deepEqual(checkFiles(root, ['link.txt', '../outside.txt']).map(x => x.kind), ['unsafe-file-path', 'unsafe-file-path']);
});
