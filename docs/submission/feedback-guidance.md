# Reproducible feedback — reporting protocol

The `feedback/` directory is intentionally empty until a **real, reproduced** dreamDEX API, SDK, documentation, app, or contract issue is discovered. Only validated, distinct issue reports belong there. Use [`feedback-report-template.md`](feedback-report-template.md), copying it to `feedback/<specific-symptom>.md` after gathering actual evidence.

Before publishing:

1. Verify the behavior with an exact SDK/API version and network. Repeat it and record timestamps.
2. Confirm it is not caused by unfunded gas, a mismatched chain, invalid parameters, stale data, or environmental failure.
3. Check for publicly known duplicates where possible: only the first accepted valid report earns a payment.
4. Record expected versus actual results, sanitized commands or requests/responses, and a minimal reproduction.
5. Assign severity using *observed* impact, without speculative loss estimates.
6. Exclude passwords, API keys, signing material, mnemonics, proprietary headers, and sensitive account data.

The organizers state $40 per accepted critical/major finding, $15 per other accepted finding, and a total Feedback prize pool of $1,500. Acceptance is subject to reproduction and duplicate review.

**Security vulnerabilities must be disclosed privately to `security@dreamdex.io`, not placed in the public repository.**
