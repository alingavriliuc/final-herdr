// FINAL HERDR's command menu: a JRPG window at the pointer.
// mode "hero": Go / Peek / Talk / Banner / Flee for one agent.
// mode "recruit": pick a class (an installed agent), name the hero, start it.
// mode "site": a worktree on the world map (the campfire or a house): travel,
// build a new worktree (a house), or tear a house down (git worktree remove).
// Arrows + Enter, or the mouse; Esc goes back, then closes.
import { View, div, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { props, run, closeOverlay, knownAgents, spaces, hc, notify, shared, setShared, exec } from "herdr";
import { C, TITLE, BODY, box, classOf, portraitPath, SAVE_KEY, classStats, sfx } from "./kit.js";

export default class FhMenu extends View {
  init(_props, cx) {
    const m = props()?.mode;
    this.mode = m === "recruit" || m === "site" ? m : "main";
    this.busy = false;
    this.error = "";
    this.dirty = null;  // demolish: uncommitted changes in the house, once known
    this.sel = 0;
    this.agents = null;
    this.recruit = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.input = InputState.new({ value: "" });
    this.input.on("submit", (_e, cx) => this.submit(cx));
    if (this.mode === "recruit") this.loadAgents(cx);
  }

  loadAgents(cx) {
    cx.spawn(async (cx) => {
      const space = spaces().find((s) => s.active);
      // OpenCode (the Engineer) always leads the list; the rest keep Herdr's order.
      try {
        this.agents = (await knownAgents({ on: space?.machine })).filter((a) => a.installed)
          .sort((a, b) => (b.key === "opencode") - (a.key === "opencode"));
      }
      catch { this.agents = []; }
      cx.notify();
    });
  }

  close() { closeOverlay(props().overlay); }

  // ---- worktrees (mode "site")

  async git(args) {
    const p = props();
    const r = await exec("git", args, { cwd: p.main, on: p.machine ?? undefined });
    return { ok: r.code === 0, out: (r.stdout ?? "").trim(), err: (r.stderr || r.stdout || "").trim() };
  }

  /** The world map reads git again (it's waiting for this). */
  changed() { setShared("fh.world.changed", Date.now()); }

  travel() {
    const p = props();
    this.close();
    if (p.spaces?.length) run("space.select", { id: p.spaces[0] });
    else run("space.new", p.machine ? { folder: p.path, machine: p.machine } : { folder: p.path });
    run("fh-hud.combat");
  }

  build(cx, branch) {
    const p = props();
    // Next to the main worktree, like the others: eni/main -> eni/main.feat-x
    const path = `${p.main}.${branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")}`;
    this.busy = true; this.error = ""; cx.notify();
    cx.spawn(async (cx) => {
      const exists = (await this.git(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`])).ok;
      const r = await this.git(exists ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, "HEAD"]);
      this.busy = false;
      if (!r.ok) { this.error = r.err || "git worktree add failed."; sfx("blocked"); return cx.notify(); }
      this.changed();
      this.close();
      sfx("achievement");
      notify({ title: "New house!", body: `${branch} moves into ${p.repo}.`, level: "info", timeout: 5000 });
      run("space.new", p.machine ? { folder: path, machine: p.machine } : { folder: path });
    });
  }

  demolish(cx) {
    const p = props();
    this.busy = true; this.error = ""; cx.notify();
    cx.spawn(async (cx) => {
      // Terminals first: a shell sitting in the folder keeps it busy.
      for (const id of p.spaces ?? []) run("space.close", { id, confirmed: true });
      const r = await this.git(["worktree", "remove", ...(this.dirty ? ["--force"] : []), p.path]);
      this.busy = false;
      if (!r.ok) { this.error = r.err || "git worktree remove failed."; sfx("blocked"); return cx.notify(); }
      this.changed();
      this.close();
      notify({ title: "House demolished", body: `${p.branch} left ${p.repo}. The branch is kept.`, level: "info", timeout: 5000 });
    });
  }

  checkDirty(cx) {
    const p = props();
    this.dirty = null;
    cx.spawn(async (cx) => {
      const r = await exec("git", ["--no-optional-locks", "status", "--porcelain"], { cwd: p.path, on: p.machine ?? undefined });
      this.dirty = r.code === 0 ? (r.stdout ?? "").trim() !== "" : false;
      cx.notify();
    });
  }

  // Each mode's choices: { label, hint?, color?, act(cx) }.
  items() {
    const p = props() ?? {};
    if (this.mode === "main") return [
      { label: "Go", hint: "join the battle", act: () => { this.close(); run("agent.focus", { terminal: p.terminal }); run("fh-hud.combat"); } },
      { label: "Peek", hint: "take a look", act: () => { this.close(); run("terminal.peek", { terminal: p.terminal }); } },
      { label: "Talk", hint: "send an order", act: (cx) => this.enter("talk", cx) },
      { label: p.pinned ? "Lower the banner" : "Banner", hint: p.pinned ? "unpin" : "pin to the top", act: () => { this.close(); run("terminal.pin", { terminal: p.terminal, pinned: !p.pinned }); } },
      { label: "Flee", hint: "stop this hero", color: C.red, act: (cx) => this.enter("flee", cx) },
    ];
    if (this.mode === "flee") return [
      { label: "No", hint: "stay and fight", act: (cx) => this.enter("main", cx) },
      { label: "Yes, flee", hint: "the terminal will close", color: C.red, act: () => { this.close(); run("terminal.kill", { terminal: p.terminal }); } },
    ];
    if (this.mode === "site") return [
      p.spaces?.length
        ? { label: "Travel", hint: "go there", act: () => this.travel() }
        : { label: "Settle", hint: "open a space here", act: () => this.travel() },
      { label: "Build a house", hint: "new worktree", act: (cx) => this.enter("build", cx) },
      ...(p.kind === "house" ? [{ label: "Demolish", hint: "remove this worktree", color: C.red, act: (cx) => this.enter("demolish", cx) }] : []),
    ];
    if (this.mode === "demolish") return this.busy || this.dirty === null ? [] : [
      { label: "No", hint: "keep it", act: (cx) => this.enter("site", cx) },
      { label: "Yes, demolish", hint: this.dirty ? "changes will be lost" : "the folder will be deleted", color: C.red, act: (cx) => this.demolish(cx) },
    ];
    if (this.mode === "recruit") return (this.agents ?? []).map((a) => {
      const cls = classOf(a, a.key);
      return { label: cls.name, hint: a.name, art: cls.art, act: (cx) => { this.recruit = a; this.enter("name", cx); } };
    });
    return [];
  }

  enter(mode, cx) {
    this.mode = mode;
    this.sel = 0;
    this.error = "";
    if (mode === "demolish") this.checkDirty(cx);
    if (mode === "talk" || mode === "name" || mode === "build") { this.input.set_value?.(""); this.input.focus(); }
    else this.handle.focus();
    cx.notify();
  }

  submit(cx) {
    const p = props() ?? {};
    const text = this.input.value().trim();
    if (this.mode === "talk") {
      if (!text) return;
      this.close();
      cx.spawn(async () => {
        const r = await hc(["send", p.terminal, text]);
        if (r.code !== 0) notify({ title: `${p.name} isn't listening`, body: (r.stderr || r.stdout).trim(), level: "warning" });
      });
    } else if (this.mode === "build") {
      if (!text || this.busy) return;
      this.build(cx, text);
    } else if (this.mode === "name" && this.recruit) {
      const space = spaces().find((s) => s.active);
      this.close();
      run("tab.new", { ...(text ? { name: text } : {}), space: space?.id, argv: this.recruit.run });
      run("fh-hud.combat");
    }
  }

  key(e, cx) {
    if (e.key === "escape") {
      cx.stop_propagation();
      if (this.mode === "main" || this.mode === "recruit" || this.mode === "site") return this.close();
      return this.enter({ name: "recruit", build: "site", demolish: "site" }[this.mode] ?? "main", cx);
    }
    if (this.mode === "talk" || this.mode === "name" || this.mode === "build") return;
    const items = this.items();
    if (!items.length) return;
    if (e.key === "down") { this.sel = (this.sel + 1) % items.length; sfx("cursor"); cx.notify(); }
    else if (e.key === "up") { this.sel = (this.sel - 1 + items.length) % items.length; sfx("cursor"); cx.notify(); }
    else if (e.key === "enter" || e.key === "space") { sfx("select"); items[this.sel].act(cx); }
    else return;
    cx.stop_propagation();
  }

  row(item, i) {
    const on = i === this.sel;
    return h_flex().id(`fm-${this.mode}-${i}`).h(28).px(8).gap(8).items_center().rounded(4).cursor_pointer()
      .when(on, (el) => el.bg("#ffffff1a"))
      .on_hover((h, cx) => { if (h && this.sel !== i) { this.sel = i; sfx("cursor"); cx.notify(); } })
      .on_click((_e, cx) => { sfx("select"); item.act(cx); })
      .child(div().w(14).text_color(C.gold)
        .when(on, (el) => el.relative().loop("left", { from: -2, to: 1, period: 700 }).child("☞")))
      .when(Boolean(item.art), (el) => el.child(image(portraitPath(item)).size(20)))
      .child(div().text_size(15).text_color(item.color ?? C.text).child(item.label))
      .child(div().flex_1().truncate().text_size(12).text_color(C.dim).child(item.hint ?? ""));
  }

  header() {
    const p = props() ?? {};
    const title = { main: p.name, flee: "Flee?", talk: `Talk to ${p.name}`, recruit: "RECRUIT", name: "Hero's name",
      site: p.branch, build: "Build a house", demolish: `Demolish ${p.branch}?` }[this.mode];
    const site = this.mode === "site" || this.mode === "build" || this.mode === "demolish";
    return h_flex().gap(10).items_center().pb(8).mb(4).border_b(1).border_color(C.edgeDim)
      .when(site, (el) => el.child(image(`mods/fh-world/tiles/${p.tile}.svg`).size(32)))
      .when(!site && Boolean(p.art) && this.mode !== "recruit" && this.mode !== "name", (el) => el.child(image(portraitPath(p)).size(32)))
      .when(this.mode === "name" && this.recruit, (el) => el.child(image(portraitPath(classOf(this.recruit, this.recruit.key))).size(32)))
      .child(v_flex().flex_1().overflow_hidden()
        .child(div().text_size(15).text_color(C.gold).truncate().child(title ?? ""))
        .when(this.mode === "main" || this.mode === "flee", (el) => el.child(div().text_size(12).text_color(C.dim).child(p.cls ? `${p.cls} · Lv. ${classStats(shared(SAVE_KEY), p.cls).level}` : "")))
        .when(site, (el) => el.child(div().text_size(12).text_color(C.dim).truncate()
          .child(`${p.kind === "fire" ? "Campfire" : "House"} · ${p.repo}`)))
        .when(this.mode === "name" && this.recruit, (el) => el.child(div().text_size(12).text_color(C.dim)
          .child(`${classOf(this.recruit, this.recruit.key).name} · ${this.recruit.name}`))));
  }

  body() {
    const err = this.error ? div().px(4).text_size(12).text_color(C.red).child(this.error) : null;
    if (this.mode === "talk" || this.mode === "name" || this.mode === "build") {
      const hint = { talk: "Enter to send · Esc to go back", name: "Enter to recruit (empty: default name) · Esc",
        build: this.busy ? "Building…" : "Branch name (existing or new) · Enter · Esc" }[this.mode];
      return v_flex().gap(8)
        .child(Input.new(this.input).h(32).px(8).rounded(4).border(1).border_color(C.edge).bg("#03051a99")
          .text_size(14).text_color(C.text))
        .child(div().text_size(11).text_color(C.dim).child(hint))
        .when(Boolean(err), (el) => el.child(err));
    }
    if (this.mode === "demolish") {
      const note = this.busy ? "Demolishing…" : this.dirty === null ? "Inspecting the house…"
        : this.dirty ? "⚠ There are uncommitted changes: they will be lost." : "Nothing uncommitted. The branch is kept.";
      return v_flex().gap(6)
        .child(div().px(4).text_size(12).text_color(this.dirty ? C.red : C.dim).child(note))
        .when(Boolean(err), (el) => el.child(err))
        .child(v_flex().gap(1).children(this.items().map((it, i) => this.row(it, i))));
    }
    if (this.mode === "recruit" && this.agents === null) {
      return div().px(8).text_size(13).text_color(C.dim).frames(["Looking for heroes", "Looking for heroes.", "Looking for heroes..", "Looking for heroes..."], 300);
    }
    const items = this.items();
    if (!items.length) return div().px(8).text_size(13).text_color(C.dim).child("No heroes available at the tavern.");
    return v_flex().gap(1).id("fm-list").overflow_y_scrollbar().children(items.map((it, i) => this.row(it, i)));
  }

  render() {
    return div().id("fh-menu").size_full().track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .child(box(div().size_full(), { radius: 8 })
        .child(v_flex().relative().size_full().p(10).font_family(BODY)
          .child(this.header())
          .child(this.body())));
  }
}
