# Chat Happens

Too many chats? Chat Happens.

A lightweight Tampermonkey userscript for selectively archiving and deleting ChatGPT conversations.

## Why this project exists

Regular use of ChatGPT can leave you with a long list of accumulated conversations. Some are worth keeping; others are ready to be archived or deleted. This project grew out of the need to select and clean up multiple conversations, a workflow the ChatGPT desktop app did not provide when the project began.

Chat Happens aims to make that cleanup easier through a browser userscript.

## Project status

**v0.1.0 — first stable release.** 

### Original planning note

Early planning stage. No userscript implementation has been added yet. Kapoy isip pramis gyud. AI? Of course I can use that but only at 80% as I do not want to get infected with brain rot.

## Planning documents

Current stage: v0.1.0 release. See the [release validation record](docs/release-validation.md) for scope, evidence, and limitations.

- [Product definition — business challenge, intent, intent summary, PRD, and solution specification](docs/product-definition.md) — Draft for review.

## Ready-to-install userscript

[**Install Chat Happens**](https://raw.githubusercontent.com/shimuranmonk/chat-happens/main/chat-happens.user.js) · [Releases](https://github.com/shimuranmonk/chat-happens/releases)

Install Tampermonkey first, then open the installation link. If your browser displays text instead of an installation screen, use the copy-and-save steps below.

Chat Happens provides manual selection, review, archive/delete confirmations, progress, Stop, and per-conversation results. It runs locally without a separate account, payments, telemetry, or usage limits in this release.

This release targets the inspected English ChatGPT web sidebar. Project chats and unfamiliar layouts are excluded. Live testing was reported by the user in Chrome with Tampermonkey; other browser combinations have not been validated. The original planning note above is retained as project history.

## How to install and use Chat Happens

You do not need to know how to code. Chat Happens adds a small cleanup panel to the ChatGPT website.

**Start with a disposable chat while getting familiar with the controls. Always review your selected chats before confirming an action.**

### What you need

- A desktop browser with [Tampermonkey](https://www.tampermonkey.net/) installed. Tampermonkey is a browser extension that lets small add-ons like Chat Happens run on a website.
- ChatGPT open at [chatgpt.com](https://chatgpt.com/), with its interface set to English.

This version runs in your browser. It does not add buttons to the ChatGPT desktop or phone app. This first release was live-tested in Chrome with Tampermonkey; other browser combinations remain unverified.

### 1. Install Tampermonkey

1. Visit the [official Tampermonkey website](https://www.tampermonkey.net/).
2. Choose your browser and follow its installation instructions.
3. Find the Tampermonkey icon near your browser's address bar. It may be inside the puzzle-piece **Extensions** menu.

If Tampermonkey says it needs permission to run userscripts, follow its [official instructions](https://www.tampermonkey.net/faq.php#Q209). You do not need a command window or any of the developer tools listed later in this README.

### 2. Add Chat Happens

1. Open [the Chat Happens script](chat-happens.user.js) in this repository.
2. Click **Raw** to display the complete script by itself.
3. If Tampermonkey opens an installation screen, check that the name is **Chat Happens** and the author is **Alapaap.net**, then choose **Install**.
4. If you see a page of text instead, select and copy all of it. Click the Tampermonkey icon, choose **Create a new script**, select all the sample text in its editor, and replace it with what you copied. Choose **File → Save**.
5. Check that **Chat Happens** is switched on in Tampermonkey.

You are copying a ready-made add-on; you do not need to edit its contents. Do not paste it into a browser console.

### Updating an existing installation

For an existing experimental installation, open the latest [Chat Happens script](chat-happens.user.js), click **Raw**, and copy the complete text. Open Tampermonkey's **Dashboard**, open your existing **Chat Happens (experimental)** entry, replace all its editor contents with the copied text, and choose **File → Save**. Its name becomes **Chat Happens**. Refresh ChatGPT afterward. Update that existing entry rather than keeping both editions enabled.

The stable script includes update and download addresses pointing to the main release channel. Tampermonkey can check them according to its update settings; you can also update manually using the steps above.

### 3. Open cleanup mode

1. Open ChatGPT in the same browser and sign in to your account.
2. Refresh the ChatGPT page if it was already open.
3. Open the sidebar that lists your conversations.
4. Look for the **Chat Happens** panel near the bottom-right corner. The installed version is shown beneath its name, for example **v0.1.0**.
5. Click **Enter cleanup mode**. Small checkboxes should appear beside supported chats.

If checkboxes do not appear, leave your chats unchanged and check the troubleshooting tips below.

### 4. Choose and review your chats

1. Tick the box beside each chat you want to act on.
2. Check the selected count and chat titles in the panel. Each selected row is also shaded green and has a ticked checkbox. The title list stays visible even if you scroll away from a selected chat.
3. Click **Review selection** to see the full list.

**Select displayed** selects only supported chats currently visible in the sidebar. It does not select your whole account or load older chats. Chats that appear later are not automatically selected. Project chats are excluded in this version.

To change your mind, untick a chat or choose **Clear selection**. **Exit cleanup mode** clears your selection and removes the checkboxes without archiving or deleting anything.

The review shows each chat's title and a long identifying number. This helps distinguish chats with the same title. If you cannot tell which is which, choose **Cancel** and check the chats before continuing.

### 5. Archive or delete

From the review screen, choose one action:

- **Archive selected** removes the chats from your regular sidebar while keeping them in your ChatGPT account.
- **Delete selected** permanently deletes the chats. They cannot be restored through ChatGPT, and Chat Happens has no undo. See [OpenAI's explanation](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt).

Read the next screen and check the action and number of chats. For deletion, you must also tick the box acknowledging that deletion is permanent. Click the confirmation button only when the list is correct. **Cancel** closes the review without starting cleanup.

After your final confirmation in Chat Happens, the script handles ChatGPT's own **Delete chat** confirmation for each matching selected chat. You should not have to click Delete separately for every chat. If it cannot verify the dialog, it stops and leaves the dialog open for you to close.

### 6. Watch the progress

Keep the page open and avoid using ChatGPT while cleanup is running. The panel shows progress and a **Stop processing** button. During a batch, Chat Happens may scroll the sidebar to bring an already-selected chat back into view. It does not add any chats to your selection.

**Stop processing** prevents further chats from being processed. An action already submitted may still finish. Switching away from the tab or interacting with ChatGPT outside the panel also requests a stop.

Open **Batch results** to see what happened to each chat:

| Result | What it means |
|---|---|
| Succeeded | Chat Happens saw a success notice, or verified that the relevant confirmation or archive menu closed and that specific chat stayed removed while neighboring chats remained. This verifies the page result, not deletion from OpenAI's servers. |
| Skipped | The selected chat could not be found reliably or brought into view. No action was started for that chat. Check it manually; you can review and retry skipped chats separately. |
| Failed | A check failed before the action was submitted. Read the accompanying explanation. |
| Stopped before processing | Cleanup stopped before this chat was processed. |
| Outcome unknown | An action may have happened, but Chat Happens could not confirm the result. |

**If you see “Outcome unknown,” check the chat in ChatGPT before doing anything else. Do not simply run the same action again.** The remaining batch stops, and that chat cannot be selected again until the page is reloaded. Reloading does not resolve the uncertainty.

Refreshing or closing the page clears the selection and results. Cleanup does not continue in the background. If an unfamiliar ChatGPT confirmation stays open after a failure, close it manually without approving it.

### If something is not working

- **No cleanup panel:** Check that Tampermonkey and Chat Happens are enabled, then refresh the ChatGPT website.
- **No checkboxes:** Open the conversation sidebar and check that ChatGPT is in English. Project chats and unsupported layouts are excluded.
- **Cleanup stops unexpectedly:** Read the result beside the affected chat. Chat Happens stops when it cannot confidently identify a control or confirm an outcome.
- **Still stuck:** [Report an issue](https://github.com/shimuranmonk/chat-happens/issues). Include your browser, Tampermonkey version, the Chat Happens version shown in the panel, and the message shown. Leave out private chat contents.

## For developers: build and test

These steps are optional. You do not need them to install the ready-made script.

Requires Node.js 20+ and npm:

```sh
npm ci --ignore-scripts
npm run check
npm run preview
```

The preview shows a simulated chat list at http://127.0.0.1:4173. It never connects to your ChatGPT account. Reload resets its samples. Stop the preview server with Ctrl+C.

- [Test plan and production release gate](docs/test-plan.md)
- [Integration findings, assumptions, and limitations](docs/integration-validation.md)

## Credits

This README was generated by Alapaap.net.
