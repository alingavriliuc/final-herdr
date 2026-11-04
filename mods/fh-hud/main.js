// FINAL HERDR's top bar: title, the three views (World / Party / Battle),
// where the party is, gold, clock. It owns view switching: the keys send
// fh-hud.cycle / .world / .roster / .combat here.
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run, layout, nextCommand, shared } from "herdr";
import { C, TITLE, BODY, gradient, zoneName, VIEWS, KEYS_HELP, SAVE_KEY } from "./kit.js";
import { Engine } from "./engine.js";

const pad = (n) => String(n).padStart(2, "0");

function findNode(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

export function currentView() {
  return findNode(layout(), "view")?.active ?? "combat";
}

function select(child) {
  run("layout.select", { stack: "view", child });
}

export default class FhHud extends View {
  init(_props, cx) {
    this.now = new Date();
    this.engine = new Engine();
    // globalThis survives hot reloads: the title screen shows once per launch.
    if (!globalThis.__fhTitleShown) {
      globalThis.__fhTitleShown = true;
      run("mod.open", { name: "fh-title" });
    }
    cx.timer.every(2000, () => this.engine.tick());
    cx.timer.every(15000, (cx) => { this.now = new Date(); cx.notify(); });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "cycle") {
          const i = VIEWS.findIndex((v) => v.id === currentView());
          select(VIEWS[(i + 1) % VIEWS.length].id);
        } else if (VIEWS.some((v) => v.id === c)) {
          select(c);
        }
        cx.notify();
      }
    });
  }

  tab(v, active) {
    return h_flex().id(`fh-view-${v.id}`).gap(6).items_center().px(10).h(26).rounded(4)
      .cursor_pointer()
      .when(active, (el) => el.bg("#ffffff1a").border(1).border_color(C.edge))
      .when(!active, (el) => el.hover((s) => s.bg("#ffffff10")))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => select(v.id))
      .child(div().w(14).text_color(C.gold)
        .when(active, (el) => el.relative().loop("left", { from: -2, to: 1, period: 700 }).child("☞")))
      .child(div().font_family(TITLE).text_size(9).text_color(active ? C.text : C.dim).child(v.label));
  }

  stat(label, value, color) {
    return h_flex().gap(6).items_center()
      .child(div().font_family(TITLE).text_size(8).text_color(C.dim).child(label))
      .child(div().text_size(14).text_color(color ?? C.text).child(value));
  }

  button(id, label, onClick) {
    return div().id(id).px(8).h(24).rounded(4).border(1).border_color(C.edgeDim)
      .flex().items_center().cursor_pointer()
      .font_family(TITLE).text_size(9).text_color(C.text)
      .hover((s) => s.bg("#ffffff1a").border_color(C.edge))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(onClick)
      .child(label);
  }

  render() {
    const view = currentView();
    const space = spaces().find((s) => s.active);
    const gold = Number(shared(SAVE_KEY)?.gold ?? 0);
    const d = this.now;

    return div().id("root").size_full().relative()
      .child(gradient("#2a3a99", "#0d1550"))
      .child(div().absolute().left(0).right(0).bottom(0).h(2).bg(C.edgeDim))
      .child(h_flex().relative().size_full().pl(84).pr(14).gap(16).items_center().font_family(BODY)
        .child(div().font_family(TITLE).text_size(12).text_color(C.gold).child("FINAL HERDR"))
        .child(h_flex().gap(4).items_center().children(VIEWS.map((v) => this.tab(v, v.id === view))))
        .child(div().flex_1())
        .child(this.stat("AREA", space ? zoneName(space.name) : "—"))
        .child(this.stat("GOLD", `${gold} G`, C.gold))
        .child(this.stat("", `${pad(d.getHours())}:${pad(d.getMinutes())}`))
        .child(h_flex().gap(6).items_center()
          .child(this.button("fh-help", "?", () => run("mod.open", { name: "fh-manual" })))
          .child(this.button("fh-settings", "⚙", () => run("app.settings", {}))
            .font_family(BODY).text_size(15))));
  }
}
