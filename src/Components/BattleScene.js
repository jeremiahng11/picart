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

/* A self-running battle that decorates the cartridge label. It is purely
 * ornamental: aria-hidden, driven by one interval, and it touches nothing in
 * the app. The whole thing is skipped when the user asks for reduced motion.
 */

import React from "react";

const TICK_MS = 820;
export const HERO_MAX_HP = 26;
export const HERO_MAX_MP = 12;
const DROP_CHANCE = 0.55;
const FLOAT_LIFE = 3;

const MONSTERS = [
  { kind: "slime", name: "SLIME", color: "#6ddf8e", maxHp: 10, dmg: [1, 3] },
  { kind: "bat", name: "BAT", color: "#b48ce0", maxHp: 8, dmg: [2, 4] },
  { kind: "ghost", name: "GHOST", color: "#8fd7ff", maxHp: 13, dmg: [1, 4] },
  { kind: "imp", name: "IMP", color: "#ff9b6b", maxHp: 16, dmg: [3, 6] },
];

const DROPS = [
  { kind: "potion", label: "+HP", color: "#ff6b8a" },
  { kind: "mana", label: "+MP", color: "#6bb6ff" },
  { kind: "coin", label: "GOLD", color: "#ffd76b" },
  { kind: "relic", label: "RELIC", color: "#e6e0ff" },
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function rollBetween([lo, hi]) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function spawnMonster() {
  const def = pick(MONSTERS);
  return { ...def, hp: def.maxHp, hurt: false, attacking: false, dead: false, timer: 0 };
}

export function initialState() {
  return {
    hero: {
      hp: HERO_MAX_HP,
      mp: HERO_MAX_MP,
      hurt: false,
      attacking: false,
      dead: false,
      timer: 0,
    },
    monster: spawnMonster(),
    drop: null,
    floats: [],
    turn: "hero",
    tick: 0,
  };
}

let floatId = 0;

function addFloat(floats, tick, text, color, side) {
  floatId += 1;
  return floats.concat({ id: floatId, born: tick, text, color, side });
}

// One turn of combat. Kept pure so the whole sequence is decided here, the
// component only renders what comes out, and it can be tested without timers.
export function step(prev) {
  const tick = prev.tick + 1;
  let floats = prev.floats.filter((f) => tick - f.born < FLOAT_LIFE);

  const hero = { ...prev.hero, hurt: false, attacking: false };
  let monster = { ...prev.monster, hurt: false, attacking: false };
  let drop = prev.drop;
  let turn = prev.turn;

  if (hero.dead) {
    if (hero.timer > 1) {
      return { ...prev, tick, floats, hero: { ...hero, timer: hero.timer - 1 } };
    }
    floats = addFloat(floats, tick, "REVIVE", "#8affc1", "hero");
    return {
      tick,
      floats,
      hero: { ...hero, hp: HERO_MAX_HP, mp: HERO_MAX_MP, dead: false, timer: 0 },
      monster: spawnMonster(),
      drop: null,
      turn: "hero",
    };
  }

  if (monster.dead) {
    if (monster.timer > 1) {
      return { ...prev, tick, floats, monster: { ...monster, timer: monster.timer - 1 } };
    }

    // The hero pockets whatever fell before the next one wanders in.
    if (drop) {
      if (drop.kind === "potion") {
        hero.hp = Math.min(HERO_MAX_HP, hero.hp + 8);
      } else if (drop.kind === "mana") {
        hero.mp = Math.min(HERO_MAX_MP, hero.mp + 5);
      }
      floats = addFloat(floats, tick, drop.label, drop.color, "hero");
      drop = null;
    }

    return { tick, floats, hero, monster: spawnMonster(), drop, turn: "hero" };
  }

  if (turn === "hero") {
    const crit = Math.random() < 0.18;
    const damage = rollBetween([2, 5]) + (crit ? 4 : 0);

    hero.attacking = true;
    monster = { ...monster, hp: monster.hp - damage, hurt: true };
    floats = addFloat(floats, tick, crit ? damage + "!" : String(damage), crit ? "#ffd76b" : "#fff", "monster");

    if (monster.hp <= 0) {
      monster = { ...monster, hp: 0, dead: true, hurt: false, timer: 2 };
      if (Math.random() < DROP_CHANCE) {
        drop = pick(DROPS);
      }
    }

    return { tick, floats, hero, monster, drop, turn: "monster" };
  }

  const damage = rollBetween(monster.dmg);
  monster = { ...monster, attacking: true };
  hero.hp -= damage;
  hero.hurt = true;
  floats = addFloat(floats, tick, String(damage), "#ff8f8f", "hero");

  if (hero.hp <= 0) {
    hero.hp = 0;
    hero.dead = true;
    hero.timer = 3;
    floats = addFloat(floats, tick, "K.O.", "#ff6b8a", "hero");
  }

  return { tick, floats, hero, monster, drop, turn: "hero" };
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
    <svg viewBox="0 0 10 12" shapeRendering="crispEdges">
      <rect x="3" y="0" width="4" height="1" fill="#ffd76b" />
      <rect x="3" y="1" width="4" height="3" fill="#f6cfa6" />
      <rect x="4" y="2" width="1" height="1" fill="#0d0a1c" />
      <rect x="2" y="4" width="6" height="4" fill="#4a7fe0" />
      <rect x="1" y="5" width="1" height="2" fill="#3a63b4" />
      <rect x="9" y="1" width="1" height="7" fill="#e6e0ff" />
      <rect x="8" y="7" width="2" height="1" fill="#8a7fb8" />
      <rect x="2" y="8" width="2" height="4" fill="#2c1f4e" />
      <rect x="6" y="8" width="2" height="4" fill="#2c1f4e" />
    </svg>
  );
}

