// FINAL HERDR's journal: the last events (quests, blocks, levels, achievements).
// Opened by clicking the dialog box.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, shared } from "herdr";
import { C, TITLE, BODY, box, SAVE_KEY, ago } from "./kit.js";

export const KIND = {
  done: { icon: "★", color: C.green },
  blocked: { icon: "!", color: C.red },
  level: { icon: "▲", color: C.gold },
  ach: { icon: "◆", color: C.gold },
  info: { icon: "·", color: C.dim },
};

export default class FhJournal extends View {
  render() {
    const log = shared(SAVE_KEY)?.log ?? [];
    const now = Date.now();
    return box(div().id("fh-journal").size_full(), { radius: 8 })
      .child(v_flex().relative().size_full().p(16).gap(10).font_family(BODY)
        .child(h_flex().justify_between().items_center()
          .child(div().font_family(TITLE).text_size(11).text_color(C.gold).child("QUEST LOG"))
          .child(div().id("fj-close").px(8).h(22).rounded(3).border(1).border_color(C.edgeDim)
            .flex().items_center().cursor_pointer().text_size(12).text_color(C.text)
            .hover((s) => s.bg("#ffffff1a"))
            .on_click(() => closeOverlay(props().overlay)).child("Close")))
        .child(v_flex().id("fj-list").flex_1().gap(4).overflow_y_scrollbar()
          .when(log.length === 0, (el) => el.child(div().text_size(14).text_color(C.dim)
            .child("Nothing to tell yet. Send a hero on a quest!")))
          .children(log.map((e, i) => {
            const k = KIND[e.kind] ?? KIND.info;
            return h_flex().id(`fj-${i}`).gap(10).items_start()
              .child(div().w(14).flex_none().text_size(14).text_color(k.color).child(k.icon))
              .child(div().flex_1().text_size(14).text_color(e.kind === "info" ? C.dim : C.text).child(e.text))
              .child(div().flex_none().text_size(12).text_color(C.faint).child(ago(e.t, now)));
          }))));
  }
}
