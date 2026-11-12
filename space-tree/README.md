# Space Tree

A sidebar for Herdr: every space is a folder with its agents, sub-agents and terminals under it as a tree, and Claude and Codex usage limits at the bottom.

## What you see

- **Spaces** as rows with a chevron, a colored folder icon and the name. A space on another machine shows the machine name.
- **An open space** is a card with a border; the active space's card is grey. Under the header, in pane order:
  - agents with the program icon, a label (tab name, else title) and status: a spinner while working, a red *Needs you* pill when blocked, a filled dot when done, a hollow dot when idle;
  - sub-agents (terminals an agent started with `hc run`) nested under their agent, any depth;
  - plain terminals as `program · folder`.
  - The focused pane is bold. Hover shows the full title.
- **A folded space** shows a summary: number of agents, number of terminals, `! N` when agents are blocked, or a dot with the number of done agents, or a spinner.
- **Usage limits** at the bottom: Claude 5h and 7d, Codex windows (5h, 7d). Percentage, time to reset and a bar; green, orange from 50%, red from 80%. Expired windows are hidden; an agent without data is hidden.
- Narrower than 160px, it draws a compact rail of space numbers.

## How it behaves

- Click a space to select it; drag it to reorder within its machine.
- Click the chevron to fold; folds are remembered.
- Right-click a space for Herdr's space menu.
- Click an agent or terminal to focus its pane; click a sub-agent to focus or peek it.
- `+` makes a new space.
- `agent.next` / `agent.prev` follow the tree's order.

## Usage limits

**Codex** needs nothing: the mod reads the last `rate_limits` record from the newest `~/.codex/sessions/**/rollout-*.jsonl` every 30 seconds. It uses GNU `find -printf` (Linux).

**Claude** needs Claude Code's status line to save its `rate_limits` to `~/.cache/claude-rate-limits.json`. [`claude-limits.sh`](claude-limits.sh) does that from the status line's input (needs `jq`). Call it from your status line script:

```sh
input=$(cat)
echo "$input" | /path/to/herdr-mods/space-tree/claude-limits.sh
```

or, with no status line of your own, in `~/.claude/settings.json`:

```json
{ "statusLine": { "type": "command", "command": "/path/to/herdr-mods/space-tree/claude-limits.sh" } }
```

The Claude block shows up once Claude Code's status line input has had `rate_limits` at least once.

## Install

See the [repository README](../README.md). The mod needs a block in your layout: `{ "id": "spaces", "type": "block", "content": { "mod": "space-tree" } }` in a sidebar column with id `sidebar`.

## Runs and reads

- runs `sh -c` with `find`, `sort`, `grep` over `~/.codex/sessions`;
- reads `~/.cache/claude-rate-limits.json`;
- no network.
