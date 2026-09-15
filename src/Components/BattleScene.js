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

const TICK_MS = 165;

export const HERO_MAX_HP = 30;
export const HERO_MAX_MP = 12;

const HERO_SPEED = 1.5;
const HERO_REACH = 9;
const HERO_COOLDOWN = 5;

const FIELD_MIN = 4;
const FIELD_MAX = 94;
const PICKUP_RANGE = 5;
const WAVE_GAP = 12;
const DROP_CHANCE = 0.55;
const FLOAT_LIFE = 9;
const HURT_TICKS = 3;
const ATTACK_TICKS = 3;
const DEATH_TICKS = 5;

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

const DROPS = [
  { kind: "potion", label: "+HP", color: "#ff6b8a" },
  { kind: "mana", label: "+MP", color: "#6bb6ff" },
  { kind: "coin", label: "GOLD", color: "#ffd76b" },
  { kind: "relic", label: "RELIC", color: "#e6e0ff" },
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

// One to three at a time, fanned out so they queue up rather than stacking on
// the same pixel.
export function spawnWave() {
  const count = 1 + Math.floor(Math.random() * 3);
  const wave = [];

  for (let i = 0; i < count; i++) {
    const def = pick(MONSTERS);
    wave.push({
      ...def,
      id: id(),
      hp: def.maxHp,
      x: clamp(FIELD_MAX - i * 9 - Math.random() * 6, FIELD_MIN, FIELD_MAX),
      face: -1,
      state: "walk",
      timer: 0,
      cooldown: Math.floor(Math.random() * 4),
      slot: i,
      dead: false,
    });
  }

  return wave;
}

export function initialState() {
  return {
    tick: 0,
    hero: {
      x: 16,
      hp: HERO_MAX_HP,
      mp: HERO_MAX_MP,
      face: 1,
      state: "idle",
      timer: 0,
      cooldown: 0,
      dead: false,
      respawn: 0,
    },
    monsters: spawnWave(),
    drops: [],
    floats: [],
    waveGap: 0,
  };
}

function addFloat(floats, tick, text, color, x) {
  return floats.concat({ id: id(), born: tick, text, color, x });
}

function advance(unit) {
  const next = { ...unit };
  next.cooldown = Math.max(0, next.cooldown - 1);

  if (next.state === "attack" || next.state === "hurt") {
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
  let drops = prev.drops;
  let waveGap = prev.waveGap;

  let hero = advance(prev.hero);
  let monsters = prev.monsters.map(advance);

  if (hero.dead) {
    hero.respawn -= 1;
    if (hero.respawn > 0) {
      return { ...prev, tick, floats, hero, monsters };
    }

    floats = addFloat(floats, tick, "REVIVE", "#8affc1", 16);
    return {
      tick,
      floats,
      drops: [],
      waveGap: 0,
      hero: {
        ...hero,
        x: 16,
        hp: HERO_MAX_HP,
        mp: HERO_MAX_MP,
        dead: false,
        state: "idle",
        respawn: 0,
      },
      monsters: spawnWave(),
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
      drops = drops.concat({ ...pick(DROPS), id: id(), x: m.x, born: tick });
    }
  }
  monsters = survivors;

  const living = monsters.filter((m) => !m.dead);

  if (living.length === 0) {
    waveGap += 1;
    if (waveGap >= WAVE_GAP) {
      monsters = monsters.concat(spawnWave());
      waveGap = 0;
    }
  } else {
    waveGap = 0;
  }

  // Hero: close on the nearest living monster, swing when in reach.
  if (hero.state !== "attack" && hero.state !== "hurt") {
    const target = living
      .slice()
      .sort((a, b) => Math.abs(a.x - hero.x) - Math.abs(b.x - hero.x))[0];

    if (target) {
      const gap = target.x - hero.x;
      hero.face = gap >= 0 ? 1 : -1;

      if (Math.abs(gap) <= HERO_REACH) {
        if (hero.cooldown === 0) {
          const crit = Math.random() < 0.18;
          const damage = rollBetween([3, 6]) + (crit ? 5 : 0);

          hero.state = "attack";
          hero.timer = ATTACK_TICKS;
          hero.cooldown = HERO_COOLDOWN;

          monsters = monsters.map((m) => {
            if (m.id !== target.id || m.dead) {
              return m;
            }
            const hp = m.hp - damage;
            if (hp <= 0) {
              return { ...m, hp: 0, dead: true, state: "dead", timer: DEATH_TICKS };
            }
            return { ...m, hp, state: "hurt", timer: HURT_TICKS };
          });

          floats = addFloat(
            floats,
            tick,
            crit ? damage + "!" : String(damage),
            crit ? "#ffd76b" : "#ffffff",
            target.x
          );
        } else {
          hero.state = "idle";
        }
      } else {
        hero.state = "walk";
        hero.x = clamp(hero.x + Math.sign(gap) * HERO_SPEED, FIELD_MIN, FIELD_MAX);
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
        const damage = rollBetween(next.dmg);
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

  // Loot is collected by walking over it.
  if (!hero.dead && drops.length) {
    const kept = [];
    for (const d of drops) {
      if (Math.abs(d.x - hero.x) > PICKUP_RANGE) {
        kept.push(d);
        continue;
      }
      if (d.kind === "potion") {
        hero.hp = Math.min(HERO_MAX_HP, hero.hp + 8);
      } else if (d.kind === "mana") {
        hero.mp = Math.min(HERO_MAX_MP, hero.mp + 5);
      }
      floats = addFloat(floats, tick, d.label, d.color, d.x);
    }
    drops = kept;
  }

  return { tick, hero, monsters, drops, floats, waveGap };
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function HeroSprite() {
  return (
    <svg viewBox="0 0 16 18" shapeRendering="crispEdges">
      <g className="bs-hero-body">
        <rect x="5" y="0" width="6" height="1" fill="#ffd76b" />
        <rect x="4" y="1" width="8" height="1" fill="#c9962b" />
        <rect x="5" y="2" width="6" height="3" fill="#f6cfa6" />
        <rect x="6" y="3" width="1" height="1" fill="#0d0a1c" />
        <rect x="9" y="3" width="1" height="1" fill="#0d0a1c" />
        <rect x="4" y="5" width="8" height="5" fill="#4a7fe0" />
        <rect x="4" y="7" width="8" height="1" fill="#2f5bb0" />
        <rect x="6" y="6" width="4" height="1" fill="#8fc0ff" />
        <rect x="3" y="6" width="1" height="3" fill="#3a63b4" />
        <rect x="4" y="10" width="3" height="5" fill="#2c1f4e" />
        <rect x="9" y="10" width="3" height="5" fill="#2c1f4e" />
        <rect x="3" y="15" width="4" height="2" fill="#6b4a2a" />
        <rect x="9" y="15" width="4" height="2" fill="#6b4a2a" />
      </g>
      <g className="bs-hero-arm">
        <rect x="12" y="6" width="2" height="2" fill="#f6cfa6" />
        <rect x="13" y="2" width="1" height="5" fill="#8a7fb8" />
        <rect x="13" y="0" width="1" height="2" fill="#e6e0ff" />
        <rect x="12" y="5" width="3" height="1" fill="#c9962b" />
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
      return (
        <svg viewBox="0 0 12 9" shapeRendering="crispEdges">
          <path fill="currentColor" d="M4 0h4v1h2v1h1v6H1V2h1V1h2z" />
          <path fill="#ffffff" opacity="0.35" d="M3 2h2v1H3z" />
          <rect x="4" y="4" width="1" height="2" fill="#0d0a1c" />
          <rect x="7" y="4" width="1" height="2" fill="#0d0a1c" />
        </svg>
      );
  }
}

function DropSprite({ kind }) {
  if (kind === "coin") {
    return (
      <svg viewBox="0 0 7 7" shapeRendering="crispEdges">
        <path fill="#ffd76b" d="M2 0h3v1h1v5H1V1h1z" />
        <rect x="3" y="2" width="1" height="3" fill="#c9962b" />
      </svg>
    );
  }
  if (kind === "relic") {
    return (
      <svg viewBox="0 0 7 7" shapeRendering="crispEdges">
        <path fill="#e6e0ff" d="M3 0h1v2h2v1h1v1H5v3H2V4H0V3h2V2h1z" />
      </svg>
    );
  }
  const glass = kind === "mana" ? "#6bb6ff" : "#ff6b8a";
  return (
    <svg viewBox="0 0 7 8" shapeRendering="crispEdges">
      <rect x="3" y="0" width="2" height="1" fill="#d8cfae" />
      <rect x="2" y="1" width="4" height="6" fill={glass} />
      <rect x="3" y="2" width="1" height="2" fill="#ffffff" opacity="0.6" />
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

  const { hero, monsters, drops, floats } = state;

  return (
    <div className="bs" aria-hidden="true">
      {drops.map((d) => (
        <span key={d.id} className="bs-drop" style={{ left: d.x + "%" }}>
          <DropSprite kind={d.kind} />
        </span>
      ))}

      <span
        className={"bs-unit bs-unit--hero bs-move-walk is-" + hero.state}
        style={{ left: hero.x + "%" }}
      >
        <span className="bs-meters">
          <Bar value={hero.hp} max={HERO_MAX_HP} color="#6ddf8e" width={24} />
          <Bar value={hero.mp} max={HERO_MAX_MP} color="#6bb6ff" width={24} />
        </span>
        <span className="bs-sprite" style={{ transform: "scaleX(" + hero.face + ")" }}>
          <HeroSprite />
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
          <span className="bs-sprite" style={{ transform: "scaleX(" + m.face + ")" }}>
            <MonsterSprite kind={m.kind} />
          </span>
        </span>
      ))}

      {floats.map((f) => (
        <span key={f.id} className="bs-float" style={{ left: f.x + "%", color: f.color }}>
          {f.text}
        </span>
      ))}
    </div>
  );
}
