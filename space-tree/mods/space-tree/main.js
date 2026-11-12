import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, agents, terminals, panes, focused, readTextFile, home, exec, run, openOverlay, theme, shared, setShared, setAgentOrder, layout } from "herdr";

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const PALETTE = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function agentLabel(a, many) {
  const title = clean(a.title);
  const prog = a.program?.name ?? "";
  const tab = /^\d+$/.test(a.tab_name) ? "" : a.tab_name;
  if (tab && !many) return tab;
  if (title && title !== prog && !/^[~/]/.test(title)) return title;
  return tab || prog || a.address;
}

const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};

function subTree(all, addr, lead = []) {
  const kids = all.filter((k) => k.parent === addr && k.state === "live");
  return kids.flatMap((k, i) => {
    const last = i === kids.length - 1;
    return [
      { k, lines: [...lead, last ? "└" : "├"] },
      ...subTree(all, k.address, [...lead, last ? "" : "│"]),
    ];
  });
}

const CODEX_LIMITS = `find "$HOME/.codex/sessions" -name 'rollout-*.jsonl' -mtime -8 -printf '%T@ %p\\n' 2>/dev/null | sort -rn | head -5 | cut -d' ' -f2- | while read -r f; do l=$(grep '"rate_limits":{' "$f" | tail -1); if [ -n "$l" ]; then printf '%s\\n' "$l"; break; fi; done`;

