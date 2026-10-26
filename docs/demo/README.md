# TradeFirewall — offline interactive demo

Open `web/index.html` through a local HTTP server (ES module imports require HTTP in many browsers):

```bash
cd tradefirewall
python3 -m http.server 8080
```

Visit `http://localhost:8080/web/`.

Or run the deterministic demo-engine unit tests:

```bash
node --test web/tests/*.test.mjs
```

The UI demonstrates an automated trader proposing an order, a separate risk policy making one of three decisions (`ALLOW`, `RESIZE`, `BLOCK`), editable order/position/exposure limits, preset scenarios, and a JSON-exportable local ledger. The user supplies the simulated market freshness, daily realized loss, equity and signed position (positive long, negative short). Nothing leaves the browser: no wallet connection, trading key, chain RPC or dreamDEX SDK is used by this demo.

The demo accepts **whole USDso amounts and whole leverage multiples only**; it validates safe integers and uses `BigInt` to size orders against the order cap and signed position cap. This is a deliberately constrained browser representation of the integer-microUSD production engine (`src/policy/evaluate.ts`), and `web/tests/policy-parity.test.mjs` compares representative adverse and boundary decisions against that actual engine. The browser demo does not implement reduce-only orders, fractional USDso, wallet signature isolation, or atomic risk reservation. Input snapshots are hypothetical, not authenticated or live.

The exported JSON is a **local simulation audit**, not a trading history: it includes each provided intent, the settings used, all triggered cap reasons, the decision, and the `simulation-only` execution marker. Never present its approved notional as an actually placed or signed trade. Live execution requires integration, an exclusively controlled signing path, and testnet funds; verified transaction hashes should be attached only after orders truly occur.

# Offline evidence exports

The **Export offline evidence** button downloads `tradefirewall-offline-policy-evidence.json` after at least one local policy evaluation. The artifact uses the versioned `tradefirewall.offline-evidence.v1` schema, preserves each input intent and risk-limit snapshot, and summarizes ALLOW/RESIZE/BLOCK decisions. It explicitly marks `networkExecution: false`, `walletSigned: false`, and an empty `transactionHashes` array. Do not present it as SDK read verification, a signed order, or on-chain proof.
