/* JKL Cartridge Webapp
 * Copyright (C) 2023 Sebastian Quilitz
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* A self-running skirmish that decorates the cartridge label. Ornamental only:
 * aria-hidden, no pointer events, one interval cleaned up on unmount, and the
 * loop never starts when the user asks for reduced motion.
 *
 * Positions are percentages across the field, so everything scales with the
 * label rather than being pinned to pixels.
 */

import React from "react";
import Scenery, { sceneAt } from "./Scenery";

const TICK_MS = 165;

// Comfortably above the sturdiest monster, so a bad wave wears the hero down
// rather than finishing him.
export const HERO_MAX_HP = 60;
export const HERO_MAX_MP = 12;
export const HERO_DEFENCE = 1;

const HERO_SPEED = 1.5;
const HERO_REACH = 9;
const HERO_COOLDOWN = 5;
const CAST_TICKS = 4;
const CAST_CHANCE = 0.55;
const MP_REGEN_TICKS = 26;
const CHEST_CHANCE = 0.45;
const LOW_HP = 0.4;
const REST_RANGE = 24;
export const HP_REGEN_TICKS = 16;
const EFFECT_LIFE = 5;
// Timed against the scene cross-fade in App.css so the hero dims out of the old
// land and brightens into the new one alongside it, rather than snapping across.
// Far enough past the edges that the label's clipping hides him entirely, so
// the scene can be swapped without anything being seen to jump.
const EXIT_X = 116;
const ENTER_X = -16;
export const WAVES_MIN = 2;
export const WAVES_MAX = 5;
const WAVE_PAUSE = 16;
const WANDER_PAUSE = [8, 26];

const FIELD_MIN = 4;
const FIELD_MAX = 94;
const PICKUP_RANGE = 5;
const DROP_CHANCE = 0.55;
const FLOAT_LIFE = 9;
const HURT_TICKS = 3;
const ATTACK_TICKS = 3;
const DEATH_TICKS = 5;
const SPAWN_CLEARANCE = 15;
const SPAWN_SPACING = 8;

// move drives which idle animation the sprite gets: hoppers bounce, fliers
// flap, floaters drift, walkers take steps.
export const MONSTERS = [
  { kind: "slime", color: "#6ddf8e", maxHp: 10, dmg: [1, 3], speed: 0.75, reach: 7, cd: 7, move: "hop" },
  { kind: "bat", color: "#b48ce0", maxHp: 8, dmg: [2, 4], speed: 1.7, reach: 7, cd: 5, move: "fly" },
  { kind: "ghost", color: "#8fd7ff", maxHp: 13, dmg: [1, 4], speed: 1.0, reach: 8, cd: 6, move: "float" },
  { kind: "imp", color: "#ff9b6b", maxHp: 16, dmg: [3, 6], speed: 1.2, reach: 7, cd: 8, move: "walk" },
  { kind: "skeleton", color: "#e8e4d9", maxHp: 14, dmg: [2, 5], speed: 0.95, reach: 8, cd: 7, move: "walk" },
  { kind: "mushroom", color: "#ff7f9e", maxHp: 12, dmg: [2, 4], speed: 0.6, reach: 6, cd: 9, move: "hop" },
  { kind: "spider", color: "#a78bd6", maxHp: 9, dmg: [1, 5], speed: 1.6, reach: 6, cd: 5, move: "walk" },
];

// Shed by monsters. Chests never contain these.
// Rare, slow, and far sturdier than anything else on the field. A boss arrives
// alone rather than as part of a wave.
export const BOSSES = [
  { kind: "dragon", color: "#c9452f", maxHp: 120, dmg: [7, 12], speed: 0.55, reach: 12, cd: 9, move: "fly", boss: true },
  { kind: "lich", color: "#a98cff", maxHp: 95, dmg: [6, 14], speed: 0.7, reach: 11, cd: 8, move: "float", boss: true },
  { kind: "golem", color: "#8d9a86", maxHp: 150, dmg: [9, 15], speed: 0.4, reach: 10, cd: 11, move: "walk", boss: true },
];

export const BOSS_CHANCE = 0.12;

const DROPS = [
  { kind: "potion", label: "+HP", color: "#ff6b8a" },
  { kind: "mana", label: "+MP", color: "#6bb6ff" },
  { kind: "coin", label: "GOLD", color: "#ffd76b" },
];

