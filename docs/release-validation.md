# v0.1.0 release validation

Date: 2026-11-08 (Asia/Manila)

## Decision

The user reported all single and multiple deletion and archive tests passed and authorized review, merge, and publication. Release v0.1.0 keeps the tested alpha.7 operation logic; release-only changes update the name/version, remove the experimental label, add stable installation/update addresses, and update documentation.

## Evidence

- 57 automated tests pass, including target identity, duplicate titles, confirmation matching, stop handling, selection visibility, offscreen row recovery, stable completion evidence, and uncertain outcomes.
- Build and JavaScript syntax checks pass. The generated distributable is checked for consistency in CI.
- User-reported live single deletion: passed with automatic native confirmation and accurate result reporting.
- User-reported live multiple deletions: passed after selected-row visibility recovery was added.
- User-reported live single archive: chat confirmed in Archived chats; reporting retest passed after alpha.7.
- User-reported live multiple archives: passed in the user's final test report.
- Browser screenshots show Chrome. Tampermonkey is installed, but exact browser and manager versions were not supplied.

Live results are user reports, not independent agent-run destructive tests. No new account cleanup was performed during release preparation.

## Review

Reviewed core runner, adapter, interface, build, and regression coverage. Selection is frozen by ID/title at confirmation. Targets are reacquired by ID, menu ownership and native delete titles are checked, and actions run sequentially. Unknown outcomes stop the batch without retries. Untrusted titles are rendered as text. No private endpoints, token extraction, account credentials, remote runtime dependencies, billing, or telemetry were introduced. Installation matches only chatgpt.com and excludes frames.

## Scope and limitations

- English ordinary-chat history in the inspected ChatGPT interface; project chats excluded.
- Chrome with Tampermonkey is the live-tested setup. Other browsers/managers, account/workspace variants, complete accessibility behavior, and service-limit behavior are not broadly certified.
- UI completion is inferred from an explicit receipt or combined stable page evidence. Server-side deletion/retention is not independently verified.
- Without adequate evidence, including a last remaining chat with no notice or neighbors, an action may still report outcome unknown.
- Reloading loses in-memory selection and results. Background continuation and undo are not provided.
- ChatGPT interface changes may require adapter updates.

## Packaging

Installable Tampermonkey userscript: chat-happens.user.js. Stable update/download addresses point to main. Existing experimental users should replace the contents of their existing Tampermonkey entry, rather than enable duplicate editions.

No 15-chat quota or paid subscription is included. Monetization remains a separate product decision.
