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

/* Scrolling scenery behind the battle.
 *
 * Eight biomes of hand drawn parallax art, four layers each: an opaque sky and
 * three increasingly near silhouettes. The layers tile horizontally, so each
 * one is laid across a strip twice the width of the frame and slid half its
 * length, which loops without a seam. Nearer layers travel faster, and that
 * difference is the whole of the depth effect.
 *
 * Four biomes ship with night artwork of their own. The rest are dimmed and
 * cooled for night rather than being given art that does not exist.
 *
 * Which scene is showing is decided by the battle: the hero walks off the edge
 * of one and into the next, so travel advances the journey rather than a clock.
 */

import React from "react";

import plains_day_0 from "../assets/scenes/plains/day/0.png";
import plains_day_1 from "../assets/scenes/plains/day/1.png";
import plains_day_2 from "../assets/scenes/plains/day/2.png";
import plains_day_3 from "../assets/scenes/plains/day/3.png";
import plains_night_0 from "../assets/scenes/plains/night/0.png";
import plains_night_1 from "../assets/scenes/plains/night/1.png";
import plains_night_2 from "../assets/scenes/plains/night/2.png";
import plains_night_3 from "../assets/scenes/plains/night/3.png";
import forest_day_0 from "../assets/scenes/forest/day/0.png";
import forest_day_1 from "../assets/scenes/forest/day/1.png";
import forest_day_2 from "../assets/scenes/forest/day/2.png";
import forest_day_3 from "../assets/scenes/forest/day/3.png";
import forest_night_0 from "../assets/scenes/forest/night/0.png";
import forest_night_1 from "../assets/scenes/forest/night/1.png";
import forest_night_2 from "../assets/scenes/forest/night/2.png";
import forest_night_3 from "../assets/scenes/forest/night/3.png";
import savana_day_0 from "../assets/scenes/savana/day/0.png";
import savana_day_1 from "../assets/scenes/savana/day/1.png";
import savana_day_2 from "../assets/scenes/savana/day/2.png";
import savana_day_3 from "../assets/scenes/savana/day/3.png";
import savana_night_0 from "../assets/scenes/savana/night/0.png";
import savana_night_1 from "../assets/scenes/savana/night/1.png";
import savana_night_2 from "../assets/scenes/savana/night/2.png";
import savana_night_3 from "../assets/scenes/savana/night/3.png";
import meadow_day_0 from "../assets/scenes/meadow/day/0.png";
import meadow_day_1 from "../assets/scenes/meadow/day/1.png";
import meadow_day_2 from "../assets/scenes/meadow/day/2.png";
import meadow_day_3 from "../assets/scenes/meadow/day/3.png";
import meadow_night_0 from "../assets/scenes/meadow/night/0.png";
import meadow_night_1 from "../assets/scenes/meadow/night/1.png";
import meadow_night_2 from "../assets/scenes/meadow/night/2.png";
import meadow_night_3 from "../assets/scenes/meadow/night/3.png";
import desert_day_0 from "../assets/scenes/desert/day/0.png";
import desert_day_1 from "../assets/scenes/desert/day/1.png";
import desert_day_2 from "../assets/scenes/desert/day/2.png";
import desert_day_3 from "../assets/scenes/desert/day/3.png";
import mountains_day_0 from "../assets/scenes/mountains/day/0.png";
import mountains_day_1 from "../assets/scenes/mountains/day/1.png";
import mountains_day_2 from "../assets/scenes/mountains/day/2.png";
import mountains_day_3 from "../assets/scenes/mountains/day/3.png";
import ruins_day_0 from "../assets/scenes/ruins/day/0.png";
import ruins_day_1 from "../assets/scenes/ruins/day/1.png";
import ruins_day_2 from "../assets/scenes/ruins/day/2.png";
import ruins_day_3 from "../assets/scenes/ruins/day/3.png";
import temple_day_0 from "../assets/scenes/temple/day/0.png";
import temple_day_1 from "../assets/scenes/temple/day/1.png";
import temple_day_2 from "../assets/scenes/temple/day/2.png";
import temple_day_3 from "../assets/scenes/temple/day/3.png";

const SCENES = {
  plains: { day: [plains_day_0, plains_day_1, plains_day_2, plains_day_3], night: [plains_night_0, plains_night_1, plains_night_2, plains_night_3] },
  forest: { day: [forest_day_0, forest_day_1, forest_day_2, forest_day_3], night: [forest_night_0, forest_night_1, forest_night_2, forest_night_3] },
  savana: { day: [savana_day_0, savana_day_1, savana_day_2, savana_day_3], night: [savana_night_0, savana_night_1, savana_night_2, savana_night_3] },
  meadow: { day: [meadow_day_0, meadow_day_1, meadow_day_2, meadow_day_3], night: [meadow_night_0, meadow_night_1, meadow_night_2, meadow_night_3] },
  desert: { day: [desert_day_0, desert_day_1, desert_day_2, desert_day_3], night: null },
  mountains: { day: [mountains_day_0, mountains_day_1, mountains_day_2, mountains_day_3], night: null },
  ruins: { day: [ruins_day_0, ruins_day_1, ruins_day_2, ruins_day_3], night: null },
  temple: { day: [temple_day_0, temple_day_1, temple_day_2, temple_day_3], night: null },
};

export const BIOMES = Object.keys(SCENES);

export const PHASES = ["day", "night"];

// How many scenes a phase holds for. Alternating every scene made the sky
// flicker between lands; a run means the hero travels through several daylit
// places, then several dark ones.
export const PHASE_RUN = 3;

export const CYCLE = 24;

// Biome advances every scene, phase only every PHASE_RUN. The two cycles are of
// different lengths, which is what eventually pairs each land with both of its
// palettes instead of freezing it in one.
export function sceneAt(step) {
  const wrapped = ((step % CYCLE) + CYCLE) % CYCLE;
  return {
    biome: BIOMES[wrapped % BIOMES.length],
    phase: PHASES[Math.floor(wrapped / PHASE_RUN) % 2],
  };
}

// Interiors are lit by their own torches, so the hero can step into one under
// any sky and come out under either.
export function isInterior(biome) {
  return biome === "temple" || biome === "ruins";
}

// The art for a scene, and whether night had to be faked from the day plates.
export function layersFor(biome, phase) {
  const scene = SCENES[biome] || SCENES[BIOMES[0]];
  if (phase === "night" && scene.night) {
    return { layers: scene.night, dimmed: false };
  }
  if (phase === "night") {
    return { layers: scene.day, dimmed: true };
  }
  return { layers: scene.day, dimmed: false };
}

// Seconds for one full pass of each layer. The sky barely moves; the nearest
// band runs fastest.
const SPEEDS = [420, 150, 84, 48];

export default function Scenery({ step }) {
  // The outgoing scene stays mounted underneath so the incoming one can fade
  // over it rather than snapping.
  const showing = step === 0 ? [step] : [step - 1, step];

  return (
    <div className="sc" aria-hidden="true">
      {showing.map((s) => {
        const { biome, phase } = sceneAt(s);
        const { layers, dimmed } = layersFor(biome, phase);

        return (
          <div
            key={s}
            className={"sc-scene sc-" + biome + " is-" + phase + (dimmed ? " is-dimmed" : "")}
          >
            {layers.map((src, i) => (
              <div
                key={i}
                className={"sc-layer sc-layer--" + i}
                style={{
                  backgroundImage: "url(" + src + ")",
                  animationDuration: SPEEDS[i] + "s",
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
