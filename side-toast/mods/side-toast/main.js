import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, shared, setShared } from "herdr";

const KEY = "side-toast.items";
const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };
const TIMEOUT = 6000;

const items = () => (shared(KEY) ?? []).filter((n) => n.until > Date.now());

export default class SideToast extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.relay = Boolean(p.overlay);
    if (this.relay) {
      const n = { id: p.overlay, title: p.title ?? "", body: p.body ?? "", level: p.level, icon: p.icon, action: p.action ?? null, until: Date.now() + (p.timeout ?? TIMEOUT) };
      setShared(KEY, [...items(), n].slice(-5));
      closeOverlay(p.overlay);
      return;
    }
    this.count = items().length;
    cx.timer.every(1000, (cx) => {
      const now = items().length;
      if (now !== this.count) {
        this.count = now;
        cx.notify();
      }
    });
  }

  dismiss(id) {
    setShared(KEY, items().filter((n) => n.id !== id));
  }

  card(t, n) {
    return h_flex()
      .id(`toast-${n.id}`)
      .w(320)
      .px(14)
      .py(10)
      .gap(12)
      .items_center()
      .rounded(6)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => {
        if (n.action?.name) run(n.action.name, n.action.args ?? {});
        this.dismiss(n.id);
      })
      .child(n.icon ? image(n.icon).w(18).h(18).flex_none() : div().size(8).rounded(4).flex_none().bg(t[DOT[n.level] ?? "accent"]))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().font_semibold().text_size(13).text_color(t.foreground).child(n.title))
        .when(Boolean(n.body), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(n.body))));
  }

  render() {
    if (this.relay) return div();
    const list = items();
    if (!list.length) return div();
    const t = theme();
    return v_flex().px(4).gap(2).children(list.map((n) => this.card(t, n)));
  }
}