function MonsterSprite({ kind }) {
  if (kind === "bat") {
    return (
      <svg viewBox="0 0 12 8" shapeRendering="crispEdges">
        <path fill="currentColor" d="M5 2h2v4H5zM3 3h2v2H3zM0 1h3v3H0zM7 3h2v2H7zM9 1h3v3H9z" />
        <rect x="5" y="3" width="1" height="1" fill="#0d0a1c" />
      </svg>
    );
  }
  if (kind === "ghost") {
    return (
      <svg viewBox="0 0 10 10" shapeRendering="crispEdges">
        <path fill="currentColor" d="M3 0h4v1h1v1h1v7H1V2h1V1h1z" opacity="0.85" />
        <rect x="3" y="3" width="1" height="2" fill="#0d0a1c" />
        <rect x="6" y="3" width="1" height="2" fill="#0d0a1c" />
        <rect x="1" y="9" width="2" height="1" fill="transparent" />
      </svg>
    );
  }
  if (kind === "imp") {
    return (
      <svg viewBox="0 0 10 10" shapeRendering="crispEdges">
        <rect x="1" y="0" width="1" height="2" fill="currentColor" />
        <rect x="8" y="0" width="1" height="2" fill="currentColor" />
        <path fill="currentColor" d="M2 2h6v6H2z" />
        <rect x="3" y="4" width="1" height="1" fill="#0d0a1c" />
        <rect x="6" y="4" width="1" height="1" fill="#0d0a1c" />
        <rect x="2" y="8" width="2" height="2" fill="currentColor" />
        <rect x="6" y="8" width="2" height="2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 10 8" shapeRendering="crispEdges">
      <path fill="currentColor" d="M3 0h4v1h1v1h1v6H1V2h1V1h1z" />
      <rect x="3" y="3" width="1" height="1" fill="#0d0a1c" />
      <rect x="6" y="3" width="1" height="1" fill="#0d0a1c" />
    </svg>
  );
}

function DropSprite({ kind }) {
  if (kind === "coin") {
    return (
      <svg viewBox="0 0 6 6" shapeRendering="crispEdges">
        <path fill="#ffd76b" d="M2 0h2v1h1v4H1V1h1z" />
        <rect x="2" y="2" width="2" height="2" fill="#c9962b" />
      </svg>
    );
  }
  if (kind === "relic") {
    return (
      <svg viewBox="0 0 6 6" shapeRendering="crispEdges">
        <path fill="#e6e0ff" d="M2 0h2v2h2v2H4v2H2V4H0V2h2z" />
      </svg>
    );
  }
  const glass = kind === "mana" ? "#6bb6ff" : "#ff6b8a";
  return (
    <svg viewBox="0 0 6 7" shapeRendering="crispEdges">
      <rect x="2" y="0" width="2" height="1" fill="#d8cfae" />
      <rect x="1" y="1" width="4" height="5" fill={glass} />
      <rect x="2" y="2" width="1" height="2" fill="#ffffff" opacity="0.55" />
    </svg>
  );
}

function Bar({ value, max, color }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="battle__bar">
      <span className="battle__bar-fill" style={{ width: pct + "%", background: color }} />
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
    const id = setInterval(() => setState(step), TICK_MS);
    return () => clearInterval(id);
  }, [still]);

  const { hero, monster, drop, floats } = state;

  return (
    <div className="battle" aria-hidden="true">
      <div className="battle__row">
        <div className={"battle__unit battle__unit--hero"
          + (hero.attacking ? " is-attacking" : "")
          + (hero.hurt ? " is-hurt" : "")
          + (hero.dead ? " is-dead" : "")}>
          <span className="battle__sprite">
            <HeroSprite />
          </span>
          <span className="battle__meters">
            <Bar value={hero.hp} max={HERO_MAX_HP} color="#6ddf8e" />
            <Bar value={hero.mp} max={HERO_MAX_MP} color="#6bb6ff" />
          </span>
        </div>

        {drop && (
          <span className="battle__drop">
            <DropSprite kind={drop.kind} />
          </span>
        )}

        <div className={"battle__unit battle__unit--monster"
          + (monster.attacking ? " is-attacking" : "")
          + (monster.hurt ? " is-hurt" : "")
          + (monster.dead ? " is-dead" : "")}>
          <span className="battle__meters">
            <Bar value={monster.hp} max={monster.maxHp} color={monster.color} />
          </span>
          <span className="battle__sprite" style={{ color: monster.color }}>
            <MonsterSprite kind={monster.kind} />
          </span>
        </div>
      </div>

      {floats.map((f) => (
        <span
          key={f.id}
          className={"battle__float battle__float--" + f.side}
          style={{ color: f.color }}
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}
