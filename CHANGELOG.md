# Changelog

## 2026-11-17

### New

- **Backlog** (`backlog`): the `docs/backlog/` items of the focused space's repo in a popup (`ctrl-shift-j`) and a pane, with search, `worth` and last-7-days filters, and sort. The pane shows an item as markdown and hands it to an installed agent in a new tab (`/amoniac:backlog <slug>` for Claude Code). Works for spaces on other machines.

## 2026-11-14

### New

- **Space Tree**: Git in each space row: branch, `↑N` / `↓N` against upstream, and the branch's pull request from `gh` with its state, checks and review. Click opens the pull request.

## 2026-11-12

### New

- **Space Tree** (`space-tree`), **Side Toast** (`side-toast`) and the **Tree** layout (`tree`).
- **Space Tree**: spaces grouped by machine, with a color and an icon per machine; usage limits read from every machine and grouped by account.
- `sync.sh` copies the mods and layouts to and from `~/.config/herdr-app`.
