# Tree

Herdr's main layout with one change in the sidebar and one in notifications: [Space Tree](../space-tree/README.md) replaces the spaces and agents lists, and [Side Toast](../side-toast/README.md) shows notifications at the bottom left.

## What you see

Left to right:

1. **Sidebar**, 268px (44 to 480), `chrome`: Herdr's `workspace-chrome` brand bar (46px, drags the window), the `space-tree` block (min 90px), `workspace-chrome` footer (69px).
2. **Work column**: `tabs` (42px, drags the window), the active tab's panes as cards (radius 10, gap 8, 1px `border`, `accent` when focused, a `pane` header 30px on top, also on a lone pane), a hidden right panel with Herdr's `files` and `changes` (368px), `workspace-status` (28px).
3. Notifications float at the left edge of the work column, at the bottom.

Background `canvas`, 1px `border` dividers, no system title bar, terminal padding 14/12.

## How it behaves

As Herdr's main layout, plus what [Space Tree](../space-tree/RECIPE.md) and [Side Toast](../side-toast/RECIPE.md) do.

## Built from

- `layouts/tree.json`: a clone of Herdr's `main` 0.1.15 (`cloned_from`), with:
  - root `"toast": "side-toast"`;
  - `sidebar-lists` holding one block `{ "id": "spaces", "content": { "mod": "space-tree" }, "min": 90 }`;
  - `work` with `"floating": [{ "id": "toasts", "content": { "mod": "side-toast" }, "edge": "left", "align": "end" }]`.
- Mods: `space-tree` and `side-toast` from this repository; `workspace-chrome`, `tabs`, `pane`, `files`, `changes`, `workspace-status` are Herdr's.

## Install

1. Install `space-tree` and `side-toast` (their folders' `mods/<name>/` into `~/.config/herdr-app/mods/`).
2. Copy `layouts/tree.json` into `~/.config/herdr-app/layouts/`. Don't overwrite an existing `tree.json`: rename the new one.
3. `herdr-app check` both mods, then `herdr-app do layout.switch --name tree`.

## Watch out

- The layout is a clone of `main` 0.1.15 and does not follow Herdr's updates of `main`. If a newer `main` changes, clone it again (`layout.clone`) and redo the three changes above.
- `ctrl-alt-shift-escape` always goes back to `main`.

## Done when

- `herdr-app status` shows layout `tree`, the float `toasts` and no errors.
- The sidebar shows the space tree with limits at the bottom.
- An agent finishing in another space shows its notification at the bottom left.
