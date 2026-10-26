# Draft X posts — do not publish before verifying claims

All posts must tag `@DreamDEXSomnia`. The final Build's README needs links to 2–3 **published** posts. These drafts distinguish a simulation from a deployed product.

## Post 1 — the problem / introduction (safe to post during offline development)

Trading bots and AI agents can be fast. They can also ignore your intended risk limits when a strategy goes wrong.

I'm building TradeFirewall for the @DreamDEXSomnia Perps Builder Bounty: a separate risk gate that reviews proposed orders and can allow, resize, or block them. This is the offline build stage; live testnet orders are next.

## Post 2 — proof of offline behavior (publish once test output and demo are confirmed)

TradeFirewall's offline demo shows what happens when a bot proposes an oversized order, a stale-price trade, or one that breaches a loss limit: the policy engine can resize or reject the intent and record why.

Tests and replayable simulation are part of the build for @DreamDEXSomnia. These are simulated scenarios—not claims of executed on-chain orders. [insert repository/demo link]

## Post 3 — live-order milestone (HOLD until executed on Hideki)

TradeFirewall has now routed a guarded perp order to @DreamDEXSomnia on Somnia Hideki testnet. A proposal passed the risk checks, the guarded executor submitted it, and the transaction was included.

Market: [market] | Tx: [real verified explorer URL] | Demo: [link]

We also show a separate excessive intent being blocked before submission. [insert verified evidence]

**Do not publish Post 3 while the wallet is unfunded, or if only a simulator or local fork has run.**
