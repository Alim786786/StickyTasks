# StickyTasks

A minimal floating checklist for Chrome (Manifest V3). Click the toolbar icon to show or hide a draggable, resizable panel on the current page. Everything is stored locally with `chrome.storage.local`. There is no backend, no login, and nothing leaves your browser.

## Features

- **Global list**: one permanent list shared by every tab and window. It is never archived.
- **Tab notes**: one optional note per browser tab, created from `··· → Create tab note`. Two tabs on the same site get separate notes.
- **Navigation**: use the ‹ › arrows, click the note name for a picker, or scroll the mouse wheel over the navigator. Double-click a tab note's name to rename it.
- **Switch Chrome tabs** (off by default): when it's on, picking a tab note jumps to that note's browser tab and opens the panel there.
- **Archive**: closing a browser tab archives its note with all its tasks. In `··· → Archived notes` you can search, restore (this reopens the saved URL and reconnects the note), or delete notes permanently.
- **Tasks**: add, edit (click the text), complete, delete (×), and reorder (drag a row, or Alt+↑/↓). Enter saves and Escape cancels. Every change saves automatically.

These actions do **not** archive a note: reloading the page, navigating, switching tabs, closing the panel, or Chrome discarding the tab.

## Install (developer mode)

```bash
npm install
npm run build        # typecheck + production build into dist/
```

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `dist/` folder.
4. Pin StickyTasks from the puzzle-piece menu, then click its icon on any normal web page.

After you rebuild, click the reload icon on the extension's card. Pages that were already open get the new version the next time you click the icon.

> Chrome doesn't allow extensions on `chrome://` pages, the Chrome Web Store, or other internal pages. On those pages the icon briefly shows a `!` badge. For `file://` pages, turn on "Allow access to file URLs" on the extension's details page.

## Scripts

| Command             | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `npm run build`     | Typecheck, then build `dist/`                |
| `npm run typecheck` | `tsc --noEmit`                               |
| `npm test`          | Vitest unit tests (model, lifecycle, store)  |
| `npm run icons`     | Regenerate the PNG icons in `public/icons/`  |

## Architecture

```
src/
  shared/       pure logic (no Chrome APIs): types, model, validation, geometry, messages
  background/   MV3 service worker: tab lifecycle, serialized store, panel auth, injection
  content/      tiny page-side host: positions the panel iframe, relays show/hide
  panel/        panel.html entry: connection handshake, storage bridge
  ui/           React components (Tailwind, Lucide), rendered inside panel.html
tests/          Vitest tests: model, lifecycle, storage, security regressions
public/         manifest.json and icons
```

- **Single writer.** Only the service worker writes app state. Every read-modify-write goes through one promise queue (`background/store.ts`), so panels in different tabs can't overwrite each other with stale data. Panels send intent-based ops (`task.add`, `task.move`, …), apply them optimistically, and reconcile using a revision number from `chrome.storage.onChanged`.
- **Per-tab UI state.** Visibility, the current note, and the panel's position are kept per tab in `chrome.storage.session`. This survives reloads, which re-open the panel automatically, but it's cleared when the browser quits.
- **Isolation.** The UI is an extension-origin iframe (`panel.html`) inside a closed shadow root. Web pages can't read its DOM or see keystrokes typed into it. The page-side content script holds no task data; it only positions the iframe.
- **Lifecycle and restart safety.**
  - Closing a single tab archives its note.
  - Closing a whole window first *detaches* its notes. If the browser keeps running, they're archived right away. If the browser is quitting, they wait for session restore.
  - After a restart, when `chrome.storage.session` is empty, notes are matched to the restored tabs by URL. Notes whose tabs don't come back within 2 minutes are archived, never deleted.
  - Tab discards and prerenders (`tabs.onReplaced`) keep the note bound to its tab.
- **Duplicate protection.** A guard flag plus a host-element check prevent duplicate panels, and injection runs once per tab at a time. Restore is idempotent: restoring an already-active note just focuses its tab.

## Permissions

- `storage`: saves tasks locally.
- `scripting` and host access to `http`, `https`, and `file` pages: inject the panel when you click the icon, re-show it after reloads or when switching tabs, and read tab URLs for archiving and session restore. `activeTab` alone can't do the last three.

## Security

- **Untrusted senders.** Content scripts share a process with the web page, so the service worker treats their messages as untrusted. Each message is checked for sender role (page host vs. panel frame) and validated field by field (`src/shared/validate.ts`).
- **Panel authentication.** `panel.html` is web-accessible, so a page could frame it, for example to clickjack it. To prevent that, the host registers a random one-time nonce with the service worker and gives it only to its own iframe, using `postMessage` restricted to the extension origin. Panel requests from any other frame are rejected.
- **Storage.** Both storage areas are restricted to trusted contexts. Stored data is re-validated on every load.
- **CSP and network.** The CSP is strict (`script-src 'self'; connect-src 'none'; object-src 'none'`). There's no `innerHTML` or `eval`, and no remote code or network requests.
- **Restore URLs.** The archive only reopens `http`, `https`, and `file` URLs.
