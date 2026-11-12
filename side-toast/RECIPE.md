# Side Toast

Herdr's notifications at the bottom left of the work area instead of the bottom right. Herdr has no setting for where toasts show, so one mod plays two roles: the layout's toast mod, which passes each notification on and closes at once, and a floating block that draws them.

## What you see

- A floating block on the left edge of the work column, aligned to the bottom. Herdr draws its frame.
- Inside, padding 4px horizontal, 2px gap: one card per notification, newest last, at most 5.
- Card: 320px wide, padding 10/14, gap 12, radius 6, hover `hover`. Left: `image(icon)` 18px if the notification has an icon, else an 8px dot colored by level (`error` → `blocked`, `warning` → `working`, `success` → `done`, `info` or none → `accent`). Right: title (13px semibold, `foreground`, truncated) and body (12px, `muted`, truncated) if any.
- No notifications: renders an empty `div()`, so the block disappears.

## How it behaves

- Each card lives until `timeout` ms (default 6000) after it arrived; the block checks every second and redraws only when the count changes.
- Click a card: `run(action.name, action.args)` if the notification has an action, then remove the card.
- The card stops left mouse-down so clicking it doesn't drag the floating block.

## Built from

- Mod `side-toast`, `mod.json` `{ "place": "none" }`.
- Layout root: `"toast": "side-toast"`. Herdr opens it as an overlay for every notification with `props()` `{ title, body, level, icon, action, timeout, overlay }`.
- Layout node `work` (the column with tabs and panes): `"floating": [{ "id": "toasts", "content": { "mod": "side-toast" }, "edge": "left", "align": "end" }]`.
- In `init`: if `props().overlay` is set, this copy is the relay: append `{ id: overlay, title, body, level, icon, action, until: now + (timeout ?? 6000) }` to shared `side-toast.items` (dropping expired, keeping the last 5), then `closeOverlay(overlay)` and render nothing. Otherwise it is the display: read shared `side-toast.items`, filtered by `until > Date.now()`.
- `herdr`: `props`, `closeOverlay`, `run`, `theme`, `shared`, `setShared`.

## Watch out

- The relay must close its overlay in `init`, or Herdr's empty toast frame stays on the right.
- Filter expired items on every read; nothing else removes them from shared state except a click.
- Only layouts with both the root `toast` and the floating block show notifications this way; in other layouts Herdr's own toast stays on the right.

## Done when

- `herdr-app check` passes.
- `herdr-app status` shows the floating block `toasts` and no errors.
- When an agent finishes in a space you aren't looking at, a card appears at the bottom left; clicking it focuses that agent and the card goes away.
- A card disappears by itself after about 6 seconds.
