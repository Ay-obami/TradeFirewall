# TradeFirewall — dreamDEX Perps Builder Bounty submission checklist

**Competition:** [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail)  
**Deadline:** November 1, 2026, 23:59 UTC (November 2, 00:59 WAT)  
**Target:** MVP track; a distinct Feedback submission may use the same bounty's Feedback track.

## Eligibility and publication

- [ ] Register for the event with a DoraHacks account.
- [ ] Obtain submission whitelist approval for that exact DoraHacks email: open a dreamDEX Discord ticket or contact SomniaHacks Telegram organizers. Merely registering does **not** guarantee authorization to submit a Build.
- [ ] Publish a public GitHub repository with reproducible source and installation instructions. Verify its URL resolves while signed out.
- [ ] Verify that no `.env`, private key, seed phrase, encrypted wallet export, passphrase, or wallet credential has entered Git history. Use a placeholder address in docs where possible.
- [ ] Create a DoraHacks Build and select the **MVP** track, following the current form's instructions. Attach the repository link and a demo link/video if provided.
- [ ] Submit before the deadline; revisit the Build page to verify the submission succeeded. A published GitHub repository alone is not a DoraHacks submission.

## Evidence required for the MVP track

- [ ] Execute at least one **real perp order on dreamDEX's Somnia Tokyo / Hideki testnet** through the actual adapter. The team's developer documentation specifies Hideki chain ID `50383` for perps.
- [ ] Preserve public transaction hash(es), corresponding explorer URL(s), market, timestamps, test wallet address, and receipt status. Do not mistake an `eth_call`, simulator trace, fork transaction, or failed transaction for a placed live order.
- [ ] Record the firewall's decision before each submitted trade and demonstrate at least one blocked or resized malicious/excessive proposed trade. Offline tests can support this; clearly distinguish from live on-chain enforcement.
- [ ] Capture a concise working demo: normal trade → blocked/downsized intent → actual testnet order and explorer receipt.
- [ ] Ensure README identifies product, intended users, run instructions, limitations, and an **X posts** section linking 2–3 published posts that tag `@DreamDEXSomnia`.
- [ ] Cross-check README statements against proof: no claims of deployed contracts, gas funding, production security, or on-chain enforcement unless independently verified.

## Funding and prerequisites

- [ ] Fund a testnet signer with **Hideki STT** for gas. Shannon (`50312`) faucet STT is on a different chain and is not interchangeable without an independently verified bridge mechanism.
- [ ] Obtain applicable paper USDso collateral through the Perps Arena or official developer voucher process. Paper USDso does not itself pay transaction gas.
- [ ] If linking a bot, verify app trading wallet and the app's transaction-sending key have enough STT. The bot must not have an unrestricted alternative signing route around TradeFirewall.
- [ ] Avoid mixing organizer-allocated bounty USDso with a Perps Arena wallet; the stated bounty rules prohibit transferring extra bounty allocations into Arena accounts.
- [ ] Validate live SDK version and contract addresses from official [Perps on Testnet for Developers](https://app.testnet.dreamdex.io/docs/developers/perps-testnet), rather than assuming generic Shannon deployment details apply.

## Prize conditions

- MVP: three selected projects win $500 each. $300 is paid on winner announcement; the remaining $200 is conditional on placing orders on mainnet within 30 days after perps mainnet launch.
- Feedback: each accepted critical/major report pays $40; other accepted items pay $15. Only first reproducible valid report gets paid, subject to the track's $1,500 total budget.
- Security findings must go privately to `security@dreamdex.io`, not a public issue or repository.

## Feedback submission, if entering both tracks

- [ ] Keep a `feedback/` folder, one Markdown file per bug; each file includes a short title, `Severity: critical | major | normal`, `Area: API | SDK | docs | app | contracts`, reproducible steps, expected/actual, evidence, and environment.
- [ ] Exclude findings confirmed to duplicate another first report. Do not present offline hypothetical impact as an observed financial loss.
- [ ] Submit a DoraHacks Feedback Build if that track needs its own entry; verify accepted status separately from the MVP submission.

**Current verified state when drafted (October 26, 2026):** development and simulated tests are in progress. No evidence of funded Hideki wallet, live submitted perp order, published X thread, whitelisted email, or accepted DoraHacks Build has been provided for TradeFirewall. Update each checkbox only against actual artifacts.
