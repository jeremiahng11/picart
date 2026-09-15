import { sceneAt, BIOMES, PHASES } from './Scenery';

test('eight biomes, each with a day and a night, gives sixteen looks', () => {
  expect(BIOMES).toHaveLength(8);
  expect(PHASES).toEqual(['day', 'night']);
  expect(new Set(BIOMES).size).toBe(8);

  const looks = new Set();
  for (let i = 0; i < 16; i++) {
    const { biome, phase } = sceneAt(i);
    looks.add(biome + ':' + phase);
  }
  expect(looks.size).toBe(16);
});

test('the journey alternates day and night within each biome', () => {
  for (let i = 0; i < 16; i += 2) {
    expect(sceneAt(i).phase).toBe('day');
    expect(sceneAt(i + 1).phase).toBe('night');
    expect(sceneAt(i).biome).toBe(sceneAt(i + 1).biome);
  }
});

test('the cycle wraps rather than running off the end', () => {
  expect(sceneAt(16)).toEqual(sceneAt(0));
  expect(sceneAt(33)).toEqual(sceneAt(1));
  expect(sceneAt(-1)).toEqual(sceneAt(15));
});

test('the original night scene is still in the rotation, with a day of its own', () => {
  expect(BIOMES).toContain('plains');
  expect(sceneAt(0)).toEqual({ biome: 'plains', phase: 'day' });
  expect(sceneAt(1)).toEqual({ biome: 'plains', phase: 'night' });
});

test('the journey visits an interior as well as open country', () => {
  expect(BIOMES).toContain('castle');
  expect(BIOMES).toContain('dungeon');
});
