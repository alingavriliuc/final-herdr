// FINAL HERDR's player's manual: keys, views, statuses, commands, progression,
// classes. Opened with ⌘/ or the "?" in the HUD.
import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { C, TITLE, BODY, box, CLASSES, portraitPath, STATUS, XP, ACHIEVEMENTS } from "./kit.js";

const KEYS = [
  ["⌘E", "Next view (World → Party → Battle)"],
  ["⌘⌥1", "World map"],
  ["⌘⌥2", "Hero sheets and achievements"],
  ["⌘⌥3", "Battle: the active tab's terminals"],
  ["⌘/", "This manual"],
  ["⌘⇧L", "Switch layout"],
  ["⌘1…9", "Go to quest (tab) number"],
  ["⌘] / ⌘[", "Next / previous hero"],
];

const VIEWS = [
  ["World", "Each git repo is a settlement: the main worktree is the campfire, every other worktree a house. Up to 3 houses: village; 4-5: town; 6+: castle. Empty house: a worktree not opened yet (SETTLE creates its space). Other spaces are lone zones. Click: select; click again or TRAVEL: go there. Right-click a campfire or a house: Travel, Build a house (new worktree), Demolish. Arrows + Enter on the keyboard."],
  ["Party", "One sheet per hero (level, zone, quest, battle time) and the achievements wall. Click: go to the hero. Right-click: its menu."],
  ["Battle", "The active tab's terminals, framed as JRPG windows."],
  ["Party column", "Always visible. Click a hero: go to its terminal. Right-click: its menu. + RECRUIT: start an agent."],
  ["Dialog box", "The latest event. Click: the quest log."],
];

const MENU = [
  ["Go", "join the agent in the Battle view"],
  ["Peek", "take a look at its terminal"],
  ["Talk", "send it an order (not while it's blocked)"],
  ["Banner", "pin it to the top of the party"],
  ["Flee", "stop the agent (asks first)"],
];

const STATUS_HELP = {
  working: "the portrait bounces, the ATB gauge charges then flashes gold, the timer runs",
  blocked: "red \"!\" bubble: it needs you",
  done: "gold ★: quest finished while you were away",
  idle: "greyed portrait, zzz: waiting for a quest",
};

export default class FhManual extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  section(title, body) {
    return v_flex().gap(8)
      .child(div().font_family(TITLE).text_size(9).text_color(C.gold).child(title))
      .child(body);
  }

  rows(list, w = 90) {
    return v_flex().gap(4).children(list.map(([k, v]) => h_flex().gap(10).items_start()
      .child(div().w(w).flex_none().text_size(13).text_color(C.text).child(k))
      .child(div().flex_1().min_w(0).overflow_hidden().text_size(13).text_color(C.dim).child(v))));
  }

  render() {
    const close = () => closeOverlay(props()?.overlay);
    return div().id("fh-manual").size_full().track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { cx.stop_propagation(); close(); } })
      .child(box(div().size_full(), { radius: 8 })
        .child(v_flex().relative().size_full().p(18).gap(12).font_family(BODY)
          .child(h_flex().justify_between().items_center()
            .child(div().font_family(TITLE).text_size(13).text_color(C.gold).child("PLAYER'S MANUAL"))
            .child(div().id("fm-close").px(8).h(22).rounded(3).border(1).border_color(C.edgeDim)
              .flex().items_center().cursor_pointer().text_size(12).text_color(C.text)
              .hover((s) => s.bg("#ffffff1a")).on_click(close).child("Close")))
          .child(v_flex().id("fm-body").flex_1().gap(18).overflow_y_scrollbar()
            .child(this.section("SHORTCUTS", this.rows(KEYS)))
            .child(this.section("SCREENS", this.rows(VIEWS, 130)))
            .child(this.section("STATUSES", v_flex().gap(4).children(Object.entries(STATUS).map(([k, s]) =>
              h_flex().gap(10).child(div().w(90).flex_none().font_family(TITLE).text_size(7).text_color(s.color).child(s.label))
                .child(div().flex_1().text_size(13).text_color(C.dim).child(STATUS_HELP[k]))))))
            .child(this.section("COMMAND MENU", this.rows(MENU)))
            .child(this.section("PROGRESSION", this.rows([
              ["XP", `${XP.perSecond} per second of battle, +${XP.quest} per completed quest, +${XP.clean} if flawless. Shared by class.`],
              ["Levels", "100 × level^1.5 XP to reach the next one."],
              ["Gold", "One coin per completed quest."],
              ["Achievements", `${ACHIEVEMENTS.length} to unlock, on the Party screen.`],
            ])))
            .child(this.section("CLASSES", h_flex().flex_wrap().gap(12).children(
              [...CLASSES.map((c) => [c, c.re.source.replace(/\\/g, "")]), [{ name: "Villager", art: "villageois" }, "a plain shell"]]
                .map(([c, who]) => h_flex().w(200).gap(8).items_center()
                  .child(image(portraitPath(c)).size(36))
                  .child(v_flex().child(div().text_size(14).text_color(C.text).child(c.name))
                    .child(div().text_size(12).text_color(C.dim).child(who))))))))));
  }
}
