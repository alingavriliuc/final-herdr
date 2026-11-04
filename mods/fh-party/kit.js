// FINAL HERDR's drawing kit: JRPG window boxes, colors, fonts, classes and
// statuses. Each fh-* mod carries its own copy (mods can't import each other).
import { div, image, PathBuilder, Background } from "gpui-kit";
import { shared, playSound, settings } from "herdr";

export const C = {
  top: "#3a4fb0",
  bottom: "#0d1550",
  edge: "#e8ecff",
  edgeDim: "#8a92c4",
  text: "#f2f4ff",
  dim: "#9aa3d8",
  faint: "#6a74b0",
  gold: "#ffd84a",
  green: "#7be07b",
  red: "#ff6b6b",
  cyan: "#6fe3e3",
  ink: "#03051a",
};

export const TITLE = "Press Start 2P";
export const BODY = "DotGothic16";

const RECT = () => PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();

/** A measured size (on_size_change: logical px) in the px that .left()/.w() take,
 *  which the person's zoom scales. Positions computed from a size need this. */
export function designSize(size) {
  const z = Number(settings()?.zoom) || 1;
  return { width: size.width / z, height: size.height / z };
}

/** A layer filling its (relative) parent with a gradient; 180 = top to bottom. */
export function gradient(from = C.top, to = C.bottom, angle = 180) {
  return window.paint_path(RECT(), Background.linear_gradient(angle, from, to)).absolute().top(0).left(0).size_full();
}

/** A JRPG window: blue gradient, white rounded border. `el` is the box itself; children go on top. */
export function box(el, { radius = 6, edge = C.edge, from = C.top, to = C.bottom } = {}) {
  return el.relative().rounded(radius).border(2).border_color(edge).overflow_hidden()
    .child(gradient(from, to));
}

export const CLASSES = [
  { re: /opencode/i, name: "Engineer", sigil: "⚙", art: "ingenieur" },
  { re: /claude/i, name: "Archmage", sigil: "✦", art: "archimage" },
  { re: /codex/i, name: "Alchemist", sigil: "⚗", art: "alchimiste" },
  { re: /cursor/i, name: "Thief", sigil: "✧", art: "voleur" },
  { re: /copilot/i, name: "Bard", sigil: "♪", art: "barde" },
];

/** The class of a program (agents()/panes() `program`, and `app`). */
export function classOf(program, app) {
  const hay = `${program?.key ?? ""} ${program?.name ?? ""} ${app ?? ""}`;
  const c = CLASSES.find((k) => k.re.test(hay));
  if (c) return c;
  if (program?.shell) return { name: "Villager", sigil: "⌂", art: "villageois" };
  return { name: program?.name ?? "Unknown", sigil: "?", art: "villageois" };
}

/** A class's pixel portrait (an SVG drawn by mods/fh-party/art/portraits.py). */
export function portraitPath(cls) {
  return `mods/fh-party/portraits/${cls.art ?? "villageois"}.svg`;
}

/** A hero's portrait with its status: bounces in combat, "!" when blocked, "zz" at camp, ★ on victory. */
export function heroPortrait(a, size) {
  const cls = classOf(a.program, a.app);
  const badge = Math.max(8, Math.round(size / 5));
  return div().relative().size(size).flex_none()
    .child(div().relative()
      .when(a.status === "working", (el) => el.loop("top", { from: 0, to: -Math.max(2, size / 14), period: 520 }))
      .when(a.status === "idle", (el) => el.opacity(0.45))
      .child(image(portraitPath(cls)).size(size)))
    .when(a.status === "blocked", (el) => el.child(
      div().absolute().top(-6).right(-4).px(3).rounded(3).bg(C.red).border(1).border_color(C.edge)
        .font_family(TITLE).text_size(badge).text_color(C.text)
        .loop("opacity", { from: 0.35, to: 1, period: 500 }).child("!")))
    .when(a.status === "idle", (el) => el.child(
      div().absolute().top(-4).right(-6).text_size(badge + 2).text_color(C.dim).frames(["z", "zz", "zzz", " "], 650)))
    .when(a.status === "done", (el) => el.child(
      div().absolute().top(-6).right(-5).text_size(badge + 4).text_color(C.gold)
        .loop("opacity", { from: 0.5, to: 1, period: 900 }).child("★")));
}

/** The tab an agent fights in (for working_since). */
export function tabOf(a, list) {
  for (const s of list) for (const t of s.tabs) if (t.id === a.tab) return t;
  return null;
}

