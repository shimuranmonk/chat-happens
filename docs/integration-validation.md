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

The native delete confirmation layout has now been reported through a user's live-test screenshot. Alpha.4 supports the heading “Delete chat?”, the exact plain-text message “This will permanently delete <selected title>. This can't be undone.”, and the button “Delete chat”. It also retains the earlier emphasized-title layout with a “Delete” button. Only one visible, enabled confirmation button is accepted. The selected conversation ID, title, and originating action button are revalidated before submission. The script automatically submits a matching native confirmation after the user's own batch confirmation; no extra per-chat click is intended. Unrecognized or mismatched dialogs remain unconfirmed.

An end-to-end live deletion and actual service success receipts are still awaiting confirmation. No real chat was deleted by the agent while implementing this correction.

For success, the adapter first accepts a new role=status/alert receipt exactly matching “Chat archived”, “Conversation archived”, “Chat deleted”, or “Conversation deleted” (optional punctuation), together with disappearance of the selected ID while history remains visible.

Starting in alpha.5, deletion can also complete without such a notice. This fallback requires the exact confirmation submitted by the script to close, no other active overlay, the same visible history container, the target ID to remain absent, and every other previously discovered ordinary-chat ID to remain present continuously for at least 750 ms. At least one neighboring chat is required. The location must remain unchanged, or move from the deleted chat's own URL to the home page. Any interruption of those checks resets the stability interval.

These are combined UI signals, not independent server-side verification. Sidebar disappearance or row disappearance alone never count as success. Starting in alpha.7, archiving can use the same stable-list evidence when its exact action menu closes; no native archive confirmation is expected. Uncertain outcomes stop the batch without retry.

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

## Alpha.4 native confirmation regression

The screenshot-reported plain-text layout and “Delete chat” label are represented in the fixture suite. Tests verify automatic confirmation once, rejection of another title, rejection of a disabled button, and preservation of an unselected duplicate-title chat. All 35 automated tests pass locally. Live success verification remains a release gate.

## Alpha.5 result reporting and visible version

A user reported that a single conversation was successfully deleted, but the script reported outcome unknown because its expected success notice was not detected. The alpha.5 fallback above covers that UI completion pattern while retaining unknown results for an unstable list, missing neighbors, hidden/replaced history, an open confirmation, reappearing target, or unexpected navigation. Agent-run tests use simulated conversations; validation of the revised path on the user's installation remains pending.

The panel now shows the installed version. The UI and userscript header share src/version.js, and a regression test checks that they match package metadata. All 44 local automated tests pass.

## Alpha.6 selected rows outside the viewport

A user reported a six-chat deletion batch with four successes and two skips. The skipped result is raised before any cleanup action for that item. Code review identified that the pre-action lookup used visible-only discovery, so list reflow could make an otherwise valid selected chat ineligible.

Alpha.6 first looks up the selected ID among all currently loaded eligible ordinary-chat rows and briefly waits for transient rendering gaps. If its row is offscreen while the sidebar is visible, it scrolls that row into view, reacquires the exact ID and title, then performs the existing ownership and confirmation checks. Stop remains effective during this preparation. It never substitutes another row or adds to the selection. A genuinely unloaded or ambiguous target, failed visibility recovery, or missing row is still skipped. It does not search all account history or automatically retry already-submitted operations.

Five added regression tests cover deletion-induced reflow, row redraw while scrolling, target disappearance, stop during scrolling, and transient unloading. All 49 local tests pass. The reported two skips still require retesting on the user's installation; viewport movement is a reproduced cause, not independently established as the exact cause of those two results.

## Alpha.7 archiving verification

A live single-chat archive test returned outcome unknown, and the user independently confirmed the conversation was present in Archived chats. The effect succeeded; the alpha.6 result verifier had still required an explicit archive success notice.

Alpha.7 adds archive completion through combined UI evidence: the exact archive menu used by the adapter closes, no other active overlay remains, the same history root stays visible, the selected ID stays absent, every neighboring ordinary-chat ID remains, and location remains expected for the full stability interval. No neighboring evidence, missing history, replacement history, unexpected navigation, reappearing target, or an open menu leaves the outcome unknown. This verifies page behavior, not an independent account-wide archive lookup.

All 57 local tests pass, including single and multiple toast-free archives and uncertainty cases. User-reported deletion testing has passed; archive reporting needs a single-chat retest on alpha.7, followed by multi-chat archive testing. Production remains pending.
