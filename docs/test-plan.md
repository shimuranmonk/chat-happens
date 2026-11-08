# Test plan

Status: automated and simulated-browser checks completed; live destructive checks pending.

## Acceptance coverage

| Requirements | Verification |
|---|---|
| FR-01, FR-03, FR-04 | UI tests enter/exit cleanup, count and clear selection without mutations. |
| FR-02, FR-05 | Adapter tests stable IDs, duplicate titles, hidden rows, reordered rows, project URLs, origin and owner mismatch, duplicate rendered identities. |
| FR-06 | Review lists title plus full ID; untrusted titles render as text. |
| FR-07 | Fixture archive targets one selected ID and requires a new explicit success receipt plus row removal. |
| FR-08 | UI deletion acknowledgement; fixture native-dialog title matching. Screenshot-reported native layout is covered in fixtures; end-to-end live success remains pending. |
| FR-09, FR-12 | Runner reports each item; browser simulation displays progress and per-item results. |
| FR-10 | Stop during an in-flight operation allows settlement and prevents later operations; stop between menu opening and action prevents submission. |
| FR-11 | Missing item skips; changed title, mismatched menu, service error, exception and silent removal halt conservatively. Old success toast cannot verify a later operation. |
| FR-13 | Concurrent invocation rejected; selection snapshot remains independent of later changes. |

## Reproducible automated checks

Requires Node.js 20+ and npm. No ChatGPT credentials required.

```sh
npm ci --ignore-scripts
npm run check
```

The check builds the distributable, checks its JavaScript syntax, and runs the fixture-based tests. CI also rejects a distributable that differs from the generated source.

## Local browser simulation

```sh
npm run preview
```

Open http://127.0.0.1:4173. All rows are simulated. Select one of the duplicate-title chats, review its ID, archive it, and verify that the other duplicate remains. Reload restores all samples. The server binds only to the local machine and serves an explicit file allowlist.

## Manual release gate — not yet passed

Use a dedicated test account or explicitly disposable conversations. Never use valuable history to validate this alpha.

1. Install the built userscript through Tampermonkey and record browser/manager versions.
2. Verify sidebar checkboxes, keyboard navigation, focus, dark/light appearance, and narrow/wide layouts. Cancel archive and delete review; confirm no account changes.
3. Create three disposable ordinary chats, including two with identical titles. Record their IDs.
4. Archive one; confirm its archived status using ChatGPT's own archive manager and confirm both nonselected chats are unchanged.
5. Inspect the native delete confirmation against the strict adapter contract. If it differs, cancel and update the adapter and fixtures before proceeding.
6. Delete one explicitly disposable chat after human confirmation; verify in the normal account UI. Confirm the other duplicate remains.
7. Test stop, missing rows, sidebar closure, navigation, and a simulated connection failure. Check results against actual account state; never retry an unknown result blindly.
8. Validate actual success receipts and the toast-free deletion path. Without a receipt, require a closed native confirmation and a stable history list retaining every neighboring chat while the selected ID stays absent. Verify the result independently in ChatGPT.
9. Record outcomes and resolve issues, rerun automated checks, then repeat affected manual checks before proposing production.

## Known coverage limits

Fixtures model the observed row/menu contract, not the entire ChatGPT application. Automated checks cannot establish real service behavior, account/workspace isolation, rate-limit signals, Tampermonkey execution compatibility, or native confirmation wording. No real conversation was archived or deleted during development.

## Alpha.3 regression coverage

The suite now contains 32 tests. Added cases cover hidden/closed/inert dialog remnants, truly open dialog/alert/menu blockers, a sidebar exposed as a dialog, and a native deletion confirmation that temporarily hides the underlying sidebar. The selection-visibility tests also cover title/ID lists, row marking, and checkbox recovery after a page redraw. These simulated checks do not replace the manual release gate above.

## Alpha.4 native delete confirmation

The suite now contains 35 tests, including the live-reported plain-text title message and Delete chat button. A matching dialog is confirmed automatically after the batch confirmation; a different title or disabled button is never confirmed. The user still needs to validate an end-to-end result with a disposable conversation.

## Alpha.5 completion evidence and version

The suite now contains 44 tests. New tests verify stable toast-free deletion, unknown results when the sidebar hides or is replaced, loss of neighbors, an open confirmation, unexpected navigation, a reappearing target, and lack of any neighboring evidence. A version consistency test compares the displayed version, userscript header, and package metadata. Live validation of the updated reporting remains pending.

## Alpha.6 batch visibility regression

The suite now contains 49 tests. Added scenarios ensure a selected offscreen row is brought into view after an earlier deletion, a redrawn row is reacquired by exact ID, a disappearing target never causes substitution, Stop prevents submission during scrolling, and a transiently unloaded row can settle before processing. Live retest: review only the skipped chats from the earlier batch and confirm they remain intended targets before retrying; do not repeat successful deletions.

## Alpha.7 archive live-test feedback

The suite now contains 57 tests. Archive scenarios cover one and multiple toast-free archives, hidden or replaced history, lost neighbors, unexpected navigation, reappearing targets, and open menus. Old success notices still cannot substitute for current evidence.

| Live check | Reported status |
|---|---|
| Single deletion | Passed by user report |
| Multiple deletions | Passed after alpha.6 by user report |
| Single archive effect | User confirmed the chat appears in Archived chats |
| Single archive reporting | Alpha.6 reported unknown; alpha.7 retest pending |
| Multiple archives | Pending |

Do not mark archive testing or production complete until both remaining archive checks pass.