function windowLabel(minutes) {
  if (!minutes) return "?";
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

export default class SpaceTree extends View {
  init(_props, cx) {
    this.folded = new Set(JSON.parse(localStorage.getItem("folded") ?? "[]"));
    this.pressed = null;
    this.over = null;
    this.limits = { claude: [], codex: [] };
    this.readLimits(cx);
    cx.timer.every(30000, (cx) => this.readLimits(cx));
  }

  readLimits(cx) {
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(`${home()}/.cache/claude-rate-limits.json`);
        const rl = text ? JSON.parse(text).rate_limits ?? {} : {};
        this.limits.claude = [["5h", rl.five_hour], ["7d", rl.seven_day]]
          .filter(([, w]) => w)
          .map(([label, w]) => ({ label, pct: w.used_percentage, resets_at: w.resets_at }));
      } catch {
        this.limits.claude = [];
      }
      try {
        const r = await exec("sh", ["-c", CODEX_LIMITS]);
        const rl = r.stdout.trim() ? JSON.parse(r.stdout.trim()).payload?.rate_limits ?? {} : {};
        this.limits.codex = [rl.primary, rl.secondary]
          .filter(Boolean)
          .map((w) => ({ label: windowLabel(w.window_minutes), pct: w.used_percent, resets_at: w.resets_at }));
      } catch {
        this.limits.codex = [];
      }
      cx.notify();
    });
  }

  limitsBar(t) {
    const now = Date.now() / 1000;
    const live = (list) => list.filter((w) => typeof w.pct === "number" && (!w.resets_at || w.resets_at > now));
    const agentsShown = [["Claude", "icons/claude.svg", live(this.limits.claude)], ["Codex", "icons/codex.svg", live(this.limits.codex)]]
      .filter(([, , list]) => list.length);
    if (!agentsShown.length) return null;
    const left = (secs) => {
      const m = Math.max(0, Math.floor(secs / 60));
      if (m < 60) return `${m}m`;
      const h = Math.floor(m / 60);
      return h < 24 ? `${h}h${m % 60}m` : `${Math.floor(h / 24)}d${h % 24}h`;
    };
    const windowRow = (w) => {
      const pct = Math.round(w.pct);
      const color = pct >= 80 ? t.blocked : pct >= 50 ? t.ansi3 : t.ansi2;
      return v_flex().gap(3)
        .child(h_flex().gap(6).items_center()
          .child(div().w(18).flex_none().text_color(t.muted).child(w.label))
          .child(div().flex_1().text_color(color).child(`${pct}%`))
          .when(Boolean(w.resets_at), (el) => el.child(div().flex_none().text_color(t.dim).child(`resets in ${left(w.resets_at - now)}`))))
        .child(div().h(4).w_full().rounded(2).bg(t.raised)
          .child(div().h_full().rounded(2).bg(color).w(`${Math.min(100, pct)}%`)));
    };
    return v_flex().flex_none().px(16).py(8).gap(8).border_t(1).border_color(t.border).text_size(11)
      .children(agentsShown.map(([name, path, list]) => v_flex().gap(5)
        .child(h_flex().gap(6).items_center().text_color(t.dim)
          .child(image(path).w(12).h(12).flex_none())
          .child(name))
        .children(list.map(windowRow))));
  }

  toggle(id, cx) {
    this.folded.has(id) ? this.folded.delete(id) : this.folded.add(id);
    localStorage.setItem("folded", JSON.stringify([...this.folded]));
    cx.notify();
  }

  colors(sp) {
    const stored = shared("space.colors") ?? {};
    const ids = new Set(sp.map((s) => s.id));
    const kept = Object.fromEntries(Object.entries(stored).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(stored).length;
    for (const s of sp) {
      if (kept[s.id] || s.name === "~") continue;
      const uses = (c) => Object.values(kept).filter((v) => v === c).length;
      kept[s.id] = PALETTE.reduce((best, c) => (uses(c) < uses(best) ? c : best));
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    return kept;
  }

  status(t, st) {
    if (st === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (st === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    if (st === "done") return div().size(7).mx(3).flex_none().rounded(4).bg(t.done);
    return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
  }

  spaceRow(t, s, color, kids, statuses, card) {
    const open = !this.folded.has(s.id);
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color] ?? t.accent);
    const top = statuses.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
    const sp = spaces();
    const from = this.pressed === null ? -1 : sp.findIndex((x) => x.id === this.pressed);
    const here = sp.findIndex((x) => x.id === s.id);
    const target = this.pressed !== null && this.pressed !== s.id && this.over === s.id;
    return h_flex()
      .relative()
      .id(`space-${s.id}`)
      .h(30)
      .px(6)
      .gap(6)
      .flex_none()
      .items_center()
      .rounded(8)
      .cursor_pointer()
      .when(s.active && !card, (el) => el.bg(t.selected))
      .when(!s.active, (el) => el.hover((st) => st.bg(t.hover)))
      .when(this.pressed === s.id && this.over !== s.id, (el) => el.opacity(0.5))
      .when(target, (el) => el.child(div().absolute().left(0).right(0).h(2).bg(t.accent)
        .when(from < here, (line) => line.bottom(0))
        .when(from > here, (line) => line.top(0))))
      .on_mouse_down("left", () => {
        this.pressed = s.id;
        this.over = s.id;
      })
      .on_mouse_move((_e, cx) => {
        const source = sp.find((x) => x.id === this.pressed);
        const over = source && (source.machine ?? null) === (s.machine ?? null) ? s.id : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const pressed = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (pressed !== null && over === s.id && pressed !== s.id) run("space.move", { id: pressed, index: here + 1 });
        else if (pressed === s.id) run("space.select", { id: s.id });
        cx.notify();
      })
      .on_mouse_down("right", () => openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } }))
      .child(div().id(`fold-${s.id}`).size(16).flex_none().flex().items_center().justify_center().rounded(4)
        .text_color(t.dim)
        .when(kids.length > 0, (el) => el.hover((st) => st.bg(t.hover).text_color(t.foreground))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => { cx.stop_propagation(); this.toggle(s.id, cx); })
          .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11))))
      .child(h_flex().size(18).flex_none().rounded(5).bg(fill + "33").items_center().justify_center()
        .child(svg("mods/workspace-chrome/folder.svg").size(12).text_color(fill)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(s.name))
      .when(Boolean(s.machine), (el) => el.child(div().flex_none().text_size(10).text_color(t.dim).child(s.machine)))
      .when(!open && kids.length > 0, (el) => el.child(this.summary(t, kids, statuses, top)));
  }

  summary(t, kids, statuses, top) {
    const terms = kids.filter((x) => x.p).length;
    const blocked = statuses.filter((x) => x.status === "blocked").length;
    const done = statuses.filter((x) => x.status === "done").length;
    const chip = (path, n, color) => h_flex().flex_none().gap(3).items_center().text_size(11).text_color(color)
      .child(svg(path).size(12).flex_none()).child(String(n));
    return h_flex().flex_none().gap(7).items_center()
      .when(statuses.length > 0, (el) => el.child(chip("icons/agent.svg", statuses.length, top === "working" ? t.working : t.dim)))
      .when(terms > 0, (el) => el.child(chip("icons/shell.svg", terms, t.dim)))
      .when(blocked > 0, (el) => el.child(div().flex_none().px(5).h(16).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold()
        .text_color(t.blocked).flex().items_center().child(`! ${blocked}`)))
      .when(blocked === 0 && done > 0, (el) => el.child(h_flex().flex_none().gap(3).items_center().text_size(11).text_color(t.done)
        .child(div().size(7).rounded(4).bg(t.done)).child(String(done))))
      .when(blocked === 0 && done === 0 && top === "working", (el) => el.child(this.status(t, "working")));
  }

  connector(t, kind) {
    const elbow = kind === "├" || kind === "└";
    const through = kind === "├" || kind === "│";
    return div().relative().w(9).h_full().mr(8).flex_none()
      .when(elbow, (el) => el.child(div().absolute().top(0).left(0).w(9).h(13).border_l(1.5).border_b(1.5).rounded_bl(6).border_color(t.input)))
      .when(through, (el) => el.child(div().absolute().top(0).bottom(0).left(0).border_l(1.5).border_color(t.input)));
  }

  subRow(t, s, lines, listed) {
    const k = s.k;
    const pic = icon(k.program, 14, t.foreground);
    const st = kidStatus(k, listed);
    const name = k.name || k.template || k.program?.name || k.address;
    return h_flex()
      .id(`sub-${k.address}`)
      .tooltip(clean(k.title) || name)
      .h(26)
      .pl(14)
      .pr(6)
      .flex_none()
      .items_center()
      .rounded(8)
      .text_size(12.5)
      .cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_click(() => (listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : run("terminal.peek", { terminal: k.address })))
      .children(lines.map((l) => this.connector(t, l)))
      .when(Boolean(pic), (el) => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().min_w(0).truncate().text_color(st === "idle" ? t.muted : t.foreground).child(name))
      .child(this.status(t, st));
  }

  agentRow(t, a, last, many) {
    const pic = icon(a.program, 14, t.foreground);
    return h_flex()
      .id(`ag-${a.address}`)
      .tooltip(clean(a.title) || agentLabel(a, many))
      .h(26)
      .pl(14)
      .pr(6)
      .flex_none()
      .items_center()
      .rounded(8)
      .text_size(12.5)
      .cursor_pointer()
      .hover((st) => st.bg(t.hover))
      .on_click(() => run("pane.focus", { pane: a.pane }))
      .child(this.connector(t, last ? "└" : "├"))
      .when(Boolean(pic), (el) => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().min_w(0).truncate().text_color(a.status === "idle" && a.pane !== this.current ? t.muted : t.foreground)
        .when(a.pane === this.current, (el) => el.font_bold()).child(agentLabel(a, many)))
      .child(this.status(t, a.status));
  }

  terminalRow(t, p, last) {
    const pic = icon(p.program, 14, t.foreground);
    const title = clean(p.title);
    const folder = (p.cwd ?? "").replace(/\/+$/, "").split("/").pop();
    const plain = [p.program?.name || p.terminal, folder].filter(Boolean).join(" · ");
    const name = title && !/^[~/]/.test(title) && !title.includes("@") ? title : plain;
    return h_flex()
      .id(`term-${p.pane}`)
      .tooltip([clean(p.title) || name, p.cwd].filter(Boolean).join("\n"))
      .h(26)
      .pl(14)
      .pr(6)
      .flex_none()
      .items_center()
      .rounded(8)
      .text_size(12.5)
      .cursor_pointer()
      .hover((st) => st.bg(t.hover))
      .on_click(() => run("pane.focus", { pane: p.pane }))
      .child(this.connector(t, last ? "└" : "├"))
      .child(div().mr(8).child(pic ?? svg("mods/workspace-chrome/terminal.svg").size(14).flex_none()))
      .child(div().flex_1().min_w(0).truncate().text_color(p.pane === this.current ? t.foreground : t.muted)
        .when(p.pane === this.current, (el) => el.font_bold()).child(name));
  }

  compactRow(t, s, i) {
    const glyph = s.status === "blocked" || s.status === "done" ? "●" : "·";
    return h_flex().flex_none().justify_center().child(h_flex()
      .id(`space-${s.id}`)
      .relative()
      .w(32)
      .h(26)
      .rounded(6)
      .justify_center()
      .items_center()
      .when(s.active, (el) => el.bg(t.selected))
      .when(!s.active, (el) => el.hover((st) => st.bg(t.hover)))
      .on_click(() => run("space.select", { id: s.id }))
      .child(div().text_color(s.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().absolute().right(5).text_color(t[s.status] ?? t.unknown).child(glyph)));
  }

  render() {
    const t = theme();
    const sp = spaces();
    const colors = this.colors(sp);
    this.current = focused()?.pane ?? null;
    const listedAgents = agents();
    const listed = new Map(listedAgents.map((a) => [a.address, a.status]));
    const all = terminals();
    const subs = new Map(listedAgents.map((a) => [a.address, subTree(all, a.address)]));
    const nested = new Set([...subs.values()].flatMap((list) => list.map((s) => s.k.address)));
    const agentByPane = new Map(listedAgents.map((a) => [a.pane, a]));
    const spaceOfTab = new Map(sp.flatMap((s) => (s.tabs ?? []).map((tab) => [tab.id, s.id])));
    const bySpace = new Map(sp.map((s) => [s.id, []]));
    for (const p of panes()) {
      if (!p.terminal) continue;
      const a = agentByPane.get(p.pane);
      if (a && nested.has(a.address)) continue;
      if (!a && nested.has(p.terminal)) continue;
      bySpace.get(a?.space ?? spaceOfTab.get(p.tab))?.push(a ? { a } : { p });
    }
    setAgentOrder(sp.flatMap((s) => bySpace.get(s.id).filter((x) => x.a).flatMap(({ a }) => [a.address, ...subs.get(a.address).map((x) => x.k.address)])));
    const collapsed = narrow();

    const rows = collapsed
      ? sp.map((s, i) => this.compactRow(t, s, i))
      : sp.flatMap((s) => {
        const items = bySpace.get(s.id);
        const perTab = new Map();
        for (const { a } of items) if (a) perTab.set(a.tab, (perTab.get(a.tab) ?? 0) + 1);
        const statuses = items.filter((x) => x.a).flatMap(({ a }) => [{ status: a.status }, ...subs.get(a.address).map((x) => ({ status: kidStatus(x.k, listed) }))]);
        const card = !this.folded.has(s.id) && items.length > 0;
        const head = this.spaceRow(t, s, colors[s.id] ?? "ansi6", items, statuses, card);
        if (!card) return [head];
        return [v_flex().flex_none().my(2).p(2).rounded(10).border_1().border_color(t.border).when(s.active, (el) => el.bg(t.selected)).child(head).children(items.flatMap(({ a, p }, i) => {
          const last = i === items.length - 1;
          if (p) return [this.terminalRow(t, p, last)];
          return [
            this.agentRow(t, a, last, perTab.get(a.tab) > 1),
            ...subs.get(a.address).map((x) => this.subRow(t, x, [last ? "" : "│", ...x.lines], listed)),
          ];
        }))];
      });

    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).flex_none().items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(collapsed, (el) => el.pl(0).pr(0).justify_center())
        .when(!collapsed, (el) => el.child("Spaces"))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6)
          .hover((st) => st.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new"))
          .child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().id("tree").flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; this.over = null; cx.notify(); })
        .children(rows))
      .when(!collapsed, (el) => el.children([this.limitsBar(t)].filter(Boolean)));
  }
}
