import {
  step, initialState, spawnWave, choosePower,
  MONSTERS, POWERS, HERO_MAX_HP, HERO_MAX_MP, HERO_DEFENCE,
} from './BattleScene';

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

test('monsters spawn anywhere on the field, not only to one side', () => {
  const sides = new Set();
  for (let i = 0; i < 120; i++) {
    for (const m of spawnWave(50)) {
      sides.add(m.x < 50 ? 'left' : 'right');
    }
  }
  expect(sides.has('left')).toBe(true);
  expect(sides.has('right')).toBe(true);
});

test('a wave keeps its distance from the hero and from itself', () => {
  for (let i = 0; i < 120; i++) {
    const heroX = 20 + Math.random() * 60;
    const wave = spawnWave(heroX);

    for (const m of wave) {
      expect(Math.abs(m.x - heroX)).toBeGreaterThanOrEqual(10);
    }
    for (let a = 0; a < wave.length; a++) {
      for (let b = a + 1; b < wave.length; b++) {
        expect(Math.abs(wave[a].x - wave[b].x)).toBeGreaterThan(2);
      }
    }
  }
});

test('a monster spawned to the left of the hero faces right at him', () => {
  const wave = spawnWave(90);
  for (const m of wave) {
    expect(m.face).toBe(m.x <= 90 ? 1 : -1);
  }
});

test('the hero walks right toward a monster on his right', () => {
  const state = { ...heroAt(16), monsters: [monster('skeleton', 90)] };
  const after = withRandom(0.5, () => step(state));

  expect(after.hero.state).toBe('walk');
  expect(after.hero.x).toBeGreaterThan(16);
  expect(after.hero.face).toBe(1);
});

test('the hero turns and walks left toward a monster behind him', () => {
  const state = { ...heroAt(80), monsters: [monster('skeleton', 10)] };
  const after = withRandom(0.5, () => step(state));

  expect(after.hero.state).toBe('walk');
  expect(after.hero.x).toBeLessThan(80);
  expect(after.hero.face).toBe(-1);
});

test('the hero picks whichever monster is nearest, on either side', () => {
  const state = {
    ...heroAt(50),
    monsters: [monster('skeleton', 12), { ...monster('imp', 56), id: 2 }],
  };
  const after = withRandom(0.5, () => step(state));

  expect(after.hero.face).toBe(1);
  expect(after.monsters.find((m) => m.id === 2).hp).toBeLessThan(16);
});

test('the hero swings once the monster is within reach', () => {
  // A roll above the cast threshold keeps him on the sword.
  const state = { ...heroAt(16), monsters: [monster('skeleton', 21)] };
  const after = withRandom(0.9, () => step(state));

  expect(after.hero.state).toBe('attack');
  expect(after.hero.mp).toBe(HERO_MAX_MP);
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

test('the three powers cost a third, two thirds and all of the mana pool', () => {
  expect(POWERS).toHaveLength(3);
  expect(POWERS.map((p) => p.cost)).toEqual([
    Math.round(HERO_MAX_MP / 3),
    Math.round((HERO_MAX_MP * 2) / 3),
    HERO_MAX_MP,
  ]);
});

test('the dearest power is the strongest and the only one that hits everything', () => {
  const [spark, flame, nova] = POWERS;

  expect(flame.dmg[0]).toBeGreaterThan(spark.dmg[1]);
  expect(nova.dmg[0]).toBeGreaterThan(flame.dmg[1]);
  expect(nova.aoe).toBe(true);
  expect(spark.aoe).toBe(false);
  expect(flame.aoe).toBe(false);
});

test('the hero casts the strongest power he can afford', () => {
  expect(choosePower(HERO_MAX_MP, 0).key).toBe('nova');
  expect(choosePower(POWERS[1].cost, 0).key).toBe('flame');
  expect(choosePower(POWERS[0].cost, 0).key).toBe('spark');
});

test('no power is cast without the mana for it', () => {
  expect(choosePower(POWERS[0].cost - 1, 0)).toBeNull();
  expect(choosePower(0, 0)).toBeNull();
});

test('the hero sometimes swings instead of casting', () => {
  expect(choosePower(HERO_MAX_MP, 0.99)).toBeNull();
});

test('casting spends the mana it costs', () => {
  const state = { ...heroAt(16), monsters: [monster('skeleton', 20)] };
  const after = withRandom(0.1, () => step(state));

  expect(after.hero.state).toBe('cast');
  expect(after.hero.mp).toBe(HERO_MAX_MP - HERO_MAX_MP);
  expect(after.monsters[0].hp).toBeLessThan(after.monsters[0].maxHp);
});

test('the strongest power strikes every monster on the field', () => {
  const state = {
    ...heroAt(50),
    monsters: [
      monster('skeleton', 54),
      { ...monster('imp', 20), id: 2 },
      { ...monster('ghost', 80), id: 3 },
    ],
  };
  const after = withRandom(0.1, () => step(state));

  expect(after.hero.state).toBe('cast');
  for (const m of after.monsters) {
    expect(m.hp).toBeLessThan(m.maxHp);
  }
});

test('mana trickles back without a drop', () => {
  let s = { ...heroAt(50, { mp: 0, cooldown: 999 }), monsters: [] };
  for (let i = 0; i < 30; i++) {
    s = step(s);
  }
  expect(s.hero.mp).toBeGreaterThan(0);
});

test('the hero outlasts any single monster', () => {
  const toughest = Math.max(...MONSTERS.map((m) => m.maxHp));
  expect(HERO_MAX_HP).toBeGreaterThan(toughest * 3);
});

test('armour takes the edge off every blow', () => {
  const imp = MONSTERS.find((m) => m.kind === 'imp');
  const state = {
    ...heroAt(40, { cooldown: 999 }),
    monsters: [monster('imp', 42)],
  };
  const after = withRandom(0.99, () => step(state));

  const dealt = HERO_MAX_HP - after.hero.hp;
  expect(dealt).toBe(imp.dmg[1] - HERO_DEFENCE);
  expect(dealt).toBeGreaterThanOrEqual(1);
});
