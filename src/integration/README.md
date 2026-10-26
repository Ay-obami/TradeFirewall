# Policy-to-execution integration

`createPolicyGuardedExecutor` combines the deterministic `evaluateTrade` risk policy with the adapter's one-use, state-bound approvals.

`resolveRisk(intent, snapshot)` is a **trusted adapter**, not a property of the AI-generated trade. It must:

1. Read the correct Hideki market (`50383`), market base/quote decimals and tick/lot constraints, then provide the verified `marketSymbol` and positive `lotSizeRaw`.
2. Convert a given quantity to a nonnegative integer **micro-USDso** notional at a validated mark price, returned as a decimal integer string through `quoteNotionalUsd6(quantityRaw)`. The function must be monotonic for increasing quantities, at the same snapshot, and must not use JavaScript `number` for token arithmetic.
3. Derive `signedPositionUsd6`, `dailyPnlUsd6` and `equityUsd6` from authoritative account state. These are not supplied by the AI/bot and must correspond to the same snapshot. The risk object's `observedAtMs` must exactly match the snapshot timestamp.
4. Provide verified, integer `leverageBps` and `slippageBps` of the actual proposed execution. Risk policy treats them as limits, not as claims that an exchange will actually execute at that price.

If any value cannot be established, throw; no trade approval will be issued. The execution port and its signer must remain inaccessible to the bot except through `prepare` and `execute`/`dryRun`.

**Boundaries:** Generic adapter orders do not carry enforceable `reduceOnly`; this integration evaluates all intents with `reduceOnly:false`. It does not yet provide SDK-specific conversions, margin adequacy, signed on-chain policy enforcement, private key handling, or live execution proof. Network-funded integration and non-bypassability review remain separate milestones.
