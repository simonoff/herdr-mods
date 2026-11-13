import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, agents, terminals, panes, focused, exec, run, openOverlay, theme, shared, setShared, setAgentOrder, layout, window } from "herdr";

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const PALETTE = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
const MACHINE_ICONS = [
  "laptop", "laptop-minimal", "monitor", "tv", "smartphone", "tablet", "server", "server-cog", "hard-drive", "cpu", "database", "router",
  "wifi", "globe", "cloud", "house", "building-2", "school", "factory", "warehouse", "briefcase", "box", "container", "terminal",
  "code", "bug", "shield", "flask-conical", "gamepad-2", "rocket", "bot", "brain", "cat", "dog", "bird", "fish",
  "rabbit", "turtle", "flame", "zap", "star", "heart", "coffee", "leaf", "mountain", "ship", "plane", "car", "ghost", "skull", "crown",
];
const machineColor = (key) => (shared("machine.colors") ?? {})[key] ?? (key ? PALETTE[[...key].reduce((h, c) => h + c.charCodeAt(0), 0) % PALETTE.length] : "ansi4");
const machineIcon = (key) => `mods/space-tree/machines/${(shared("machine.icons") ?? {})[key] ?? (key ? "server" : "monitor")}.svg`;

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

const LIMITS = `printf 'claude_account\\t%s\\n' "$(jq -r '.oauthAccount.accountUuid // empty' "$HOME/.claude.json" 2>/dev/null)"
printf 'claude_limits\\t%s\\n' "$(tr -d '\\n' 2>/dev/null < "$HOME/.cache/claude-rate-limits.json")"
printf 'codex_account\\t%s\\n' "$(jq -r '.tokens.account_id // empty' "$HOME/.codex/auth.json" 2>/dev/null)"
printf 'codex_limits\\t%s\\n' "$(${CODEX_LIMITS})"`;

const PR_FIELDS = "number,state,isDraft,title,url,reviewDecision,statusCheckRollup";
const FAILED = ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"];

function checkState(rollup) {
  const list = rollup ?? [];
  if (!list.length) return null;
  if (list.some((c) => FAILED.includes(c.conclusion ?? c.state))) return "fail";
  if (list.some((c) => (c.status && c.status !== "COMPLETED") || c.state === "PENDING" || c.state === "EXPECTED")) return "pending";
  return "pass";
}

function places() {
  const spaceOfTab = new Map(spaces().flatMap((s) => (s.tabs ?? []).map((tab) => [tab.id, s])));
  const out = new Map();
  for (const p of panes()) {
    const s = spaceOfTab.get(p.tab);
    if (!s || out.has(s.id) || !p.terminal || !p.cwd) continue;
    out.set(s.id, { on: s.machine ?? null, cwd: p.cwd, branch: p.branch, key: `${s.machine ?? ""}\t${p.cwd}` });
  }
  return out;
}

const openUrl = (url) => {
  const platform = window().platform;
  exec(platform === "macos" ? "open" : platform === "windows" ? "explorer" : "xdg-open", [url]).catch(() => null);
};

