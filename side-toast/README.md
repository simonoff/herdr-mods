# Side Toast

Herdr's notifications at the bottom left of the work area, next to the sidebar, instead of the bottom right.

## What you see

Up to five cards, 320px wide, stacked in a floating block at the left edge of the work area: an icon (or a dot in the level's color), the title (13px semibold) and the body (12px, muted). Nothing is drawn when there are none.

## How it behaves

- A card stays for the notification's `timeout`, else 6 seconds.
- Click: runs the notification's action (for example, goes to the agent that finished) and closes the card.
- Drag the block anywhere; Herdr remembers the spot.

## Install

See the [repository README](../README.md). Your layout needs two changes:

```json
{ "id": "root", "toast": "side-toast", ... }
```

and a floating block on the column that holds the tabs:

```json
"floating": [ { "id": "toasts", "content": { "mod": "side-toast" }, "edge": "left", "align": "end" } ]
```

The [Tree](../tree/RECIPE.md) layout has both.

## Runs and reads

Nothing outside Herdr; no network.
