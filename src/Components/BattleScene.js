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
const EXIT_TICKS = 6;
const ENTER_TICKS = 8;

const FIELD_MIN = 4;
const FIELD_MAX = 94;
const PICKUP_RANGE = 5;
const WAVE_GAP = 12;
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
export function spawnWave(heroX = 16) {
  const count = 1 + Math.floor(Math.random() * 3);
  const wave = [];

  for (let i = 0; i < count; i++) {
    const def = pick(MONSTERS);
    let x = FIELD_MIN;

    for (let attempt = 0; attempt < 14; attempt++) {
      // Bound per iteration so the closure below captures this candidate
      // rather than a variable the loop keeps reassigning.
      const candidate = FIELD_MIN + Math.random() * (FIELD_MAX - FIELD_MIN);
      const clearOfHero = Math.abs(candidate - heroX) >= SPAWN_CLEARANCE;
      const clearOfKin = wave.every((m) => Math.abs(m.x - candidate) >= SPAWN_SPACING);

      x = candidate;
      if (clearOfHero && clearOfKin) {
        break;
      }
    }

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

export const BASE_POWERS = POWERS.filter((p) => p.base).map((p) => p.key);

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
export const SPECIAL_ITEMS = [
  { key: "tome-frost", name: "TOME: FROST", type: "spell", grants: "frost", color: "#bfe9ff" },
  { key: "tome-quake", name: "TOME: QUAKE", type: "spell", grants: "quake", color: "#d9a066" },
  { key: "tome-judge", name: "TOME: JUDGEMENT", type: "spell", grants: "judge", color: "#fff0a8" },
  { key: "blade", name: "KEEN BLADE", type: "weapon", power: 2, color: "#eef2ff" },
  { key: "sabre", name: "RUNED SABRE", type: "weapon", power: 3, color: "#bfe9ff" },
  { key: "greatsword", name: "GREATSWORD", type: "weapon", power: 5, color: "#ffd76b" },
  { key: "heart", name: "STONE HEART", type: "relic", stat: "maxHp", amount: 12, color: "#ff6b8a" },
  { key: "sigil", name: "MANA SIGIL", type: "relic", stat: "maxMp", amount: 4, color: "#6bb6ff" },
  { key: "aegis", name: "AEGIS", type: "relic", stat: "defence", amount: 1, color: "#cfd6e6" },
  { key: "boots", name: "SWIFT BOOTS", type: "relic", stat: "speed", amount: 0.4, color: "#6ddf8e" },
];

export const ITEMS = COMMON_ITEMS.concat(SPECIAL_ITEMS);

// A chest holds one to three things and never gold or potions. A full chest of
// three always carries at least one special.
export function rollChestContents() {
  const count = 1 + Math.floor(Math.random() * 3);
  const contents = [];

  if (count === 3) {
    contents.push(pick(SPECIAL_ITEMS));
  }

  while (contents.length < count) {
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

  if (entry.kind === "potion") {
    next.hp = Math.min(next.maxHp, next.hp + 8);
  } else if (entry.kind === "mana") {
    next.mp = Math.min(next.maxMp, next.mp + 5);
  } else if (entry.type === "spell") {
    if (next.powers.indexOf(entry.grants) === -1) {
      next.powers = next.powers.concat(entry.grants);
    }
  } else if (entry.type === "weapon") {
    if (entry.power > next.weapon) {
      next.weapon = entry.power;
      next.gear = { ...next.gear, weapon: entry };
    }
  } else if (entry.type === "relic") {
    next.gear = { ...next.gear, relics: next.gear.relics.concat(entry.key) };
    if (entry.stat === "maxHp") {
      next.maxHp += entry.amount;
      next.hp += entry.amount;
    } else if (entry.stat === "maxMp") {
      next.maxMp += entry.amount;
    } else if (entry.stat === "defence") {
      next.defence += entry.amount;
    } else if (entry.stat === "speed") {
      next.speed += entry.amount;
    }
  }

  push(entry.name || entry.label, entry.color);
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
      gear: { weapon: null, relics: [] },
      powers: BASE_POWERS.slice(),
      bag: [],
      face: 1,
      state: "idle",
      timer: 0,
      cooldown: 0,
      mpTimer: 0,
      travelTimer: 0,
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

  while (next.xp >= next.level * XP_PER_LEVEL) {
    next.xp -= next.level * XP_PER_LEVEL;
    next.level += 1;
    next.maxHp += LEVEL_HP;
    next.hp = next.maxHp;
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
    if (Math.random() < DROP_CHANCE) {
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
    // Nothing left to fight and nothing left to pick up, so travel on.
    if (drops.length === 0 && waveGap >= WAVE_GAP) {
      travelling = true;
    }
  } else {
    waveGap = 0;
    travelling = false;
  }

  // Travel runs in three beats: walk to the edge, fade out of this land, fade in
  // at the next. The journey only advances between the two fades, which is what
  // keeps the hero and the scenery changing together.
  if (travelling && !hero.dead) {
    if (hero.state === "exit") {
      hero.travelTimer -= 1;
      if (hero.travelTimer <= 0) {
        journey += 1;
        hero.x = FIELD_MIN;
        hero.state = "enter";
        hero.travelTimer = ENTER_TICKS;
        monsters = spawnWave(hero.x);
        const arrival = sceneAt(journey);
        floats = addFloat(
          floats,
          tick,
          arrival.biome.toUpperCase() + " " + arrival.phase.toUpperCase(),
          "#ffd76b",
          hero.x
        );
      }
    } else if (hero.state === "enter") {
      hero.travelTimer -= 1;
      if (hero.travelTimer <= 0) {
        hero.state = "idle";
        hero.travelTimer = 0;
        travelling = false;
        waveGap = 0;
      }
    } else {
      hero.state = "walk";
      hero.face = 1;
      hero.x += hero.speed * 1.4;

      if (hero.x >= FIELD_MAX) {
        hero.x = FIELD_MAX;
        hero.state = "exit";
        hero.travelTimer = EXIT_TICKS;
      }
    }

    return { tick, hero, monsters, drops, floats, effects, waveGap, journey, travelling };
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
    } else {
      hero.state = "idle";
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

  return { tick, hero, monsters, drops, floats, effects, waveGap, journey, travelling };
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function HeroSprite({ weapon, shielded }) {
  // Three blades and two shields, so an upgrade is visible on the field rather
  // than only in the numbers.
  const blade =
    weapon >= 5
      ? { x: 13, w: 3, top: 0, edge: "#ffd76b", body: "#e8dcae" }
      : weapon >= 3
        ? { x: 14, w: 2, top: 1, edge: "#bfe9ff", body: "#8fd7ff" }
        : { x: 14, w: 2, top: 1, edge: "#eef2ff", body: "#b9c2de" };

  return (
    <svg viewBox="0 0 18 20" shapeRendering="crispEdges">
      <g className="bs-hero-body">
        <path fill="#9e2b45" d="M4 7h3v9H4z" />
        <path fill="#b8324f" d="M5 7h2v8H5z" />

        <rect x="8" y="0" width="2" height="1" fill="#ff8fa8" />
        <rect x="8" y="1" width="2" height="1" fill="#ff6b8a" />
        <rect x="7" y="1" width="1" height="1" fill="#d1425f" />
        <rect x="6" y="2" width="6" height="4" fill="#cfd6e6" />
        <rect x="6" y="2" width="6" height="1" fill="#eef2ff" />
        <rect x="6" y="5" width="6" height="1" fill="#9aa3bb" />
        <rect x="7" y="4" width="4" height="1" fill="#2b2340" />

        <rect x="4" y="6" width="3" height="2" fill="#cfd6e6" />
        <rect x="11" y="6" width="3" height="2" fill="#cfd6e6" />
        <rect x="4" y="6" width="3" height="1" fill="#eef2ff" />
        <rect x="11" y="6" width="3" height="1" fill="#eef2ff" />
        <rect x="6" y="6" width="6" height="6" fill="#4a7fe0" />
        <rect x="6" y="6" width="6" height="1" fill="#79a4f5" />
        <rect x="8" y="8" width="2" height="2" fill="#ffd76b" />
        <rect x="6" y="12" width="6" height="1" fill="#6b4a2a" />
        <rect x="8" y="12" width="2" height="1" fill="#c9962b" />

        {shielded ? (
          <g>
            <rect x="1" y="7" width="5" height="7" fill="#cfd6e6" />
            <rect x="1" y="7" width="5" height="1" fill="#eef2ff" />
            <rect x="2" y="9" width="3" height="3" fill="#4a7fe0" />
            <rect x="3" y="10" width="1" height="1" fill="#ffd76b" />
          </g>
        ) : (
          <g>
            <rect x="2" y="8" width="4" height="5" fill="#c9962b" />
            <rect x="2" y="8" width="4" height="1" fill="#ffd76b" />
            <rect x="3" y="10" width="2" height="2" fill="#8a5f1c" />
          </g>
        )}

        <rect x="6" y="13" width="2" height="4" fill="#2c1f4e" />
        <rect x="10" y="13" width="2" height="4" fill="#2c1f4e" />
        <rect x="5" y="17" width="4" height="2" fill="#6b4a2a" />
        <rect x="9" y="17" width="4" height="2" fill="#6b4a2a" />
      </g>

      <g className="bs-hero-arm">
        <rect x="12" y="7" width="2" height="3" fill="#cfd6e6" />
        <rect x="13" y="8" width="4" height="1" fill="#c9962b" />
        <rect x={blade.x} y={blade.top} width={blade.w} height={8 - blade.top} fill={blade.body} />
        <rect x={blade.x} y={blade.top} width="1" height={8 - blade.top} fill={blade.edge} />
        <rect x={blade.x} y={Math.max(0, blade.top - 1)} width={blade.w} height="1" fill="#ffffff" />
      </g>
    </svg>
  );
}

function MonsterSprite({ kind }) {
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

function StatusSheet({ hero, onClose }) {
  const known = POWERS.filter((p) => hero.powers.indexOf(p.key) !== -1);
  const relics = hero.gear.relics
    .map((key) => SPECIAL_ITEMS.find((i) => i.key === key))
    .filter(Boolean);
  const trophies = new Set(hero.bag.filter((b) => COMMON_ITEMS.some((i) => i.key === b)));

  return (
    // Anywhere outside closes it, which is why the backdrop carries the handler.
    <div className="bs-sheet-wrap" onClick={onClose} role="presentation">
      <div className="bs-sheet">
        <div className="bs-sheet__head">
          <span>HERO</span>
          <span>LV {hero.level}</span>
        </div>

        <dl className="bs-sheet__stats">
          <dt>HP</dt><dd>{hero.hp} / {hero.maxHp}</dd>
          <dt>MP</dt><dd>{hero.mp} / {hero.maxMp}</dd>
          <dt>XP</dt><dd>{hero.xp} / {hero.level * XP_PER_LEVEL}</dd>
          <dt>ATK</dt><dd>{3 + hero.weapon} - {6 + hero.weapon}</dd>
          <dt>DEF</dt><dd>{hero.defence}</dd>
          <dt>SPD</dt><dd>{hero.speed.toFixed(1)}</dd>
        </dl>

        <div className="bs-sheet__row">
          <span className="bs-sheet__label">WEAPON</span>
          <span>{hero.gear.weapon ? hero.gear.weapon.name : "PLAIN SWORD"}</span>
        </div>

        <div className="bs-sheet__row">
          <span className="bs-sheet__label">ARMOUR</span>
          <span>{hero.defence > HERO_DEFENCE ? "AEGIS" : "LEATHER"}</span>
        </div>

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

        {relics.length > 0 && (
          <div className="bs-sheet__row bs-sheet__row--wrap">
            <span className="bs-sheet__label">RELICS</span>
            <span>
              {relics.map((r) => (
                <span key={r.key} className="bs-tag" style={{ color: r.color }}>{r.name}</span>
              ))}
            </span>
          </div>
        )}

        <div className="bs-sheet__row">
          <span className="bs-sheet__label">TROPHIES</span>
          <span>{trophies.size} / {COMMON_ITEMS.length}</span>
        </div>

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
          + (hero.state === "cast" && hero.spell ? " spell-" + hero.spell : "")}
        style={{ left: hero.x + "%" }}
      >
        <span className="bs-meters">
          <Bar value={hero.hp} max={HERO_MAX_HP} color="#6ddf8e" width={24} />
          <Bar value={hero.mp} max={HERO_MAX_MP} color="#6bb6ff" width={24} />
        </span>
        <span className="bs-facing" style={{ transform: "scaleX(" + hero.face + ")" }}>
          <span className="bs-sprite">
            <HeroSprite weapon={hero.weapon} shielded={hero.defence > HERO_DEFENCE} />
          </span>
        </span>
      </span>

      {monsters.map((m) => (
        <span
          key={m.id}
          className={"bs-unit bs-move-" + m.move + " is-" + m.state}
          style={{ left: m.x + "%", color: m.color }}
        >
          <span className="bs-meters">
            <Bar value={m.hp} max={m.maxHp} color={m.color} width={18} />
          </span>
          <span className="bs-facing" style={{ transform: "scaleX(" + m.face + ")" }}>
            <span className="bs-sprite">
              <MonsterSprite kind={m.kind} />
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
          className="bs-hit"
          style={{ left: hero.x + "%" }}
          onClick={() => setShowSheet(true)}
        />
      </div>

      {showSheet && <StatusSheet hero={hero} onClose={() => setShowSheet(false)} />}
    </div>
  );
}
