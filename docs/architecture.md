# Enforced TradeFirewall boundary

Target: dreamDEX Perps on Somnia Hideki (`50383`). No funded deployment yet.

`bot proposal → independent policy evaluation → authorized guarded executor → dreamDEX SDK`

The signer/operator credential must be held **only** by the guarded executor. An AI agent or legacy bot is an untrusted producer of proposals. If it can access the unrestricted key, it can bypass an off-chain firewall; this is a security boundary, not a UX choice.

Policy inputs: requested market, side, quantity, limit/market price, account equity, existing exposures, reliable timestamped oracle and risk limits. Fail closed for missing and stale inputs. Changes between approval and execution must invalidate approval or force re-evaluation.

MVP milestone without gas: demonstrate decisions using deterministic simulation and mock exchange state. Future milestone after STT arrives: verify correct operator permissions, place a tiny safe testnet order, collect transaction hashes, and clearly distinguish proof from simulation.
