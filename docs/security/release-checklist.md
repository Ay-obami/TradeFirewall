# Security and bounty release checklist

## Signing/operator boundary

- [ ] The trading agent never receives a raw wallet private key, seed phrase or unrestricted signer.
- [ ] The only execution route uses the guarded executor. In a contract-operator deployment, the owner authorizes the firewall contract, **not** the bot EOA.
- [ ] Any prior direct operator approvals have been explicitly reviewed and revoked by the owner.
- [ ] Approvals are short-lived, one-use, bound to account, market, side, quantity, price and state; stale prices and unexpected RPC errors fail closed.
- [ ] Cross-process and multi-replica replay locking is implemented if more than one executor instance runs. The current `Map` state is process-local.
- [ ] Remote submission checks receipts and retries idempotently. An RPC timeout does not imply a transaction failed.
- [ ] Real signer environment values are never logged, checked into git, placed in client JavaScript, sent to analytics or included in screenshots.

## Testnet and order evidence

- [ ] Only Somnia Hideki chain `50383` and official dreamDEX Perps pool addresses are used for live MVP claims.
- [ ] Confirm operator permissions against the deployed chain, not a mocked registry.
- [ ] Run Solidity **tests**, not merely compiler checks. The offline CI workflow compiles Solidity but does not execute Foundry tests.
- [ ] Fund the disposable testnet account with STT for gas. Never use a real-money wallet or disclose its recovery phrase.
- [ ] Execute a small testnet order only after authorization and policy checks.
- [ ] Record verified transaction hashes, network, timestamp, order status and relevant screenshots.
- [ ] Distinguish an accepted order from an executed fill. Do not interpret an off-chain dry run as a confirmed order.

## Repository and submission

- [ ] Review `git diff --cached --name-only` before pushing; specifically inspect `.env`, `*.age`, key exports, keystores and wallet files.
- [ ] Run `npm test`, `node --test tests/security/*.test.mjs`, and the tracked-file scanner.
- [ ] Review automated secret-scanner findings manually. This lightweight guard is not a comprehensive secrets detector or a substitute for credential hygiene.
- [ ] Verify no known security flaw or exploitable live vulnerability is published; send suspected security vulnerabilities privately to `security@dreamdex.io`.
- [ ] Obtain DoraHacks email whitelist; record submission confirmation before Nov 1, 2026, 23:59 UTC.
- [ ] Publish only accurate demo claims and real X-post URLs. Simulated outcomes are always labeled simulation.

## CI limitations

The workflow intentionally runs without signing credentials or STT. It tests offline code, checks files for obvious key material and compiles Solidity. It does **not** prove on-chain deployment, operator permission, Foundry execution, integration with the real markets SDK runtime, or successful trading. These require separate evidence.
