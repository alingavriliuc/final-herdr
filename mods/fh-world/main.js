// FINAL HERDR's world map. Every git repo is a settlement: its main worktree is
// the campfire in the middle, each other worktree a house around it. Up to 3
// houses it's a village, 4-5 a town, 6+ a castle with walls. Worktrees nobody
// opened are empty houses (one click settles there: a new space). Other spaces
// stay single zones (home, towers, dungeons). Settlements and zones are linked
// by a path. Click to select, click again (or TRAVEL) to travel; arrows +
// Enter work too. Right-click a fire or a house: travel, build a worktree,
// demolish one (fh-menu). The side panel lists the settlement's worktrees and quests.
import { View, div, image, PathBuilder, Background } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, panes, run, home, pickFolder, exec, openOverlay, shared, notify } from "herdr";
import { C, TITLE, BODY, box, designSize, zoneName, classOf, portraitPath, STATUS } from "./kit.js";

const TILE = 56;
const HOUSE = 40;
const FIRE = 44;
const SAND = "#e8d8a0";
const TOWN = 4;    // houses from which a village becomes a town
const CASTLE = 6;  // houses from which a town gets walls
const TIERS = [
  { min: CASTLE, name: "Castle", house: "maison-ville" },
  { min: TOWN, name: "Town", house: "maison-ville" },
  { min: 0, name: "Village", house: "maison" },
];
const URGENT = { blocked: 0, done: 1, working: 2, idle: 3 };
const GIT_EVERY = 30000;

const base = (p) => (p ?? "").replace(/\/+$/, "").split("/").pop();

