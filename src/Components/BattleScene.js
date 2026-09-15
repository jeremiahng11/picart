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

import warriorBase from "../assets/sprites/warrior-base.png";
import slimeSheet from "../assets/sprites/slime.png";
import skullSheet from "../assets/sprites/skull.png";
import goblinSheet from "../assets/sprites/goblin.png";
import skeletonSheet from "../assets/sprites/skeleton.png";
import ghoulSheet from "../assets/sprites/ghoul.png";
import mummySheet from "../assets/sprites/mummy.png";
import warlockSheet from "../assets/sprites/warlock.png";
import lichSheet from "../assets/sprites/lich.png";
import deathSheet from "../assets/sprites/death.png";
import redknightSheet from "../assets/sprites/redknight.png";
import mimicSheet from "../assets/sprites/mimic.png";
import goldSheet from "../assets/sprites/gold.png";
import burstSheet from "../assets/sprites/burst.png";
import fireburstSheet from "../assets/sprites/fireburst.png";
import auraSheet from "../assets/sprites/aura.png";
import rippleSheet from "../assets/sprites/ripple.png";
import punchSheet from "../assets/sprites/punch.png";

const TICK_MS = 165;

// Comfortably above the sturdiest monster, so a bad wave wears the hero down
// rather than finishing him.
export const HERO_MAX_HP = 60;
export const HERO_MAX_MP = 12;
// Both pools grow with him, so the dearest spell comes within reach as he does.
export const LEVEL_MP = 2;
export const GOD_SPELL_COST = 40;

// The ceiling spell is a storm rather than a blast: it hangs over the field for
// about three seconds, striking on its own rhythm, so anything that wanders in
// while it lasts is struck too.
export const STORM_TICKS = Math.round(3000 / 165);
export const STORM_MAX_HITS = 8;
const STORM_GAP = [1, 3];
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

// Which plate stands in for each kind of hit, and how it is tinted. The pack has
// one white burst and one fiery one, so the rest are recoloured from those.
export const EFFECT_ART = {
  melee: { sheet: punchSheet, frames: 4, tall: false, filter: "none" },
  flame: { sheet: fireburstSheet, frames: 4, tall: false, filter: "none" },
  spark: { sheet: burstSheet, frames: 4, tall: false, filter: "hue-rotate(185deg) saturate(2.5)" },
  frost: { sheet: burstSheet, frames: 4, tall: false, filter: "hue-rotate(160deg) saturate(2) brightness(1.15)" },
  storm: { sheet: burstSheet, frames: 4, tall: false, filter: "hue-rotate(255deg) saturate(2.2)" },
  quake: { sheet: fireburstSheet, frames: 4, tall: false, filter: "hue-rotate(28deg) saturate(0.7)" },
  nova: { sheet: rippleSheet, frames: 6, tall: true, filter: "hue-rotate(255deg) saturate(1.8)" },
  judge: { sheet: rippleSheet, frames: 6, tall: true, filter: "hue-rotate(70deg) brightness(1.3)" },
  heal: { sheet: auraSheet, frames: 4, tall: true, filter: "none" },
  // Drawn rather than taken from a plate: the pack has no bolt, and a zap wants
  // to strike from above rather than bloom on the spot.
  godlight: { bolt: true },
};
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
// Every sheet is 16px frames laid out in a row, the first four of which are the
// idle cycle. sheetFrames is how many the plate holds in total, which is what
// the background has to be scaled by.
export const MONSTERS = [
  { kind: "slime", sheet: slimeSheet, sheetFrames: 4, color: "#6ddf8e", maxHp: 10, dmg: [1, 3], speed: 0.75, reach: 7, cd: 7, move: "hop" },
  { kind: "skull", sheet: skullSheet, sheetFrames: 4, color: "#e8e4d9", maxHp: 9, dmg: [2, 4], speed: 1.5, reach: 7, cd: 6, move: "float" },
  { kind: "goblin", sheet: goblinSheet, sheetFrames: 8, color: "#8fb35a", maxHp: 12, dmg: [2, 4], speed: 1.4, reach: 7, cd: 6, move: "walk" },
  { kind: "skeleton", sheet: skeletonSheet, sheetFrames: 8, color: "#e8e4d9", maxHp: 14, dmg: [2, 5], speed: 0.95, reach: 8, cd: 7, move: "walk" },
  { kind: "ghoul", sheet: ghoulSheet, sheetFrames: 8, color: "#a78bd6", maxHp: 16, dmg: [3, 6], speed: 1.2, reach: 7, cd: 8, move: "walk" },
  { kind: "mummy", sheet: mummySheet, sheetFrames: 8, color: "#d9c9a0", maxHp: 18, dmg: [3, 5], speed: 0.7, reach: 7, cd: 9, move: "walk" },
  // Never wanders in: a mimic is only ever what a trapped chest turns out to
  // be, which is why it is kept out of the wave pool.
  { kind: "mimic", sheet: mimicSheet, sheetFrames: 4, color: "#c9962b", maxHp: 22, dmg: [4, 8], speed: 0.9, reach: 6, cd: 7, move: "hop", ambush: true },
  { kind: "warlock", sheet: warlockSheet, sheetFrames: 8, color: "#8fd7ff", maxHp: 13, dmg: [1, 6], speed: 1.0, reach: 9, cd: 6, move: "float" },
];

// What a wave may be made of. The ambushers are excluded, since they arrive by
// their own means rather than walking on.
export const WAVE_MONSTERS = MONSTERS.filter((m) => !m.ambush);

// Shed by monsters. Chests never contain these.
// Rare, slow, and far sturdier than anything else on the field. A boss arrives
// alone rather than as part of a wave.
export const BOSSES = [
  { kind: "lich", sheet: lichSheet, sheetFrames: 12, color: "#a98cff", maxHp: 110, dmg: [6, 13], speed: 0.7, reach: 11, cd: 8, move: "float", boss: true },
  { kind: "death", sheet: deathSheet, sheetFrames: 8, color: "#cfd6e6", maxHp: 130, dmg: [8, 14], speed: 0.8, reach: 11, cd: 9, move: "float", boss: true },
  { kind: "redknight", sheet: redknightSheet, sheetFrames: 12, color: "#c9452f", maxHp: 150, dmg: [9, 15], speed: 0.6, reach: 10, cd: 10, move: "walk", boss: true },
];

