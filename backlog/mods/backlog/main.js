import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input } from "gpui-base";
import { spaces, focused, exec, watchFolder, knownAgents, run, theme, props, closeOverlay, checking } from "herdr";

const DIR = "docs/backlog";
const WORTH_ORDER = { yes: 0, later: 1, no: 2 };
const REMOTE_REFRESH_MS = 15000;
const CARD_HEIGHT = 54;
const CARD_GAP = 6;
const POPUP_LIST_MAX = 480;
const RECENT_DAYS = 7;
const FILTERS = [
  { id: "all", label: "all", test: () => true },
  { id: "yes", label: "yes", test: (i) => i.worth === "yes" },
  { id: "later", label: "later", test: (i) => i.worth === "later" },
  { id: "no", label: "no", test: (i) => i.worth === "no" },
  { id: "recent", label: `last ${RECENT_DAYS} days`, test: (i) => i.added >= recentSince() },
];
const SORTS = [
  { id: "worth", label: "worth, oldest first", compare: null },
  { id: "newest", label: "newest first", compare: (a, b) => b.added.localeCompare(a.added) || a.slug.localeCompare(b.slug) },
  { id: "oldest", label: "oldest first", compare: (a, b) => a.added.localeCompare(b.added) || a.slug.localeCompare(b.slug) },
];

function recentSince() {
  return new Date(Date.now() - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
}

function parseItem(slug, text) {
  const fields = {};
  let body = text;
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (front) {
    for (const line of front[1].split(/\r?\n/)) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) fields[m[1]] = m[2].trim();
    }
    body = text.slice(front[0].length);
  }
  const title = body.match(/^#\s+(.+)$/m)?.[1].trim() ?? slug;
  return { slug, title, body: body.trim(), worth: fields.worth ?? "", where: fields.where ?? "", added: fields.added ?? "", ticket: fields.ticket ?? "" };
}

function sortItems(items) {
  return items.sort((a, b) =>
    (WORTH_ORDER[a.worth] ?? 3) - (WORTH_ORDER[b.worth] ?? 3) || a.added.localeCompare(b.added) || a.slug.localeCompare(b.slug));
}

const RECORD_SEPARATOR = "\x1e";
const READ_ALL_SCRIPT = `[ -d "$1" ] || exit 3
for f in "$1"/*.md; do
  [ -f "$f" ] || continue
  printf '\\036%s\\n' "$(basename "$f" .md)"
  cat "$f"
done`;

async function readBacklog(folder, machine) {
  const r = await exec("sh", ["-c", READ_ALL_SCRIPT, "backlog", `${folder}/${DIR}`], { on: machine });
  if (r.code === 3) return null;
  if (r.code !== 0) throw new Error(r.stderr.trim() || `exit ${r.code}`);
  return r.stdout;
}

function parseBacklog(raw) {
  if (raw === null) return null;
  return sortItems(raw.split(RECORD_SEPARATOR).filter(Boolean).map((record) => {
    const newline = record.indexOf("\n");
    return parseItem(record.slice(0, newline), record.slice(newline + 1));
  }));
}

async function repoRoot(cwd, machine) {
  const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: cwd || undefined, on: machine });
  return r.code === 0 ? r.stdout.trim() : null;
}

function taskFor(agent, slug) {
  return agent.key === "claude" ? `/amoniac:backlog ${slug}` : `Work on the backlog item ${DIR}/${slug}.md`;
}

