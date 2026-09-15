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

/* Scrolling scenery behind the battle. Eight biomes, each with a day and a
 * night palette, giving sixteen looks that the journey walks through in order.
 *
 * The artwork is entirely gradient layers declared in App.css. Which scene is
 * showing is decided by the battle: the hero walks off the edge of one and into
 * the next, so travel advances the journey rather than a clock.
 */

import React from "react";

export const BIOMES = [
  "plains",
  "forest",
  "castle",
  "desert",
  "dungeon",
  "coast",
  "ruins",
  "volcano",
];

export const PHASES = ["day", "night"];

// Each step of the journey is one biome in one phase, so the cycle runs
// forest day, forest night, desert day, and so on.
export function sceneAt(step) {
  const wrapped = ((step % (BIOMES.length * 2)) + BIOMES.length * 2) % (BIOMES.length * 2);
  return {
    biome: BIOMES[Math.floor(wrapped / 2)],
    phase: PHASES[wrapped % 2],
  };
}

export default function Scenery({ step }) {
  // The outgoing scene stays mounted underneath so the incoming one can fade
  // over it rather than snapping.
  const showing = step === 0 ? [step] : [step - 1, step];

  return (
    <div className="sc" aria-hidden="true">
      {showing.map((s) => {
        const { biome, phase } = sceneAt(s);
        return (
          <div key={s} className={"sc-scene sc-" + biome + " is-" + phase}>
            <div className="sc-sky" />
            <div className="sc-stars" />
            <div className="sc-orb" />
            <div className="sc-far" />
            <div className="sc-mid" />
            <div className="sc-near" />
            <div className="sc-ground" />
          </div>
        );
      })}
    </div>
  );
}
