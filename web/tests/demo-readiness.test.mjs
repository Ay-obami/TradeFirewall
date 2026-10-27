import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultLimits, demoScenarios, walkthroughCases, evaluateIntent } from '../demo-engine.mjs';

test('guided walkthrough covers allow, constrained resize, and two independent fail-closed reasons', () => {
  assert.deepEqual(walkthroughCases, ['safe', 'large', 'stale', 'loss']);
  const results = walkthroughCases.map(key => evaluateIntent(demoScenarios[key], defaultLimits));
  assert.deepEqual(results.map(result => result.decision), ['ALLOW', 'RESIZE', 'BLOCK', 'BLOCK']);
  assert.deepEqual(results.map(result => result.reason), ['POLICY_PASS', 'ORDER_CAP', 'STALE_STATE', 'DAILY_LOSS_EXCEEDED']);
  assert.equal(results[1].approvedNotional, 1000);
  assert.deepEqual(results.slice(2).map(result => result.approvedNotional), [0, 0]);
});

test('offline walkthrough UI clearly says results are neither signed nor broadcast', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="walkthrough-button"/);
  assert.match(html, /id="walkthrough-status"[^>]*aria-live="polite"/);
  assert.match(html, /No wallet signing, SDK submission, or on-chain execution/i);
});

test('decision region announces updates and the ledger exposes approved notional', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(html, /class="decision-area"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /<th[^>]*>APPROVED<\/th>/);
  assert.match(html, /colspan="6"/);
  assert.match(main, /row\.result\.approvedNotional\.toLocaleString/);
});

test('evidence download URL cleanup is deferred past the browser click task', () => {
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /setTimeout\(\(\) => URL\.revokeObjectURL\(url\),\s*\d+\)/);
  assert.doesNotMatch(main, /a\.click\(\);\s*URL\.revokeObjectURL\(url\)/);
});