/** "42 s", "12 min", "1 h 05". */
export function elapsed(since, now = Date.now()) {
  if (!since) return "";
  const s = Math.max(0, Math.floor((now - since) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/** Opens the JRPG command menu for a hero, or the recruit menu (no agent). */
export function openHeroMenu(openOverlay, a, at) {
  if (!a) {
    return openOverlay({ mod: "fh-menu", kind: "popup", frame: "none", width: 280, height: 300, at, props: { mode: "recruit" } });
  }
  const cls = classOf(a.program, a.app);
  return openOverlay({
    mod: "fh-menu", kind: "popup", frame: "none", width: 260, height: 232, at,
    props: { mode: "hero", terminal: a.address, name: heroName(a), cls: cls.name, art: cls.art, pinned: a.pinned, status: a.status },
  });
}

export const STATUS = {
  working: { label: "IN BATTLE", color: C.cyan },
  blocked: { label: "HELP!", color: C.red },
  done: { label: "VICTORY", color: C.green },
  idle: { label: "AT CAMP", color: C.faint },
};

/** A zone's name: a space's, with the home folder ("~") as "Home". */
export function zoneName(name) {
  return !name || name === "~" ? "Home" : name;
}

/** "1 hero", "3 heroes". */
export function heroCount(n) {
  return `${n} hero${n === 1 ? "" : "es"}`;
}

/** A hero's name: its tab's name, else its zone's (space) when the tab has only a number. */
export function heroName(a) {
  if (a.tab_name && !/^\d+$/.test(a.tab_name)) return a.tab_name;
  return a.space_name && a.space_name !== "~" ? a.space_name : "Wanderer";
}

export const VIEWS = [
  { id: "world", label: "WORLD", key: "⌘⌥1" },
  { id: "roster", label: "PARTY", key: "⌘⌥2" },
  { id: "combat", label: "BATTLE", key: "⌘⌥3" },
];

export const KEYS_HELP = "⌘E view · ⌘⌥1 World · ⌘⌥2 Party · ⌘⌥3 Battle · ⌘/ manual · ⌘⇧L other layout";

/** Plays one of FINAL HERDR's chiptune sounds (mods/fh-hud/sounds, made by art/sounds.py). */
export function sfx(name) {
  try { playSound(`mods/fh-hud/sounds/${name}.mp3`); } catch {}
}

// ---- progression (written by fh-hud's engine, read by everyone)

export const SAVE_KEY = "fh.save";

export const XP = {
  perSecond: 1,
  quest: 50,
  clean: 25,
  /** XP from level L to L+1. */
  need: (level) => Math.round(100 * Math.pow(level, 1.5)),
};

export const ACHIEVEMENTS = [
  { id: "premiere", name: "First Quest", desc: "Complete a quest" },
  { id: "veteran", name: "Veteran", desc: "Complete 10 quests" },
  { id: "legende", name: "Legend", desc: "Complete 100 quests" },
  { id: "propre", name: "Not a Scratch", desc: "Complete 10 quests without getting stuck" },
  { id: "trio", name: "Party of Three", desc: "3 heroes in battle at once" },
  { id: "armee", name: "Army", desc: "5 heroes in battle at once" },
  { id: "nuit", name: "All-Nighter", desc: "A hero in battle between midnight and 5 AM" },
  { id: "marathon", name: "Marathon", desc: "A quest lasting over 30 minutes" },
  { id: "polyvalent", name: "Jack of All Trades", desc: "XP in 3 different classes" },
  { id: "explorateur", name: "Explorer", desc: "5 zones on the map" },
  { id: "maitre", name: "Master", desc: "A class reaches level 10" },
];

// Class names in saves made by the French version, by English name.
const LEGACY = { Engineer: "Ingénieur", Archmage: "Archimage", Alchemist: "Alchimiste", Thief: "Voleur", Bard: "Barde", Villager: "Villageois" };

/** A fresh copy of the save (safe to change, then setShared). */
export function loadSave() {
  const s = shared(SAVE_KEY);
  const base = { v: 1, classes: {}, gold: 0, clean: 0, ach: {}, log: [] };
  const save = s && typeof s === "object" ? { ...base, ...JSON.parse(JSON.stringify(s)) } : base;
  for (const [en, fr] of Object.entries(LEGACY)) {
    if (save.classes[fr] && !save.classes[en]) { save.classes[en] = save.classes[fr]; delete save.classes[fr]; }
  }
  return save;
}

/** Level from total XP: { level, into, need }. */
export function levelOf(xp) {
  let level = 1, left = Math.max(0, Math.floor(xp ?? 0));
  while (left >= XP.need(level)) { left -= XP.need(level); level++; }
  return { level, into: left, need: XP.need(level) };
}

/** A class's progress from the save: { xp, quests, level, into, need }. */
export function classStats(save, name) {
  const c = save?.classes?.[name] ?? save?.classes?.[LEGACY[name]] ?? { xp: 0, quests: 0 };
  return { xp: c.xp ?? 0, quests: c.quests ?? 0, ...levelOf(c.xp) };
}

/** "3 min ago" */
export function ago(t, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}
