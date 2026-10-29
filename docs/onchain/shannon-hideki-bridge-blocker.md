# Verified Shannon → Hideki USDso dispatch blocker (2026-10-29)

External owner `0xF40003d36567478489BcCF1a1fEd094f87EeC9a5` has **100 USDso on Shannon** (50312). USDso `0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171` allowance to collateral warp router `0x94E2E7f4B2B0a8E3032c7D3ff3c86790BB5979E6` is **100 USDso**. `transferRemote(50383, recipient, 100e18)` reverts on both `https://dream-rpc.somnia.network` and `https://api.infra.testnet.somnia.network` in `eth_call`.

`debug_traceCall` shows USDso `transferFrom` succeeds in the simulated frame, but the mailbox dispatch reaches `0xf11c364da4b5e22b3040be8ea77dccdbfd1277de` via `postDispatch(bytes,bytes)` selector `0x086011b9`; that contract does **not** implement the selector (verified by deployed bytecode inspection) and reverts with empty data. The rollback leaves the 100 USDso in the sender wallet.

The failure is not fixed by increasing native STT value (multiple test amounts up to 0.1 STT simulated and reverted). No bridge transaction was submitted. Do not retry until the bridge owner fixes the incompatible dispatch hook or supported alternate route is verified. SDK bridge docs: https://prd.smk.somnia.host/docs/typescript/bridge .

The local funding UI intentionally disables the failing bridge button while preserving balance and allowance. TradeFirewall's existing Gate remains paused and trading funding is **not** established on Hideki.