let nextId = 0;
function id() {
  nextId += 1;
  return nextId;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function rollBetween([lo, hi]) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// One to three at a time, anywhere on the field and on either side of the hero,
// but never right on top of him or on each other.
export function rollWaveCount() {
  return WAVES_MIN + Math.floor(Math.random() * (WAVES_MAX - WAVES_MIN + 1));
}

export function spawnWave(heroX = 16) {
  if (Math.random() < BOSS_CHANCE) {
    const def = pick(BOSSES);
    const x = heroX > (FIELD_MIN + FIELD_MAX) / 2 ? FIELD_MIN + 6 : FIELD_MAX - 6;
    return [{
      ...def,
      id: id(),
      hp: def.maxHp,
      x,
      face: heroX >= x ? 1 : -1,
      state: "walk",
      timer: 0,
      cooldown: 4,
      slot: 0,
      dead: false,
    }];
  }

  const count = 1 + Math.floor(Math.random() * 3);
  const wave = [];

  for (let i = 0; i < count; i++) {
    const def = pick(MONSTERS);

    // Positions are chosen from the set that already satisfies the spacing,
    // rather than by guessing and hoping. Rejection sampling with a retry cap
    // only made the clearance likely, which showed up as an occasional monster
    // materialising on top of the hero.
    const candidates = [];
    for (let candidate = FIELD_MIN; candidate <= FIELD_MAX; candidate += 2) {
      const clearOfHero = Math.abs(candidate - heroX) >= SPAWN_CLEARANCE;
      const clearOfKin = wave.every((m) => Math.abs(m.x - candidate) >= SPAWN_SPACING);
      if (clearOfHero && clearOfKin) {
        candidates.push(candidate);
      }
    }

    // Only reachable if the field is impossibly crowded; stand as far off as
    // the ground allows.
    const x = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : (heroX > (FIELD_MIN + FIELD_MAX) / 2 ? FIELD_MIN : FIELD_MAX);

    wave.push({
      ...def,
      id: id(),
      hp: def.maxHp,
      x,
      face: heroX >= x ? 1 : -1,
      state: "walk",
      timer: 0,
      cooldown: Math.floor(Math.random() * 4),
      slot: i,
      dead: false,
    });
  }

  return wave;
}


// Cost is a fraction of the full mana pool, so the three tiers are a third, two
// thirds and the lot. The strongest is also the only one that catches every
// monster on the field.
export const POWERS = [
  { key: "spark", name: "SPARK", tier: 1, dmg: [7, 11], color: "#8fd7ff", aoe: false, base: true },
  { key: "frost", name: "FROST", tier: 1, dmg: [10, 14], color: "#bfe9ff", aoe: false, base: false },
  { key: "flame", name: "FLAME", tier: 2, dmg: [14, 19], color: "#ffb36b", aoe: false, base: true },
  { key: "quake", name: "QUAKE", tier: 2, dmg: [17, 23], color: "#d9a066", aoe: true, base: false },
  { key: "nova", name: "NOVA", tier: 3, dmg: [22, 30], color: "#ff6bd6", aoe: true, base: true },
  { key: "judge", name: "JUDGEMENT", tier: 3, dmg: [30, 40], color: "#fff0a8", aoe: true, base: false },
].map((p) => ({ ...p, fraction: p.tier / 3, cost: Math.round((p.tier / 3) * HERO_MAX_MP) }));

// He sets out knowing one spell; the rest are found as books.
export const BASE_POWERS = ["flame"];

// Ten ordinary trophies, shed by monsters alongside gold and potions.
export const COMMON_ITEMS = [
  { key: "bone", name: "BONE", type: "trophy", color: "#e8e4d9" },
  { key: "fang", name: "FANG", type: "trophy", color: "#fff5f8" },
  { key: "ember", name: "EMBER", type: "trophy", color: "#ff9b6b" },
  { key: "silk", name: "SILK", type: "trophy", color: "#d9cfe8" },
  { key: "shard", name: "SHARD", type: "trophy", color: "#8fd7ff" },
  { key: "husk", name: "HUSK", type: "trophy", color: "#c9b48c" },
  { key: "feather", name: "FEATHER", type: "trophy", color: "#eef2ff" },
  { key: "claw", name: "CLAW", type: "trophy", color: "#b48ce0" },
  { key: "scale", name: "SCALE", type: "trophy", color: "#6ddf8e" },
  { key: "cinder", name: "CINDER", type: "trophy", color: "#ff7f9e" },
];

// Ten that only ever come out of a chest: three spellbooks, three weapons and
// four relics that raise a stat for good.
// Six slots. He starts in nothing but clothes with a worn sword, so every piece
// found is a visible change.
export const SLOTS = ["weapon", "shield", "top", "legs", "boots", "gloves"];

export const STARTER_WEAPON = {
  key: "worn-sword", name: "WORN SWORD", type: "weapon",
  tier: 0, power: 0, element: null, color: "#b9c2de",
};

export const SPECIAL_ITEMS = [
  // --- weapons, three of them elemental ---
  { key: "iron-sword", name: "IRON SWORD", type: "weapon", tier: 1, power: 2, element: null, color: "#c9cfdd" },
  { key: "keen-blade", name: "KEEN BLADE", type: "weapon", tier: 2, power: 3, element: null, color: "#eef2ff" },
  { key: "flame-sword", name: "FLAME SWORD", type: "weapon", tier: 3, power: 5, element: "flame", color: "#ff9b4a" },
  { key: "frost-sword", name: "FROST BRAND", type: "weapon", tier: 4, power: 6, element: "frost", color: "#8fd7ff" },
  { key: "storm-sword", name: "STORM EDGE", type: "weapon", tier: 5, power: 7, element: "storm", color: "#d7b3ff" },
  { key: "greatsword", name: "GREATSWORD", type: "weapon", tier: 6, power: 9, element: "holy", color: "#ffd76b" },

  // --- shields ---
  { key: "buckler", name: "BUCKLER", type: "shield", tier: 1, defence: 1, color: "#c9962b" },
  { key: "kite", name: "KITE SHIELD", type: "shield", tier: 2, defence: 2, color: "#cfd6e6" },
  { key: "tower", name: "TOWER SHIELD", type: "shield", tier: 3, defence: 3, maxHp: 8, color: "#ffd76b" },

  // --- body ---
  { key: "top-leather", name: "LEATHER JERKIN", type: "top", tier: 1, defence: 1, maxHp: 6, color: "#a9713f" },
  { key: "top-chain", name: "CHAIN HAUBERK", type: "top", tier: 2, defence: 2, maxHp: 12, color: "#9aa8c4" },
  { key: "top-plate", name: "PLATE CUIRASS", type: "top", tier: 3, defence: 3, maxHp: 20, color: "#eef2ff" },

  // --- legs ---
  { key: "legs-leather", name: "LEATHER CHAPS", type: "legs", tier: 1, defence: 1, maxHp: 4, color: "#8a5f34" },
  { key: "legs-chain", name: "CHAIN LEGGINGS", type: "legs", tier: 2, defence: 1, maxHp: 8, color: "#8d99b5" },
  { key: "legs-plate", name: "PLATE GREAVES", type: "legs", tier: 3, defence: 2, maxHp: 12, color: "#dfe6f5" },

  // --- boots ---
  { key: "boots-leather", name: "TRAVEL BOOTS", type: "boots", tier: 1, defence: 0, speed: 0.25, color: "#8a5f34" },
  { key: "boots-chain", name: "MAIL BOOTS", type: "boots", tier: 2, defence: 1, speed: 0.15, color: "#8d99b5" },
  { key: "boots-plate", name: "STEEL SABATONS", type: "boots", tier: 3, defence: 2, maxHp: 4, color: "#dfe6f5" },

  // --- gloves ---
  { key: "gloves-leather", name: "LEATHER GLOVES", type: "gloves", tier: 1, defence: 0, power: 1, color: "#a9713f" },
  { key: "gloves-chain", name: "MAIL GAUNTLETS", type: "gloves", tier: 2, defence: 1, power: 1, color: "#8d99b5" },
  { key: "gloves-plate", name: "PLATE GAUNTLETS", type: "gloves", tier: 3, defence: 1, power: 2, color: "#dfe6f5" },

  // --- spellbooks: he begins knowing flame only ---
  { key: "tome-spark", name: "TOME: SPARK", type: "spell", grants: "spark", color: "#8fd7ff" },
  { key: "tome-frost", name: "TOME: FROST", type: "spell", grants: "frost", color: "#bfe9ff" },
  { key: "tome-quake", name: "TOME: QUAKE", type: "spell", grants: "quake", color: "#d9a066" },
  { key: "tome-nova", name: "TOME: NOVA", type: "spell", grants: "nova", color: "#ff6bd6" },
  { key: "tome-judge", name: "TOME: JUDGEMENT", type: "spell", grants: "judge", color: "#fff0a8" },
];

export const MAX_LEVEL = 99;

export const ITEMS = COMMON_ITEMS.concat(SPECIAL_ITEMS);

// A chest holds one to three things and never gold or potions. A full chest of
// three always carries at least one special.
export function rollChestContents() {
  const count = 1 + Math.floor(Math.random() * 3);
  const contents = [];

  if (count === 3) {
    contents.push(pick(SPECIAL_ITEMS));
  }

  // Bounded: rejecting duplicates could otherwise spin forever if the draw keeps
  // returning the same thing, which is exactly what a fixed seed does.
  for (let attempt = 0; attempt < 40 && contents.length < count; attempt++) {
    const pool = Math.random() < 0.4 ? SPECIAL_ITEMS : COMMON_ITEMS;
    const candidate = pick(pool);
    if (!contents.some((c) => c.key === candidate.key)) {
      contents.push(candidate);
    }
  }

  return contents;
}

// The strongest of the spells the hero actually knows that he can currently
// afford. He does not cast every opening, so the sword still gets used.
export function choosePower(known, mp, roll = Math.random()) {
  const affordable = POWERS.filter((p) => known.indexOf(p.key) !== -1 && p.cost <= mp);
  if (affordable.length === 0 || roll > CAST_CHANCE) {
    return null;
  }
  return affordable.reduce((best, p) => {
    if (p.cost !== best.cost) {
      return p.cost > best.cost ? p : best;
    }
    return p.dmg[1] > best.dmg[1] ? p : best;
  });
}

// Applies one pickup. Returns the changed hero; floats are pushed onto the list
// it is handed.
export function applyPickup(hero, entry, push) {
  const next = { ...hero, bag: hero.bag.concat(entry.key || entry.kind) };

  if (entry.kind === "potion" || entry.kind === "mana") {
    const full = entry.kind === "potion" ? next.hp >= next.maxHp : next.mp >= next.maxMp;

    if (full) {
      // No use for it now, so it goes in the pack for later.
      next.inventory = next.inventory.concat(entry);
      push(entry.label + " KEPT", entry.color);
      return next;
    }

    if (entry.kind === "potion") {
      next.hp = Math.min(next.maxHp, next.hp + 8);
    } else {
      next.mp = Math.min(next.maxMp, next.mp + 5);
    }
    push(entry.label, entry.color);
    return next;
  }

  if (entry.type === "spell") {
    if (next.powers.indexOf(entry.grants) === -1) {
      next.powers = next.powers.concat(entry.grants);
      push(entry.name, entry.color);
    } else {
      // A spell he already knows is a spare book rather than nothing.
      next.inventory = next.inventory.concat(entry);
      push("SPARE TOME", entry.color);
    }
    return next;
  }

  if (SLOTS.indexOf(entry.type) !== -1) {
    return equip(next, entry, push);
  }

  push(entry.name || entry.label, entry.color);
  return next;
}

// Wears the piece if it beats what is in that slot, keeping whatever it
// replaces. Anything weaker is kept too, so nothing found is thrown away.
export function equip(hero, entry, push = () => {}) {
  const next = { ...hero, gear: { ...hero.gear } };
  const worn = next.gear[entry.type];

  if (worn && worn.tier >= entry.tier) {
    next.inventory = next.inventory.concat(entry);
    push("SPARE " + entry.type.toUpperCase(), entry.color);
    return next;
  }

  next.gear[entry.type] = entry;
  next.inventory = worn
    ? next.inventory.filter((i) => i !== entry).concat(worn)
    : next.inventory.filter((i) => i !== entry);

  push(entry.name, entry.color);
  return recalc(next);
}

// Stats are derived from what is worn, so taking a piece off cannot leave a
// bonus behind.
export function recalc(hero) {
  const next = { ...hero };
  const worn = SLOTS.map((slot) => next.gear[slot]).filter(Boolean);

  const sum = (field) => worn.reduce((total, piece) => total + (piece[field] || 0), 0);

  next.weapon = sum("power");
  next.defence = HERO_DEFENCE + sum("defence");
  next.speed = HERO_SPEED + sum("speed");
  next.maxHp = HERO_MAX_HP + sum("maxHp") + (next.level - 1) * LEVEL_HP;
  next.hp = Math.min(next.hp, next.maxHp);
  next.element = next.gear.weapon ? next.gear.weapon.element : null;

  return next;
}

// Anything in the pack that beats what is worn is put on. This is what lets a
// better blade found while a fight is on be drawn once there is a moment.
export function reequip(hero) {
  let next = hero;

  for (const slot of SLOTS) {
    const best = next.inventory
      .filter((i) => i.type === slot)
      .reduce((top, i) => (!top || i.tier > top.tier ? i : top), null);

    const worn = next.gear[slot];
    if (best && (!worn || best.tier > worn.tier)) {
      next = { ...next, inventory: next.inventory.filter((i) => i !== best) };
      next = equip(next, best);
    }
  }

  return next;
}

export function initialState() {
  return {
    tick: 0,
    hero: {
      x: 16,
      hp: HERO_MAX_HP,
      maxHp: HERO_MAX_HP,
      mp: HERO_MAX_MP,
      maxMp: HERO_MAX_MP,
      defence: HERO_DEFENCE,
      speed: HERO_SPEED,
      weapon: 0,
      level: 1,
      xp: 0,
      gear: { weapon: STARTER_WEAPON, shield: null, top: null, legs: null, boots: null, gloves: null },
      inventory: [],
      powers: BASE_POWERS.slice(),
      bag: [],
      face: 1,
      state: "idle",
      timer: 0,
      cooldown: 0,
      mpTimer: 0,
      wanderTo: null,
      wanderTimer: 0,
      spell: null,
      dead: false,
      respawn: 0,
    },
    monsters: spawnWave(16),
    drops: [],
    floats: [],
    effects: [],
    waveGap: 0,
    journey: 0,
    travelling: false,
    wavesLeft: rollWaveCount() - 1,
  };
}

const FLOAT_LANES = 4;

// Anything landing on the same tick is given its own lane, so a chest handing
// over three items prints three readable lines rather than one smear.
function addFloat(floats, tick, text, color, x) {
  const sameTick = floats.filter((f) => f.born === tick).length;
  return floats.concat({
    id: id(),
    born: tick,
    text,
    color,
    x,
    lane: sameTick % FLOAT_LANES,
  });
}

function addEffect(effects, tick, key, x) {
  return effects.concat({ id: id(), born: tick, key, x });
}

export const XP_PER_LEVEL = 40;
export const LEVEL_HP = 6;

// Levelling is deliberately gentle: a little more health and a little more bite
// each time, so a long run gets easier without trivialising the monsters.
export function gainXp(hero, amount) {
  const next = { ...hero, xp: hero.xp + amount };

  while (next.level < MAX_LEVEL && next.xp >= next.level * XP_PER_LEVEL) {
    next.xp -= next.level * XP_PER_LEVEL;
    next.level += 1;
    next.maxHp += LEVEL_HP;
    next.hp = next.maxHp;
  }

  if (next.level >= MAX_LEVEL) {
    next.level = MAX_LEVEL;
    next.xp = 0;
  }

  return next;
}

function advance(unit) {
  const next = { ...unit };
  next.cooldown = Math.max(0, next.cooldown - 1);

  if (next.state === "attack" || next.state === "cast" || next.state === "hurt") {
    next.timer -= 1;
    if (next.timer <= 0) {
      next.state = "idle";
    }
  }

  return next;
}

// One frame of the skirmish. Pure, so the component only renders the result and
// the whole thing is testable without timers.
export function step(prev) {
  const tick = prev.tick + 1;
  let floats = prev.floats.filter((f) => tick - f.born < FLOAT_LIFE);
  let effects = (prev.effects || []).filter((e) => tick - e.born < EFFECT_LIFE);
  let drops = prev.drops;
  let waveGap = prev.waveGap;
  let journey = prev.journey || 0;
  let travelling = prev.travelling || false;
  let wavesLeft = prev.wavesLeft === undefined ? 0 : prev.wavesLeft;

  let hero = advance(prev.hero);
  let monsters = prev.monsters.map(advance);

  hero.mpTimer = (hero.mpTimer || 0) + 1;
  if (hero.mpTimer >= MP_REGEN_TICKS) {
    hero.mpTimer = 0;
    hero.mp = Math.min(hero.maxMp, hero.mp + 1);
  }

  const threat = prev.monsters
    .filter((m) => !m.dead)
    .reduce((closest, m) => Math.min(closest, Math.abs(m.x - hero.x)), Infinity);

  hero.hpTimer = (hero.hpTimer || 0) + 1;
  if (hero.hpTimer >= HP_REGEN_TICKS) {
    hero.hpTimer = 0;
    if (threat > REST_RANGE) {
      hero.hp = Math.min(hero.maxHp, hero.hp + 1);
    }
  }

  if (hero.dead) {
    hero.respawn -= 1;
    if (hero.respawn > 0) {
      return { ...prev, tick, floats, effects, hero, monsters };
    }

    floats = addFloat(floats, tick, "REVIVE", "#8affc1", 16);
    return {
      tick,
      floats,
      effects,
      drops: [],
      waveGap: 0,
      journey,
      travelling: false,
      wavesLeft: rollWaveCount() - 1,
      hero: {
        ...hero,
        x: 16,
        hp: hero.maxHp,
        mp: hero.maxMp,
        dead: false,
        state: "idle",
        respawn: 0,
      },
      monsters: spawnWave(16),
    };
  }

  // Corpses linger a moment, then leave loot behind.
  const survivors = [];
  for (const m of monsters) {
    if (!m.dead) {
      survivors.push(m);
      continue;
    }
    if (m.timer > 1) {
      survivors.push({ ...m, timer: m.timer - 1 });
      continue;
    }
    if (m.boss) {
      // A boss always leaves a chest, and a generous one.
      drops = drops.concat({
        kind: "chest", name: "HOARD", color: "#ffd76b",
        id: id(), x: m.x, born: tick,
        contents: rollChestContents().concat(pick(SPECIAL_ITEMS)),
      });
    } else if (Math.random() < DROP_CHANCE) {
      const loot = Math.random() < 0.4
        ? { ...pick(COMMON_ITEMS), kind: "item" }
        : { ...pick(DROPS) };
      drops = drops.concat({ ...loot, id: id(), x: m.x, born: tick });
    }
  }
  monsters = survivors;

  const living = monsters.filter((m) => !m.dead);

  if (living.length === 0) {
    waveGap += 1;
    if (waveGap === 1 && Math.random() < CHEST_CHANCE) {
      drops = drops.concat({
        kind: "chest",
        name: "CHEST",
        color: "#ffd76b",
        id: id(),
        x: clamp(FIELD_MIN + Math.random() * (FIELD_MAX - FIELD_MIN), FIELD_MIN, FIELD_MAX),
        born: tick,
        contents: rollChestContents(),
      });
    }
    if (drops.length === 0 && waveGap >= WAVE_PAUSE) {
      if (wavesLeft > 0) {
        // The scene has more to throw at him, so he stays put.
        monsters = monsters.concat(spawnWave(hero.x));
        wavesLeft -= 1;
        waveGap = 0;
      } else {
        travelling = true;
      }
    }
  } else {
    waveGap = 0;
    travelling = false;
    hero.wanderTo = null;
    hero.wanderTimer = 0;
  }

  // Travel keeps him on his feet the whole way: he walks off the right of the
  // frame, and the moment he is out of sight the land changes and he walks back
  // in from the left. No fading, and nothing visibly teleports.
  if (travelling && !hero.dead) {
    hero.state = "walk";
    hero.face = 1;
    hero.x += hero.speed * 1.5;

    if (hero.x >= EXIT_X) {
      journey += 1;
      hero.x = ENTER_X;
      // The left property is eased, which would drag him back across the frame
      // in view. This marks the one frame that must not animate.
      hero.warp = tick;
      monsters = spawnWave(FIELD_MIN + 20);
      wavesLeft = rollWaveCount() - 1;
      const arrival = sceneAt(journey);
      floats = addFloat(
        floats,
        tick,
        arrival.biome.toUpperCase() + " " + arrival.phase.toUpperCase(),
        "#ffd76b",
        FIELD_MIN + 8
      );
    }

    if (hero.x >= FIELD_MIN && journey !== prev.journey) {
      travelling = false;
      waveGap = 0;
    }

    return { tick, hero, monsters, drops, floats, effects, waveGap, journey, travelling, wavesLeft };
  }

  // Hero: fetch loot when the field allows it, otherwise close on the nearest
  // monster and swing when in reach.
  if (hero.state !== "attack" && hero.state !== "cast" && hero.state !== "hurt") {
    const target = living
      .slice()
      .sort((a, b) => Math.abs(a.x - hero.x) - Math.abs(b.x - hero.x))[0];

    const nearest = (list) =>
      list.slice().sort((a, b) => Math.abs(a.x - hero.x) - Math.abs(b.x - hero.x))[0];

    const loot = nearest(drops);
    const hurt = hero.hp <= hero.maxHp * LOW_HP;

    // A potion in the pack is drunk before going looking for one on the ground.
    if (hurt) {
      const kept = hero.inventory.find((i) => i.kind === "potion");
      if (kept) {
        hero = {
          ...hero,
          hp: Math.min(hero.maxHp, hero.hp + 8),
          inventory: hero.inventory.filter((i) => i !== kept),
        };
        floats = addFloat(floats, tick, "+HP", "#ff6b8a", hero.x);
      }
    }

    const potion = hurt ? nearest(drops.filter((d) => d.kind === "potion")) : null;

    // Loot is worth a detour when nothing is in his face: either the field is
    // clear or the nearest thing on the ground is closer than the nearest
    // monster. When badly hurt, a potion outranks all of that.
    const goForLoot = loot && (!target || Math.abs(loot.x - hero.x) < Math.abs(target.x - hero.x));
    const errand = potion || (goForLoot ? loot : null);

    if (errand && Math.abs(errand.x - hero.x) > PICKUP_RANGE - 1) {
      const gap = errand.x - hero.x;
      hero.face = gap >= 0 ? 1 : -1;
      hero.state = "walk";
      hero.x = clamp(hero.x + Math.sign(gap) * hero.speed, FIELD_MIN, FIELD_MAX);
    } else if (hurt && !potion && target && Math.abs(target.x - hero.x) <= HERO_REACH + 5) {
      // Nothing to drink and badly hurt, so give ground rather than trade blows.
      // He keeps facing the monster while backing away.
      const away = Math.sign(hero.x - target.x) || 1;
      hero.face = target.x >= hero.x ? 1 : -1;
      hero.state = "walk";
      hero.x = clamp(hero.x + away * hero.speed, FIELD_MIN, FIELD_MAX);
    } else if (target) {
      const gap = target.x - hero.x;
      hero.face = gap >= 0 ? 1 : -1;

      if (Math.abs(gap) <= HERO_REACH) {
        if (hero.cooldown === 0) {
          const power = choosePower(hero.powers, hero.mp);

          if (power) {
            const struck = power.aoe ? living : [target];
            const hits = new Set(struck.map((m) => m.id));

            hero.mp -= power.cost;
            hero.state = "cast";
            hero.timer = CAST_TICKS;
            hero.cooldown = HERO_COOLDOWN + 2;
            hero.spell = power.key;

            let earned = 0;
            monsters = monsters.map((m) => {
              if (!hits.has(m.id) || m.dead) {
                return m;
              }
              const damage = rollBetween(power.dmg);
              const hp = m.hp - damage;
              effects = addEffect(effects, tick, power.key, m.x);
              floats = addFloat(floats, tick, String(damage), power.color, m.x);
              if (hp <= 0) {
                earned += m.maxHp;
                return { ...m, hp: 0, dead: true, state: "dead", timer: DEATH_TICKS };
              }
              return { ...m, hp, state: "hurt", timer: HURT_TICKS };
            });

            if (earned > 0) {
              const before = hero.level;
              hero = gainXp(hero, earned);
              if (hero.level > before) {
                floats = addFloat(floats, tick, "LEVEL " + hero.level, "#8affc1", hero.x);
              }
            }

            floats = addFloat(floats, tick, power.name, power.color, hero.x);
          } else {
            const crit = Math.random() < 0.18;
            const damage = rollBetween([3, 6]) + hero.weapon + (crit ? 5 : 0);

            hero.state = "attack";
            hero.timer = ATTACK_TICKS;
            hero.cooldown = HERO_COOLDOWN;
            hero.spell = null;

            let earned = 0;
            monsters = monsters.map((m) => {
              if (m.id !== target.id || m.dead) {
                return m;
              }
              const hp = m.hp - damage;
              if (hp <= 0) {
                earned += m.maxHp;
                return { ...m, hp: 0, dead: true, state: "dead", timer: DEATH_TICKS };
              }
              return { ...m, hp, state: "hurt", timer: HURT_TICKS };
            });

            if (earned > 0) {
              const before = hero.level;
              hero = gainXp(hero, earned);
              if (hero.level > before) {
                floats = addFloat(floats, tick, "LEVEL " + hero.level, "#8affc1", hero.x);
              }
            }

            floats = addFloat(
              floats,
              tick,
              crit ? damage + "!" : String(damage),
              crit ? "#ffd76b" : "#ffffff",
              target.x
            );
          }
        } else {
          hero.state = "idle";
        }
      } else {
        hero.state = "walk";
        hero.x = clamp(hero.x + Math.sign(gap) * hero.speed, FIELD_MIN, FIELD_MAX);
      }
    } else if (hero.wanderTimer > 0) {
      hero.wanderTimer -= 1;
      hero.state = "idle";
      if (hero.wanderTimer % 8 === 0) {
        hero = reequip(hero);
      }
    } else if (hero.wanderTo === null || Math.abs(hero.wanderTo - hero.x) < 2.5) {
      hero.wanderTo = FIELD_MIN + Math.random() * (FIELD_MAX - FIELD_MIN);
      hero.wanderTimer = WANDER_PAUSE[0] + Math.floor(Math.random() * (WANDER_PAUSE[1] - WANDER_PAUSE[0]));
      hero.state = "idle";
    } else {
      const stroll = hero.wanderTo - hero.x;
      hero.face = stroll >= 0 ? 1 : -1;
      hero.state = "walk";
      hero.x = clamp(hero.x + Math.sign(stroll) * hero.speed * 0.55, FIELD_MIN, FIELD_MAX);
    }
  }

  // Monsters: drawn toward the hero, striking when close enough.
  monsters = monsters.map((m) => {
    if (m.dead || m.state === "attack" || m.state === "hurt") {
      return m;
    }

    const next = { ...m };
    const gap = hero.x - next.x;
    next.face = gap >= 0 ? 1 : -1;

    // Each keeps its own standoff distance so a group fans out instead of
    // collapsing onto one spot.
    const standoff = next.reach + next.slot * 3;

    if (Math.abs(gap) <= standoff) {
      if (next.cooldown === 0 && Math.abs(gap) <= next.reach + 2) {
        const damage = Math.max(1, rollBetween(next.dmg) - hero.defence);
        next.state = "attack";
        next.timer = ATTACK_TICKS;
        next.cooldown = next.cd;

        hero.hp -= damage;
        hero.state = "hurt";
        hero.timer = HURT_TICKS;
        floats = addFloat(floats, tick, String(damage), "#ff8f8f", hero.x);

        if (hero.hp <= 0) {
          hero.hp = 0;
          hero.dead = true;
          hero.state = "dead";
          hero.respawn = 14;
          floats = addFloat(floats, tick, "K.O.", "#ff6b8a", hero.x);
        }
      } else {
        next.state = "idle";
      }
    } else {
      next.state = "walk";
      next.x = clamp(next.x + Math.sign(gap) * next.speed, FIELD_MIN, FIELD_MAX);
    }

    return next;
  });

  // Loot is collected by walking onto it; a chest bursts into everything it
  // holds at once.
  if (!hero.dead && drops.length) {
    const kept = [];
    // Collected into a list the loop only appends to, so the closure below does
    // not capture a variable being reassigned each pass.
    const announced = [];

    for (const d of drops) {
      if (Math.abs(d.x - hero.x) > PICKUP_RANGE) {
        kept.push(d);
        continue;
      }

      const push = (text, color) => announced.push({ text, color, x: d.x });

      if (d.kind === "chest") {
        push("CHEST", "#ffd76b");
        for (const entry of d.contents) {
          hero = applyPickup(hero, entry, push);
        }
      } else {
        hero = applyPickup(hero, d, push);
      }
    }

    for (const a of announced) {
      floats = addFloat(floats, tick, a.text, a.color, a.x);
    }

    drops = kept;
  }

  return { tick, hero, monsters, drops, floats, effects, waveGap, journey, travelling, wavesLeft };
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Palettes per slot tier. Tier 0 is the clothes he sets out in, so every piece
// found visibly replaces cloth with something better.
const TOP_COLOURS = [
  { base: "#8a6f4a", lit: "#a98a5e", dark: "#6b5436" },
  { base: "#a9713f", lit: "#c98f57", dark: "#7d5028" },
  { base: "#9aa8c4", lit: "#c3cde0", dark: "#6f7d99" },
  { base: "#dfe6f5", lit: "#ffffff", dark: "#a8b4cc" },
];

const LEG_COLOURS = ["#6b5a3e", "#8a5f34", "#8d99b5", "#dfe6f5"];
const BOOT_COLOURS = ["#5a4630", "#8a5f34", "#8d99b5", "#dfe6f5"];
const GLOVE_COLOURS = ["#c9a882", "#a9713f", "#8d99b5", "#dfe6f5"];

function tierOf(piece) {
  return piece ? piece.tier : 0;
}

function HeroSprite({ gear }) {
  const top = TOP_COLOURS[tierOf(gear.top)];
  const legs = LEG_COLOURS[tierOf(gear.legs)];
  const boots = BOOT_COLOURS[tierOf(gear.boots)];
  const glove = GLOVE_COLOURS[tierOf(gear.gloves)];
  const shieldTier = tierOf(gear.shield);
  const weapon = gear.weapon || STARTER_WEAPON;

  const blade = [
    { x: 19, w: 3, top: 3, body: "#b9c2de", edge: "#eef2ff" },
    { x: 19, w: 3, top: 2, body: "#c9cfdd", edge: "#f4f7ff" },
    { x: 19, w: 3, top: 1, body: "#eef2ff", edge: "#ffffff" },
    { x: 19, w: 3, top: 0, body: "#ff9b4a", edge: "#ffd76b" },
    { x: 19, w: 3, top: 0, body: "#8fd7ff", edge: "#e6f7ff" },
    { x: 18, w: 4, top: 0, body: "#d7b3ff", edge: "#f0e2ff" },
    { x: 18, w: 5, top: 0, body: "#e8dcae", edge: "#ffd76b" },
  ][Math.min(weapon.tier, 6)];

  return (
    <svg viewBox="0 0 26 32" shapeRendering="crispEdges">
      <g className="bs-hero-cape">
        <path fill="#8a2540" d="M6 12h5v15H6z" />
        <path fill="#b8324f" d="M7 12h4v14H7z" />
        <path fill="#d14a67" d="M8 13h2v11H8z" />
      </g>

      <g className="bs-hero-legs">
        <rect x="10" y="22" width="3" height="6" fill={legs} />
        <rect x="14" y="22" width="3" height="6" fill={legs} />
        <rect x="10" y="22" width="3" height="1" fill="#ffffff" opacity="0.18" />
        <rect x="9" y="28" width="5" height="3" fill={boots} />
        <rect x="14" y="28" width="5" height="3" fill={boots} />
        <rect x="9" y="28" width="5" height="1" fill="#ffffff" opacity="0.22" />
        <rect x="14" y="28" width="5" height="1" fill="#ffffff" opacity="0.22" />
        <rect x="9" y="31" width="5" height="1" fill="#3a2a1c" />
        <rect x="14" y="31" width="5" height="1" fill="#3a2a1c" />
      </g>

      <g className="bs-hero-body">
        <rect x="12" y="0" width="3" height="1" fill="#ffb3c8" />
        <rect x="12" y="1" width="3" height="2" fill="#ff6b8a" />
        <rect x="11" y="2" width="1" height="2" fill="#d1425f" />

        <rect x="9" y="3" width="8" height="1" fill="#eef2ff" />
        <rect x="8" y="4" width="10" height="6" fill="#cfd6e6" />
        <rect x="8" y="4" width="10" height="1" fill="#f6f9ff" />
        <rect x="8" y="9" width="10" height="1" fill="#9aa3bb" />
        <rect x="10" y="6" width="6" height="2" fill="#2b2340" />
        <rect x="11" y="6" width="1" height="1" fill="#8fd7ff" />
        <rect x="14" y="6" width="1" height="1" fill="#8fd7ff" />

        <rect x="10" y="10" width="6" height="1" fill="#9aa3bb" />
        <rect x="6" y="11" width="4" height="3" fill={top.lit} />
        <rect x="16" y="11" width="4" height="3" fill={top.lit} />

        <rect x="9" y="11" width="8" height="11" fill={top.base} />
        <rect x="9" y="11" width="8" height="1" fill={top.lit} />
        <rect x="9" y="16" width="8" height="1" fill={top.dark} />
        {tierOf(gear.top) >= 2 && (
          <g>
            <rect x="9" y="14" width="8" height="1" fill={top.dark} opacity="0.65" />
            <rect x="9" y="19" width="8" height="1" fill={top.dark} opacity="0.65" />
          </g>
        )}
        {tierOf(gear.top) === 3 && (
          <g>
            <rect x="9" y="12" width="1" height="10" fill="#ffd76b" />
            <rect x="16" y="12" width="1" height="10" fill="#ffd76b" />
          </g>
        )}
        <rect x="11" y="13" width="4" height="3" fill="#ffd76b" />
        <rect x="12" y="14" width="2" height="1" fill="#c9962b" />
        <rect x="9" y="21" width="8" height="2" fill="#6b4a2a" />
        <rect x="12" y="21" width="2" height="2" fill="#c9962b" />

        {shieldTier === 3 ? (
          <g>
            <rect x="1" y="11" width="7" height="13" fill="#cfd6e6" />
            <rect x="1" y="11" width="7" height="1" fill="#f6f9ff" />
            <rect x="2" y="13" width="5" height="9" fill="#c9962b" />
            <rect x="3" y="15" width="3" height="5" fill="#ffd76b" />
          </g>
        ) : shieldTier === 2 ? (
          <g>
            <rect x="2" y="12" width="6" height="7" fill="#cfd6e6" />
            <rect x="2" y="12" width="6" height="1" fill="#f6f9ff" />
            <path fill="#cfd6e6" d="M3 19h4v2H3zM4 21h2v1H4z" />
            <rect x="3" y="14" width="4" height="4" fill="#4a7fe0" />
          </g>
        ) : shieldTier === 1 ? (
          <g>
            <rect x="3" y="13" width="5" height="6" fill="#c9962b" />
            <rect x="3" y="13" width="5" height="1" fill="#ffd76b" />
            <rect x="4" y="15" width="3" height="2" fill="#8a5f1c" />
          </g>
        ) : null}
      </g>

      <g className="bs-hero-arm">
        <rect x="17" y="13" width="3" height="4" fill={glove} />
        <rect x="17" y="13" width="3" height="1" fill="#ffffff" opacity="0.25" />
        <rect x={blade.x - 2} y="12" width="7" height="1" fill="#c9962b" />
        <rect x={blade.x} y={blade.top} width={blade.w} height={12 - blade.top} fill={blade.body} />
        <rect x={blade.x} y={blade.top} width="1" height={12 - blade.top} fill={blade.edge} />
        <rect x={blade.x} y={blade.top} width={blade.w} height="1" fill="#ffffff" />
      </g>
    </svg>
  );
}

function BossSprite({ kind }) {
  if (kind === "lich") {
    return (
      <svg viewBox="0 0 26 30" shapeRendering="crispEdges">
        <path fill="currentColor" opacity="0.35" d="M4 8h18v20H4z" />
        <path fill="#2b2340" d="M8 2h10v9H8z" />
        <rect x="8" y="2" width="10" height="1" fill="currentColor" />
        <rect x="10" y="5" width="2" height="3" fill="#8fd7ff" />
        <rect x="14" y="5" width="2" height="3" fill="#8fd7ff" />
        <rect x="11" y="9" width="4" height="1" fill="#0d0a1c" />
        <path fill="currentColor" d="M6 11h14v12H6z" />
        <rect x="6" y="11" width="14" height="1" fill="#e2d6ff" />
        <rect x="11" y="14" width="4" height="6" fill="#2b2340" />
        <rect x="12" y="15" width="2" height="4" fill="#8fd7ff" />
        <path fill="currentColor" d="M4 23h18v5H4z" opacity="0.8" />
        <rect x="22" y="4" width="2" height="20" fill="#6b4a2a" />
        <rect x="20" y="1" width="6" height="4" fill="#8fd7ff" />
        <rect x="22" y="2" width="2" height="2" fill="#ffffff" />
      </svg>
    );
  }

  if (kind === "golem") {
    return (
      <svg viewBox="0 0 28 30" shapeRendering="crispEdges">
        <rect x="8" y="1" width="12" height="8" fill="currentColor" />
        <rect x="8" y="1" width="12" height="1" fill="#c3d0bc" />
        <rect x="10" y="4" width="3" height="2" fill="#ff9b6b" />
        <rect x="15" y="4" width="3" height="2" fill="#ff9b6b" />
        <rect x="9" y="7" width="10" height="1" fill="#5d6a58" />
        <rect x="5" y="9" width="18" height="12" fill="currentColor" />
        <rect x="5" y="9" width="18" height="1" fill="#c3d0bc" />
        <rect x="9" y="12" width="10" height="6" fill="#5d6a58" />
        <rect x="11" y="13" width="6" height="4" fill="#ff9b6b" opacity="0.6" />
        <rect x="0" y="10" width="5" height="10" fill="currentColor" />
        <rect x="23" y="10" width="5" height="10" fill="currentColor" />
        <rect x="0" y="20" width="6" height="4" fill="currentColor" />
        <rect x="22" y="20" width="6" height="4" fill="currentColor" />
        <rect x="7" y="21" width="6" height="9" fill="currentColor" />
        <rect x="15" y="21" width="6" height="9" fill="currentColor" />
        <rect x="7" y="21" width="6" height="1" fill="#5d6a58" />
        <rect x="15" y="21" width="6" height="1" fill="#5d6a58" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 34 28" shapeRendering="crispEdges">
      <g className="bs-wing bs-wing--l">
        <path fill="currentColor" opacity="0.85" d="M6 2h10v3H6zM3 5h13v4H3zM6 9h10v3H6z" />
        <path fill="#7d2a1c" d="M8 4h2v7H8zM12 4h2v7h-2z" />
      </g>
      <path fill="currentColor" d="M12 10h14v9H12z" />
      <rect x="12" y="10" width="14" height="1" fill="#e07a5f" />
      <rect x="13" y="13" width="12" height="4" fill="#7d2a1c" opacity="0.5" />
      <path fill="currentColor" d="M24 4h8v8h-8z" />
      <rect x="24" y="4" width="8" height="1" fill="#e07a5f" />
      <rect x="26" y="7" width="2" height="2" fill="#ffd76b" />
      <rect x="30" y="7" width="2" height="2" fill="#ffd76b" />
      <path fill="#ffe9a8" d="M25 12h2v2h-2zM29 12h2v2h-2z" />
      <path fill="currentColor" d="M22 2h2v3h-2zM28 1h2v3h-2z" />
      <path fill="currentColor" d="M2 12h12v4H2z" />
      <path fill="currentColor" d="M0 14h4v3H0z" />
      <rect x="14" y="19" width="4" height="7" fill="currentColor" />
      <rect x="21" y="19" width="4" height="7" fill="currentColor" />
      <rect x="13" y="26" width="6" height="2" fill="#7d2a1c" />
      <rect x="20" y="26" width="6" height="2" fill="#7d2a1c" />
    </svg>
  );
}

function MonsterSprite({ kind, boss }) {
  if (boss) {
    return <BossSprite kind={kind} />;
  }

  switch (kind) {
    case "bat":
      return (
        <svg viewBox="0 0 16 9" shapeRendering="crispEdges">
          <g className="bs-wing bs-wing--l">
            <path fill="currentColor" d="M0 1h3v4H0zM3 3h2v2H3z" />
          </g>
          <g className="bs-wing bs-wing--r">
            <path fill="currentColor" d="M13 1h3v4h-3zM11 3h2v2h-2z" />
          </g>
          <path fill="currentColor" d="M6 0h1v2H6zM9 0h1v2H9zM6 2h4v6H6z" />
          <rect x="6" y="4" width="1" height="1" fill="#0d0a1c" />
          <rect x="9" y="4" width="1" height="1" fill="#0d0a1c" />
        </svg>
      );
    case "ghost":
      return (
        <svg viewBox="0 0 12 13" shapeRendering="crispEdges">
          <path fill="currentColor" opacity="0.9" d="M4 0h4v1h2v1h1v9H1V2h1V1h2z" />
          <path fill="currentColor" opacity="0.55" d="M1 11h2v2H1zM5 11h2v2H5zM9 11h2v2H9z" />
          <rect x="3" y="4" width="2" height="3" fill="#0d0a1c" />
          <rect x="7" y="4" width="2" height="3" fill="#0d0a1c" />
        </svg>
      );
    case "imp":
      return (
        <svg viewBox="0 0 12 13" shapeRendering="crispEdges">
          <path fill="currentColor" d="M1 0h1v3H1zM10 0h1v3h-1z" />
          <path fill="currentColor" d="M2 2h8v7H2z" />
          <rect x="3" y="4" width="2" height="2" fill="#0d0a1c" />
          <rect x="7" y="4" width="2" height="2" fill="#0d0a1c" />
          <rect x="4" y="7" width="4" height="1" fill="#0d0a1c" />
          <g className="bs-legs">
            <rect x="2" y="9" width="3" height="4" fill="currentColor" />
            <rect x="7" y="9" width="3" height="4" fill="currentColor" />
          </g>
        </svg>
      );
    case "skeleton":
      return (
        <svg viewBox="0 0 12 15" shapeRendering="crispEdges">
          <path fill="currentColor" d="M3 0h6v5H3z" />
          <rect x="4" y="2" width="2" height="2" fill="#0d0a1c" />
          <rect x="7" y="2" width="2" height="2" fill="#0d0a1c" />
          <rect x="4" y="5" width="4" height="1" fill="currentColor" />
          <rect x="5" y="6" width="2" height="4" fill="currentColor" />
          <rect x="2" y="6" width="8" height="1" fill="currentColor" />
          <rect x="3" y="8" width="6" height="1" fill="currentColor" />
          <g className="bs-legs">
            <rect x="3" y="10" width="2" height="5" fill="currentColor" />
            <rect x="7" y="10" width="2" height="5" fill="currentColor" />
          </g>
        </svg>
      );
    case "mushroom":
      return (
        <svg viewBox="0 0 12 11" shapeRendering="crispEdges">
          <path fill="currentColor" d="M3 0h6v1H3zM1 1h10v3H1z" />
          <rect x="3" y="2" width="2" height="1" fill="#fff5f8" opacity="0.85" />
          <rect x="7" y="1" width="2" height="2" fill="#fff5f8" opacity="0.85" />
          <rect x="3" y="4" width="6" height="6" fill="#f3e2cf" />
          <rect x="4" y="6" width="1" height="2" fill="#0d0a1c" />
          <rect x="7" y="6" width="1" height="2" fill="#0d0a1c" />
        </svg>
      );
    case "spider":
      return (
        <svg viewBox="0 0 14 10" shapeRendering="crispEdges">
          <g className="bs-legs">
            <path fill="currentColor" d="M0 2h3v1H0zM0 6h3v1H0zM11 2h3v1h-3zM11 6h3v1h-3z" />
          </g>
          <path fill="currentColor" d="M4 2h6v6H4z" />
          <rect x="5" y="4" width="1" height="1" fill="#fff" />
          <rect x="8" y="4" width="1" height="1" fill="#fff" />
          <rect x="6" y="0" width="2" height="2" fill="currentColor" />
        </svg>
      );
    default:
      // The shape of the very first decorative sprite, kept as drawn.
      return (
        <svg viewBox="0 0 8 6" shapeRendering="crispEdges">
          <path fill="currentColor" d="M3 0h2v1h1v1h1v4H0V2h1V1h2z" />
          <rect x="2" y="3" width="1" height="1" fill="#0d0a1c" />
          <rect x="5" y="3" width="1" height="1" fill="#0d0a1c" />
          <rect x="1" y="2" width="1" height="1" fill="#ffffff" opacity="0.4" />
        </svg>
      );
  }
}

function DropSprite({ drop }) {
  if (drop.kind === "chest") {
    return (
      <svg viewBox="0 0 12 10" shapeRendering="crispEdges">
        <path fill="#8a5f1c" d="M1 3h10v6H1z" />
        <path fill="#c9962b" d="M1 0h10v3H1z" />
        <rect x="1" y="3" width="10" height="1" fill="#6b4a2a" />
        <rect x="5" y="2" width="2" height="3" fill="#ffd76b" />
        <rect x="5" y="3" width="2" height="1" fill="#6b4a2a" />
      </svg>
    );
  }

  if (drop.kind === "coin") {
    return (
      <svg viewBox="0 0 7 7" shapeRendering="crispEdges">
        <path fill="#ffd76b" d="M2 0h3v1h1v5H1V1h1z" />
        <rect x="3" y="2" width="1" height="3" fill="#c9962b" />
      </svg>
    );
  }

  if (drop.kind === "potion" || drop.kind === "mana") {
    const glass = drop.kind === "mana" ? "#6bb6ff" : "#ff6b8a";
    return (
      <svg viewBox="0 0 7 8" shapeRendering="crispEdges">
        <rect x="3" y="0" width="2" height="1" fill="#d8cfae" />
        <rect x="2" y="1" width="4" height="6" fill={glass} />
        <rect x="3" y="2" width="1" height="2" fill="#ffffff" opacity="0.6" />
      </svg>
    );
  }

  // Everything out of the catalogue is drawn by its type, tinted per item.
  if (drop.type === "spell") {
    return (
      <svg viewBox="0 0 8 8" shapeRendering="crispEdges">
        <rect x="0" y="0" width="8" height="8" fill="#4a3b6b" />
        <rect x="1" y="1" width="6" height="6" fill={drop.color} />
        <rect x="3" y="2" width="2" height="4" fill="#4a3b6b" />
        <rect x="2" y="3" width="4" height="2" fill="#4a3b6b" />
      </svg>
    );
  }

  if (drop.type === "weapon") {
    return (
      <svg viewBox="0 0 8 8" shapeRendering="crispEdges">
        <rect x="3" y="0" width="2" height="6" fill={drop.color} />
        <rect x="1" y="5" width="6" height="1" fill="#c9962b" />
        <rect x="3" y="6" width="2" height="2" fill="#6b4a2a" />
      </svg>
    );
  }

  if (drop.type === "relic") {
    return (
      <svg viewBox="0 0 8 8" shapeRendering="crispEdges">
        <path fill={drop.color} d="M3 0h2v1h2v2h1v2H6v3H2V5H0V3h1V1h2z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 7 7" shapeRendering="crispEdges">
      <path fill={drop.color || "#e8e4d9"} d="M2 1h3v1h1v3H1V2h1z" />
      <rect x="2" y="2" width="1" height="1" fill="#ffffff" opacity="0.5" />
    </svg>
  );
}

function Bar({ value, max, color, width }) {
  const pct = clamp((value / max) * 100, 0, 100);
  return (
    <span className="bs-bar" style={{ width: width + "px" }}>
      <span className="bs-bar-fill" style={{ width: pct + "%", background: color }} />
    </span>
  );
}

// Every kind of thing gets its own drawing, so the sheet reads as a row of
// items rather than a list of words.
export function ItemIcon({ item }) {
  const c = item.color || "#e8e4d9";

  if (item.type === "spell") {
    return (
      <svg className="bs-icon" viewBox="0 0 10 10" shapeRendering="crispEdges">
        <rect x="0" y="0" width="9" height="10" fill="#4a3b6b" />
        <rect x="1" y="1" width="7" height="8" fill={c} />
        <rect x="0" y="0" width="2" height="10" fill="#6b4a2a" />
        <rect x="4" y="3" width="2" height="4" fill="#4a3b6b" />
        <rect x="3" y="4" width="4" height="2" fill="#4a3b6b" />
      </svg>
    );
  }

  if (item.type === "weapon") {
    return (
      <svg className="bs-icon" viewBox="0 0 10 10" shapeRendering="crispEdges">
        <rect x="4" y="0" width="2" height="7" fill={c} />
        <rect x="4" y="0" width="1" height="7" fill="#ffffff" />
        <rect x="2" y="6" width="6" height="1" fill="#c9962b" />
        <rect x="4" y="7" width="2" height="3" fill="#6b4a2a" />
      </svg>
    );
  }

  if (item.type === "armour") {
    return (
      <svg className="bs-icon" viewBox="0 0 10 10" shapeRendering="crispEdges">
        <path fill={c} d="M2 1h6v7H2z" />
        <rect x="1" y="1" width="2" height="3" fill={c} />
        <rect x="7" y="1" width="2" height="3" fill={c} />
        <rect x="2" y="1" width="6" height="1" fill="#ffffff" />
        <rect x="4" y="3" width="2" height="3" fill="#4a7fe0" />
      </svg>
    );
  }

  if (item.type === "shield") {
    return (
      <svg className="bs-icon" viewBox="0 0 10 10" shapeRendering="crispEdges">
        <path fill={c} d="M2 1h6v5H2z" />
        <path fill={c} d="M3 6h4v2H3zM4 8h2v1H4z" />
        <rect x="2" y="1" width="6" height="1" fill="#ffffff" />
        <rect x="4" y="3" width="2" height="3" fill="#4a7fe0" />
      </svg>
    );
  }

  if (item.kind === "potion" || item.kind === "mana") {
    const glass = item.kind === "mana" ? "#6bb6ff" : "#ff6b8a";
    return (
      <svg className="bs-icon" viewBox="0 0 10 10" shapeRendering="crispEdges">
        <rect x="4" y="0" width="2" height="2" fill="#d8cfae" />
        <rect x="2" y="2" width="6" height="7" fill={glass} />
        <rect x="3" y="3" width="1" height="3" fill="#ffffff" opacity="0.6" />
      </svg>
    );
  }

  return (
    <svg className="bs-icon" viewBox="0 0 10 10" shapeRendering="crispEdges">
      <path fill={c} d="M3 2h4v1h1v5H2V3h1z" />
      <rect x="3" y="3" width="1" height="1" fill="#ffffff" opacity="0.5" />
    </svg>
  );
}

function Slot({ label, item, fallback }) {
  return (
    <div className="bs-slot">
      <span className="bs-sheet__label">{label}</span>
      {item ? <ItemIcon item={item} /> : <span className="bs-icon bs-icon--empty" />}
      <span>{item ? item.name : fallback}</span>
    </div>
  );
}

function StatusSheet({ hero, onClose }) {
  const [tab, setTab] = React.useState("status");
  const known = POWERS.filter((p) => hero.powers.indexOf(p.key) !== -1);
  const trophies = new Set(hero.bag.filter((b) => COMMON_ITEMS.some((i) => i.key === b)));

  return (
    // Anywhere outside closes it, which is why the backdrop carries the handler.
    <div className="bs-sheet-wrap" onClick={onClose} role="presentation">
      <div className="bs-sheet" onClick={(e) => e.stopPropagation()} role="presentation">
        <div className="bs-sheet__head">
          <span>HERO</span>
          <span>LV {hero.level} / {MAX_LEVEL}</span>
        </div>

        <div className="bs-tabs">
          <button
            type="button"
            tabIndex={-1}
            className={"bs-tab" + (tab === "status" ? " is-on" : "")}
            onClick={() => setTab("status")}
          >
            STATUS
          </button>
          <button
            type="button"
            tabIndex={-1}
            className={"bs-tab" + (tab === "bag" ? " is-on" : "")}
            onClick={() => setTab("bag")}
          >
            INVENTORY {hero.inventory.length > 0 ? "(" + hero.inventory.length + ")" : ""}
          </button>
        </div>

        {tab === "status" ? (
          <div>
            <dl className="bs-sheet__stats">
              <dt>HP</dt><dd>{hero.hp} / {hero.maxHp}</dd>
              <dt>MP</dt><dd>{hero.mp} / {hero.maxMp}</dd>
              <dt>XP</dt><dd>{hero.level >= MAX_LEVEL ? "MAX" : hero.xp + " / " + hero.level * XP_PER_LEVEL}</dd>
              <dt>ATK</dt><dd>{3 + hero.weapon} - {6 + hero.weapon}</dd>
              <dt>DEF</dt><dd>{hero.defence}</dd>
              <dt>SPD</dt><dd>{hero.speed.toFixed(1)}</dd>
            </dl>

            <Slot label="WEAPON" item={hero.gear.weapon} fallback="BARE HANDS" />
            <Slot label="SHIELD" item={hero.gear.shield} fallback="NONE" />
            <Slot label="TOP" item={hero.gear.top} fallback="CLOTH SHIRT" />
            <Slot label="LEGS" item={hero.gear.legs} fallback="CLOTH PANTS" />
            <Slot label="BOOTS" item={hero.gear.boots} fallback="WORN SHOES" />
            <Slot label="GLOVES" item={hero.gear.gloves} fallback="BARE HANDS" />

            {hero.element && (
              <div className="bs-sheet__row">
                <span className="bs-sheet__label">ELEMENT</span>
                <span className="bs-tag" style={{ color: hero.gear.weapon.color }}>
                  {hero.element.toUpperCase()}
                </span>
              </div>
            )}

            <div className="bs-sheet__row bs-sheet__row--wrap">
              <span className="bs-sheet__label">SPELLS</span>
              <span>
                {known.map((p) => (
                  <span key={p.key} className="bs-tag" style={{ color: p.color }}>
                    {p.name} {p.cost}
                  </span>
                ))}
              </span>
            </div>

            <div className="bs-sheet__row">
              <span className="bs-sheet__label">TROPHIES</span>
              <span>{trophies.size} / {COMMON_ITEMS.length}</span>
            </div>
          </div>
        ) : (
          <div className="bs-bag">
            {hero.inventory.length === 0 ? (
              <p className="bs-bag__empty">NOTHING SPARE</p>
            ) : (
              hero.inventory.map((item, i) => (
                <div className="bs-bag__row" key={item.key + i}>
                  <ItemIcon item={item} />
                  <span>{item.name || item.label}</span>
                  <span className="bs-bag__kind">{(item.type || item.kind).toUpperCase()}</span>
                </div>
              ))
            )}
          </div>
        )}

        <p className="bs-sheet__hint">CLICK ANYWHERE TO CLOSE</p>
      </div>
    </div>
  );
}

export default function BattleScene() {
  const [state, setState] = React.useState(initialState);
  const still = React.useMemo(prefersReducedMotion, []);

  React.useEffect(() => {
    if (still) {
      return undefined;
    }
    const handle = setInterval(() => setState(step), TICK_MS);
    return () => clearInterval(handle);
  }, [still]);

  const [showSheet, setShowSheet] = React.useState(false);
  const { hero, monsters, drops, floats, effects } = state;

  return (
    <div className="bs" aria-hidden="true" data-phase={sceneAt(state.journey).phase}>
      <Scenery step={state.journey} />

      <div className="bs-field">
      {drops.map((d) => (
        <span
          key={d.id}
          className={"bs-drop" + (d.kind === "chest" ? " bs-drop--chest" : "")}
          style={{ left: d.x + "%" }}
        >
          <DropSprite drop={d} />
        </span>
      ))}

      {(effects || []).map((e) => (
        <span key={e.id} className={"bs-fx bs-fx--" + e.key} style={{ left: e.x + "%" }} />
      ))}

      <span
        className={"bs-unit bs-unit--hero bs-move-walk is-" + hero.state
          + (hero.warp === state.tick ? " is-warp" : "")
          + (hero.element ? " elem-" + hero.element : "")
          + (hero.state === "cast" && hero.spell ? " spell-" + hero.spell : "")}
        style={{ left: hero.x + "%" }}
      >
        <span className="bs-meters">
          <Bar value={hero.hp} max={HERO_MAX_HP} color="#6ddf8e" width={24} />
          <Bar value={hero.mp} max={HERO_MAX_MP} color="#6bb6ff" width={24} />
        </span>
        <span className="bs-facing" style={{ transform: "scaleX(" + hero.face + ")" }}>
          <span className="bs-sprite">
            <HeroSprite gear={hero.gear} />
          </span>
        </span>
      </span>

      {monsters.map((m) => (
        <span
          key={m.id}
          className={"bs-unit bs-move-" + m.move + " is-" + m.state + (m.boss ? " bs-unit--boss" : "")}
          style={{ left: m.x + "%", color: m.color }}
        >
          <span className="bs-meters">
            <Bar value={m.hp} max={m.maxHp} color={m.color} width={18} />
          </span>
          <span className="bs-facing" style={{ transform: "scaleX(" + m.face + ")" }}>
            <span className="bs-sprite">
              <MonsterSprite kind={m.kind} boss={m.boss} />
            </span>
          </span>
        </span>
      ))}

      {floats.map((f) => (
        <span
          key={f.id}
          className="bs-float"
          style={{ left: f.x + "%", color: f.color, bottom: 34 + (f.lane || 0) * 11 + "px" }}
        >
          {f.text}
        </span>
      ))}

        {/* The content layer covers the whole label, so a click on the hero
            never reaches him. This invisible target rides above it. */}
        <span
          className={"bs-hit" + (hero.warp === state.tick ? " is-warp" : "")}
          style={{ left: hero.x + "%" }}
          onClick={() => setShowSheet(true)}
        />
      </div>

      {showSheet && <StatusSheet hero={hero} onClose={() => setShowSheet(false)} />}
    </div>
  );
}