function windowLabel(minutes) {
  if (!minutes) return "?";
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function parseClaude(text) {
  const j = JSON.parse(text);
  const rl = j.rate_limits ?? {};
  return {
    at: j.at ?? 0,
    windows: [["5h", rl.five_hour], ["7d", rl.seven_day]]
      .filter(([, w]) => w)
      .map(([label, w]) => ({ label, pct: w.used_percentage, resets_at: w.resets_at })),
  };
}

function parseCodex(text) {
  const j = JSON.parse(text);
  const rl = j.payload?.rate_limits ?? {};
  return {
    at: Date.parse(j.timestamp ?? "") / 1000 || 0,
    windows: [rl.primary, rl.secondary]
      .filter(Boolean)
      .map((w) => ({ label: windowLabel(w.window_minutes), pct: w.used_percent, resets_at: w.resets_at })),
  };
}

export default class SpaceTree extends View {
  init(_props, cx) {
    this.folded = new Set(JSON.parse(localStorage.getItem("folded") ?? "[]"));
    this.pressed = null;
    this.over = null;
    this.limits = { claude: [], codex: [] };
    this.readLimits(cx);
    cx.timer.every(30000, (cx) => this.readLimits(cx));
    this.git = {};
    this.gitBusy = new Set();
    this.refreshGit(cx, false);
    cx.timer.every(5000, (cx) => this.refreshGit(cx, false));
    cx.timer.every(60000, (cx) => this.refreshGit(cx, true));
  }

  refreshGit(cx, all) {
    const due = [...new Map([...places().values()].map((w) => [w.key, w])).values()]
      .filter((w) => w.branch && !this.gitBusy.has(w.key) && (all || this.git[w.key]?.branch !== w.branch));
    for (const w of due) {
      this.gitBusy.add(w.key);
      cx.spawn(async (cx) => {
        const opts = { cwd: w.cwd, on: w.on };
        const [counts, pr] = await Promise.all([
          exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], opts).catch(() => null),
          exec("gh", ["pr", "view", "--json", PR_FIELDS], { ...opts, timeout: 15000 }).catch(() => null),
        ]);
        const [ahead, behind] = counts?.code === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : [0, 0];
        let info = null;
        try {
          if (pr?.code === 0) info = JSON.parse(pr.stdout);
        } catch {}
        this.git[w.key] = { branch: w.branch, ahead, behind, pr: info };
        this.gitBusy.delete(w.key);
        cx.notify();
      });
    }
  }

  gitInfo(s) {
    const w = this.places?.get(s.id);
    if (!w?.branch) return null;
    const g = this.git[w.key];
    return g && g.branch === w.branch ? { branch: w.branch, ahead: g.ahead, behind: g.behind, pr: g.pr } : { branch: w.branch, ahead: 0, behind: 0, pr: null };
  }

  branchIcon(t, s, g) {
    return div().id(`branch-${s.id}`).flex_none().text_color(t.dim)
      .tooltip(g.branch)
      .child(svg("mods/workspace-chrome/git-branch.svg").size(12));
  }

  gitTail(t, s, g) {
    if (!g.ahead && !g.behind && !g.pr) return null;
    return h_flex().flex_none().gap(5).items_center().text_size(11)
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`↑${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`↓${g.behind}`)))
      .when(Boolean(g.pr), (el) => el.child(this.prChip(t, s, g.pr)));
  }

  prChip(t, s, pr) {
    const color = pr.state === "MERGED" ? t.ansi5 : pr.state === "CLOSED" ? t.ansi1 : pr.isDraft ? t.dim : t.ansi2;
    const ck = checkState(pr.statusCheckRollup);
    const ckColor = { pass: t.ansi2, fail: t.blocked, pending: t.ansi3 }[ck];
    const review = { APPROVED: "approved", CHANGES_REQUESTED: "changes requested", REVIEW_REQUIRED: "review required" }[pr.reviewDecision];
    const tip = [`#${pr.number} ${pr.title}`, [pr.isDraft ? "draft" : String(pr.state).toLowerCase(), ck && `checks ${ck}`, review].filter(Boolean).join(" · ")].join("\n");
    return h_flex().id(`pr-${s.id}`).flex_none().gap(4).px(5).h(16).rounded(4).items_center().bg(color + "26").text_color(color).cursor_pointer()
      .tooltip(tip)
      .hover((st) => st.bg(color + "40"))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); openUrl(pr.url); })
      .child(svg("mods/space-tree/icons/git-pull-request.svg").size(11).flex_none())
      .child(`#${pr.number}`)
      .when(Boolean(ckColor), (el) => el.child(div().size(6).rounded(3).flex_none().bg(ckColor)))
      .when(pr.reviewDecision === "APPROVED", (el) => el.child(svg("mods/workspace-chrome/check.svg").size(10).flex_none().text_color(t.ansi2)))
      .when(pr.reviewDecision === "CHANGES_REQUESTED", (el) => el.child(svg("mods/workspace-chrome/x.svg").size(10).flex_none().text_color(t.blocked)));
  }

  readLimits(cx) {
    cx.spawn(async (cx) => {
      const names = [null, ...new Set([...spaces().map((s) => s.machine), ...machines().map((m) => m.name)].filter(Boolean))];
      const found = { claude: [], codex: [] };
      await Promise.all(names.map(async (m) => {
        try {
          const r = await exec("sh", ["-c", LIMITS], { on: m });
          const f = Object.fromEntries(r.stdout.split("\n").filter((l) => l.includes("\t")).map((l) => [l.slice(0, l.indexOf("\t")), l.slice(l.indexOf("\t") + 1)]));
          for (const [agent, parse] of [["claude", parseClaude], ["codex", parseCodex]]) {
            try {
              if (f[`${agent}_limits`]) found[agent].push({ machine: m, account: f[`${agent}_account`] || `machine:${m ?? ""}`, ...parse(f[`${agent}_limits`]) });
            } catch {}
          }
        } catch {}
      }));
      for (const agent of ["claude", "codex"]) {
        const groups = new Map();
        for (const x of found[agent].sort((a, b) => names.indexOf(a.machine) - names.indexOf(b.machine))) {
          const g = groups.get(x.account) ?? { machines: [], at: -1, windows: [] };
          g.machines.push(x.machine);
          if (x.at > g.at) Object.assign(g, { at: x.at, windows: x.windows });
          groups.set(x.account, g);
        }
        this.limits[agent] = [...groups.values()];
      }
      cx.notify();
    });
  }

  limitsBar(t) {
    const now = Date.now() / 1000;
    const live = (list) => list.filter((w) => typeof w.pct === "number" && (!w.resets_at || w.resets_at > now));
    const agentsShown = [["Claude", "icons/claude.svg", this.limits.claude], ["Codex", "icons/codex.svg", this.limits.codex]]
      .flatMap(([name, path, groups]) => groups.map((g) => [
        groups.length > 1 ? `${name} · ${g.machines.map((m) => m ?? "this computer").join(", ")}` : name,
        path,
        live(g.windows),
      ]))
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
    const git = this.gitInfo(s);
    const tail = git && this.gitTail(t, s, git);
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
      .when(Boolean(git), (el) => el.child(this.branchIcon(t, s, git)))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(s.name))
      .when(Boolean(tail), (el) => el.child(tail))
      .when(Boolean(s.machine) && !this.grouped, (el) => el.child(div().flex_none().text_size(10).text_color(t.dim).child(s.machine)))
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

  machineRow(t, m, mine, collapsed) {
    const key = `machine:${m ?? ""}`;
    const folded = this.folded.has(key);
    const layoutState = machines().find((k) => k.name === m)?.layout ?? (m ? "unavailable" : "ready");
    const online = layoutState === "ready";
    const top = mine.reduce((acc, s) => ((RANK[s.status] ?? 0) > (RANK[acc] ?? 0) ? s.status : acc), null);
    const blocked = mine.filter((s) => s.status === "blocked").length;
    const done = mine.filter((s) => s.status === "done").length;
    const alert = folded && blocked > 0;
    const color = machineColor(m ?? "");
    const fill = alert ? t.blocked : color.startsWith("#") ? color : (MARK[color] ?? t[color] ?? t.accent);
    const badge = (el) => el.relative()
      .child(svg(machineIcon(m ?? "")).size(12).text_color(fill))
      .when(alert, (b) => b.child(div().absolute().right(-2).top(-2).size(6).rounded(3).bg(t.blocked)));
    const pic = badge(h_flex().id(`machine-icon-${m ?? "local"}`).size(18).flex_none().rounded(5).bg(fill + "33").items_center().justify_center()
      .tooltip("Change icon and color")
      .on_click((_e, cx) => { cx.stop_propagation(); this.picking = this.picking === key ? null : key; cx.notify(); }));
    const summary = h_flex().flex_none().gap(7).items_center()
      .child(h_flex().flex_none().gap(3).items_center().text_color(blocked > 0 ? t.blocked : t.dim)
        .when(blocked > 0, (el) => el.font_semibold())
        .child(svg("mods/workspace-chrome/folder.svg").size(12).flex_none()).child(String(mine.length)))
      .when(blocked === 0 && done > 0, (el) => el.child(h_flex().flex_none().gap(3).items_center().text_color(t.done)
        .child(div().size(7).rounded(4).bg(t.done)).child(String(done))))
      .when(blocked === 0 && done === 0 && top === "working", (el) => el.child(this.status(t, "working")));
    return h_flex()
      .id(`machine-${m ?? "local"}`)
      .h(26)
      .flex_none()
      .mt(6)
      .gap(7)
      .items_center()
      .rounded(6)
      .text_size(11)
      .text_color(t.dim)
      .cursor_pointer()
      .hover((st) => st.bg(t.hover))
      .tooltip(`${m ?? "This computer"} · ${layoutState}`)
      .on_click((_e, cx) => this.toggle(key, cx))
      .when(collapsed, (el) => el.justify_center().child(badge(h_flex().size(18).flex_none().rounded(5).bg(fill + "33").items_center().justify_center())))
      .when(!collapsed, (el) => el.px(6)
        .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none())
        .child(pic)
        .child(div().flex_1().min_w(0).truncate().child(m ?? "This computer"))
        .when(layoutState === "loading", (el) => el.child(div().flex_none().child("Loading…")))
        .when(folded && mine.length > 0, (el) => el.child(summary))
        .when(online, (el) => el.child(div().id(`machine-add-${m ?? "local"}`).size(18).flex_none().flex().items_center().justify_center().rounded(4)
          .hover((st) => st.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); })
          .child(svg("mods/workspace-chrome/plus.svg").size(11))))
        .child(div().size(6).mr(4).rounded(3).flex_none().bg(online ? t.ansi2 : t.dim)));
  }

  iconPicker(t, m) {
    const current = machineIcon(m ?? "");
    const currentColor = machineColor(m ?? "");
    const colors = h_flex().flex_none().gap(6).px(6).py(4)
      .children(PALETTE.map((c) => div().id(`machine-color-${m ?? "local"}-${c}`).size(16).flex_none().rounded(8).bg(MARK[c])
        .cursor_pointer()
        .when(c === currentColor, (el) => el.border(2).border_color(t.foreground))
        .hover((st) => st.opacity(0.8))
        .on_click((_e, cx) => {
          setShared("machine.colors", { ...(shared("machine.colors") ?? {}), [m ?? ""]: c });
          cx.notify();
        })));
    return v_flex().flex_none().child(colors).child(h_flex().flex_none().flex_wrap().gap(2).px(6).pb(4)
      .children(MACHINE_ICONS.map((name) => {
        const path = `mods/space-tree/machines/${name}.svg`;
        return div().id(`machine-pick-${m ?? "local"}-${name}`).size(24).flex_none().flex().items_center().justify_center().rounded(5)
          .text_color(path === current ? t.foreground : t.dim)
          .when(path === current, (el) => el.bg(t.selected))
          .hover((st) => st.bg(t.hover).text_color(t.foreground))
          .tooltip(name)
          .on_click((_e, cx) => {
            setShared("machine.icons", { ...(shared("machine.icons") ?? {}), [m ?? ""]: name });
            this.picking = null;
            cx.notify();
          })
          .child(svg(path).size(14));
      })));
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
    this.places = places();
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
    const remote = [...new Set([...sp.map((s) => s.machine), ...machines().map((m) => m.name)].filter(Boolean))].sort();
    this.grouped = remote.length > 0;

    const draw = (list) => collapsed
      ? list.map((s) => this.compactRow(t, s, sp.indexOf(s)))
      : list.flatMap((s) => {
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
    const rows = !this.grouped ? draw(sp) : [null, ...remote].flatMap((m) => {
      const mine = sp.filter((s) => (s.machine ?? null) === m);
      const picker = !collapsed && this.picking === `machine:${m ?? ""}` ? [this.iconPicker(t, m)] : [];
      return [this.machineRow(t, m, mine, collapsed), ...picker, ...(this.folded.has(`machine:${m ?? ""}`) ? [] : draw(mine))];
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
