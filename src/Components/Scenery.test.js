import { sceneAt, isInterior, layersFor, BIOMES, PHASES, PHASE_RUN, CYCLE } from './Scenery';

test('eight biomes, each with a day and a night, gives sixteen looks', () => {
  expect(BIOMES).toHaveLength(8);
  expect(PHASES).toEqual(['day', 'night']);
  expect(new Set(BIOMES).size).toBe(8);

  const looks = new Set();
  for (let i = 0; i < CYCLE; i++) {
    const { biome, phase } = sceneAt(i);
    looks.add(biome + ':' + phase);
  }
  expect(looks.size).toBe(16);
});

test('every land is seen under both skies within one cycle', () => {
  const seen = {};
  for (let i = 0; i < CYCLE; i++) {
    const { biome, phase } = sceneAt(i);
    seen[biome] = seen[biome] || new Set();
    seen[biome].add(phase);
  }

  for (const biome of BIOMES) {
    expect(Array.from(seen[biome]).sort()).toEqual(['day', 'night']);
  }
});

test('the sky holds for a run of scenes instead of flickering every scene', () => {
  for (let i = 0; i < CYCLE; i += PHASE_RUN) {
    const run = [];
    for (let k = 0; k < PHASE_RUN; k++) {
      run.push(sceneAt(i + k).phase);
    }
    expect(new Set(run).size).toBe(1);
  }
});

test('a daylit run is followed by a dark one', () => {
  for (let i = 0; i < CYCLE; i += PHASE_RUN) {
    expect(sceneAt(i).phase).not.toBe(sceneAt(i + PHASE_RUN).phase);
  }
});

test('the land changes every scene even while the sky holds', () => {
  for (let i = 0; i < CYCLE - 1; i++) {
    expect(sceneAt(i).biome).not.toBe(sceneAt(i + 1).biome);
  }
});

test('an interior can be entered under one sky and left under another', () => {
  const crossings = [];
  for (let i = 0; i < CYCLE; i++) {
    if (isInterior(sceneAt(i).biome) && sceneAt(i).phase !== sceneAt(i + 1).phase) {
      crossings.push(i);
    }
  }
  expect(crossings.length).toBeGreaterThan(0);
});

test('the temple and the ruins are the interiors', () => {
  expect(isInterior('temple')).toBe(true);
  expect(isInterior('ruins')).toBe(true);
  expect(isInterior('forest')).toBe(false);
});

test('every biome and phase resolves to four layers of art', () => {
  for (const biome of BIOMES) {
    for (const phase of PHASES) {
      const { layers } = layersFor(biome, phase);
      expect(layers).toHaveLength(4);
      for (const src of layers) {
        expect(typeof src).toBe('string');
        expect(src.length).toBeGreaterThan(0);
      }
    }
  }
});

test('biomes with night plates use them, and the rest are dimmed instead', () => {
  // Jest stubs an image import as its bare filename, so every layer resolves to
  // the same string here and the paths cannot be compared. The flag is what
  // carries the decision, so that is what is asserted.
  const authored = BIOMES.filter((b) => !layersFor(b, 'night').dimmed);
  const faked = BIOMES.filter((b) => layersFor(b, 'night').dimmed);

  for (const biome of BIOMES) {
    expect(layersFor(biome, 'day').dimmed).toBe(false);
  }

  expect(authored.length).toBeGreaterThanOrEqual(4);
  expect(faked.length).toBeGreaterThan(0);
  expect(authored.length + faked.length).toBe(BIOMES.length);
});

test('an unknown biome falls back rather than rendering nothing', () => {
  const { layers } = layersFor('atlantis', 'day');
  expect(layers).toHaveLength(4);
});

test('the cycle wraps rather than running off the end', () => {
  expect(sceneAt(CYCLE)).toEqual(sceneAt(0));
  expect(sceneAt(CYCLE * 2 + 5)).toEqual(sceneAt(5));
  expect(sceneAt(-1)).toEqual(sceneAt(CYCLE - 1));
});

test('the original night scene is still in the rotation, with a day of its own', () => {
  expect(BIOMES).toContain('plains');
  expect(sceneAt(0)).toEqual({ biome: 'plains', phase: 'day' });

  const plainsNight = [];
  for (let i = 0; i < CYCLE; i++) {
    const s = sceneAt(i);
    if (s.biome === 'plains' && s.phase === 'night') {
      plainsNight.push(i);
    }
  }
  expect(plainsNight.length).toBeGreaterThan(0);
});
