// FINAL HERDR's party column: every agent as a hero, always visible.
// Click a hero: go to its terminal. Right-click: the command menu. "+ Recruit": start a new agent.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, spaces, setAgentOrder, openOverlay, shared, run } from "herdr";
import { C, TITLE, BODY, box, designSize, heroName, heroCount, classOf, STATUS, tabOf, elapsed, openHeroMenu, heroPortrait, SAVE_KEY, classStats } from "./kit.js";

const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };

// The ATB gauge: cyan segments charge one by one, the full gauge flashes
// gold ("ready"), then it starts over. Native frames on stacked layers (no
// timer); each hero charges at its own speed. As many segments as the
// gauge's width holds, so it fills the sidebar at any size.
const SEG = "▮";
const SEG_W = 6.6; // JetBrains Mono 11px advance
const GAUGES = new Map();
function gauge(n) {
  if (!GAUGES.has(n)) {
    const FULL = SEG.repeat(n), NONE = " ".repeat(n);
    const CHARGE = Array.from({ length: n + 1 }, (_, k) => SEG.repeat(k) + " ".repeat(n - k));
    const FLASH = [FULL, NONE, FULL, NONE, FULL, FULL];
    GAUGES.set(n, { FULL, cyan: [...CHARGE, ...FLASH.map(() => NONE)], gold: [...CHARGE.map(() => NONE), ...FLASH] });
  }
  return GAUGES.get(n);
}

export default class FhParty extends View {
  init(_props, cx) {
    this.width = 230;
    this.gw = {}; // address -> gauge width
    // Combat times are shown in seconds then minutes: a tick every 5 s is plenty.
    cx.timer.every(5000, (cx) => { if (agents().some((a) => a.status === "working")) cx.notify(); });
  }

  atb(address) {
    let h = 0;
    for (const ch of address) h = (h * 31 + ch.charCodeAt(0)) % 997;
    // A long gauge charges segment by segment as fast: keep the cycle near 2 s.
    const w = this.gw[address] ?? 120;
    const n = Math.max(6, Math.floor((w - 4) / SEG_W));
    const step = Math.round((90 + (h % 5) * 15) * 18 / n);
    const g = gauge(n);
    const left = Math.max(1, (w - 2 - n * SEG_W) / 2);
    const glyphs = (color) => div().absolute().left(left).top(0).bottom(0).flex().items_center()
      .font_family("JetBrains Mono").text_size(11).text_color(color);
    return div().id(`fh-atb-${address}`).relative().flex_1().min_w(0).h(12).rounded(2).bg("#03051a")
      .border(1).border_color(C.edgeDim).overflow_hidden()
      .on_size_change((measured, cx) => {
        const size = designSize(measured);
        if (Math.abs((this.gw[address] ?? 0) - size.width) >= 1) { this.gw[address] = size.width; cx.notify(); }
      })
      .child(glyphs("#222c6a").child(g.FULL))
      .child(glyphs(C.cyan).frames(g.cyan, step))
      .child(glyphs(C.gold).frames(g.gold, step));
  }

  hero(a, compact, world) {
    const cls = classOf(a.program, a.app);
    const st = STATUS[a.status] ?? STATUS.idle;
    const since = a.status === "working" ? tabOf(a, world)?.working_since : null;
    const open = (_e, cx) => { cx.stop_propagation(); openHeroMenu(openOverlay, a); };
    const go = (_e, cx) => { cx.stop_propagation(); run("agent.focus", { terminal: a.address }); run("fh-hud.combat"); };

    if (compact) {
      return div().id(`fh-hero-${a.address}`).p(6).rounded(4).cursor_pointer()
        .when(a.focused, (el) => el.bg("#ffffff1a"))
        .hover((s) => s.bg("#ffffff14"))
        .on_click(go)
        .on_mouse_down("right", open)
        .child(heroPortrait(a, 40));
    }

    return h_flex().id(`fh-hero-${a.address}`).px(8).py(6).gap(10).rounded(4).cursor_pointer()
      .when(a.focused, (el) => el.bg("#ffffff1a"))
      .when(a.status === "blocked", (el) => el.bg("#ff6b6b22"))
      .hover((s) => s.bg("#ffffff14"))
      .on_click(go)
      .on_mouse_down("right", open)
      .child(heroPortrait(a, 40))
      .child(v_flex().flex_1().overflow_hidden().gap(2)
        .child(h_flex().gap(6).items_center()
          .when(a.pinned, (el) => el.child(div().text_size(11).text_color(C.gold).child("⚑")))
          .child(div().flex_1().truncate().text_size(14).text_color(a.status === "idle" ? C.dim : C.text).child(heroName(a)))
          .child(div().flex_none().text_size(12).text_color(C.gold).child(`Lv.${classStats(shared(SAVE_KEY), cls.name).level}`)))
        .child(h_flex().gap(6).items_center()
          .child(div().flex_1().truncate().text_size(12).text_color(C.dim).child(cls.name))
          .child(div().font_family(TITLE).text_size(7).text_color(st.color)
            .when(a.status === "blocked", (e) => e.loop("opacity", { from: 0.35, to: 1, period: 600 }))
            .child(st.label)))
        .when(a.status === "working", (el) => el.child(h_flex().gap(6).items_center()
          .child(this.atb(a.address))
          .child(div().text_size(11).text_color(C.cyan).child(elapsed(since))))));
  }

  render() {
    const world = spaces();
    const list = [...agents()].sort((a, b) =>
      (b.pinned - a.pinned) || (RANK[a.status] - RANK[b.status]) || (b.seq - a.seq));
    setAgentOrder(list.map((a) => a.address));
    const compact = this.width < 150;

    return div().id("root").size_full().pb(2)
      .on_size_change((measured, cx) => { const size = designSize(measured); if (size.width !== this.width) { this.width = size.width; cx.notify(); } })
      .child(box(v_flex().size_full())
        .child(v_flex().relative().size_full().py(8).px(4).gap(2).font_family(BODY)
          .child(h_flex().px(8).pb(6).justify_between().items_center()
            .child(div().font_family(TITLE).text_size(compact ? 7 : 9).text_color(C.gold).child(compact ? "PT" : "PARTY"))
            .when(!compact, (el) => el.child(div().text_size(12).text_color(C.dim).child(heroCount(list.length)))))
          .child(v_flex().id("fh-party-list").flex_1().gap(2).overflow_y_scrollbar()
            .when(list.length === 0, (el) => el.child(div().px(8).text_size(13).text_color(C.dim)
              .child(compact ? "…" : "Nobody here. Recruit a hero!")))
            .children(list.map((a) => this.hero(a, compact, world))))
          .child(div().id("fh-recruit").mx(4).mt(4).h(28).rounded(4).border(1).border_color(C.edgeDim)
            .flex().items_center().justify_center().cursor_pointer()
            .hover((s) => s.bg("#ffffff1a").border_color(C.edge))
            .on_click(() => openHeroMenu(openOverlay, null))
            .child(div().font_family(TITLE).text_size(compact ? 9 : 8).text_color(C.gold).child(compact ? "+" : "+ RECRUIT")))));
  }
}
