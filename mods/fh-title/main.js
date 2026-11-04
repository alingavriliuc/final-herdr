// FINAL HERDR's title screen: shown once per app launch (fh-hud opens it).
// Enter, Esc, Space or a click: start.
import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, agents, shared } from "herdr";
import { C, TITLE, BODY, designSize, gradient, heroCount, CLASSES, portraitPath, sfx, SAVE_KEY } from "./kit.js";

// Twinkling stars at fixed spots (share of width, share of height, size, period).
const STARS = [
  [0.08, 0.12, 3, 1300], [0.21, 0.31, 2, 900], [0.34, 0.08, 3, 1700], [0.47, 0.22, 2, 1100],
  [0.62, 0.1, 3, 1500], [0.74, 0.27, 2, 800], [0.88, 0.15, 3, 1900], [0.93, 0.38, 2, 1200],
  [0.05, 0.45, 2, 1000], [0.15, 0.7, 3, 1600], [0.83, 0.62, 2, 1400], [0.95, 0.78, 3, 1100],
  [0.28, 0.86, 2, 1800], [0.66, 0.9, 3, 1000], [0.52, 0.72, 2, 1300], [0.41, 0.48, 2, 2100],
];

export default class FhTitle extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
    this.size = { width: 1200, height: 800 };
    sfx("title");
  }

  start() {
    sfx("select");
    const id = props()?.overlay;
    if (id) closeOverlay(id);
  }

  render() {
    const { width: w, height: h } = this.size;
    const crew = agents();
    const gold = shared(SAVE_KEY)?.gold ?? 0;
    return div().id("root").size_full().relative().overflow_hidden().cursor_pointer()
      .track_focus(this.handle)
      .on_size_change((measured, cx) => { const size = designSize(measured); if (size.width !== w || size.height !== h) { this.size = size; cx.notify(); } })
      .on_key_down((e, cx) => {
        if (["enter", "escape", "space"].includes(e.key)) { cx.stop_propagation(); this.start(); }
      })
      .on_click(() => this.start())
      .child(gradient("#0d1550", "#000000"))
      .children(STARS.map(([x, y, s, p], i) => div().id(`st-${i}`).absolute().left(x * w).top(y * h).size(s).bg(C.edge)
        .loop("opacity", { from: 0.1, to: 1, period: p })))
      .child(v_flex().relative().size_full().items_center().justify_center().gap(26).font_family(BODY)
        .child(h_flex().gap(18).items_end()
          .children(CLASSES.map((c, i) => div().relative()
            .loop("top", { from: 0, to: -6, period: 600 + i * 90 })
            .child(image(portraitPath(c)).size(64)))))
        .child(div().relative()
          .child(div().absolute().left(4).top(4).font_family(TITLE).text_size(54).text_color("#3a1d00").child("FINAL HERDR"))
          .child(div().relative().font_family(TITLE).text_size(54).text_color(C.gold).child("FINAL HERDR")))
        .child(div().text_size(20).text_color(C.dim).child("— Rise of the Agents —"))
        .child(div().h(30))
        .child(div().font_family(TITLE).text_size(14).text_color(C.text)
          .loop("opacity", { from: 0.1, to: 1, period: 900 }).child("PRESS ENTER"))
        .child(div().text_size(13).text_color(C.faint)
          .child(`${heroCount(crew.length)} ready · ${gold} G in your pocket`)))
      .child(div().absolute().bottom(24).left(0).right(0).flex().justify_center()
        .font_family(BODY).text_size(12).text_color(C.faint).child("© 2026 HERDR SOFT · a production of your terminal"));
  }
}
