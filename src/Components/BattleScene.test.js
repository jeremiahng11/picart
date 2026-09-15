import { step, initialState, spawnWave, MONSTERS, HERO_MAX_HP, HERO_MAX_MP } from './BattleScene';

// The skirmish rolls dice, so tests pin Math.random to make a frame
// deterministic.
function withRandom(value, fn) {
  const real = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

function heroAt(x, extra = {}) {
  const base = withRandom(0.5, initialState);
  return { ...base, hero: { ...base.hero, x, ...extra }, monsters: [], drops: [] };
}

function monster(kind, x, extra = {}) {
  const def = MONSTERS.find((m) => m.kind === kind);
  return {
    ...def, id: 1, hp: def.maxHp, x, face: -1,
    state: 'walk', timer: 0, cooldown: 0, slot: 0, dead: false, ...extra,
  };
}

test('there are seven kinds of monster, each with its own sprite key', () => {
  expect(MONSTERS).toHaveLength(7);
  expect(new Set(MONSTERS.map((m) => m.kind)).size).toBe(7);
});

test('the original hopping slime is still one of them', () => {
  const slime = MONSTERS.find((m) => m.kind === 'slime');
  expect(slime).toBeDefined();
  expect(slime.move).toBe('hop');
});

test('a wave holds between one and three monsters', () => {
  for (let i = 0; i < 80; i++) {
    const wave = spawnWave();
    expect(wave.length).toBeGreaterThanOrEqual(1);
    expect(wave.length).toBeLessThanOrEqual(3);
  }
});

test('monsters in a wave are fanned out rather than stacked', () => {
  const wave = withRandom(0.9, spawnWave);
  const xs = wave.map((m) => m.x);
  expect(new Set(xs).size).toBe(xs.length);
});

test('the hero walks toward a monster that is out of reach', () => {
  const state = { ...heroAt(16), monsters: [monster('skeleton', 90)] };
  const after = withRandom(0.5, () => step(state));

  expect(after.hero.state).toBe('walk');
  expect(after.hero.x).toBeGreaterThan(16);
  expect(after.hero.face).toBe(1);
});

test('the hero swings once the monster is within reach', () => {
  const state = { ...heroAt(16), monsters: [monster('skeleton', 21)] };
  const after = withRandom(0.5, () => step(state));

  expect(after.hero.state).toBe('attack');
  expect(after.monsters[0].hp).toBeLessThan(after.monsters[0].maxHp);
});

test('monsters are drawn toward the hero', () => {
  const state = { ...heroAt(16, { cooldown: 99 }), monsters: [monster('spider', 90)] };
  const after = withRandom(0.5, () => step(state));

  expect(after.monsters[0].x).toBeLessThan(90);
  expect(after.monsters[0].state).toBe('walk');
});

test('a monster dies when its health is spent', () => {
  const state = { ...heroAt(16), monsters: [monster('slime', 20, { hp: 1 })] };
  const after = withRandom(0.5, () => step(state));

  expect(after.monsters[0].dead).toBe(true);
  expect(after.monsters[0].hp).toBe(0);
});

test('a corpse leaves loot behind and the hero collects it by walking over it', () => {
  const state = {
    ...heroAt(40, { hp: 5, cooldown: 99 }),
    monsters: [monster('slime', 40, { hp: 0, dead: true, state: 'dead', timer: 1 })],
  };
  const after = withRandom(0.1, () => step(state));

  expect(after.monsters).toHaveLength(0);
  expect(after.hero.hp).toBeGreaterThan(5);
  expect(after.drops).toHaveLength(0);
});

test('loot out of the hero reach stays on the ground', () => {
  const state = {
    ...heroAt(10, { cooldown: 99 }),
    monsters: [],
    drops: [{ kind: 'coin', label: 'GOLD', color: '#ffd76b', id: 9, x: 80, born: 0 }],
  };
  const after = withRandom(0.9, () => step(state));

  expect(after.drops).toHaveLength(1);
});

test('the hero is knocked out when a monster lands the last hit', () => {
  const state = {
    ...heroAt(40, { hp: 1, cooldown: 99 }),
    monsters: [monster('imp', 42)],
  };
  const after = withRandom(0.9, () => step(state));

  expect(after.hero.dead).toBe(true);
  expect(after.hero.hp).toBe(0);
  expect(after.floats.some((f) => f.text === 'K.O.')).toBe(true);
});

test('a knocked out hero revives at full strength against a new wave', () => {
  const base = heroAt(40, { hp: 0, dead: true, state: 'dead', respawn: 1 });
  const after = withRandom(0.5, () => step(base));

  expect(after.hero.dead).toBe(false);
  expect(after.hero.hp).toBe(HERO_MAX_HP);
  expect(after.hero.mp).toBe(HERO_MAX_MP);
  expect(after.monsters.length).toBeGreaterThanOrEqual(1);
});

test('a cleared field brings in another wave', () => {
  let s = { ...heroAt(50), monsters: [], waveGap: 0 };
  for (let i = 0; i < 40 && s.monsters.length === 0; i++) {
    s = step(s);
  }
  expect(s.monsters.length).toBeGreaterThanOrEqual(1);
});

test('a long skirmish never breaks its invariants', () => {
  let s = initialState();

  for (let i = 0; i < 1200; i++) {
    s = step(s);

    expect(s.hero.hp).toBeGreaterThanOrEqual(0);
    expect(s.hero.hp).toBeLessThanOrEqual(HERO_MAX_HP);
    expect(s.hero.mp).toBeLessThanOrEqual(HERO_MAX_MP);
    expect(s.hero.x).toBeGreaterThanOrEqual(0);
    expect(s.hero.x).toBeLessThanOrEqual(100);
    expect(s.monsters.length).toBeLessThanOrEqual(6);
    expect(s.floats.length).toBeLessThan(30);
    expect(s.drops.length).toBeLessThan(20);

    for (const m of s.monsters) {
      expect(m.hp).toBeGreaterThanOrEqual(0);
      expect(m.hp).toBeLessThanOrEqual(m.maxHp);
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThanOrEqual(100);
    }
  }
});
