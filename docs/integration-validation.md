# Integration validation and implementation decisions

Date: 2026-11-08. Status: experimental alpha, not production approved.

## Official behavior

OpenAI's [deleting and archiving chats documentation](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt) describes per-chat actions through the more-options menu. Archive hides a chat from ordinary history while retaining it; deletion cannot be restored. Existing archive-all/delete-all controls do not supply the selective workflow sought here.

The script follows those visible controls. No documented conversation-management API was established in this investigation, and no private endpoints, auth-token extraction, analytics, or remote dependencies are used. This UI approach is a compatibility choice, not an endorsement or guarantee from OpenAI.

Tampermonkey header fields follow its [official documentation](https://www.tampermonkey.net/documentation.php). The userscript matches only https://chatgpt.com/*, excludes frames, and requests no privileged grants. The preview server is development-only; the installable script never connects to it.

## Observed signed-in interface

Read-only inspection established:

- Sidebar container: #browser-sidebar-popover.
- Ordinary conversation link: a[data-interactive-row-link] with a /c/<UUID> URL.
- Row: [data-sidebar-cycle-item][role="group"].
- Owner: data-sidebar-chatgpt-conversation-key="chatgpt:conversation:<UUID>".
- Action button: aria-label="Chat actions", aria-haspopup="menu", unique ID.
- Open menu: role="menu", aria-labelledby pointing back to that button, matching aria-controls.
- Exact English Archive and Delete menu items.
- Project conversations can use /g/.../c/... URLs and are excluded.

The menu was opened for inspection and closed without selecting an action. No user conversation was changed.

## Conservative unverified contracts

The native delete dialog and actual service success receipts were **not inspected by performing destructive actions**. The implementation requires a single native dialog headed “Delete chat?” or “Delete conversation?”, the expected title in a strong/b element, and exactly one Delete button. Any mismatch stops before submitting the native confirmation; close the dialog manually.

For success, the adapter requires a new role=status/alert receipt exactly matching “Chat archived”, “Conversation archived”, “Chat deleted”, or “Conversation deleted” (optional punctuation), plus disappearance of the ID while the history remains visible. Those receipt strings are fixture assumptions awaiting live validation. Missing or differing receipts produce outcome unknown and stop the batch. Sidebar disappearance alone never counts as success.

## Implementation refinements to the PRD

- First alpha supports only the inspected English row/menu shape; unfamiliar layouts expose no eligible controls or stop safely.
- Select displayed means currently visible eligible rows, including clipping by a scroll container. It never selects the whole account or scrolls to load more chats. Partially clipped rows can be eligible.
- Processing is sequential with a 750 ms gap. Service-limit, authentication, and generic error text in new status/alert signals stop the batch; these recognizers still need live validation.
- Changing ChatGPT outside the cleanup panel, hiding the tab, or history navigation requests a stop. Already-submitted actions may finish. There is no resume or automatic retry.
- Unknown-result IDs are ineligible for re-selection during that page session. Reload clears this guard; inspect account state first.
- Selection and results are memory-only; closing/reloading loses them. No telemetry, local storage, conversation-content reading, or background continuation.
- Success receipts are UI evidence, not independent server-side verification. This limitation must be evaluated in the live release gate.

## Verification performed

Automated fixture and UI tests, generated-script syntax check, and an actual-browser simulation of selecting one duplicate-title chat, reviewing its ID, archiving it, and confirming that the other duplicate stayed present. See [test plan](test-plan.md) for outstanding release checks.

## Release decision

Keep this branch and its pull request in draft. Do not publish a production release until installation, disposable live archive/delete checks, browser compatibility, and failure-mode checks pass and are recorded here.

## Live-test feedback and alpha.3 correction

A user confirmed that selection is visible, then reported deletion stopping at the preflight message about another menu or dialog. That message is raised before the script opens a chat action menu or submits deletion.

Code review found that preflight checked for the presence of dialog elements without checking whether they were active. Alpha.3 ignores hidden/closed/inert dialog remnants and the known sidebar operating surface, while continuing to block separate visible overlays. Blocking messages include the overlay label when available. This addresses a reproducible false-positive case; confirmation on the user's installation is still pending.

The native delete confirmation can temporarily hide the underlying sidebar for accessibility. The final identity check now checks the same connected ID/title/button without requiring that background row to be visible, while retaining strict confirmation-title matching. Regression tests cover both cases, plus genuinely open dialogs, alerts, and menus. All 32 automated tests pass locally. Actual live deletion and service receipts remain unverified.
