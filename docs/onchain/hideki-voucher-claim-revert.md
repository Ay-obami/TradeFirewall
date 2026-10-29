# Hideki paper USDso self-claim is not a usable external-wallet funding path

Chain 50383; externally controlled wallet `0xF40003d36567478489BcCF1a1fEd094f87EeC9a5`; MarginBank `0x478769E1177C0773c43A593DCCc4Ad15F15F1394`; distributor `0x2ACD9EFdA721450906bfE1bef3edE269636E42C4`.

Read-only SDK `getPerpVoucherEligibility` returns `eligible=true` and 1,000 paper USDso, but both `eth_call` and `eth_estimateGas` with `claim()` calldata `0x4e71d92d` revert with selector `0x3e31dcc2`. `debug_traceCall` shows distributor implementation `0x9657f0fd53efc01cd108d93c835bb4b517732b43` reverting early. This is a contract failure, not a proven gas shortage; never force a large gas estimate.

Independently documented **identical** failure and explanation: https://github.com/PhiBao/dreamdex-perps-feedback/blob/main/feedback/002-voucher-claim-eligibility.md . That report observes paper credit distributed in batches to dreamDEX trading wallets, rather than this unusable self-claim. The competition documentation confirms weekly credits for in-app trading wallets: https://app.testnet.dreamdex.io/competition .

Practical implication: EOA funding through paper voucher self-claim is **blocked**. Keep the existing Gate paused; do not deploy an additional Gate until an actual viable collateral source is verified. Independent externally owned accounts may instead need real test USDso token collateral obtained via a chain-appropriate testnet funding route; do not assume Shannon faucets/contracts apply to Hideki.

The diagnostic claim page deliberately disables the known-reverting transaction. Neither this investigation nor the page sent a transaction.
