import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readWalletSnapshot, buildUnsignedDraft, HIDEKI_CHAIN_ID } from '../wallet-readonly.mjs';

const address = '0x1234567890abcdef1234567890abcdef12345678';
const intent = { market: 'BTC-PERP', side: 'LONG', notional: 850 };
const policy = { maxOrderNotional: 1500 };
const decision = { decision: 'ALLOW', approvedNotional: 850, reason: 'POLICY_PASS' };

test('only explicitly approved read-only EIP-1193 methods are requested', async () => {
  const calls = [];
  const provider = { request: async ({ method, params }) => {
    calls.push([method, params]);
    return ({ eth_requestAccounts: [address], eth_chainId: '0xc4cf', eth_getBalance: '0xde0b6b3a7640000' })[method];
  } };
  const state = await readWalletSnapshot(provider, true);
  assert.deepEqual(calls.map(([method]) => method), ['eth_requestAccounts', 'eth_chainId', 'eth_getBalance']);
  assert.deepEqual(calls[2][1], [address, 'latest']);
  assert.equal(state.chainId, HIDEKI_CHAIN_ID);
  assert.equal(state.nativeBalance, '1');
  assert.equal(state.address, address);
});

test('wrong chain or malformed observations fail closed', async () => {
  const provider = { request: async ({ method }) => ({ eth_accounts: [address], eth_chainId: '0x1', eth_getBalance: '0x0' })[method] };
  await assert.rejects(() => readWalletSnapshot(provider, false), /WRONG_CHAIN/);
  const malformed = { request: async ({ method }) => ({ eth_accounts: [address], eth_chainId: '0xc4cf', eth_getBalance: 'not-hex' })[method] };
  await assert.rejects(() => readWalletSnapshot(malformed, false), /INVALID_BALANCE/);
});

test('draft is never created for a failed or unverified simulated decision', () => {
  const wallet = { address, chainId: HIDEKI_CHAIN_ID, nativeBalance: '1', observedAt: new Date().toISOString() };
  assert.throws(() => buildUnsignedDraft({ wallet: null, intent, policy, decision }), /WALLET_NOT_VERIFIED/);
  assert.throws(() => buildUnsignedDraft({ wallet: { ...wallet, observedAt: '2020-01-01T00:00:00.000Z' }, intent, policy, decision }), /WALLET_READ_STALE/);
  assert.throws(() => buildUnsignedDraft({ wallet, intent, policy, decision: { ...decision, decision: 'BLOCK', approvedNotional: 0 } }), /POLICY_BLOCKED/);
  const draft = buildUnsignedDraft({ wallet, intent, policy, decision });
  assert.equal(draft.status, 'UNSIGNED_SIMULATION_DRAFT');
  assert.equal(draft.networkExecution, false);
  assert.equal(draft.walletSigned, false);
  assert.equal(draft.orderSubmitted, false);
  assert.equal(draft.approvedNotional, 850);
  assert.equal(draft.account, address);
  assert.equal('to' in draft, false);
  assert.equal('data' in draft, false);
});

test('wallet UI labels live observation separately from simulated policy and never offers sending', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(html, /id="wallet-connect"/);
  assert.match(html, /id="wallet-refresh"/);
  assert.match(html, /id="prepare-button"[^>]*disabled/);
  assert.match(html, /LIVE WALLET READ · NOT POLICY EVIDENCE/);
  assert.match(html, /NO TRANSACTION/);
  assert.match(script, /accountsChanged/);
  assert.match(script, /chainChanged/);
  assert.doesNotMatch(script, /eth_sendTransaction|personal_sign|eth_signTypedData|wallet_switchEthereumChain/);
});
