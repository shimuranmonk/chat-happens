# Changelog

## v0.1.0 — 2026-11-08

First stable release by Alapaap.net.

- Select ordinary ChatGPT conversations with persistent checkboxes, green highlights, and a title/ID list.
- Review selected chats and confirm archive or permanent deletion once per batch.
- Process chats sequentially with progress, Stop, and individual results.
- Automatically handle matching native Delete chat confirmations.
- Recover selected rows that move outside the sidebar viewport.
- Verify completion through success notices or stable combined page evidence; stop on unknown outcomes without automatic retries.
- Display the installed version and provide stable install/update addresses.

Validation: 57 automated tests, build/syntax checks, and user-reported live single/multiple deletion and archiving tests. Tested scope: Chrome/Tampermonkey, inspected English ChatGPT ordinary-chat sidebar. Project chats and broader compatibility remain outside the verified scope. See docs/release-validation.md.

Existing experimental users: replace the contents of the existing Tampermonkey entry with this release and save; do not keep duplicate editions enabled.

No subscriptions, usage quotas, telemetry, or separate accounts are included.
