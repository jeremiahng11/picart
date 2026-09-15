import {
  step, initialState, spawnWave, choosePower, applyPickup, rollChestContents, gainXp,
  MONSTERS, POWERS, BASE_POWERS, ITEMS, COMMON_ITEMS, SPECIAL_ITEMS,
  HERO_MAX_HP, HERO_MAX_MP, HERO_DEFENCE, XP_PER_LEVEL, HP_REGEN_TICKS,
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
      expect(Math.abs(m.x - heroX)).toBeGreaterThanOrEqual(15);
    }
    for (let a = 0; a < wave.length; a++) {
      for (let b = a + 1; b < wave.length; b++) {
        expect(Math.abs(wave[a].x - wave[b].x)).toBeGreaterThanOrEqual(8);
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
  expect(after.hero.bag.length).toBeGreaterThan(0);
  // Clearing the field can leave a chest behind, but the monster's own drop is
  // gone from the ground.
  expect(after.drops.every((d) => d.kind === 'chest')).toBe(true);
});

test('a potion picked off the ground restores health', () => {
  const state = {
    ...heroAt(40, { hp: 5, cooldown: 99 }),
    monsters: [],
    drops: [{ kind: 'potion', label: '+HP', color: '#ff6b8a', id: 3, x: 40, born: 0 }],
  };
  const after = withRandom(0.9, () => step(state));

  expect(after.hero.hp).toBeGreaterThan(5);
  expect(after.drops).toHaveLength(0);
});