// How often a chest on the ground turns out to have teeth.
export const MIMIC_CHANCE = 0.18;

export const BOSS_MIN_LEVEL = 8;
export const BOSS_CHANCE_CAP = 0.08;
// Lands after a boss, and no other may appear until the hero has crossed this
// many scenes. Rarity alone was not enough; two in quick succession still read
// as common.
export const BOSS_COOLDOWN_SCENES = 4;

export function bossChance(level) {
  if (level < BOSS_MIN_LEVEL) {
    return 0;
  }
  return Math.min(BOSS_CHANCE_CAP, 0.015 + (level - BOSS_MIN_LEVEL) * 0.006);
}

// Both the level and the distance since the last one have to allow it.
export function bossAllowed(level, journey, lastBossJourney) {
  if (level < BOSS_MIN_LEVEL) {
    return false;
  }
  if (lastBossJourney === null || lastBossJourney === undefined) {
    return true;
  }
  return journey - lastBossJourney >= BOSS_COOLDOWN_SCENES;
}

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

export function spawnWave(heroX = 16, level = 1, allowBoss = true) {
  if (allowBoss && Math.random() < bossChance(level)) {
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
    const def = pick(WAVE_MONSTERS);

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
  { key: "spark", name: "SPARK", tier: 1, cost: 4, dmg: [7, 11], color: "#8fd7ff", aoe: false },
  { key: "frost", name: "FROST", tier: 1, cost: 6, dmg: [10, 14], color: "#bfe9ff", aoe: false },
  { key: "flame", name: "FLAME", tier: 2, cost: 8, dmg: [14, 19], color: "#ffb36b", aoe: false },
  { key: "quake", name: "QUAKE", tier: 2, cost: 10, dmg: [17, 23], color: "#d9a066", aoe: true },
  { key: "nova", name: "NOVA", tier: 3, cost: 12, dmg: [22, 30], color: "#ff6bd6", aoe: true },
  { key: "judge", name: "JUDGEMENT", tier: 3, cost: 26, dmg: [44, 62], color: "#fff0a8", aoe: true },
  // The ceiling. It empties the pool, and the pool only reaches forty after
  // fifteen levels or with god gold on.
  { key: "godlight", name: "GODS LIGHTNING", tier: 4, cost: 40, dmg: [120, 180], color: "#fff6c9", aoe: true, god: true },
];

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
export const SLOTS = ["weapon", "shield", "helm", "top", "legs", "boots", "gloves"];

export const STARTER_WEAPON = {
  key: "worn-sword", name: "WORN SWORD", type: "weapon",
  tier: 0, power: 0, element: null, color: "#b9c2de",
};

// tier drives what a piece looks like; the stats vary within a tier, so a
// rusted mail coif and a fine one share a silhouette but not a value.
export const SPECIAL_ITEMS = [
  // --- weapons ---
  { key: "rusted-sword", name: "RUSTED SWORD", type: "weapon", tier: 1, power: 1, element: null, color: "#8a8570" },
  { key: "iron-sword", name: "IRON SWORD", type: "weapon", tier: 1, power: 2, element: null, color: "#c9cfdd" },
  { key: "keen-blade", name: "KEEN BLADE", type: "weapon", tier: 2, power: 3, element: null, color: "#eef2ff" },
  { key: "flame-sword", name: "FLAME SWORD", type: "weapon", tier: 3, power: 5, element: "flame", color: "#ff9b4a" },
  { key: "frost-sword", name: "FROST BRAND", type: "weapon", tier: 4, power: 6, element: "frost", color: "#8fd7ff" },
  { key: "storm-sword", name: "STORM EDGE", type: "weapon", tier: 5, power: 7, element: "storm", color: "#d7b3ff" },
  { key: "greatsword", name: "GREATSWORD", type: "weapon", tier: 6, power: 9, element: "holy", color: "#ffd76b" },

  // --- shields ---
  { key: "plank", name: "PLANK SHIELD", type: "shield", tier: 1, defence: 0, maxHp: 2, color: "#8a6f4a" },
  { key: "buckler", name: "BUCKLER", type: "shield", tier: 1, defence: 1, color: "#c9962b" },
  { key: "kite", name: "KITE SHIELD", type: "shield", tier: 2, defence: 2, color: "#cfd6e6" },
  { key: "tower", name: "TOWER SHIELD", type: "shield", tier: 3, defence: 3, maxHp: 8, color: "#ffd76b" },

  // --- helms, none worn to begin with ---
  { key: "helm-cap", name: "CLOTH CAP", type: "helm", tier: 1, defence: 0, maxHp: 2, color: "#8a6f4a" },
  { key: "helm-hood", name: "LEATHER HOOD", type: "helm", tier: 1, defence: 1, maxHp: 3, color: "#a9713f" },
  { key: "helm-iron", name: "IRON HELM", type: "helm", tier: 2, defence: 2, maxHp: 5, color: "#9aa8c4" },
  { key: "helm-knight", name: "KNIGHT HELM", type: "helm", tier: 3, defence: 3, maxHp: 8, color: "#cfd6e6" },
  { key: "helm-great", name: "GREAT HELM", type: "helm", tier: 3, defence: 4, maxHp: 12, color: "#ffd76b" },

  // --- body ---
  { key: "top-rags", name: "RAGGED SHIRT", type: "top", tier: 1, defence: 0, maxHp: 2, color: "#8a6f4a" },
  { key: "top-leather", name: "LEATHER JERKIN", type: "top", tier: 1, defence: 1, maxHp: 6, color: "#a9713f" },
  { key: "top-chain-rust", name: "RUSTED HAUBERK", type: "top", tier: 2, defence: 1, maxHp: 5, color: "#7d8496" },
  { key: "top-chain", name: "CHAIN HAUBERK", type: "top", tier: 2, defence: 2, maxHp: 12, color: "#9aa8c4" },
  { key: "top-plate", name: "PLATE CUIRASS", type: "top", tier: 3, defence: 3, maxHp: 20, color: "#eef2ff" },

  // --- legs ---
  { key: "legs-rags", name: "TORN BREECHES", type: "legs", tier: 1, defence: 0, maxHp: 1, color: "#7d6a4a" },
  { key: "legs-leather", name: "LEATHER CHAPS", type: "legs", tier: 1, defence: 1, maxHp: 4, color: "#8a5f34" },
  { key: "legs-chain", name: "CHAIN LEGGINGS", type: "legs", tier: 2, defence: 1, maxHp: 8, color: "#8d99b5" },
  { key: "legs-plate", name: "PLATE GREAVES", type: "legs", tier: 3, defence: 2, maxHp: 12, color: "#dfe6f5" },

  // --- boots ---
  { key: "boots-sandals", name: "WORN SANDALS", type: "boots", tier: 1, defence: 0, speed: 0.1, color: "#9a7f5a" },
  { key: "boots-leather", name: "TRAVEL BOOTS", type: "boots", tier: 1, defence: 0, speed: 0.25, color: "#8a5f34" },
  { key: "boots-chain", name: "MAIL BOOTS", type: "boots", tier: 2, defence: 1, speed: 0.15, color: "#8d99b5" },
  { key: "boots-plate", name: "STEEL SABATONS", type: "boots", tier: 3, defence: 2, maxHp: 4, color: "#dfe6f5" },

  // --- gloves ---
  { key: "gloves-tattered", name: "TATTERED MITTS", type: "gloves", tier: 1, defence: 0, power: 0, color: "#8a6f4a" },
  { key: "gloves-leather", name: "LEATHER GLOVES", type: "gloves", tier: 1, defence: 0, power: 1, color: "#a9713f" },
  { key: "gloves-chain", name: "MAIL GAUNTLETS", type: "gloves", tier: 2, defence: 1, power: 1, color: "#8d99b5" },
  { key: "gloves-plate", name: "PLATE GAUNTLETS", type: "gloves", tier: 3, defence: 1, power: 2, color: "#dfe6f5" },

  // --- spellbooks ---
  { key: "tome-spark", name: "TOME: SPARK", type: "spell", grants: "spark", color: "#8fd7ff" },
  { key: "tome-frost", name: "TOME: FROST", type: "spell", grants: "frost", color: "#bfe9ff" },
  { key: "tome-quake", name: "TOME: QUAKE", type: "spell", grants: "quake", color: "#d9a066" },
  { key: "tome-nova", name: "TOME: NOVA", type: "spell", grants: "nova", color: "#ff6bd6" },
  { key: "tome-judge", name: "TOME: JUDGEMENT", type: "spell", grants: "judge", color: "#fff0a8" },
];

// What a piece is worth, so a fine leather jerkin can beat a rusted hauberk that
// merely looks heavier. Comparing tiers alone could not express that.
export function itemScore(item) {
  if (!item) {
    return 0;
  }
  return (item.power || 0) * 3
    + (item.defence || 0) * 3
    + (item.maxHp || 0) * 0.5
    + (item.speed || 0) * 8;
}

// Below this share of what he already wears, a piece is not worth stooping for.
export const DISDAIN = 0.55;

// How many of a consumable he will carry before leaving the rest.
export const CARRY_LIMIT = 10;

// Decides whether the hero bothers with something on the ground, the way a
// player would: treasure always, consumables until his pack is full, and gear
// only when it is new to him and better than what it would replace.
export function worthTaking(hero, item) {
  if (!item) {
    return false;
  }

  if (item.kind === "chest" || item.kind === "coin") {
    return true;
  }

  if (item.kind === "potion" || item.kind === "mana") {
    const needed = item.kind === "potion" ? hero.hp < hero.maxHp : hero.mp < hero.maxMp;
    if (needed) {
      return true;
    }
    return hero.inventory.filter((i) => i.kind === item.kind).length < CARRY_LIMIT;
  }

  // A trophy is a curio: one is worth having, a second is not.
  if (item.type === "trophy") {
    return hero.bag.indexOf(item.key) === -1;
  }

  if (item.type === "spell") {
    const known = hero.powers.indexOf(item.grants) !== -1;
    const spare = hero.inventory.some((i) => i.key === item.key);
    return !(known && spare);
  }

  if (SLOTS.indexOf(item.type) !== -1) {
    const worn = hero.gear[item.type];

    // He has no use for a second of something he is already carrying.
    if (worn && worn.key === item.key) {
      return false;
    }
    if (hero.inventory.some((i) => i.key === item.key)) {
      return false;
    }
    if (!worn) {
      return true;
    }
    return itemScore(item) >= itemScore(worn) * DISDAIN;
  }

  return true;
}

// The rarest things in the game. Seven pieces, one per slot, found only in a
// boss hoard. The blade is the ceiling the whole scale was built around.
export const GOD_SET = [
  { key: "god-weapon", name: "GODS GOLD BLADE", type: "weapon", tier: 7, power: 99, element: "holy", color: "#ffd76b", god: true },
  { key: "god-shield", name: "GODS GOLD AEGIS", type: "shield", tier: 4, defence: 99, maxHp: 40, color: "#ffd76b", god: true },
  { key: "god-helm", name: "GODS GOLD CROWN", type: "helm", tier: 4, defence: 40, maxHp: 30, maxMp: 12, color: "#ffd76b", god: true },
  { key: "god-top", name: "GODS GOLD PLATE", type: "top", tier: 4, defence: 99, maxHp: 99, color: "#ffd76b", god: true },
  { key: "god-legs", name: "GODS GOLD GREAVES", type: "legs", tier: 4, defence: 60, maxHp: 50, color: "#ffd76b", god: true },
  { key: "god-boots", name: "GODS GOLD SABATONS", type: "boots", tier: 4, defence: 35, maxHp: 25, speed: 0.6, color: "#ffd76b", god: true },
  { key: "god-gloves", name: "GODS GOLD GAUNTLETS", type: "gloves", tier: 4, defence: 30, power: 20, maxMp: 16, color: "#ffd76b", god: true },
];

// The book that teaches the ceiling spell. Not a slot, so it is not part of the
// wearable set, but it is found the same way.
export const GOD_TOME = {
  key: "tome-godlight", name: "TOME: GODS LIGHTNING", type: "spell",
  grants: "godlight", color: "#fff6c9", god: true,
};

export const GOD_DROP_CHANCE = 0.3;

// A golden chest holds nothing but god gold. It is the other way to find it,
// for a hero who has not yet felled a boss.
export const GOLDEN_CHEST_CHANCE = 0.05;

export function godTreasure() {
  return Math.random() < 0.18 ? GOD_TOME : pick(GOD_SET);
}

export function hasFullGodSet(gear) {
  return SLOTS.every((slot) => gear[slot] && gear[slot].god);
}

// What a piece adds, written the way a player reads it.
export function describeItem(item) {
  if (!item) {
    return "";
  }
  const parts = [];
  if (item.power) parts.push("+" + item.power + " ATK");
  if (item.defence) parts.push("+" + item.defence + " DEF");
  if (item.maxHp) parts.push("+" + item.maxHp + " HP");
  if (item.speed) parts.push("+" + item.speed.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + " SPD");
  if (item.element) parts.push(item.element.toUpperCase());
  return parts.join("  ");
}

export const MAX_LEVEL = 99;

export const ITEMS = COMMON_ITEMS.concat(SPECIAL_ITEMS).concat(GOD_SET);

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

  if (entry.kind === "coin") {
    const amount = entry.amount || 1;
    next.gold = (next.gold || 0) + amount;
    push("+" + amount + "G", entry.color);
    return next;
  }

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
    if (next.powers.indexOf(entry.grants) !== -1) {
      // A spell he already knows is a spare book rather than nothing.
      next.inventory = next.inventory.concat(entry);
      push("SPARE TOME", entry.color);
      return next;
    }

    const spell = POWERS.find((p) => p.key === entry.grants);
    if (spell && next.maxMp < spell.cost) {
      // He can read it but not cast it. The book waits in the pack until his
      // pool is deep enough, which studyTomes checks whenever that changes.
      next.inventory = next.inventory.concat(entry);
      push("CANNOT CAST YET", entry.color);
      return next;
    }

    next.powers = next.powers.concat(entry.grants);
    push(entry.name, entry.color);
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

  if (worn && itemScore(worn) >= itemScore(entry)) {
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
  next.maxMp = HERO_MAX_MP + sum("maxMp") + (next.level - 1) * LEVEL_MP;
  next.hp = Math.min(next.hp, next.maxHp);
  next.mp = Math.min(next.mp, next.maxMp);
  next.element = next.gear.weapon ? next.gear.weapon.element : null;

  return studyTomes(next);
}

// Reads any book in the pack he has since grown into. Called wherever the mana
// pool can change, which is levelling and changing gear.
export function studyTomes(hero) {
  let next = hero;

  for (const book of hero.inventory.filter((i) => i.type === "spell")) {
    const spell = POWERS.find((p) => p.key === book.grants);
    if (!spell || next.powers.indexOf(book.grants) !== -1) {
      continue;
    }
    if (next.maxMp >= spell.cost) {
      next = {
        ...next,
        powers: next.powers.concat(book.grants),
        inventory: next.inventory.filter((i) => i !== book),
      };
    }
  }

  return next;
}

// Anything in the pack that beats what is worn is put on. This is what lets a
// better blade found while a fight is on be drawn once there is a moment.
export function reequip(hero) {
  let next = hero;

  for (const slot of SLOTS) {
    const best = next.inventory
      .filter((i) => i.type === slot)
      .reduce((top, i) => (!top || itemScore(i) > itemScore(top) ? i : top), null);

    const worn = next.gear[slot];
    if (best && itemScore(best) > itemScore(worn)) {
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
      gear: { weapon: STARTER_WEAPON, shield: null, helm: null, top: null, legs: null, boots: null, gloves: null },
      inventory: [],
      gold: 0,
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
    monsters: spawnWave(16, 1),
    drops: [],
    floats: [],
    effects: [],
    waveGap: 0,
    journey: 0,
    travelling: false,
    lastBossJourney: null,
    storm: null,
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
    next.maxMp += LEVEL_MP;
    next.hp = next.maxHp;
    next.mp = next.maxMp;
  }

  if (next.level >= MAX_LEVEL) {
    next.level = MAX_LEVEL;
    next.xp = 0;
  }

  return studyTomes(next);
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
  let lastBossJourney = prev.lastBossJourney === undefined ? null : prev.lastBossJourney;
  let storm = prev.storm || null;
  let wavesLeft = prev.wavesLeft === undefined ? 0 : prev.wavesLeft;

  let hero = advance(prev.hero);
  let monsters = prev.monsters.map(advance);

  hero.mpTimer = (hero.mpTimer || 0) + 1;
  if (hero.mpTimer >= MP_REGEN_TICKS) {
    hero.mpTimer = 0;
    hero.mp = Math.min(hero.maxMp, hero.mp + 1);
  }

  if (storm) {
    const spent = storm.hits >= STORM_MAX_HITS;
    const over = tick > storm.until;

    if (spent || over) {
      storm = null;
    } else if (tick >= storm.next) {
      const standing = monsters.filter((m) => !m.dead);

      if (standing.length) {
        const struck = standing[Math.floor(Math.random() * standing.length)];
        const power = POWERS.find((p) => p.key === "godlight");
        const damage = rollBetween(power.dmg);

        effects = addEffect(effects, tick, "godlight", struck.x);
        floats = addFloat(floats, tick, String(damage), power.color, struck.x);

        let earned = 0;
        monsters = monsters.map((m) => {
          if (m.id !== struck.id || m.dead) {
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

        storm = {
          ...storm,
          hits: storm.hits + 1,
          next: tick + STORM_GAP[0] + Math.floor(Math.random() * (STORM_GAP[1] - STORM_GAP[0] + 1)),
        };
      } else {
        // Nothing to strike this instant, but the storm has not blown out.
        storm = { ...storm, next: tick + 1 };
      }
    }
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
      lastBossJourney,
      storm: null,
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
      monsters: spawnWave(16, hero.level),
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
        gold: 60 + Math.floor(Math.random() * 90),
        contents: rollChestContents()
          .concat(pick(SPECIAL_ITEMS))
          .concat(Math.random() < GOD_DROP_CHANCE ? [godTreasure()] : []),
      });
    } else if (Math.random() < DROP_CHANCE) {
      const loot = Math.random() < 0.4
        ? { ...pick(COMMON_ITEMS), kind: "item" }
        : { ...pick(DROPS) };
      if (loot.kind === "coin") {
        loot.amount = 3 + Math.floor(Math.random() * 12);
      }
      drops = drops.concat({ ...loot, id: id(), x: m.x, born: tick });
    }
  }
  monsters = survivors;

  const living = monsters.filter((m) => !m.dead);

  if (living.length === 0) {
    waveGap += 1;
    if (waveGap === 1 && hero.level >= BOSS_MIN_LEVEL && Math.random() < GOLDEN_CHEST_CHANCE) {
      drops = drops.concat({
        kind: "chest",
        name: "GOLDEN CHEST",
        color: "#ffd76b",
        golden: true,
        id: id(),
        x: clamp(FIELD_MIN + Math.random() * (FIELD_MAX - FIELD_MIN), FIELD_MIN, FIELD_MAX),
        born: tick,
        mimic: false,
        gold: 80 + Math.floor(Math.random() * 120),
        contents: [godTreasure()],
      });
    } else if (waveGap === 1 && Math.random() < CHEST_CHANCE) {
      drops = drops.concat({
        kind: "chest",
        name: "CHEST",
        color: "#ffd76b",
        id: id(),
        x: clamp(FIELD_MIN + Math.random() * (FIELD_MAX - FIELD_MIN), FIELD_MIN, FIELD_MAX),
        born: tick,
        mimic: Math.random() < MIMIC_CHANCE,
        gold: 10 + Math.floor(Math.random() * 40),
        contents: rollChestContents(),
      });
    }
    const wanted = drops.filter((d) => worthTaking(hero, d));
    if (wanted.length === 0 && waveGap >= WAVE_PAUSE) {
      if (wavesLeft > 0) {
        // The scene has more to throw at him, so he stays put.
        monsters = monsters.concat(
          spawnWave(hero.x, hero.level, bossAllowed(hero.level, journey, lastBossJourney))
        );
        if (monsters.some((m) => m.boss)) {
          lastBossJourney = journey;
        }
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
      // What he chose to leave behind stays behind.
      drops = [];
      // The left property is eased, which would drag him back across the frame
      // in view. This marks the one frame that must not animate.
      hero.warp = tick;
      monsters = spawnWave(
        FIELD_MIN + 20,
        hero.level,
        bossAllowed(hero.level, journey, lastBossJourney)
      );
      if (monsters.some((m) => m.boss)) {
        lastBossJourney = journey;
      }
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

    return { tick, hero, monsters, drops, floats, effects, waveGap, journey, travelling, wavesLeft, lastBossJourney, storm };
  }

  // Hero: fetch loot when the field allows it, otherwise close on the nearest
  // monster and swing when in reach.
  if (hero.state !== "attack" && hero.state !== "cast" && hero.state !== "hurt") {
    const target = living
      .slice()
      .sort((a, b) => Math.abs(a.x - hero.x) - Math.abs(b.x - hero.x))[0];

    const nearest = (list) =>
      list.slice().sort((a, b) => Math.abs(a.x - hero.x) - Math.abs(b.x - hero.x))[0];

    const loot = nearest(drops.filter((d) => worthTaking(hero, d)));
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
    } else if (target) {
      const gap = target.x - hero.x;
      hero.face = gap >= 0 ? 1 : -1;

      if (Math.abs(gap) <= HERO_REACH) {
        if (hero.cooldown === 0) {
          const power = choosePower(hero.powers, hero.mp);

          if (power && power.key === "godlight") {
            hero.mp -= power.cost;
            hero.state = "cast";
            hero.timer = CAST_TICKS;
            hero.cooldown = HERO_COOLDOWN + 2;
            hero.spell = power.key;

            storm = { until: tick + STORM_TICKS, next: tick, hits: 0 };
            floats = addFloat(floats, tick, power.name, power.color, hero.x);

            return { tick, hero, monsters, drops, floats, effects, waveGap, journey, travelling, wavesLeft, lastBossJourney, storm };
          }

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
                effects = addEffect(effects, tick, "heal", hero.x);
              }
            }

            floats = addFloat(floats, tick, power.name, power.color, hero.x);
          } else {
            const crit = Math.random() < 0.18;
            const damage = rollBetween([3, 6]) + hero.weapon + (crit ? 5 : 0);
            effects = addEffect(effects, tick, "melee", target.x);

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
    // Collected into lists the loop only appends to, so the closures below do
    // not capture variables being reassigned each pass.
    const announced = [];
    let sprung = [];
    let spilled = [];

    for (const d of drops) {
      if (Math.abs(d.x - hero.x) > PICKUP_RANGE || !worthTaking(hero, d)) {
        kept.push(d);
        continue;
      }

      const push = (text, color) => announced.push({ text, color, x: d.x });

      if (d.kind === "chest" && d.mimic) {
        // Bait. It springs the moment he reaches for it.
        const def = MONSTERS.find((m) => m.kind === "mimic");
        sprung = sprung.concat({
          ...def,
          id: id(),
          hp: def.maxHp,
          x: d.x,
          face: hero.x >= d.x ? 1 : -1,
          state: "attack",
          timer: ATTACK_TICKS,
          cooldown: 2,
          slot: 0,
          dead: false,
        });
        push("MIMIC!", "#ff6b8a");
      } else if (d.kind === "chest") {
        push("CHEST", "#ffd76b");

        // The lid comes off and everything inside lands on the ground, so he
        // has to gather it rather than absorbing it through the lid.
        const spill = d.contents.slice();
        if (d.gold) {
          spill.push({ kind: "coin", label: "GOLD", color: "#ffd76b", amount: d.gold });
        }
        const mid = (spill.length - 1) / 2;
        spilled = spilled.concat(spill.map((entry, i) => ({
          ...entry,
          id: id(),
          x: clamp(d.x + (i - mid) * 7, FIELD_MIN, FIELD_MAX),
          born: tick,
        })));
      } else {
        hero = applyPickup(hero, d, push);
      }
    }

    for (const a of announced) {
      floats = addFloat(floats, tick, a.text, a.color, a.x);
    }

    if (sprung.length) {
      monsters = monsters.concat(sprung);
      waveGap = 0;
      travelling = false;
    }

    drops = kept.concat(spilled);
  }

  return { tick, hero, monsters, drops, floats, effects, waveGap, journey, travelling, wavesLeft, lastBossJourney, storm };
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
const TOP_COLOURS = ["#3d4a66", "#7a5334", "#7f8ba6", "#c6d0e4", "#f0c34a"];
const LEG_COLOURS = ["#331b0a", "#5c3a1c", "#5f6a84", "#aab4c9", "#d9a636"];
const BOOT_COLOURS = ["#663614", "#7d4a20", "#6f7a92", "#b9c2d6", "#c9962b"];
const GLOVE_COLOURS = ["#cca38e", "#8a5a33", "#7b869e", "#c6d0e4", "#f0c34a"];
const HELM_COLOURS = ["#663614", "#8a5a33", "#7f8ba6", "#c6d0e4", "#ffd76b"];

// Shields are carried, not worn, so they stay an overlay.
const SHIELD_COLOURS = [
  null,
  { base: "#8a6f4a", lit: "#c9a882", boss: "#5c4830" },
  { base: "#c9962b", lit: "#ffd76b", boss: "#8a5f1c" },
  { base: "#cfd6e6", lit: "#f6f9ff", boss: "#9aa3bb" },
  { base: "#ffd76b", lit: "#fff6c9", boss: "#c9962b" },
];

// Which pixels of the base plate belong to which slot. The artist reused one
// brown for both hair and boots, so the row range is what tells them apart;
// colour alone would recolour his head when he found a pair of sabatons.
const SWAPS = [
  { slot: "top", from: [0x3d, 0x4a, 0x66], rows: [8, 13], palette: TOP_COLOURS },
  { slot: "legs", from: [0x33, 0x1b, 0x0a], rows: [9, 15], palette: LEG_COLOURS },
  { slot: "boots", from: [0x66, 0x36, 0x14], rows: [12, 15], palette: BOOT_COLOURS },
  { slot: "gloves", from: [0xcc, 0xa3, 0x8e], rows: [10, 13], palette: GLOVE_COLOURS },
];

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const sheetCache = new Map();

// Repaints the base plate for the gear he is wearing. Swapping the pixels is
// what makes armour look worn rather than stuck on, which drawing rectangles
// over the top never could.
export function recolourKey(gear) {
  return SWAPS.map((sw) => (gear[sw.slot] ? gear[sw.slot].tier : 0)).join("-");
}

function recolouredSheet(gear) {
  const key = recolourKey(gear);
  // Derived rather than spelled out, so adding or removing a swap cannot leave
  // this checking for a key that no longer exists.
  if (/^0(-0)*$/.test(key)) {
    return warriorBase;
  }
  if (sheetCache.has(key)) {
    return sheetCache.get(key);
  }

  // jsdom has no canvas, and a browser that refuses one should still show the
  // hero rather than nothing.
  let canvas;
  try {
    canvas = document.createElement("canvas");
  } catch (e) {
    return warriorBase;
  }
  const ctx = canvas.getContext && canvas.getContext("2d");
  const img = sheetCache.get("__img");
  if (!ctx || !img || !img.complete || !img.naturalWidth) {
    return warriorBase;
  }

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  const rules = SWAPS
    .map((sw) => {
      const tier = gear[sw.slot] ? gear[sw.slot].tier : 0;
      return tier > 0 ? { ...sw, to: hexToRgb(sw.palette[Math.min(tier, 4)]) } : null;
    })
    .filter(Boolean);

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const o = (y * canvas.width + x) * 4;
      if (data[o + 3] < 128) {
        continue;
      }
      for (const rule of rules) {
        if (y < rule.rows[0] || y > rule.rows[1]) {
          continue;
        }
        if (data[o] === rule.from[0] && data[o + 1] === rule.from[1] && data[o + 2] === rule.from[2]) {
          data[o] = rule.to[0];
          data[o + 1] = rule.to[1];
          data[o + 2] = rule.to[2];
          break;
        }
      }
    }
  }

  ctx.putImageData(frame, 0, 0);
  const url = canvas.toDataURL();
  sheetCache.set(key, url);
  return url;
}

function tierOf(piece) {
  return piece ? piece.tier : 0;
}

// The base plate is the warrior with his painted-on shield and sword lifted
// off, and everything he is wearing is drawn over it in the same sixteen by
// sixteen space, so an overlay lands exactly where a pixel would.
function HeroSprite({ gear, frames }) {
  const [sheet, setSheet] = React.useState(warriorBase);
  const key = recolourKey(gear);

  React.useEffect(() => {
    let live = true;

    const paint = () => {
      if (live) {
        setSheet(recolouredSheet(gear));
      }
    };

    if (sheetCache.get("__img")) {
      paint();
      return () => { live = false; };
    }

    const img = new Image();
    img.onload = () => {
      sheetCache.set("__img", img);
      paint();
    };
    img.src = warriorBase;
    return () => { live = false; };
    // The key is the whole of what the repaint depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const helmTier = tierOf(gear.helm);
  const shieldTier = tierOf(gear.shield);
  const weapon = gear.weapon || STARTER_WEAPON;
  const helm = HELM_COLOURS[Math.min(helmTier, 4)];

  const blade = [
    { len: 3, w: 1, body: "#b9c2de", edge: "#eef2ff", guard: "#8a7f5a" },
    { len: 4, w: 1, body: "#c9cfdd", edge: "#f4f7ff", guard: "#c9962b" },
    { len: 5, w: 1, body: "#eef2ff", edge: "#ffffff", guard: "#c9962b" },
    { len: 5, w: 2, body: "#ff7a2a", edge: "#ffd76b", guard: "#8a3a10" },
    { len: 6, w: 2, body: "#5fc7ff", edge: "#e6f7ff", guard: "#2a6a8a" },
    { len: 6, w: 2, body: "#c08cff", edge: "#f0e2ff", guard: "#5a3a8a" },
    { len: 7, w: 2, body: "#e8dcae", edge: "#ffd76b", guard: "#c9962b" },
    { len: 8, w: 3, body: "#ffd76b", edge: "#fff6c9", guard: "#c9962b" },
  ][Math.min(weapon.tier, 7)];

  return (
    <span className="bs-rig">
      <span
        className="bs-plate"
        style={{ backgroundImage: "url(" + sheet + ")", "--frames": frames }}
      />
      <svg className="bs-over" viewBox="0 0 16 16" shapeRendering="crispEdges">
        {/* The helm is worn over the head, not tinted onto the hair: the crown
            is covered flat and only the eyes and cheeks are left showing. */}
        {helmTier > 0 && (
          <g>
            <rect x="5" y="3" width="6" height="3" fill={helm} />
            <rect x="5" y="3" width="6" height="1" fill="#ffffff" opacity="0.45" />
            <rect x="4" y="4" width="1" height="3" fill={helm} />
            <rect x="11" y="4" width="1" height="3" fill={helm} />
            {helmTier >= 2 && <rect x="5" y="6" width="6" height="1" fill={helm} opacity="0.85" />}
            {helmTier >= 3 && <rect x="7" y="6" width="1" height="3" fill={helm} />}
            {helmTier >= 4 && (
              <g>
                <rect x="4" y="2" width="1" height="1" fill="#fff6c9" />
                <rect x="7" y="1" width="2" height="2" fill="#fff6c9" />
                <rect x="11" y="2" width="1" height="1" fill="#fff6c9" />
              </g>
            )}
          </g>
        )}

        {/* Carried, so drawn over the body. A heavier shield is taller, wider
            and bossed. */}
        {shieldTier > 0 && (
          <g>
            <rect
              x={4 - Math.min(shieldTier, 2)}
              y={10 - shieldTier}
              width={2 + Math.min(shieldTier, 2)}
              height={3 + shieldTier}
              fill={SHIELD_COLOURS[Math.min(shieldTier, 4)].base}
            />
            <rect
              x={4 - Math.min(shieldTier, 2)}
              y={10 - shieldTier}
              width={2 + Math.min(shieldTier, 2)}
              height="1"
              fill={SHIELD_COLOURS[Math.min(shieldTier, 4)].lit}
            />
            {shieldTier >= 2 && (
              <rect x="3" y="10" width="2" height="2" fill={SHIELD_COLOURS[Math.min(shieldTier, 4)].boss} />
            )}
          </g>
        )}

        <g className={"bs-hero-arm" + (weapon.element ? " bs-blade--" + weapon.element : "")}>
          <rect x="12" y={11 - blade.len} width={blade.w} height={blade.len} fill={blade.body} />
          <rect x="12" y={11 - blade.len} width="1" height={blade.len} fill={blade.edge} />
          <rect x="12" y={11 - blade.len} width={blade.w} height="1" fill="#ffffff" />
          <rect x="11" y="11" width={2 + blade.w} height="1" fill={blade.guard} />
        </g>
      </svg>
    </span>
  );
}

function MonsterSprite({ sheet, frames }) {
  return (
    <span
      className="bs-plate"
      style={{ backgroundImage: "url(" + sheet + ")", "--frames": frames }}
    />
  );
}

function DropSprite({ drop }) {
  // A chest and a mimic are drawn from the same plate on purpose: if the bait
  // looked different from the real thing it would not be bait.
  if (drop.kind === "chest") {
    return (
      <span
        className="bs-plate bs-plate--still bs-plate--drop"
        style={{ backgroundImage: "url(" + mimicSheet + ")", "--frames": 4 }}
      />
    );
  }

  if (drop.kind === "coin") {
    return (
      <span
        className="bs-plate bs-plate--drop"
        style={{ backgroundImage: "url(" + goldSheet + ")", "--frames": 4 }}
      />
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

  if (drop.type === "shield" || drop.type === "helm") {
    return (
      <svg viewBox="0 0 8 8" shapeRendering="crispEdges">
        <path fill={drop.color} d="M1 1h6v4H1z" />
        <path fill={drop.color} d="M2 5h4v2H2z" />
        <rect x="1" y="1" width="6" height="1" fill="#ffffff" />
      </svg>
    );
  }

  if (SLOTS.indexOf(drop.type) !== -1) {
    return (
      <svg viewBox="0 0 8 8" shapeRendering="crispEdges">
        <path fill={drop.color} d="M2 1h4v6H2z" />
        <rect x="1" y="1" width="2" height="3" fill={drop.color} />
        <rect x="5" y="1" width="2" height="3" fill={drop.color} />
        <rect x="2" y="1" width="4" height="1" fill="#ffffff" />
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

function EffectSprite({ kind }) {
  const art = EFFECT_ART[kind] || EFFECT_ART.melee;

  if (art.bolt) {
    return (
      <span className="bs-bolt">
        <svg viewBox="0 0 12 40" shapeRendering="crispEdges" preserveAspectRatio="none">
          <path fill="#fff6c9" d="M6 0h3v10H6zM4 10h4v9H4zM6 19h4v11H6zM4 30h4v10H4z" />
          <path fill="#ffffff" d="M7 0h1v10H7zM5 10h1v9H5zM7 19h1v11H7zM5 30h1v10H5z" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={"bs-plate bs-plate--fx" + (art.tall ? " bs-plate--tall" : "")}
      style={{
        backgroundImage: "url(" + art.sheet + ")",
        filter: art.filter,
        "--frames": art.frames,
        "--fxframes": art.frames,
      }}
    />
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

  if (item.type === "helm") {
    return (
      <svg className="bs-icon" viewBox="0 0 10 10" shapeRendering="crispEdges">
        <path fill={c} d="M2 2h6v5H2z" />
        <rect x="2" y="2" width="6" height="1" fill="#ffffff" />
        <rect x="2" y="4" width="2" height="2" fill="#2b2340" />
        <rect x="6" y="4" width="2" height="2" fill="#2b2340" />
        <rect x="1" y="7" width="8" height="1" fill={c} />
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

  if (item.type === "top" || item.type === "legs" || item.type === "boots" || item.type === "gloves") {
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
      <span className={item && item.god ? "bs-tag--god" : undefined}>
        {item ? item.name : fallback}
      </span>
      {item && <span className="bs-slot__stat">{describeItem(item)}</span>}
    </div>
  );
}

// Consumables of a kind are one line with a count; every piece of gear stays its
// own line, since two breastplates are two things and may differ.
export function groupInventory(inventory) {
  const rows = [];

  for (const item of inventory) {
    const stacks = item.kind === "potion" || item.kind === "mana" || item.type === "trophy";
    const found = stacks && rows.find((r) => r.item.key === item.key || (r.item.kind && r.item.kind === item.kind));

    if (found) {
      found.count += 1;
    } else {
      rows.push({ item, count: 1 });
    }
  }

  return rows;
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
          <button type="button" tabIndex={-1} className="bs-close" onClick={onClose}>X</button>
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
              <dt>GOLD</dt><dd>{hero.gold || 0}</dd>
            </dl>

            <Slot label="WEAPON" item={hero.gear.weapon} fallback="BARE HANDS" />
            <Slot label="SHIELD" item={hero.gear.shield} fallback="NONE" />
            <Slot label="HELM" item={hero.gear.helm} fallback="BARE HEAD" />
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
              groupInventory(hero.inventory).map((row, i) => {
                const spell = row.item.type === "spell"
                  ? POWERS.find((p) => p.key === row.item.grants)
                  : null;
                const locked = spell && hero.powers.indexOf(spell.key) === -1;

                return (
                  <div className="bs-bag__row" key={(row.item.key || row.item.kind) + i}>
                    <ItemIcon item={row.item} />
                    <span className={row.item.god ? "bs-tag--god" : undefined}>
                      {row.item.name || row.item.label}
                    </span>
                    {row.count > 1 && <span className="bs-bag__count">x{row.count}</span>}
                    <span className="bs-bag__stat">
                      {locked ? "NEEDS " + spell.cost + " MP" : describeItem(row.item)}
                    </span>
                    <span className="bs-bag__kind">{(row.item.type || row.item.kind).toUpperCase()}</span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {hasFullGodSet(hero.gear) && (
          <p className="bs-sheet__god">GODS GOLD SET COMPLETE</p>
        )}
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

      {/* Ambience: after the scenery so it shows against it, before the field so
          the fighters pass in front of it. */}
      <span className="sprite sprite--shoot" />
      <span className="sprite sprite--fly sprite--fly1" />
      <span className="sprite sprite--fly sprite--fly2" />

      <div className="bs-field">
      {drops.map((d) => (
        <span
          key={d.id}
          className={"bs-drop"
            + (d.kind === "chest" ? " bs-drop--chest" : "")
            + (d.golden ? " bs-drop--golden" : "")}
          style={{ left: d.x + "%" }}
        >
          <DropSprite drop={d} />
        </span>
      ))}

      {(effects || []).map((e) => (
        <span key={e.id} className="bs-fx" style={{ left: e.x + "%" }}>
          <EffectSprite kind={e.key} />
        </span>
      ))}

      <span
        className={"bs-unit bs-unit--hero bs-move-walk is-" + hero.state
          + (hero.warp === state.tick ? " is-warp" : "")
          + (hasFullGodSet(hero.gear) ? " is-godly" : "")
          + (hero.state === "cast" && hero.spell ? " spell-" + hero.spell : "")}
        style={{ left: hero.x + "%" }}
      >
        <span className="bs-meters">
          <Bar value={hero.hp} max={HERO_MAX_HP} color="#6ddf8e" width={24} />
          <Bar value={hero.mp} max={HERO_MAX_MP} color="#6bb6ff" width={24} />
        </span>
        <span className="bs-facing" style={{ transform: "scaleX(" + hero.face + ")" }}>
          <span className="bs-sprite">
            <HeroSprite gear={hero.gear} frames={12} />
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
            <Bar value={m.hp} max={m.maxHp} color={m.color} width={26} />
          </span>
          <span className="bs-facing" style={{ transform: "scaleX(" + m.face + ")" }}>
            <span className="bs-sprite">
              <MonsterSprite sheet={m.sheet} frames={m.sheetFrames} />
            </span>
          </span>
        </span>
      ))}

      {floats.map((f) => (
        <span
          key={f.id}
          className="bs-float"
          style={{ left: f.x + "%", color: f.color, bottom: 60 + (f.lane || 0) * 11 + "px" }}
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
