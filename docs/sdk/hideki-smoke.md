# dreamDEX Hideki read-only smoke

The read-only smoke is a **real-network check**, not an order submission. It verifies the RPC's `eth_chainId`, initializes the documented Markets SDK without `privateKey`, calls `listPerpMarkets()`, and checks the selected market's MarginBank configuration via `getPerpSystemConfig()`.

Official source: https://app.testnet.dreamdex.io/docs/developers/perps-testnet

Run this on Node 22.18+ (Node 24 recommended) with internet access:

```bash
npm install --no-save @somnia-chain/markets-sdk@0.32.1
node src/dreamdex-live/smoke-read.ts
```

The command exits nonzero on a wrong RPC chain, malformed RPC reply, empty market listing, or unavailable/incoherent MarginBank configuration. It prints an explicit `LIVE_READ_ONLY` result only when the live SDK reads succeed.

No wallet, private key, paper USDso, or STT is needed for this smoke test. It does **not** establish that the account has margin, that SDK sizing works for a real account, that a bot has operator permission, or that an order can be signed or settled. Those must be verified separately and recorded with transaction hashes.

Never copy a funded wallet secret into a project `.env` for this command. Leave the smoke client keyless.