test('a mana potion picked off the ground restores mana', () => {
  const state = {
    ...heroAt(40, { mp: 0, cooldown: 99 }),
    monsters: [],
    drops: [{ kind: 'mana', label: '+MP', color: '#6bb6ff', id: 4, x: 40, born: 0 }],
  };
  const after = withRandom(0.9, () => step(state));

  expect(after.hero.mp).toBeGreaterThanOrEqual(5);
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

test('a cleared field eventually brings in another wave', () => {
  // Since travel was introduced this takes a full crossing plus the departure
  // fade, and a chest appearing would hold him up further, so loot is cleared
  // each frame and the budget is generous. The old limit of 40 made this flaky.
  let s = { ...heroAt(50, { cooldown: 999 }), monsters: [], drops: [], waveGap: 0 };

  for (let i = 0; i < 150 && s.monsters.length === 0; i++) {
    s = step(s);
    s.drops = [];
  }

  expect(s.monsters.length).toBeGreaterThanOrEqual(1);
});

test('a long skirmish never breaks its invariants', () => {
  let s = initialState();

  for (let i = 0; i < 1200; i++) {
    s = step(s);

    expect(s.hero.hp).toBeGreaterThanOrEqual(0);
    expect(s.hero.hp).toBeLessThanOrEqual(s.hero.maxHp);
    expect(s.hero.mp).toBeLessThanOrEqual(s.hero.maxMp);
    expect(s.hero.powers.length).toBeLessThanOrEqual(POWERS.length);
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

test('powers cost a third, two thirds or all of the mana pool', () => {
  expect(POWERS).toHaveLength(6);
  for (const p of POWERS) {
    expect(p.cost).toBe(Math.round((p.tier / 3) * HERO_MAX_MP));
  }
});

test('the hero starts with three spells and can reach six', () => {
  expect(BASE_POWERS).toHaveLength(3);
  expect(POWERS.filter((p) => !p.base)).toHaveLength(3);

  const tomes = SPECIAL_ITEMS.filter((i) => i.type === 'spell');
  expect(tomes).toHaveLength(3);

  let hero = { ...initialState().hero };
  for (const tome of tomes) {
    hero = applyPickup(hero, tome, () => {});
  }
  expect(hero.powers).toHaveLength(6);
});

test('damage climbs with the tier of the spell', () => {
  const byTier = (t) => POWERS.filter((p) => p.tier === t);
  const top = (t) => Math.max(...byTier(t).map((p) => p.dmg[1]));

  expect(top(2)).toBeGreaterThan(top(1));
  expect(top(3)).toBeGreaterThan(top(2));
});

test('the hero casts the strongest power he can afford', () => {
  expect(choosePower(BASE_POWERS, HERO_MAX_MP, 0).key).toBe('nova');
  expect(choosePower(BASE_POWERS, 8, 0).key).toBe('flame');
  expect(choosePower(BASE_POWERS, 4, 0).key).toBe('spark');
});

test('no power is cast without the mana for it', () => {
  expect(choosePower(BASE_POWERS, 3, 0)).toBeNull();
  expect(choosePower(BASE_POWERS, 0, 0)).toBeNull();
});

test('the hero sometimes swings instead of casting', () => {
  expect(choosePower(BASE_POWERS, HERO_MAX_MP, 0.99)).toBeNull();
});

test('a spell he has not learned is never cast', () => {
  expect(choosePower(BASE_POWERS, HERO_MAX_MP, 0).key).not.toBe('judge');
  expect(choosePower(BASE_POWERS.concat('judge'), HERO_MAX_MP, 0).key).toBe('judge');
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


test('there are twenty items, half of them special', () => {
  expect(ITEMS).toHaveLength(20);
  expect(COMMON_ITEMS).toHaveLength(10);
  expect(SPECIAL_ITEMS).toHaveLength(10);
  expect(new Set(ITEMS.map((i) => i.key)).size).toBe(20);
});

test('no item is gold or a potion', () => {
  for (const item of ITEMS) {
    expect(['potion', 'mana', 'coin']).not.toContain(item.key);
    expect(item.type).toBeDefined();
  }
});

test('a chest holds between one and three things, never gold or a potion', () => {
  for (let i = 0; i < 200; i++) {
    const contents = rollChestContents();
    expect(contents.length).toBeGreaterThanOrEqual(1);
    expect(contents.length).toBeLessThanOrEqual(3);

    for (const entry of contents) {
      expect(ITEMS.some((it) => it.key === entry.key)).toBe(true);
    }
    expect(new Set(contents.map((c) => c.key)).size).toBe(contents.length);
  }
});

test('a full chest of three always carries at least one special', () => {
  let sawThree = 0;
  for (let i = 0; i < 400; i++) {
    const contents = rollChestContents();
    if (contents.length !== 3) {
      continue;
    }
    sawThree += 1;
    const specials = contents.filter((c) => SPECIAL_ITEMS.some((s) => s.key === c.key));
    expect(specials.length).toBeGreaterThanOrEqual(1);
  }
  expect(sawThree).toBeGreaterThan(0);
});

test('a spellbook teaches its spell once and only once', () => {
  const tome = SPECIAL_ITEMS.find((i) => i.type === 'spell');
  let hero = initialState().hero;

  hero = applyPickup(hero, tome, () => {});
  const afterFirst = hero.powers.length;
  hero = applyPickup(hero, tome, () => {});

  expect(hero.powers).toContain(tome.grants);
  expect(hero.powers).toHaveLength(afterFirst);
});

test('a better blade replaces a worse one but never downgrades', () => {
  const blades = SPECIAL_ITEMS.filter((i) => i.type === 'weapon')
    .sort((a, b) => a.power - b.power);
  let hero = initialState().hero;

  hero = applyPickup(hero, blades[blades.length - 1], () => {});
  expect(hero.weapon).toBe(blades[blades.length - 1].power);

  hero = applyPickup(hero, blades[0], () => {});
  expect(hero.weapon).toBe(blades[blades.length - 1].power);
});

test('relics raise the stat they name for good', () => {
  const base = initialState().hero;

  for (const relic of SPECIAL_ITEMS.filter((i) => i.type === 'relic')) {
    const after = applyPickup(base, relic, () => {});
    expect(after[relic.stat]).toBeGreaterThan(base[relic.stat]);
  }
});

test('the hero walks over to fetch loot when nothing is on him', () => {
  const state = {
    ...heroAt(20, { cooldown: 999 }),
    monsters: [],
    drops: [{ kind: 'coin', label: 'GOLD', color: '#ffd76b', id: 7, x: 80, born: 0 }],
  };
  const after = withRandom(0.9, () => step(state));

  expect(after.hero.state).toBe('walk');
  expect(after.hero.x).toBeGreaterThan(20);
});

test('a chest hands over everything inside it at once', () => {
  const tome = SPECIAL_ITEMS.find((i) => i.type === 'spell');
  const relic = SPECIAL_ITEMS.find((i) => i.type === 'relic');
  const state = {
    ...heroAt(40, { cooldown: 999 }),
    monsters: [],
    drops: [{ kind: 'chest', name: 'CHEST', color: '#ffd76b', id: 8, x: 40, born: 0, contents: [tome, relic] }],
  };
  const after = withRandom(0.9, () => step(state));

  expect(after.drops).toHaveLength(0);
  expect(after.hero.powers).toContain(tome.grants);
  expect(after.hero[relic.stat]).toBeGreaterThan(state.hero[relic.stat]);
});

test('experience accumulates and levels raise the health ceiling', () => {
  const base = initialState().hero;
  const after = gainXp(base, XP_PER_LEVEL);

  expect(after.level).toBe(base.level + 1);
  expect(after.maxHp).toBeGreaterThan(base.maxHp);
  expect(after.hp).toBe(after.maxHp);
});

test('a big haul of experience can carry more than one level', () => {
  const base = initialState().hero;
  const after = gainXp(base, XP_PER_LEVEL * 12);

  expect(after.level).toBeGreaterThan(base.level + 1);
  expect(after.xp).toBeGreaterThanOrEqual(0);
  expect(after.xp).toBeLessThan(after.level * XP_PER_LEVEL);
});

test('simultaneous pickups are given separate lanes so the text cannot overlap', () => {
  const tome = SPECIAL_ITEMS.find((i) => i.type === 'spell');
  const relic = SPECIAL_ITEMS.find((i) => i.type === 'relic');
  const state = {
    ...heroAt(40, { cooldown: 999 }),
    monsters: [],
    drops: [{ kind: 'chest', name: 'CHEST', color: '#ffd76b', id: 11, x: 40, born: 0, contents: [tome, relic] }],
  };
  const after = withRandom(0.9, () => step(state));

  const landed = after.floats.filter((f) => f.born === after.tick);
  expect(landed.length).toBeGreaterThan(1);
  expect(new Set(landed.map((f) => f.lane)).size).toBe(landed.length);
});

test('a wounded hero goes for a potion before anything else', () => {
  const state = {
    ...heroAt(50, { hp: 6, cooldown: 999 }),
    monsters: [monster('imp', 54)],
    drops: [{ kind: 'potion', label: '+HP', color: '#ff6b8a', id: 12, x: 20, born: 0 }],
  };
  const after = withRandom(0.9, () => step(state));

  // He walks away from the monster and toward the potion, even though the imp
  // lands a blow in the same frame.
  expect(after.hero.x).toBeLessThan(50);
});

test('a wounded hero with nothing to drink gives ground instead of trading blows', () => {
  const state = {
    ...heroAt(50, { hp: 6, cooldown: 999 }),
    monsters: [monster('imp', 55)],
    drops: [],
  };
  const after = withRandom(0.9, () => step(state));

  expect(after.hero.x).toBeLessThan(50);
  expect(after.hero.face).toBe(1);
});

test('a healthy hero still closes in rather than retreating', () => {
  const state = { ...heroAt(50, { cooldown: 999 }), monsters: [monster('imp', 80)], drops: [] };
  const after = withRandom(0.9, () => step(state));

  expect(after.hero.x).toBeGreaterThan(50);
});

test('wounds close slowly when nothing is nearby', () => {
  const state = {
    ...heroAt(50, { hp: 10, cooldown: 999, hpTimer: HP_REGEN_TICKS - 1 }),
    monsters: [],
    drops: [],
  };
  const after = withRandom(0.9, () => step(state));

  expect(after.hero.hp).toBe(11);
});

test('wounds do not close while a monster is breathing down his neck', () => {
  const state = {
    ...heroAt(50, { hp: 10, cooldown: 999, hpTimer: HP_REGEN_TICKS - 1 }),
    monsters: [monster('slime', 56)],
    drops: [],
  };
  const after = withRandom(0.9, () => step(state));

  expect(after.hero.hp).toBeLessThanOrEqual(10);
});

test('casting leaves a visible effect at the target', () => {
  const state = { ...heroAt(16), monsters: [monster('skeleton', 21)] };
  const after = withRandom(0.1, () => step(state));

  expect(after.hero.state).toBe('cast');
  expect(after.effects.length).toBeGreaterThan(0);
  expect(POWERS.some((p) => p.key === after.effects[0].key)).toBe(true);
});

test('a cleared and looted field sends the hero travelling', () => {
  let s = { ...heroAt(50, { cooldown: 999 }), monsters: [], drops: [], waveGap: 0 };
  for (let i = 0; i < 20 && !s.travelling; i++) {
    s = withRandom(0.9, () => step(s));
    s.drops = [];
  }
  expect(s.travelling).toBe(true);
});

test('loot still on the ground keeps him from moving on', () => {
  let s = {
    ...heroAt(50, { cooldown: 999 }),
    monsters: [],
    waveGap: 40,
    drops: [{ kind: 'coin', label: 'GOLD', color: '#ffd76b', id: 21, x: 95, born: 0 }],
  };
  s = withRandom(0.9, () => step(s));
  expect(s.travelling).toBe(false);
});

test('the hero fades out at the edge rather than snapping across', () => {
  let s = { ...heroAt(90, { cooldown: 999 }), monsters: [], drops: [], travelling: true, journey: 3 };

  for (let i = 0; i < 12 && s.hero.state !== 'exit'; i++) {
    s = withRandom(0.5, () => step(s));
  }

  // He reaches the edge and holds there while fading, with the scene unchanged.
  expect(s.hero.state).toBe('exit');
  expect(s.journey).toBe(3);
  expect(s.hero.x).toBeGreaterThan(80);
});

test('the scene turns over between the two fades', () => {
  let s = { ...heroAt(90, { cooldown: 999 }), monsters: [], drops: [], travelling: true, journey: 3 };

  for (let i = 0; i < 20 && s.journey === 3; i++) {
    s = withRandom(0.5, () => step(s));
  }

  expect(s.journey).toBe(4);
  expect(s.hero.state).toBe('enter');
  expect(s.hero.x).toBeLessThan(20);
  expect(s.monsters.length).toBeGreaterThanOrEqual(1);
});

test('travel ends once the arrival fade is done', () => {
  let s = { ...heroAt(90, { cooldown: 999 }), monsters: [], drops: [], travelling: true, journey: 3 };

  for (let i = 0; i < 40 && s.travelling; i++) {
    s = withRandom(0.5, () => step(s));
  }

  expect(s.travelling).toBe(false);
  expect(s.hero.state).not.toBe('enter');
});

test('a monster still standing stops the journey', () => {
  const s = withRandom(0.9, () => step({
    ...heroAt(50, { cooldown: 999 }),
    monsters: [monster('slime', 80)],
    drops: [],
    waveGap: 40,
    travelling: false,
  }));

  expect(s.travelling).toBe(false);
});
