# Herdr Mods

Mods for [Herdr Desktop](https://herdr.dev/), built on Herdr's own mod API: a tree sidebar of spaces and their agents with usage limits, and notifications on the left. Install one, or both as the [Tree](tree/RECIPE.md) layout.

## Install

Copy this into your Herdr agent, with the folder name:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/simonoff/herdr-mods/tree/main/<folder>
```

The agent follows the folder's `RECIPE.md`.

Or by hand, with links, so `git pull` updates the mods:

```sh
git clone https://github.com/simonoff/herdr-mods ~/Works/opensource/herdr-mods
ln -s ~/Works/opensource/herdr-mods/space-tree/mods/space-tree ~/.config/herdr-app/mods/space-tree
ln -s ~/Works/opensource/herdr-mods/side-toast/mods/side-toast ~/.config/herdr-app/mods/side-toast
cp ~/Works/opensource/herdr-mods/tree/layouts/tree.json ~/.config/herdr-app/layouts/tree.json
herdr-app check ~/.config/herdr-app/mods/space-tree
herdr-app check ~/.config/herdr-app/mods/side-toast
herdr-app do layout.switch --name tree
```

The layout is copied, not linked: Herdr saves your clicks next to it, and you may want to change it on one machine only. `ctrl-shift-l` switches back to your previous layout.

## The mods

- [Space Tree](space-tree/README.md) (`space-tree`): spaces as folders, with their agents, sub-agents and terminals as a tree; drag to reorder; a folded space shows counts and who waits for you; Claude and Codex usage limits at the bottom.
- [Side Toast](side-toast/README.md) (`side-toast`): Herdr's notifications at the bottom left of the work area instead of the right.
- [Tree](tree/RECIPE.md) (`tree`): Herdr's main layout with Space Tree in the sidebar and Side Toast for notifications.

## License

[BSD 3-Clause](LICENSE).
