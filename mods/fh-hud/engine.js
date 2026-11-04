// FINAL HERDR's progression engine, run by fh-hud (one copy, always shown).
// Watches agents' statuses: XP per second in combat, quests won (working or
// blocked -> done/idle), blocks, level-ups and achievements. Writes the save
// to shared("fh.save") on events, and at most every 30 s for combat time.
import { agents, spaces, shared, setShared, openOverlay } from "herdr";
import { classOf, heroName, levelOf, loadSave, SAVE_KEY, XP, ACHIEVEMENTS, sfx, CLASSES } from "./kit.js";

// One sound per tick, the most important one.
const SOUND_RANK = { victory: 2, achievement: 1 };

const FLUSH_MS = 30000;
const LOG_MAX = 40;
const MARATHON_MS = 30 * 60 * 1000;

export class Engine {
  constructor() {
    this.prev = new Map();    // address -> last status seen
    this.quests = new Map();  // address -> { start, blocked }
    this.pending = {};        // class name -> combat seconds not saved yet
    this.last = Date.now();
    this.lastFlush = Date.now();
    this.primed = false;
    this.save = null;         // a working copy while a tick changes things
    this.sound = null;
    this.levelUp = null;      // { who, cls, level, bonus }: shown at the end of the tick
  }

  play(name) {
    if (!this.sound || SOUND_RANK[name] > SOUND_RANK[this.sound]) this.sound = name;
  }

  edit() { return this.save ??= loadSave(); }

  log(kind, text) {
    const s = this.edit();
    s.log = [{ t: Date.now(), kind, text }, ...(s.log ?? [])].slice(0, LOG_MAX);
  }

  unlock(id) {
    const done = (this.save ?? shared(SAVE_KEY))?.ach?.[id];
    if (done) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    this.edit().ach[id] = Date.now();
    this.log("ach", `Achievement unlocked: ${a.name}!`);
    this.play("achievement");
  }

  /** Adds XP to a class, logging a level-up. */
  gain(name, xp, who) {
    const s = this.edit();
    const c = s.classes[name] ??= { xp: 0, quests: 0 };
    const before = levelOf(c.xp).level;
    c.xp = (c.xp ?? 0) + xp;
    const after = levelOf(c.xp).level;
    if (after > before) {
      this.log("level", `${who ?? name} reached level ${after}!`);
      this.levelUp = { who: who ?? name, cls: name, level: after, bonus: null };
    }
    if (after >= 10) this.unlock("maitre");
    return { before, after };
  }

  flushPending() {
    for (const [name, sec] of Object.entries(this.pending)) {
      const xp = Math.floor(sec * XP.perSecond);
      if (xp <= 0) continue;
      this.gain(name, xp, `The ${name} class`);
      this.pending[name] = sec - xp / XP.perSecond;
    }
    this.lastFlush = Date.now();
  }

  win(a, cls) {
    const q = this.quests.get(a.address);
    const clean = q && !q.blocked;
    const who = heroName(a);
    // Combat time first, so the level shown includes it.
    if (this.pending[cls.name] >= 1) {
      const xp = Math.floor(this.pending[cls.name] * XP.perSecond);
      this.gain(cls.name, xp, who);
      this.pending[cls.name] -= xp / XP.perSecond;
    }
    const bonus = XP.quest + (clean ? XP.clean : 0);
    const { before, after } = this.gain(cls.name, bonus, who);
    const s = this.edit();
    s.classes[cls.name].quests = (s.classes[cls.name].quests ?? 0) + 1;
    s.gold = (s.gold ?? 0) + 1;
    if (clean) s.clean = (s.clean ?? 0) + 1;
    this.log("done", `${who} completed a quest! +${bonus} XP${clean ? " (flawless)" : ""}`);
    if (q && Date.now() - q.start >= MARATHON_MS) this.unlock("marathon");
    if (s.gold >= 1) this.unlock("premiere");
    if (s.gold >= 10) this.unlock("veteran");
    if (s.gold >= 100) this.unlock("legende");
    if (s.clean >= 10) this.unlock("propre");
    this.quests.delete(a.address);
    if (after > before) this.levelUp = { who, cls: cls.name, level: after, bonus, clean };
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(10, (now - this.last) / 1000);
    this.last = now;
    const list = agents();
    const seen = new Set();

    for (const a of list) {
      seen.add(a.address);
      const cls = classOf(a.program, a.app);
      const before = this.prev.get(a.address);
      this.prev.set(a.address, a.status);
      if (a.status === "working") {
        this.pending[cls.name] = (this.pending[cls.name] ?? 0) + dt;
        if (!this.quests.has(a.address)) this.quests.set(a.address, { start: now, blocked: false });
      }
      if (!this.primed || before === undefined || before === a.status) continue;

      const who = heroName(a);
      if (a.status === "blocked") {
        const q = this.quests.get(a.address) ?? { start: now, blocked: false };
        q.blocked = true;
        this.quests.set(a.address, q);
        this.log("blocked", `${who} calls for help!`);
      } else if (before === "blocked" && a.status === "working") {
        this.log("info", `${who} returns to battle.`);
      } else if ((before === "working" || before === "blocked") && (a.status === "done" || a.status === "idle")) {
        this.win(a, cls);
      }
    }
    for (const addr of [...this.prev.keys()]) if (!seen.has(addr)) { this.prev.delete(addr); this.quests.delete(addr); }
    this.primed = true;

    const fighting = list.filter((a) => a.status === "working").length;
    if (fighting >= 3) this.unlock("trio");
    if (fighting >= 5) this.unlock("armee");
    if (fighting > 0 && new Date().getHours() < 5) this.unlock("nuit");
    if (spaces().length >= 5) this.unlock("explorateur");

    if (this.save || now - this.lastFlush >= FLUSH_MS) {
      this.flushPending();
      const s = this.save;
      if (s && Object.values(s.classes).filter((c) => c.xp > 0).length >= 3) this.unlock("polyvalent");
    }
    if (this.save) {
      setShared(SAVE_KEY, this.save);
      this.save = null;
    }
    // Only a level-up gets the window and the fanfare; a plain quest win stays quiet.
    if (this.levelUp) {
      const l = this.levelUp;
      this.levelUp = null;
      this.play("victory");
      const art = CLASSES.find((c) => c.name === l.cls)?.art ?? "villageois";
      openOverlay({
        mod: "fh-victory", kind: "window", key: "fh-victory", frame: "none", width: 380, height: 168,
        props: { name: l.who, cls: l.cls, art, bonus: l.bonus, clean: l.clean, level: l.level },
      });
    }
    if (this.sound) { sfx(this.sound); this.sound = null; }
  }
}
