import { step, initialState, HERO_MAX_HP, HERO_MAX_MP } from './BattleScene';

// The battle rolls dice, so every test pins Math.random to make a turn
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

test('the hero damages the monster on its turn', () => {
  const before = withRandom(0.5, initialState);
  const after = withRandom(0.5, () => step({ ...before, turn: 'hero' }));

  expect(after.monster.hp).toBeLessThan(before.monster.maxHp);
  expect(after.monster.hurt).toBe(true);
  expect(after.turn).toBe('monster');
});

test('the monster dies once its health runs out', () => {
  const base = withRandom(0.5, initialState);
  const after = withRandom(0.5, () =>
    step({ ...base, turn: 'hero', monster: { ...base.monster, hp: 1 } }));

  expect(after.monster.dead).toBe(true);
  expect(after.monster.hp).toBe(0);
  expect(after.monster.timer).toBeGreaterThan(0);
});

test('a dead monster is replaced by a fresh one at full health', () => {
  const base = withRandom(0.5, initialState);
  const after = withRandom(0.5, () =>
    step({ ...base, monster: { ...base.monster, hp: 0, dead: true, timer: 1 } }));

  expect(after.monster.dead).toBe(false);
  expect(after.monster.hp).toBe(after.monster.maxHp);
});

test('a potion drop heals the hero and is consumed', () => {
  const base = withRandom(0.5, initialState);
  const after = withRandom(0.5, () => step({
    ...base,
    hero: { ...base.hero, hp: 5 },
    monster: { ...base.monster, hp: 0, dead: true, timer: 1 },
    drop: { kind: 'potion', label: '+HP', color: '#ff6b8a' },
  }));

  expect(after.hero.hp).toBeGreaterThan(5);
  expect(after.drop).toBeNull();
});

test('a mana drop restores mp without exceeding the maximum', () => {
  const base = withRandom(0.5, initialState);
  const after = withRandom(0.5, () => step({
    ...base,
    hero: { ...base.hero, mp: HERO_MAX_MP - 1 },
    monster: { ...base.monster, hp: 0, dead: true, timer: 1 },
    drop: { kind: 'mana', label: '+MP', color: '#6bb6ff' },
  }));

  expect(after.hero.mp).toBe(HERO_MAX_MP);
});

test('the monster damages the hero on its turn', () => {
  const base = withRandom(0.5, initialState);
  const after = withRandom(0.5, () => step({ ...base, turn: 'monster' }));

  expect(after.hero.hp).toBeLessThan(HERO_MAX_HP);
  expect(after.hero.hurt).toBe(true);
  expect(after.turn).toBe('hero');
});

test('the hero is knocked out at zero health', () => {
  const base = withRandom(0.5, initialState);
  const after = withRandom(0.99, () => step({
    ...base,
    turn: 'monster',
    hero: { ...base.hero, hp: 1 },
  }));

  expect(after.hero.dead).toBe(true);
  expect(after.hero.hp).toBe(0);
  expect(after.floats.some((f) => f.text === 'K.O.')).toBe(true);
});

test('a knocked out hero revives at full health against a new monster', () => {
  const base = withRandom(0.5, initialState);
  const after = withRandom(0.5, () => step({
    ...base,
    hero: { ...base.hero, hp: 0, dead: true, timer: 1 },
  }));

  expect(after.hero.dead).toBe(false);
  expect(after.hero.hp).toBe(HERO_MAX_HP);
  expect(after.monster.hp).toBe(after.monster.maxHp);
});

test('floating text is pruned instead of accumulating', () => {
  const base = withRandom(0.5, initialState);
  const stale = { ...base, tick: 50, floats: [{ id: 1, born: 1, text: '9', color: '#fff', side: 'hero' }] };
  const after = withRandom(0.5, () => step(stale));

  expect(after.floats.some((f) => f.id === 1)).toBe(false);
});

test('a full battle runs for many turns without breaking its invariants', () => {
  let s = initialState();
  for (let i = 0; i < 400; i++) {
    s = step(s);
    expect(s.hero.hp).toBeGreaterThanOrEqual(0);
    expect(s.hero.hp).toBeLessThanOrEqual(HERO_MAX_HP);
    expect(s.monster.hp).toBeGreaterThanOrEqual(0);
    expect(s.monster.hp).toBeLessThanOrEqual(s.monster.maxHp);
    expect(s.floats.length).toBeLessThan(12);
  }
});
