# Herdr Mods

Mods for [Herdr Desktop](https://herdr.dev/), built on Herdr's own mod API: a tree sidebar of spaces and their agents with usage limits, and notifications on the left. Install one, or both as the [Tree](tree/RECIPE.md) layout.

## Install

Copy this into your Herdr agent, with the folder name:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/simonoff/herdr-mods/tree/main/<folder>
```

The agent follows the folder's `RECIPE.md`.

Or with `sync.sh`:

```sh
git clone https://github.com/simonoff/herdr-mods
cd herdr-mods
./sync.sh
herdr-app do layout.switch --name tree
```

- `./sync.sh` (or `./sync.sh to-herdr`) copies every mod and layout into `~/.config/herdr-app` (or `$HERDR_APP_HOME`) and runs `herdr-app check` on each mod. Run it again after `git pull`.
- `./sync.sh from-herdr` copies them back into the repository, after you changed them in Herdr.

It overwrites files of the same name and leaves other files alone. `ctrl-shift-l` switches back to your previous layout.

## The mods

- [Space Tree](space-tree/README.md) (`space-tree`): spaces as folders, with their agents, sub-agents and terminals as a tree; drag to reorder; a folded space shows counts and who waits for you; Claude and Codex usage limits at the bottom.
- [Side Toast](side-toast/README.md) (`side-toast`): Herdr's notifications at the bottom left of the work area instead of the right.
- [Tree](tree/RECIPE.md) (`tree`): Herdr's main layout with Space Tree in the sidebar and Side Toast for notifications.

## License

[BSD 3-Clause](LICENSE).