export default class Backlog extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.overlay = p.overlay ?? null;
    this.folder = p.folder ?? null;
    this.machine = p.machine ?? null;
    this.slug = p.slug ?? null;
    this.items = undefined;
    this.error = null;
    this.at = 0;
    this.agents = null;
    this.agentsFailed = false;
    this.menu = false;
    this.filter = "all";
    this.sort = "worth";
    this.query = "";
    this.search = InputState.new({ placeholder: "Search title, slug, where, body" });
    this.search.on("change", (_e, cx) => { this.query = this.search.value().trim().toLowerCase(); this.at = 0; cx.notify(); });
    this.handle = cx.focus_handle();
    if (this.overlay) {
      this.search.on("submit", () => this.open(this.visible()[this.at]));
      this.search.focus();
      cx.spawn(async (cx) => {
        try {
          const f = focused();
          const space = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active);
          this.machine = space?.machine ?? null;
          this.folder = await repoRoot(f?.cwd ?? space?.folder, this.machine);
          if (this.folder) this.items = parseBacklog(await readBacklog(this.folder, this.machine));
          else this.items = null;
        } catch (e) { this.error = String(e); }
        cx.notify();
      });
      return;
    }
    this.reload(cx);
    if (checking() || !this.folder) return;
    if (this.machine) {
      cx.timer.every(REMOTE_REFRESH_MS, (cx) => this.reload(cx));
    } else {
      cx.spawn(async (cx) => {
        for (;;) {
          try { await watchFolder(`${this.folder}/${DIR}`); }
          catch { cx.timer.every(REMOTE_REFRESH_MS, (cx) => this.reload(cx)); return; }
          this.reload(cx);
        }
      });
    }
  }

  reload(cx) {
    if (!this.folder) return;
    if (this.loading) { this.reloadAgain = true; return; }
    this.loading = true;
    cx.spawn(async (cx) => {
      let changed = false;
      do {
        this.reloadAgain = false;
        try {
          const raw = await readBacklog(this.folder, this.machine);
          if (raw !== this.raw || this.error) {
            this.raw = raw;
            this.items = parseBacklog(raw);
            this.error = null;
            changed = true;
          }
        } catch (e) { this.error = String(e); changed = true; }
      } while (this.reloadAgain);
      this.loading = false;
      if (changed) cx.notify();
    });
  }

  visible() {
    const filter = FILTERS.find((f) => f.id === this.filter);
    const q = this.query;
    const shown = (this.items ?? []).filter((i) => filter.test(i)
      && (!q || [i.title, i.slug, i.where, i.body].some((s) => s.toLowerCase().includes(q))));
    const compare = SORTS.find((s) => s.id === this.sort).compare;
    return compare ? shown.sort(compare) : shown;
  }

  toolbar(t) {
    const items = this.items ?? [];
    const sortIndex = SORTS.findIndex((s) => s.id === this.sort);
    const chip = (id, active, onClick) => h_flex().id(id).h(24).px(8).gap(5).items_center().rounded(6).cursor_pointer()
      .border_1().border_color(active ? t.accent : t.border).when(active, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover)).on_click(onClick).text_size(11);
    return v_flex().flex_none().gap(6)
      .child(h_flex().h(30).px(10).items_center().rounded(7).border_1().border_color(t.input).bg(t.background)
        .child(Input.new(this.search).flex_1().h_full().text_size(12).text_color(t.foreground)))
      .child(h_flex().flex_wrap().gap(5)
        .children(FILTERS.map((f) => chip(`bl-filter-${f.id}`, this.filter === f.id, (_e, cx) => { this.filter = f.id; this.at = 0; cx.notify(); })
          .child(div().font_semibold().text_color(t.foreground).child(String(items.filter(f.test).length)))
          .child(div().text_color(t.muted).child(f.label))))
        .child(chip("bl-sort", false, (_e, cx) => { this.sort = SORTS[(sortIndex + 1) % SORTS.length].id; this.at = 0; cx.notify(); })
          .child(div().text_color(t.muted).child(`↕ ${SORTS[sortIndex].label}`))));
  }

  open(item) {
    if (!item) return;
    closeOverlay(this.overlay);
    run("pane.split", { direction: "right", mod: "backlog", props: { folder: this.folder, machine: this.machine, slug: item.slug } });
  }

  toggleMenu(cx) {
    this.menu = !this.menu;
    if (this.menu && !this.agents) {
      cx.spawn(async (cx) => {
        try { this.agents = (await knownAgents({ on: this.machine })).filter((a) => a.installed); }
        catch { this.agentsFailed = true; }
        cx.notify();
      });
    }
    cx.notify();
  }

  handTo(agent, item, cx) {
    this.menu = false;
    run("tab.new", { space: focused()?.space, name: item.title, argv: agent.run, task: taskFor(agent, item.slug) });
    cx.notify();
  }

  worthBadge(t, worth) {
    const color = worth === "yes" ? t.done : worth === "later" ? t.working : t.dim;
    return h_flex().w(48).h(18).flex_none().justify_center().items_center().rounded(4).bg(color)
      .text_size(10).font_bold().text_color(t.background).child((worth || "—").toUpperCase());
  }

  emptyText() {
    if (this.error) return this.error;
    if (this.items === undefined) return "Loading backlog…";
    if (!this.folder) return "Not a Git repo";
    if (this.items === null) return `No ${DIR} in this repo`;
    if (this.items.length === 0) return "Backlog is empty";
    return null;
  }

  row(t, item, selected, onClick) {
    return h_flex().id(`bl-${item.slug}`).h(CARD_HEIGHT).flex_none().overflow_hidden().px(12).gap(10).items_center().rounded(8).cursor_pointer()
      .border_1().border_color(selected ? t.accent : t.border).bg(selected ? t.hover : t.background)
      .hover((s) => s.bg(t.hover))
      .on_click(onClick)
      .child(this.worthBadge(t, item.worth))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(div().truncate().text_size(13).font_semibold().text_color(t.foreground).child(item.title))
        .child(h_flex().min_w(0).gap(10).text_size(11)
          .child(div().min_w(0).truncate().text_color(t.accent).child(`${item.slug}.md`))
          .when(Boolean(item.where), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(item.where)))
          .when(Boolean(item.added), (el) => el.child(div().flex_none().text_color(t.dim).child(`added ${item.added}`)))));
  }

  renderPopup(t) {
    const items = this.visible();
    this.at = Math.min(this.at, Math.max(0, items.length - 1));
    const empty = this.emptyText();
    return v_flex().id("backlog-popup").track_focus(this.handle).size_full().min_h(0).p(18).gap(10).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") { closeOverlay(this.overlay); return; }
        if (k === "down" && items.length) this.at = (this.at + 1) % items.length;
        else if (k === "up" && items.length) this.at = (this.at + items.length - 1) % items.length;
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Backlog"))
        .child(div().text_size(11).text_color(t.dim).child(this.folder?.split("/").pop() ?? "")))
      .child(this.toolbar(t))
      .child(empty || !items.length
        ? div().p(8).text_size(12).text_color(t.dim).child(empty ?? "No matching items")
        : v_flex().id("backlog-popup-list").gap(CARD_GAP).h(Math.min(POPUP_LIST_MAX, items.length * (CARD_HEIGHT + CARD_GAP))).flex_none().min_h(0).overflow_y_scrollbar()
          .children(items.map((item, i) => this.row(t, item, i === this.at, () => this.open(item)))));
  }

  renderMenu(t, item) {
    const body = this.agentsFailed ? [div().px(9).py(6).text_color(t.dim).child("Could not check installed agents")]
      : !this.agents ? [div().px(9).py(6).text_color(t.dim).child("Checking installed agents…")]
      : this.agents.map((a) => h_flex().id(`bl-agent-${a.key}`).h(30).px(9).gap(10).items_center().rounded(7).cursor_pointer()
        .hover((s) => s.bg(t.selected))
        .on_click((_e, cx) => this.handTo(a, item, cx))
        .child(a.icon ? (a.tint ? svg(a.icon).size(14).text_color(t.foreground) : image(a.icon).size(14)) : div().w(14))
        .child(div().child(a.name)));
    return v_flex().p(4).rounded(8).border_1().border_color(t.border).bg(t.popover).children(body);
  }

  renderItem(t, item) {
    if (!item) return div().p(14).text_color(t.dim).child(this.slug ? "Item removed" : "Select an item");
    const meta = [item.worth, item.added, item.where, item.ticket].filter(Boolean).join(" · ");
    return v_flex().flex_1().h_full().min_w(0).min_h(0)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(meta))
        .child(div().id("bl-hand").px(10).py(4).rounded(6).cursor_pointer().bg(t.solid).text_color(t.solid_foreground).text_size(12)
          .on_click((_e, cx) => this.toggleMenu(cx))
          .child(this.menu ? "Hand to agent ▴" : "Hand to agent ▾")))
      .when(this.menu, (el) => el.child(h_flex().px(14).pt(8).justify_end().child(this.renderMenu(t, item))))
      .child(v_flex().id("bl-body").flex_1().min_h(0).overflow_y_scrollbar().p(14)
        .child(TextView.markdown(`bl-md-${item.slug}`, item.body)));
  }

  renderPane(t) {
    const items = this.items ?? [];
    const shown = this.visible();
    const empty = this.emptyText();
    if (!this.slug && items.length) this.slug = items[0].slug;
    const item = items.find((i) => i.slug === this.slug);
    return h_flex().id("backlog").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .child(v_flex().id("bl-list").w(340).flex_none().h_full().min_h(0).border_r(1).border_color(t.border)
        .child(div().p(8).flex_none().border_b(1).border_color(t.border).child(this.toolbar(t)))
        .child(empty || !shown.length
          ? div().p(12).text_size(12).text_color(t.dim).child(empty ?? "No matching items")
          : v_flex().id("bl-rows").flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(CARD_GAP)
            .children(shown.map((i) => this.row(t, i, i.slug === this.slug, (_e, cx) => { this.slug = i.slug; this.menu = false; cx.notify(); })))))
      .child(Array.isArray(this.items) && (items.length || this.slug) ? this.renderItem(t, item) : div());
  }

  render() {
    const t = theme();
    return this.overlay ? this.renderPopup(t) : this.renderPane(t);
  }
}