/** Where a space is now: its first terminal's live folder. */
function placeOf(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((t) => t.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const keyOf = (machine, path) => JSON.stringify([machine ?? null, path]);

/** What a lone zone (no git) looks like. */
function zoneKind(s) {
  if (!s.name || s.name === "~" || s.folder === home()) return { art: "village", label: "Hometown" };
  const kinds = [{ art: "tour", label: "Tower" }, { art: "grotte", label: "Dungeon" }];
  let h = 0;
  for (const ch of s.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return kinds[h % kinds.length];
}

/** The most urgent status of some spaces. */
function statusOf(list) {
  let best = null;
  for (const s of list) if (s.status && (best === null || URGENT[s.status] < URGENT[best])) best = s.status;
  return best;
}

/** The repo's name: its main checkout's folder, or the folder above for main/master. */
function repoName(main) {
  const b = base(main);
  if (/^(main|master|trunk|develop)$/i.test(b)) return base(main.replace(/\/[^/]+\/?$/, "")) || b;
  return b;
}

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

/** A settlement's ring of houses: its radii and size on the map. */
function ringOf(n) {
  const rx = n === 0 ? 0 : Math.max(70, 40 + n * 14);
  const ry = Math.round(rx * 0.62);
  const walls = n >= CASTLE;
  return { rx, ry, w: 2 * rx + (walls ? 130 : 110), h: 2 * ry + (walls ? 150 : 120) };
}

/** Node centers along a snake path, cells sized for the biggest node, and a
 * zoom (1 to 1.8) so a few settlements fill a big map. */
function placeNodes(nodes, w, h) {
  const n = nodes.length;
  if (!n || w < 200 || h < 200) return { pts: [], k: 1 };
  const cellW = Math.max(170, ...nodes.map((x) => x.size.w));
  const cellH = Math.max(130, ...nodes.map((x) => x.size.h));
  const m = 30;
  const cols = Math.max(1, Math.min(n, Math.floor((w - 2 * m) / cellW), Math.ceil(Math.sqrt(n * w / h))));
  const rows = Math.ceil(n / cols);
  const k = Math.max(1, Math.min(1.8, ((w - 2 * m) / cols) / (cellW + 40), ((h - 2 * m) / rows) / (cellH + 40)));
  const slack = Math.max(0, (h - 2 * m) / rows - cellH * k) / 2;
  const pts = nodes.map((_, i) => {
    const r = Math.floor(i / cols);
    let c = i % cols;
    if (r % 2) c = cols - 1 - c;
    return {
      x: m + (c + 0.5) * (w - 2 * m) / cols,
      y: m + (r + 0.5) * (h - 2 * m) / rows + Math.sin(i * 1.7) * Math.min(22, slack),
    };
  });
  return { pts, k };
}

const RECT = () => PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();

export default class FhWorld extends View {
  init(_props, cx) {
    this.size = { width: 0, height: 0 };
    this.sel = null;
    this.handle = cx.focus_handle();
    this.git = {};     // keyOf(machine, cwd) -> { common, top } | null (no repo)
    this.trees = {};   // keyOf(machine, common) -> [{ path, branch }], main first
    this.busy = false;
    this.refresh(cx, true);
    this.stamp = shared("fh.world.changed");
    cx.timer.every(3000, (cx) => {
      // fh-menu built or demolished a worktree: read git again now.
      const stamp = shared("fh.world.changed");
      if (stamp !== this.stamp) { this.stamp = stamp; this.refresh(cx, true); }
      else this.refresh(cx, false);
    });
    cx.timer.every(GIT_EVERY, (cx) => this.refresh(cx, true));
  }

  // ---- git: which repo each space is in, and the repos' worktrees

  refresh(cx, all) {
    if (this.busy) return;
    const ps = panes();
    const todo = spaces().map((s) => ({ s, cwd: placeOf(s, ps) }))
      .filter(({ s, cwd }) => cwd && (all || !(keyOf(s.machine, cwd) in this.git)));
    if (!todo.length && !all) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const repos = new Map();
        for (const { s, cwd } of todo) {
          const k = keyOf(s.machine, cwd);
          try {
            const r = await exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"], { cwd, on: s.machine ?? undefined });
            if (r.code !== 0) { this.git[k] = null; continue; }
            const [top, common] = r.stdout.trim().split("\n");
            this.git[k] = { top, common };
            repos.set(keyOf(s.machine, common), { machine: s.machine, top });
          } catch { /* machine away: ask again later */ }
        }
        for (const [rk, { machine, top }] of repos) {
          if (!all && rk in this.trees) continue;
          try {
            const r = await exec("git", ["worktree", "list", "--porcelain"], { cwd: top, on: machine ?? undefined });
            if (r.code !== 0) continue;
            const list = [];
            let cur = null;
            for (const line of r.stdout.split("\n")) {
              if (line.startsWith("worktree ")) list.push(cur = { path: line.slice(9), branch: null });
              else if (cur && line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
              else if (cur && line.startsWith("detached")) cur.branch = "(detached)";
              else if (cur && (line === "bare" || line.startsWith("prunable"))) cur.skip = true;
            }
            this.trees[rk] = list;
          } catch { /* later */ }
        }
      } finally {
        this.busy = false;
      }
      cx.notify();
    });
  }

  // ---- the world: settlements (repos) and zones (everything else)

  world() {
    const ps = panes();
    const nodes = [];
    const byRepo = new Map();
    for (const s of spaces()) {
      const cwd = placeOf(s, ps);
      const g = this.git[keyOf(s.machine, cwd)];
      const rk = g && keyOf(s.machine, g.common);
      const trees = rk && this.trees[rk];
      if (!trees?.length) {
        nodes.push({ kind: "zone", id: s.id, space: s, spots: [{ id: s.id, kind: "zone", spaces: [s], cwd }], size: { w: 150, h: 110 } });
        continue;
      }
      let node = byRepo.get(rk);
      if (!node) {
        const main = trees[0];
        const spots = trees.filter((t) => !t.skip).map((t, i) => ({
          id: `wt:${keyOf(s.machine, t.path)}`, kind: t === main ? "fire" : "house",
          path: t.path, branch: t.branch ?? base(t.path), machine: s.machine, spaces: [], index: i,
        }));
        const houses = spots.filter((x) => x.kind === "house").length;
        node = {
          kind: "repo", id: rk, name: repoName(main.path), main: main.path, machine: s.machine, spots,
          tier: TIERS.find((t) => houses >= t.min), houses, ring: ringOf(houses), size: ringOf(houses),
        };
        for (const x of spots) x.node = node;
        byRepo.set(rk, node);
        nodes.push(node);
      }
      const spot = node.spots.find((x) => x.path === g.top);
      if (spot) spot.spaces.push(s);
      else node.spots[0]?.spaces.push(s);
    }
    for (const n of nodes) for (const x of n.spots) { x.node ??= n; x.status = statusOf(x.spaces); }
    return nodes;
  }

  selected(spots) {
    return spots.find((x) => x.id === this.sel)
      ?? spots.find((x) => x.spaces.some((s) => s.active))
      ?? spots[0];
  }

  travel(spot, tab) {
    const s = spot.spaces.find((x) => x.active) ?? spot.spaces[0];
    if (s) {
      run("space.select", { id: s.id });
      if (tab) run("tab.select", { id: tab.id });
    } else if (spot.path) {
      run("space.new", spot.machine ? { folder: spot.path, machine: spot.machine } : { folder: spot.path });
    }
    run("fh-hud.combat");
  }

  key(e, cx) {
    const spots = this.world().flatMap((n) => n.spots);
    if (!spots.length) return;
    const cur = this.selected(spots);
    const i = spots.indexOf(cur);
    if (e.key === "right" || e.key === "down") this.sel = spots[(i + 1) % spots.length].id;
    else if (e.key === "left" || e.key === "up") this.sel = spots[(i - 1 + spots.length) % spots.length].id;
    else if (e.key === "enter") return this.travel(cur);
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  /** The site menu (fh-menu) for a fire or a house, at the pointer. */
  siteMenu(spot) {
    const node = spot.node;
    const lived = spot.spaces.length > 0;
    const tile = spot.kind === "fire" ? (lived ? "feu" : "feu-eteint") : `${node.tier.house}${lived ? "" : "-vide"}`;
    openOverlay({
      mod: "fh-menu", kind: "popup", frame: "none", width: 300, height: 210,
      props: {
        mode: "site", kind: spot.kind, path: spot.path, branch: spot.branch, main: node.main, repo: node.name,
        machine: spot.machine ?? null, spaces: spot.spaces.map((x) => x.id), tile,
      },
    });
  }

  pick(spot, cx) {
    this.handle.focus();
    if (this.sel === spot.id) return this.travel(spot);
    this.sel = spot.id;
    cx.notify();
  }

  // ---- drawing

  decor(w, h, nodes, pts, k) {
    const r = rng(Math.round(w) * 7 + Math.round(h) * 13 + pts.length);
    const count = Math.floor((w * h) / 22000);
    const out = [];
    for (let i = 0; i < count; i++) {
      // Inside the map frame (18px margin + 3px border): a tile spans x-16 to x+20.
      const x = 44 + r() * (w - 88), y = 44 + r() * (h - 88);
      const big = r() < 0.5;
      const art = r() < 0.7 ? "arbre" : "montagne";
      if (pts.some((p, j) => Math.abs(p.x - x) < nodes[j].size.w * k / 2 + 14 && Math.abs(p.y - y) < nodes[j].size.h * k / 2 + 14)) continue;
      out.push(image(`mods/fh-world/tiles/${art}.svg`).size(big ? 28 : 36)
        .absolute().left(x - 16).top(y - 16).opacity(0.85));
    }
    return out;
  }

  path(pts) {
    if (pts.length < 2) return div();
    let b = PathBuilder.stroke(3).move_to(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) b = b.line_to(p.x, p.y);
    return window.paint_path(b.dash_array([7, 7]).build(), SAND).absolute().top(0).left(0).size_full();
  }

  /** Status marks over a tile of the given size. */
  marks(el, st, size) {
    return el
      .when(st === "blocked", (e) => e.child(div().absolute().top(-8).right(-6).px(4).rounded(3).bg(C.red)
        .border(1).border_color(C.edge).font_family(TITLE).text_size(10).text_color(C.text)
        .loop("opacity", { from: 0.35, to: 1, period: 500 }).child("!")))
      .when(st === "working", (e) => e.child(div().absolute().top(-10).right(-10)
        .loop("top", { from: -12, to: -7, period: 450 }).child(image("mods/fh-world/tiles/combat.svg").size(Math.round(size * 0.4)))))
      .when(st === "done", (e) => e.child(div().absolute().top(-10).right(-8).text_size(16).text_color(C.gold)
        .loop("opacity", { from: 0.4, to: 1, period: 900 }).child("★")));
  }

  pointer(el, on, size) {
    return el.when(on, (e) => e.child(div().absolute().left(-24).top(size / 2 - 12).text_size(18).text_color(C.gold)
      .loop("left", { from: -26, to: -20, period: 700 }).child("☞")));
  }

  label(text, { on, here, size = 12, max = 140, dim = false }) {
    return div().max_w(max).px(5).py(1).rounded(3).bg(on ? "#03051ae6" : "#03051ab3")
      .border(1).border_color(on ? C.gold : here ? C.edge : "#00000000")
      .text_size(size).text_color(here ? C.gold : dim ? C.dim : C.text).truncate().child(text);
  }

  heroes(spot, crew, size) {
    const ids = new Set(spot.spaces.map((s) => s.id));
    const list = crew.filter((a) => ids.has(a.space));
    if (!list.length) return div();
    return h_flex().gap(1)
      .children(list.slice(0, 3).map((a) => image(portraitPath(classOf(a.program, a.app))).size(size)
        .when(a.status === "idle", (e) => e.opacity(0.5))))
      .when(list.length > 3, (e) => e.child(div().text_size(10).text_color(C.text).child(`+${list.length - 3}`)));
  }

  zone(node, p, sel, crew, k) {
    const s = node.space, spot = node.spots[0];
    const T = Math.round(TILE * k);
    const kind = zoneKind(s);
    const on = sel?.id === spot.id;
    return v_flex().id(`fw-${s.id}`).absolute().left(p.x - 80).top(p.y - T / 2 - 14).w(160).items_center().gap(2)
      .cursor_pointer().on_click((_e, cx) => this.pick(spot, cx))
      .child(this.pointer(this.marks(div().relative().size(T).child(image(`mods/fh-world/tiles/${kind.art}.svg`).size(T)), s.status, T), on, T))
      .child(this.label(zoneName(s.name), { on, here: s.active, size: Math.round(12 * Math.min(k, 1.3)), max: 160 }))
      .child(this.heroes(spot, crew, 18));
  }

  settlement(node, p, sel, crew, k) {
    const rx = node.ring.rx * k, ry = node.ring.ry * k;
    const HS = Math.round(HOUSE * k), FS = Math.round(FIRE * k);
    const ts = Math.round(10 * Math.min(k, 1.3));
    const castle = node.houses >= CASTLE;
    const town = node.houses >= TOWN;
    const out = [];
    const fire = node.spots.find((x) => x.kind === "fire");
    const houses = node.spots.filter((x) => x.kind === "house");

    if (castle) {
      const l = p.x - rx - 50 * k, t = p.y - ry - 58 * k, w = 2 * rx + 100 * k, h = 2 * ry + 116 * k;
      out.push(div().absolute().left(l).top(t).w(w).h(h).rounded(3).border(Math.round(5 * k)).border_color("#9a948c").bg("#5a524810"));
      const b = Math.round(5 * k);
      out.push(div().absolute().left(l + b).top(t + b).w(w - 2 * b).h(h - 2 * b).border(1).border_color("#5a5248"));
      for (const [x, y] of [[l, t], [l + w, t], [l, t + h], [l + w, t + h]]) {
        out.push(image("mods/fh-world/tiles/tourelle.svg").size(40 * k).absolute().left(x - 20 * k).top(y - 26 * k));
      }
      out.push(image("mods/fh-world/tiles/porte.svg").size(46 * k).absolute().left(p.x - 23 * k).top(t + h - 30 * k));
    }
    // The square around the fire: dirt for a village, cobbles for a town.
    const sq = Math.max(70 * k, rx * (town ? 1.1 : 0.9));
    out.push(div().absolute().left(p.x - sq).top(p.y - sq * 0.62).w(2 * sq).h(2 * sq * 0.62).rounded(sq)
      .bg(town ? "#c8bc9a40" : "#e8d8a02a").border(1).border_color(town ? "#c8bc9a66" : "#00000000"));

    houses.forEach((x, i) => {
      const n = houses.length;
      const a = (-90 + (n % 2 ? 0 : 180 / n) + (360 * i) / n) * Math.PI / 180;
      const hx = p.x + rx * Math.cos(a), hy = p.y + ry * Math.sin(a);
      const on = sel?.id === x.id;
      const lived = x.spaces.length > 0;
      const art = `${node.tier.house}${lived ? "" : "-vide"}`;
      out.push(v_flex().id(`fw-h-${x.id}`).absolute().left(hx - 60).top(hy - HS / 2 - 6).w(120).items_center().gap(1)
        .cursor_pointer().on_click((_e, cx) => this.pick(x, cx)).on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.sel = x.id; this.siteMenu(x); cx.notify(); })
        .child(this.pointer(this.marks(div().relative().size(HS).child(image(`mods/fh-world/tiles/${art}.svg`).size(HS)), x.status, HS), on, HS))
        .child(this.label(x.branch, { on, here: x.spaces.some((s) => s.active), size: ts, max: 120, dim: !lived }))
        .child(this.heroes(x, crew, Math.round(14 * Math.min(k, 1.3)))));
    });

    if (fire) {
      const on = sel?.id === fire.id;
      const lit = fire.spaces.length > 0;
      const tile = div().relative().size(FS)
        .child(image(`mods/fh-world/tiles/${lit ? "feu" : "feu-eteint"}.svg`).size(FS))
        .when(lit, (e) => e.child(div().absolute().left(0).top(0)
          .loop("opacity", { from: 0.7, to: 1, period: 260 })
          .child(div().relative().loop("top", { from: 0, to: -2, period: 380 })
            .child(image("mods/fh-world/tiles/flamme.svg").size(FS)))));
      out.push(v_flex().id(`fw-f-${fire.id}`).absolute().left(p.x - 60).top(p.y - FS / 2 - 8).w(120).items_center().gap(1)
        .cursor_pointer().on_click((_e, cx) => this.pick(fire, cx)).on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.sel = fire.id; this.siteMenu(fire); cx.notify(); })
        .child(this.pointer(this.marks(tile, fire.status, FS), on, FS))
        .child(this.label(fire.branch, { on, here: fire.spaces.some((s) => s.active), size: ts, max: 120, dim: !lit }))
        .child(this.heroes(fire, crew, Math.round(14 * Math.min(k, 1.3)))));
    }

    // The settlement's name, under it all.
    // Under the houses, or under the gate for a castle.
    const bottom = castle ? p.y + ry + (58 + 16 + 6) * k : p.y + Math.max(ry, 30 * k) + 30 * k;
    out.push(div().id(`fw-n-${node.id}`).absolute().left(p.x - 110).top(bottom).w(220).flex().justify_center()
      .when(Boolean(fire), (el) => el.cursor_pointer()
        .on_click((_e, cx) => { this.sel = fire.id; cx.notify(); })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.sel = fire.id; this.siteMenu(fire); cx.notify(); }))
      .child(h_flex().px(8).py(2).gap(6).items_center().rounded(3).bg("#03051acc").border(1).border_color(C.edgeDim)
        .child(div().font_family(TITLE).text_size(7).text_color(C.dim).child(node.tier.name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")))
        .child(div().text_size(Math.round(13 * Math.min(k, 1.3))).text_color(C.gold).truncate().child(node.name))));
    return out;
  }

  map(nodes, crew, sel) {
    const { width: w, height: h } = this.size;
    const { pts, k } = placeNodes(nodes, w, h);
    return div().id("fw-map").relative().flex_1().h_full().rounded(6).overflow_hidden()
      .border(2).border_color(C.edge)
      .on_size_change((measured, cx) => {
        const size = designSize(measured);
        if (size.width !== this.size.width || size.height !== this.size.height) { this.size = size; cx.notify(); }
      })
      .child(window.paint_path(RECT(), Background.linear_gradient(180, "#1d3a8a", "#0d1a55")).absolute().top(0).left(0).size_full())
      .child(div().absolute().top(18).left(18).right(18).bottom(18).rounded(10)
        .border(3).border_color(SAND).overflow_hidden()
        .child(window.paint_path(RECT(), Background.linear_gradient(160, "#4a9a50", "#2c6b3a")).absolute().top(0).left(0).size_full()))
      .when(pts.length > 0, (el) => el
        .children(this.decor(w, h, nodes, pts, k))
        .child(this.path(pts))
        .children(nodes.flatMap((n, i) => n.kind === "repo" ? this.settlement(n, pts[i], sel, crew, k) : [this.zone(n, pts[i], sel, crew, k)])))
      .when(nodes.length === 0, (el) => el.child(div().absolute().size_full().flex().items_center().justify_center()
        .text_size(15).text_color(C.text).child("The world is empty. Found a zone!")))
      .child(div().id("fw-newzone").absolute().bottom(28).right(30).px(10).h(26).rounded(4)
        .bg("#03051acc").border(1).border_color(C.edge).flex().items_center().cursor_pointer()
        .font_family(TITLE).text_size(8).text_color(C.gold)
        .hover((s) => s.bg("#1a2470"))
        .on_click((_e, cx) => {
          // owner: null — the task must outlive this view: the map can be rebuilt while the
          // Finder panel is open, and a cancelled task would drop the chosen folder silently.
          cx.spawn(async () => {
            try {
              const folder = await pickFolder({ prompt: "Found a zone" });
              if (folder) run("space.new", { folder });
            } catch (err) {
              notify({ title: "Found a zone failed", body: String(err?.message ?? err), level: "error" });
            }
          }, { owner: null });
        })
        .child("+ FOUND A ZONE"));
  }

  // ---- the side panel

  quest(spot, s, t, crew) {
    const heroes = crew.filter((a) => a.tab === t.id);
    const st = t.status ? STATUS[t.status] : null;
    return h_flex().id(`fq-${t.id}`).px(8).py(5).gap(8).items_center().rounded(4).cursor_pointer()
      .when(s.active && t.active, (el) => el.bg("#ffffff1a"))
      .hover((x) => x.bg("#ffffff14"))
      .on_click(() => this.travel(spot, t))
      .child(t.status === "working"
        ? image("mods/fh-world/tiles/combat.svg").size(16)
        : div().w(16).text_size(12).text_color(st?.color ?? C.faint)
          .when(t.status === "blocked", (e) => e.loop("opacity", { from: 0.3, to: 1, period: 600 }))
          .child(t.status === "blocked" ? "!" : t.status === "done" ? "★" : "·"))
      .child(div().flex_1().truncate().text_size(14).text_color(C.text).child(t.named ? t.name : `Quest ${t.index}`))
      .children(heroes.slice(0, 3).map((a) => image(portraitPath(classOf(a.program, a.app))).size(18)));
  }

  /** One worktree of the settlement, in the panel's list. */
  resident(x, on) {
    const st = x.status ? STATUS[x.status] : null;
    const art = x.kind === "fire" ? (x.spaces.length ? "feu" : "feu-eteint")
      : `${x.node.tier.house}${x.spaces.length ? "" : "-vide"}`;
    return h_flex().id(`fr-${x.id}`).px(6).py(3).gap(8).items_center().rounded(4).cursor_pointer()
      .when(on, (el) => el.bg("#ffffff1a").border(1).border_color(C.gold))
      .hover((e) => e.bg("#ffffff14"))
      .on_click((_e, cx) => { this.sel = x.id; cx.notify(); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.sel = x.id; this.siteMenu(x); cx.notify(); })
      .child(image(`mods/fh-world/tiles/${art}.svg`).size(22))
      .child(div().flex_1().truncate().text_size(13).text_color(x.spaces.length ? C.text : C.dim).child(x.branch))
      .child(div().text_size(12).text_color(st?.color ?? C.faint)
        .child(x.status === "blocked" ? "!" : x.status === "done" ? "★" : x.status === "working" ? "⚔" : x.spaces.length ? "" : "empty"));
  }

  panel(spot, crew) {
    if (!spot) return div();
    const node = spot.node;
    const s = spot.spaces.find((x) => x.active) ?? spot.spaces[0];
    const btn = (id, label, fn) => div().id(id).flex_1().h(28).rounded(4).border(1).border_color(C.edge)
      .flex().items_center().justify_center().cursor_pointer()
      .font_family(TITLE).text_size(8).text_color(C.gold)
      .hover((x) => x.bg("#ffffff1a"))
      .on_click(fn).child(label);

    let art, title, sub;
    if (spot.kind === "zone") {
      const k = zoneKind(s);
      art = k.art; title = zoneName(s.name); sub = k.label;
    } else {
      art = spot.kind === "fire" ? (s ? "feu" : "feu-eteint") : `${node.tier.house}${s ? "" : "-vide"}`;
      title = spot.branch;
      sub = `${spot.kind === "fire" ? "Campfire · main worktree" : "House · worktree"}`;
    }
    const folder = (spot.path ?? spot.cwd ?? s?.folder ?? "").replace(home(), "~");
    const heroes = crew.filter((a) => spot.spaces.some((x) => x.id === a.space));
    const tabs = s?.tabs ?? [];

    return box(v_flex().w(300).h_full().flex_none())
      .child(v_flex().relative().size_full().p(14).gap(10)
        .when(node.kind === "repo", (el) => el
          .child(h_flex().gap(8).items_center()
            .child(div().font_family(TITLE).text_size(8).text_color(C.dim)
              .child(node.tier.name.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")))
            .child(div().flex_1().truncate().text_size(16).text_color(C.gold).child(node.name))
            .child(div().text_size(11).text_color(C.dim).child(`${node.houses} house${node.houses === 1 ? "" : "s"}`)))
          .child(v_flex().id("fw-residents").max_h(190).gap(1).overflow_y_scrollbar()
            .children(node.spots.map((x) => this.resident(x, x.id === spot.id))))
          .child(div().h(1).bg(C.edgeDim)))
        .child(h_flex().gap(12).items_center()
          .child(image(`mods/fh-world/tiles/${art}.svg`).size(44))
          .child(v_flex().flex_1().overflow_hidden()
            .child(div().text_size(17).text_color(C.gold).truncate().child(title))
            .child(div().text_size(12).text_color(C.dim).child(sub + (s?.active ? " · you are here" : "")))))
        .child(v_flex().gap(3).text_size(12)
          .when(spot.kind === "zone" && Boolean(s?.branch), (el) => el.child(div().text_color(C.cyan).truncate().child(`⎇ ${s.branch}`)))
          .when(Boolean(folder), (el) => el.child(div().text_color(C.faint).truncate().child(folder)))
          .when(Boolean(spot.machine ?? s?.machine), (el) => el.child(div().text_color(C.dim).child(`Continent: ${spot.machine ?? s.machine}`)))
          .child(div().text_color(C.dim).child(s
            ? `${heroes.length} hero${heroes.length === 1 ? "" : "es"} · ${tabs.length} quest${tabs.length === 1 ? "" : "s"}${spot.spaces.length > 1 ? ` · ${spot.spaces.length} zones` : ""}`
            : "Nobody lives here.")))
        .child(h_flex().gap(8)
          .when(Boolean(s), (el) => el
            .child(btn("fw-travel", "TRAVEL", () => this.travel(spot)))
            .child(btn("fw-newquest", "+ QUEST", () => { run("tab.new", { space: s.id }); run("fh-hud.combat"); })))
          .when(!s, (el) => el.child(btn("fw-settle", "SETTLE", () => this.travel(spot)))))
        .when(Boolean(s), (el) => el
          .child(div().pt(2).font_family(TITLE).text_size(8).text_color(C.dim).child("QUESTS"))
          .child(v_flex().id("fw-quests").flex_1().gap(1).overflow_y_scrollbar()
            .children(tabs.map((t) => this.quest(spot, s, t, crew))))));
  }

  render() {
    const nodes = this.world();
    const spots = nodes.flatMap((n) => n.spots);
    const crew = agents();
    const sel = this.selected(spots);
    return div().id("root").size_full().track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .child(h_flex().size_full().gap(10).font_family(BODY)
        .child(this.map(nodes, crew, sel))
        .child(this.panel(sel, crew)));
  }
}
