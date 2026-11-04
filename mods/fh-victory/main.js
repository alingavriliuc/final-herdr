// FINAL HERDR's level-up window: a class gained a level. Closes by itself
// after a few seconds, or on click. Doesn't take the keyboard.
import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { C, TITLE, BODY, box, portraitPath } from "./kit.js";

const SHOW_MS = 4000;

export default class FhVictory extends View {
  init(_props, cx) {
    cx.timer.after(SHOW_MS, () => { const id = props()?.overlay; if (id) closeOverlay(id); });
  }

  render() {
    const p = props() ?? {};
    return div().id("fh-victory").size_full().cursor_pointer()
      .on_click(() => { if (p.overlay) closeOverlay(p.overlay); })
      .child(box(div().size_full(), { radius: 8, edge: C.gold })
        .child(h_flex().relative().size_full().p(16).gap(16).items_center().font_family(BODY)
          .child(div().relative().loop("top", { from: 0, to: -6, period: 420 })
            .child(image(portraitPath(p)).size(88)))
          .child(v_flex().flex_1().gap(6).overflow_hidden()
            .child(div().font_family(TITLE).text_size(12).text_color(C.gold)
              .loop("opacity", { from: 0.6, to: 1, period: 500 }).child("LEVEL UP!"))
            .child(div().text_size(16).text_color(C.text).truncate().child(p.name ?? ""))
            .when(p.bonus != null, (el) => el.child(div().text_size(14).text_color(C.green)
              .child(`Quest complete · +${p.bonus} XP${p.clean ? " · flawless" : ""}`)))
            .child(div().text_size(14).text_color(C.gold)
              .loop("opacity", { from: 0.4, to: 1, period: 350 })
              .child(`★ ${p.cls} reached level ${p.level}!`)))));
  }
}
