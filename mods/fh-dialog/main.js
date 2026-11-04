// FINAL HERDR's dialog box at the bottom: the latest event, what the party is
// up to, and a reminder of the keys. Click: the journal.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, shared, openOverlay } from "herdr";
import { C, TITLE, BODY, box, heroName, heroCount, classOf, KEYS_HELP, SAVE_KEY, ago } from "./kit.js";

const FRESH_MS = 10 * 60 * 1000;
const KIND = {
  done: { icon: "★", color: C.green },
  blocked: { icon: "!", color: C.red },
  level: { icon: "▲", color: C.gold },
  ach: { icon: "◆", color: C.gold },
  info: { icon: "·", color: C.dim },
};

function narrate() {
  const list = agents();
  const blocked = list.filter((a) => a.status === "blocked");
  const done = list.filter((a) => a.status === "done");
  const working = list.filter((a) => a.status === "working");
  const who = (a) => `${heroName(a)} (${classOf(a.program, a.app).name})`;
  if (blocked.length) return [`${who(blocked[0])} calls for help!`, blocked.length > 1 ? `${blocked.length - 1} more await your orders.` : "Go see them before they nod off."];
  if (done.length) return [`${who(done[0])} completed a quest!`, "Go collect the loot."];
  if (working.length) return [`${heroCount(working.length)} in battle.`, working.map(heroName).slice(0, 3).join(", ") + (working.length > 3 ? "…" : "")];
  if (list.length) return ["The party is resting at camp.", "Give them a quest."];
  return ["Welcome to FINAL HERDR.", "No heroes yet. Recruit an agent to begin."];
}

export default class FhDialog extends View {
  init(_props, cx) {
    // "3 min ago" changes slowly.
    cx.timer.every(30000, (cx) => cx.notify());
  }

  render() {
    const [say1, say2] = narrate();
    const last = shared(SAVE_KEY)?.log?.[0];
    const fresh = last && Date.now() - last.t < FRESH_MS;
    const k = fresh ? (KIND[last.kind] ?? KIND.info) : null;

    return div().size_full().pb(8).child(
      box(div().id("fh-dialog").size_full().cursor_pointer()
        .on_click(() => openOverlay({ mod: "fh-journal", kind: "dialog", width: 560, height: 460 })))
        .child(h_flex().relative().size_full().px(16).gap(16).items_center().font_family(BODY)
          .child(v_flex().flex_1().gap(4).overflow_hidden()
            .child(h_flex().gap(8).items_center()
              .when(Boolean(k), (el) => el.child(div().text_size(15).text_color(k.color).child(k.icon)))
              .child(div().flex_1().text_size(15).text_color(C.text).truncate().child(fresh ? last.text : say1))
              .when(Boolean(fresh), (el) => el.child(div().flex_none().text_size(12).text_color(C.faint).child(ago(last.t)))))
            .child(div().text_size(13).text_color(C.dim).truncate().child(fresh ? say1 : say2)))
          .child(v_flex().flex_none().items_end().gap(4)
            .child(div().text_size(12).text_color(C.dim).child(KEYS_HELP))
            .child(h_flex().gap(8).items_center()
              .child(div().text_size(11).text_color(C.faint).child("click: quest log"))
              .child(div().font_family(TITLE).text_size(8).text_color(C.gold)
                .loop("opacity", { from: 0.2, to: 1, period: 900 }).child("▼"))))));
  }
}
