# Backlog

The `docs/backlog/<slug>.md` items of the focused space's Git repo in a popup and in a pane, and a button that hands one item to an agent in a new tab.

## What you see

- **Popup**, `mod.json` overlay `{ kind: "popup", at: "top", offset: 40, width: 820, height: 0.75 }`, `popover` background, padding 18, gap 10, text 13px. Header: "Backlog" (15px semibold, `foreground`) and the repo folder name (11px, `dim`). The list is at most 480px high.
- **Item card**, 54px, gap 6 between cards, radius 8, padding 12, 1px `border` on `background` (selected: `accent` border, `hover` background): a badge 48×18, radius 4, `YES` / `LATER` / `NO` (10px bold, `background` text on `done` / `working` / `dim`); then two lines: the title (13px semibold, truncated), and `<slug>.md` (11px, `accent`), `where` (`muted`, truncated), `added <date>` (`dim`).
- **Pane**, `background`: left column 340px with a 1px `border` on the right, a 42px header ("Backlog" semibold, repo name 11px `dim`), the toolbar and the cards. Right: a 42px bar with `worth · added · where · ticket` (12px, `muted`) and a button "Hand to agent ▾" (`solid` / `solid_foreground`, radius 6, 12px); below, the item body as markdown, padding 14, scrolling.
- Toolbar above the list, in the popup and in the pane (pane list column 340px): a 30px search field (`Input`, 1px `input` border, `background`), then wrapping 24px chips, 11px, radius 6, 1px `border` (active: `accent` border, `selected` background): one per filter with its count (semibold) and label, and a sort chip `↕ <order>`.
- Agent menu under the button: installed agents from `knownAgents`, 30px rows with the program icon and name, `popover` with a 1px `border`.
- Empty states (12px, `dim`): "Loading backlog…", "Not a Git repo", "No docs/backlog in this repo", "Backlog is empty", "Item removed", or the error text.

## How it behaves

- Order: `worth` `yes`, `later`, `no`, then others; inside each group `added` ascending, then the slug.
- Filters: `all`, `yes`, `later`, `no`, `last 7 days` (`added` within 7 days). Search: case-insensitive substring of title, slug, `where`, body. Sort chip cycles `worth, oldest first` (the default order) → `newest first` → `oldest first` (by `added`, then slug). Counts ignore the search.
- Popup: the search field has the focus; ↑/↓ move the selection (wrapping), Enter (the field's submit) or a click closes the popup and runs `pane.split { direction: "right", mod: "backlog", props: { folder, machine, slug } }`. Esc closes.
- Pane: a click on a row selects that item (not saved in props). On this computer the pane reloads on `watchFolder(<folder>/docs/backlog)`; on another machine, or when the watch rejects, every 15 s.
- Hand to agent: `tab.new { space: focused().space, name: <title>, argv: agent.run, task }`. Task: `/amoniac:backlog <slug>` when the agent's `key` is `claude`, else `Work on the backlog item docs/backlog/<slug>.md`.
- No agent statuses are shown.

## Built from

- Mod `backlog`, one `main.js`, two modes: `props().overlay` set → popup; else pane with props `{ folder, machine, slug }`.
- Popup finds the space with `focused().space` (else the active space), the folder with `focused().cwd` (else the space's `folder`), and the repo root with `exec("git", ["rev-parse", "--show-toplevel"], { cwd, on: machine })`.
- Items: one `exec("sh", ["-c", script, "backlog", "<root>/docs/backlog"], { on })`. The script exits 3 when the directory is missing, else prints `\x1e<slug>\n` and the file for each `*.md`. Parse the frontmatter between the first two `---` lines (`worth`, `where`, `added`, `ticket`) and the first `# ` line as the title.
- A reload compares the script output with the last one; the same output parses nothing and draws nothing.
- `herdr`: `spaces`, `focused`, `exec`, `watchFolder`, `knownAgents`, `run`, `theme`, `props`, `closeOverlay`, `checking`. `gpui-base`: `v_flex`, `h_flex`, `TextView.markdown`.
- `keys.json`: `"global": { "ctrl-shift-j": "mod.open:backlog" }`.

## Watch out

- `TextView` comes from `gpui-base`, not `gpui-kit`.
- `mod.open` gives no props: the popup must find its space itself. `focused().cwd` is null while a mod pane has the focus.
- `exec` runs no shell: `docs/backlog/*.md` does not expand without `sh -c`. A missing directory is the empty state, not an error.
- Herdr allows at most 16 running `exec`/`readTextFile` calls. One `readTextFile` per item, plus `watchFolder` reloads that overlap, hits that limit: read all items in one `exec`, and start no reload while one runs.
- A pane already has a header with the mod's name: the pane draws no "Backlog" title of its own.
- `watchFolder` works only on this computer. Guard watches and timers with `checking()`.
- `ctrl-shift-k` is Herdr's `mod.open:picker` by default.
- The mod never changes, adds or deletes items.

## Done when

- `herdr-app check` passes.
- `ctrl-shift-j` in a repo with `docs/backlog` lists the items, `yes` first, oldest first.
- Enter opens a pane with the item as markdown and its `worth · added · where`.
- A new file in `docs/backlog` shows in the open pane.
- Hand to agent → Claude Code opens a new tab named by the item, with `/amoniac:backlog <slug>` as its first message.
- In a space on another machine, the same works with that machine's files and agents.
