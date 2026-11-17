# Backlog

The deferred-work items of the focused space's repo, `docs/backlog/<slug>.md` (the format of `amoniac:backlog`), in a popup and a pane. From an item, hand it to an agent.

## What you see

- **Popup** (`ctrl-shift-j`): the items of the repo, one row each: `worth` (`yes` green, `later` amber, `no` dim), the title and `where`. `yes` first, then `later`, then `no`; the oldest `added` first in each group.
- **Pane**: the list on the left, the selected item on the right: `worth · added · where · ticket`, a **Hand to agent ▾** button, and the item as markdown without its frontmatter.

Above the list, in both: a search field (title, slug, `where`, body), counter chips that filter (`all`, `yes`, `later`, `no`, `last 7 days`) and a sort chip that cycles `worth, oldest first` → `newest first` → `oldest first`.

## How it behaves

- Popup: typing goes to the search field, ↑/↓ select, Enter or a click opens the item in a pane to the right, Esc closes.
- Pane: a click on a row shows that item. New, changed and removed files show by themselves (at once on this computer, within 15 seconds on another machine).
- **Hand to agent**: pick an installed agent. A new tab in the space, named by the item's title, starts it with the task `/amoniac:backlog <slug>` for Claude Code, or `Work on the backlog item docs/backlog/<slug>.md` for other agents.
- A repo without `docs/backlog` shows "No docs/backlog in this repo"; an item deleted while shown shows "Item removed".

## Install

See the [repository README](../README.md), then add the key from [`keys.json`](keys.json) to `~/.config/herdr-app/keys.json`:

```json
"global": { "ctrl-shift-j": "mod.open:backlog" }
```

Without it, open the popup from the palette (`mod.open`, name `backlog`).

## Runs and reads

Runs `git rev-parse --show-toplevel` in the space's folder and one `sh` script that prints `docs/backlog/*.md`, on the space's machine. No network.
