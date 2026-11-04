// FINAL HERDR's pane header: the hero (or villager) in this pane, its class,
// where it stands and its status; pane buttons on hover.
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, home, shared } from "herdr";
import { C, TITLE, BODY, gradient, classOf, STATUS, portraitPath, SAVE_KEY, classStats } from "./kit.js";

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class FhPane extends View {
  init() { this.hovered = false; }

  button(id, icon, command, args) {
    return div().id(id).p(3).rounded(3).text_color(C.dim)
      .hover((s) => s.bg("#ffffff1a").text_color(C.gold))
      .on_click((_e, cx) => { cx.stop_propagation(); run(command, args); })
      .child(svg(`mods/pane/${icon}.svg`).size(13));
  }

  render() {
    const p = panes().find((x) => x.pane === props()?.pane);
    if (!p) return div();
    const pane = p.pane;
    const cls = classOf(p.program, p.app);
    const st = p.status ? STATUS[p.status] : null;
    const who = p.program?.agent ? `${cls.name} Lv. ${classStats(shared(SAVE_KEY), cls.name).level}`
      : p.program?.shell ? cls.name : (p.program?.name ?? p.title);

    return div().id(`fp-${pane}`).size_full().relative()
      .on_hover((h, cx) => { this.hovered = h; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .child(gradient(p.focused ? "#3a4fb0" : "#1f2a78", p.focused ? "#1a2470" : "#121a55"))
      .child(div().absolute().left(0).right(0).bottom(0).h(2).bg(p.focused ? C.edge : C.edgeDim))
      .child(h_flex().relative().size_full().px(10).gap(8).items_center().font_family(BODY).text_size(13)
        .child(div().w(10).text_color(C.gold)
          .when(p.focused, (el) => el.relative().loop("left", { from: -2, to: 1, period: 700 }).child("☞")))
        .child(div().when(p.status === "idle", (e) => e.opacity(0.5)).child(image(portraitPath(cls)).size(20)))
        .child(div().flex_none().text_color(p.focused ? C.text : C.dim).child(who))
        .child(div().flex_1().truncate().text_color(C.faint).child(folder(p.cwd)))
        .when(Boolean(p.branch), (el) => el.child(div().flex_none().truncate().max_w(200).text_color(C.cyan).child(`⎇ ${p.branch}`)))
        .when(Boolean(st), (el) => el.child(div().flex_none().font_family(TITLE).text_size(8).text_color(st.color)
          .when(p.status === "blocked", (e) => e.loop("opacity", { from: 0.3, to: 1, period: 600 }))
          .child(st.label)))
        .when(this.hovered, (el) => el
          .child(this.button(`fp-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
          .child(this.button(`fp-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
          .child(this.button(`fp-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
          .child(this.button(`fp-x-${pane}`, "close", "pane.close", { pane }))));
  }
}
