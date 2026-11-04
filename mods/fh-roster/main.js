// FINAL HERDR's party screen: every hero's sheet, big portraits.
// Click a sheet: the command menu. Last card: recruit.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, spaces, openOverlay, run, shared } from "herdr";
import { C, TITLE, BODY, box, heroName, heroCount, classOf, STATUS, tabOf, elapsed, openHeroMenu, heroPortrait, zoneName, SAVE_KEY, classStats, ACHIEVEMENTS } from "./kit.js";

const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };

export default class FhRoster extends View {
  init(_props, cx) {
    cx.timer.every(5000, (cx) => { if (agents().some((a) => a.status === "working")) cx.notify(); });
  }

  line(label, value, color) {
    return h_flex().gap(8)
      .child(div().w(56).flex_none().font_family(TITLE).text_size(7).text_color(C.dim).child(label))
      .child(div().flex_1().truncate().text_size(13).text_color(color ?? C.text).child(value));
  }

  level(st) {
    return v_flex().gap(3)
      .child(h_flex().gap(8)
        .child(div().w(56).flex_none().font_family(TITLE).text_size(7).text_color(C.dim).child("LEVEL"))
        .child(div().text_size(13).text_color(C.gold).child(`${st.level}`))
        .child(div().flex_1().text_size(11).text_color(C.dim).child(`${st.into}/${st.need} XP`)))
      .child(div().ml(64).h(5).rounded(2).bg("#03051a").border(1).border_color(C.edgeDim).overflow_hidden()
        .child(div().h_full().bg(C.gold).w(Math.max(2, Math.round(170 * st.into / st.need)))));
  }

  achievements() {
    const got = shared(SAVE_KEY)?.ach ?? {};
    const n = ACHIEVEMENTS.filter((a) => got[a.id]).length;
    return v_flex().gap(10).pt(8)
      .child(h_flex().gap(12).items_center()
        .child(div().font_family(TITLE).text_size(11).text_color(C.gold).child("ACHIEVEMENTS"))
        .child(div().text_size(13).text_color(C.dim).child(`${n}/${ACHIEVEMENTS.length}`)))
      .child(h_flex().flex_wrap().gap(8).children(ACHIEVEMENTS.map((a) => {
        const on = Boolean(got[a.id]);
        return h_flex().id(`fa-${a.id}`).w(250).px(10).py(6).gap(10).items_center().rounded(4)
          .border(1).border_color(on ? C.gold : C.edgeDim).bg(on ? "#ffd84a14" : "#03051a55")
          .child(div().text_size(16).text_color(on ? C.gold : C.faint).child(on ? "◆" : "◇"))
          .child(v_flex().flex_1().overflow_hidden()
            .child(div().truncate().text_size(13).text_color(on ? C.text : C.dim).child(on ? a.name : "???"))
            .child(div().truncate().text_size(11).text_color(C.faint).child(a.desc)));
      })));
  }

  action(id, label, fn) {
    return div().id(id).px(8).h(22).rounded(3).border(1).border_color(C.edgeDim).flex().items_center()
      .font_family(TITLE).text_size(7).text_color(C.text).cursor_pointer()
      .hover((s) => s.bg("#ffffff1a").border_color(C.edge))
      .on_click((_e, cx) => { cx.stop_propagation(); fn(); })
      .child(label);
  }

  card(a, world) {
    const cls = classOf(a.program, a.app);
    const st = STATUS[a.status] ?? STATUS.idle;
    const tab = tabOf(a, world);
    const quest = tab?.named ? tab.name : `Quest ${tab?.index ?? a.tab_index}`;
    return box(div().id(`fr-${a.address}`).w(320).h(222).cursor_pointer()
      .on_click(() => { run("agent.focus", { terminal: a.address }); run("fh-hud.combat"); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openHeroMenu(openOverlay, a); }),
      { edge: a.status === "blocked" ? C.red : a.focused ? C.gold : C.edge })
      .child(h_flex().relative().size_full().p(12).gap(14)
        .child(v_flex().items_center().gap(6)
          .child(div().pt(6).child(heroPortrait(a, 88)))
          .child(div().font_family(TITLE).text_size(7).text_color(st.color)
            .when(a.status === "blocked", (e) => e.loop("opacity", { from: 0.35, to: 1, period: 600 }))
            .child(st.label)))
        .child(v_flex().flex_1().overflow_hidden().gap(5)
          .child(h_flex().gap(6).items_center()
            .when(a.pinned, (el) => el.child(div().text_color(C.gold).child("⚑")))
            .child(div().flex_1().truncate().text_size(17).text_color(C.text).child(heroName(a))))
          .child(div().text_size(13).text_color(C.gold).child(`${cls.sigil} ${cls.name}`))
          .child(this.level(classStats(shared(SAVE_KEY), cls.name)))
          .child(this.line("ZONE", zoneName(a.space_name)))
          .child(this.line("QUEST", quest))
          .child(this.line("BATTLE", a.status === "working" ? elapsed(tab?.working_since) : "—", C.cyan))
          .child(div().flex_1())
          .child(h_flex().gap(6)
            .child(this.action(`fr-go-${a.address}`, "GO", () => { run("agent.focus", { terminal: a.address }); run("fh-hud.combat"); }))
            .child(this.action(`fr-peek-${a.address}`, "PEEK", () => run("terminal.peek", { terminal: a.address }))))));
  }

  recruitCard() {
    return div().id("fr-recruit").w(320).h(222).rounded(6).border(2).border_color(C.edgeDim)
      .flex().flex_col().items_center().justify_center().gap(10).cursor_pointer()
      .hover((s) => s.bg("#ffffff10").border_color(C.edge))
      .on_click(() => openHeroMenu(openOverlay, null))
      .child(div().font_family(TITLE).text_size(22).text_color(C.gold).child("+"))
      .child(div().font_family(TITLE).text_size(9).text_color(C.gold).child("RECRUIT"))
      .child(div().text_size(12).text_color(C.dim).child("A new agent joins the party"));
  }

  render() {
    const world = spaces();
    const list = [...agents()].sort((a, b) =>
      (b.pinned - a.pinned) || (RANK[a.status] - RANK[b.status]) || (b.seq - a.seq));
    return box(div().size_full())
      .child(v_flex().relative().size_full().p(16).gap(14).font_family(BODY)
        .child(h_flex().items_center().gap(12)
          .child(div().font_family(TITLE).text_size(13).text_color(C.gold).child("HERO SHEETS"))
          .child(div().text_size(13).text_color(C.dim).child(`${heroCount(list.length)} · ${list.filter((a) => a.status === "working").length} in battle`)))
        .child(div().id("fr-grid").flex_1().overflow_y_scrollbar()
          .child(v_flex().gap(16)
            .child(h_flex().flex_wrap().gap(14).items_start()
              .children(list.map((a) => this.card(a, world)))
              .child(this.recruitCard()))
            .child(this.achievements()))));
  }
}
