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
 * The artwork is entirely gradient layers declared in App.css, so this file
 * only decides which biome and phase are showing and keeps the outgoing one
 * around long enough to cross-fade.
 */

import React from "react";

export const BIOMES = [
  "plains",
  "forest",
  "desert",
  "cavern",
  "coast",
  "ruins",
  "tundra",
  "volcano",
];

export const PHASES = ["day", "night"];

const PHASE_MS = 24000;

// Each step of the journey is one biome in one phase, so the cycle runs
// forest day, forest night, desert day, and so on.
export function sceneAt(step) {
  const wrapped = ((step % (BIOMES.length * 2)) + BIOMES.length * 2) % (BIOMES.length * 2);
  return {
    biome: BIOMES[Math.floor(wrapped / 2)],
    phase: PHASES[wrapped % 2],
  };
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function Scenery() {
  const [step, setStep] = React.useState(0);
  const still = React.useMemo(prefersReducedMotion, []);

  React.useEffect(() => {
    if (still) {
      return undefined;
    }
    const handle = setInterval(() => setStep((s) => s + 1), PHASE_MS);
    return () => clearInterval(handle);
  }, [still]);

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
