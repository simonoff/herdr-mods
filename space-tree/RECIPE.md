# Space Tree

A Herdr sidebar mod: spaces as folders with their agents, sub-agents and terminals as a tree under each, and Claude and Codex usage limits at the bottom.

## What you see

Top to bottom, on the `chrome` background, text 13px:

1. **Header**, 31px: "Spaces" (11.5px, `dim`) on the left at 16px, a 26px `+` button (`mods/workspace-chrome/plus.svg`, 14px) on the right.
2. **Tree**, scrolls with an always-visible scrollbar, 8px side padding.
   - **Space row**, 30px, radius 8: a 16px chevron button (`mods/workspace-chrome/chevron-down.svg` / `chevron-right.svg`, 11px, `dim`, only when the space has items), an 18px folder tile (radius 5, the space color at `33` alpha, `mods/workspace-chrome/folder.svg` 12px in the space color), the name (truncated), the machine name (10px, `dim`) for remote spaces.
   - Space colors: one of `#22a99a #e3814f #5b8def #8b7cf6 #3fae6a #d9649a`, the least used, given once per space and kept in shared `space.colors`. The space named `~` gets none (falls back to `#22a99a`).
   - **Open space with items**: a card (margin 2px vertical, padding 2px, radius 10, 1px `border`), background `selected` when active. The header row has no own background then. A folded or empty active space gets `selected` on the row itself.
   - **Item rows**, 26px, text 12.5px, left padding 14px, radius 8, hover `hover`:
     - connector 9px wide, 8px right margin: `├` is a 1.5px `input` line down plus a 13px elbow with a 6px rounded corner, `└` the elbow only, `│` the line only;
     - agent: program icon 14px, label, status. Label: the tab name if not a number and the agent is alone in its tab, else the title (leading symbols stripped) unless it is the program name or a path, else tab, program, address. Text `muted` when idle;
     - sub-agent: same, with one connector per depth level; name = name, template, program or address; status `done` shows as idle, `error` as blocked;
     - terminal: program icon or `mods/workspace-chrome/terminal.svg`, title unless it is a path or has `@`, else `program · last folder of cwd`. Text `muted`;
     - the focused pane's row: `foreground`, bold.
     - tooltip: the full title; a terminal adds its cwd on a second line.
   - **Status**: working = `mods/workspace-chrome/spinner.svg` 12px, `working`, spin 900ms; blocked = "Needs you" pill (18px, radius 5, `blocked` at `26` alpha, 10.5px semibold); done = 7px `done` dot; idle = 7px ring, 1.5px `idle`.
   - **Folded summary** at the row's right: `icons/agent.svg` + agent count (`working` color if the top status is working, else `dim`), `icons/shell.svg` + terminal count, then `! N` pill for blocked, else a `done` dot + count, else a spinner when working.
3. **Limits**, 1px `border` top, padding 8/16, 11px: per agent with data, a header (12px `icons/claude.svg` or `icons/codex.svg`, name, `dim`) and a row per window: label (18px wide, `muted`), percent, `resets in 2h5m` (`dim`), then a 4px bar (radius 2, `raised` track). Color: `ansi2` below 50, `ansi3` below 80, `blocked` from 80.

Sidebar narrower than 160px (`layout()` node `sidebar` `size.px`): a rail of 32×26 buttons with the space number and a `●` (blocked or done) or `·` in the status color; no limits.

## How it behaves

- Click a space row: `space.select`. Press on one row and release on another of the same machine: `space.move {id, index: target + 1}`; while dragging, the pressed row is at 50% opacity and a 2px `accent` line marks the drop side. Releasing on empty tree area cancels.
- Chevron: fold or unfold; stops the press so no drag starts. Folded ids in `localStorage` `folded`.
- Right-click a space: `openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id } } })`.
- Agent or terminal row: `pane.focus {pane}`. Sub-agent: `pane.focus {terminal}` if it is a listed agent, else `terminal.peek {terminal}`.
- `+`: `space.new`.
- Every render calls `setAgentOrder` with agents and their sub-agents in tree order.

## Built from

- One mod `space-tree`, `mod.json` `{ "place": "none" }`, a block in the sidebar column (`id: "sidebar"`).
- `herdr`: `spaces`, `agents`, `terminals`, `panes`, `focused`, `layout`, `theme`, `shared`/`setShared`, `setAgentOrder`, `run`, `openOverlay`, `readTextFile`, `home`, `exec`.
- Items per space come from `panes()` in order: a pane with an agent is an agent item, else a terminal item; panes whose terminal is a nested sub-agent are skipped. Sub-agents: `terminals()` with `parent` = the agent's address and `state` `live`, recursively.
- Limits, every 30s and at start:
  - Claude: `~/.cache/claude-rate-limits.json`, `{ rate_limits: { five_hour, seven_day: { used_percentage, resets_at } }, at }`, written by `claude-limits.sh` from Claude Code's status line input.
  - Codex: `sh -c` finds the 5 newest `~/.codex/sessions/**/rollout-*.jsonl` changed in the last 8 days and takes the last line containing `"rate_limits":{` from the first file that has one; `payload.rate_limits.primary` / `secondary` `{ used_percent, window_minutes, resets_at }`; window label from minutes (`300` → `5h`, `10080` → `7d`).
- Icons are Herdr's: `icons/*.svg`, `mods/workspace-chrome/*.svg`.

## Watch out

- `find -printf` is GNU; on macOS the Codex part finds nothing.
- Claude limits appear only after Claude Code has drawn its status line once with `rate_limits` in its input.
- Hide an expired window (`resets_at` in the past) rather than show stale numbers.
- The card must not also paint the header row, or the active space looks double-highlighted.
- Stop the chevron's mouse-down, or folding starts a drag.

## Done when

- `herdr-app check` passes.
- A space with a Claude agent and a shell shows both rows under it; focusing one makes it bold.
- An agent that runs `hc run -- sh` shows a nested row; clicking it peeks it.
- Folding a space with a blocked agent shows `! 1`.
- Dragging a space onto another moves it there.
- With Codex used in the last week, a Codex block shows its windows.
