# TradeFirewall — offline interactive demo

Open `web/index.html` through a local HTTP server (ES module imports require HTTP in many browsers):

```bash
cd tradefirewall
python3 -m http.server 8080
```

Visit `http://localhost:8080/web/`.

Or run the deterministic demo-engine unit tests:

```bash
node --test web/tests/demo-engine.test.mjs
```

The UI demonstrates an automated trader proposing an order, a separate risk policy making one of three decisions (`ALLOW`, `RESIZE`, `BLOCK`), editable limits, preset scenarios, and a JSON-exportable local ledger. Nothing leaves the browser: no wallet connection, trading key, chain RPC or dreamDEX SDK is used by this demo.

Demo calculations use JavaScript numbers for illustrative USDso sizes; the production gate must use fixed-point integer arithmetic and atomic, enforced authorization at the trading/signing boundary. This UI is not proof of deployed or bypass-resistant on-chain enforcement. Later integration should replace this illustrative engine with the shared tested policy engine, expose the signer-enforced execution status, and attach real transaction hashes only after verified Hideki orders.
