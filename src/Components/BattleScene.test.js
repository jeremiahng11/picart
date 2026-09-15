import {
  step, initialState, spawnWave, choosePower, applyPickup, rollChestContents, gainXp, rollWaveCount, reequip,
  MONSTERS, BOSSES, bossChance, BOSS_MIN_LEVEL, BOSS_CHANCE_CAP, POWERS, BASE_POWERS, ITEMS, COMMON_ITEMS, SPECIAL_ITEMS, SLOTS, recalc,
  itemScore, worthTaking,
  HERO_MAX_HP, HERO_MAX_MP, HERO_DEFENCE, XP_PER_LEVEL, HP_REGEN_TICKS, WAVES_MIN, WAVES_MAX, MAX_LEVEL,
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
    // Travel takes him off both edges on purpose, so the bound is the frame
    // plus the off-screen margin rather than the field.
    expect(s.hero.x).toBeGreaterThanOrEqual(-20);
    expect(s.hero.x).toBeLessThanOrEqual(120);
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

test('the hero sets out knowing one spell and can learn the rest', () => {
  expect(BASE_POWERS).toEqual(['flame']);

  const tomes = SPECIAL_ITEMS.filter((i) => i.type === 'spell');
  expect(tomes).toHaveLength(POWERS.length - 1);

  let hero = { ...initialState().hero };
  expect(hero.powers).toHaveLength(1);

  for (const tome of tomes) {
    hero = applyPickup(hero, tome, () => {});
  }
  expect(hero.powers).toHaveLength(POWERS.length);
});

test('the hero sets out in clothes with a worn sword and no shield', () => {
  const hero = initialState().hero;

  expect(hero.gear.weapon.key).toBe('worn-sword');
  expect(hero.gear.weapon.power).toBe(0);
  expect(hero.gear.shield).toBeNull();
  expect(hero.gear.top).toBeNull();
  expect(hero.gear.legs).toBeNull();
  expect(hero.gear.boots).toBeNull();
  expect(hero.gear.gloves).toBeNull();
  expect(hero.defence).toBe(HERO_DEFENCE);
});

test('damage climbs with the tier of the spell', () => {
  const byTier = (t) => POWERS.filter((p) => p.tier === t);
  const top = (t) => Math.max(...byTier(t).map((p) => p.dmg[1]));

  expect(top(2)).toBeGreaterThan(top(1));
  expect(top(3)).toBeGreaterThan(top(2));
});

test('the hero casts the strongest power he can afford', () => {
  const all = POWERS.map((p) => p.key);
  expect(choosePower(all, HERO_MAX_MP, 0).tier).toBe(3);
  expect(choosePower(all, 8, 0).tier).toBe(2);
  expect(choosePower(all, 4, 0).tier).toBe(1);
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
  const base = heroAt(16);
  const state = { ...base, hero: { ...base.hero, powers: ['flame'] }, monsters: [monster('skeleton', 20)] };
  const after = withRandom(0.1, () => step(state));

  const flame = POWERS.find((p) => p.key === 'flame');
  expect(after.hero.state).toBe('cast');
  expect(after.hero.mp).toBe(HERO_MAX_MP - flame.cost);
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
  const base = heroAt(50);
  const withNova = { ...state, hero: { ...base.hero, x: 50, powers: ['nova'] } };
  const after = withRandom(0.1, () => step(withNova));

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


test('the catalogue is large and every key is unique', () => {
  expect(COMMON_ITEMS.length).toBeGreaterThanOrEqual(10);
  expect(SPECIAL_ITEMS.length).toBeGreaterThanOrEqual(20);
  expect(new Set(ITEMS.map((i) => i.key)).size).toBe(ITEMS.length);
});

test('every equipment slot has several distinct pieces to find', () => {
  for (const slot of SLOTS) {
    const pieces = SPECIAL_ITEMS.filter((i) => i.type === slot);
    expect(pieces.length).toBeGreaterThanOrEqual(4);
    expect(new Set(pieces.map((p) => p.key)).size).toBe(pieces.length);
  }
});

test('pieces of the same tier can differ in worth', () => {
  const sharing = SLOTS.some((slot) => {
    const byTier = {};
    for (const piece of SPECIAL_ITEMS.filter((i) => i.type === slot)) {
      byTier[piece.tier] = (byTier[piece.tier] || []).concat(itemScore(piece));
    }
    return Object.values(byTier).some((scores) => new Set(scores).size > 1);
  });

  // A rusted hauberk looks as heavy as a good one and is not worth as much.
  expect(sharing).toBe(true);
});

test('worth is what decides an upgrade, not how heavy it looks', () => {
  const jerkin = SPECIAL_ITEMS.find((i) => i.key === 'top-leather');
  const rusted = SPECIAL_ITEMS.find((i) => i.key === 'top-chain-rust');

  expect(rusted.tier).toBeGreaterThan(jerkin.tier);
  expect(itemScore(jerkin)).toBeGreaterThan(itemScore(rusted));

  const hero = applyPickup(initialState().hero, jerkin, () => {});
  const after = applyPickup(hero, rusted, () => {});

  expect(after.gear.top.key).toBe('top-leather');
});

test('he leaves behind a piece well beneath what he is wearing', () => {
  const plate = SPECIAL_ITEMS.find((i) => i.key === 'top-plate');
  const rags = SPECIAL_ITEMS.find((i) => i.key === 'top-rags');
  const hero = applyPickup(initialState().hero, plate, () => {});

  expect(worthTaking(hero, rags)).toBe(false);
  expect(worthTaking(initialState().hero, rags)).toBe(true);
});

test('he does not stoop for a second of something he already carries', () => {
  const helm = SPECIAL_ITEMS.find((i) => i.type === 'helm' && i.tier === 3);
  const hero = applyPickup(initialState().hero, helm, () => {});

  expect(worthTaking(hero, helm)).toBe(false);

  const carrying = { ...initialState().hero, inventory: [helm] };
  expect(worthTaking(carrying, helm)).toBe(false);
});

test('a trophy he already owns is left where it lies', () => {
  const base = initialState().hero;
  const trophy = COMMON_ITEMS[0];

  expect(worthTaking(base, trophy)).toBe(true);
  expect(worthTaking({ ...base, bag: [trophy.key] }, trophy)).toBe(false);
});

test('potions are taken when needed and only stockpiled so far', () => {
  const base = initialState().hero;
  const potion = { kind: 'potion', label: '+HP', color: '#ff6b8a' };

  expect(worthTaking({ ...base, hp: 5 }, potion)).toBe(true);

  const full = { ...base, inventory: [potion, potion, potion] };
  expect(worthTaking(full, potion)).toBe(false);
});

test('junk left on the ground does not pin him to the scene', () => {
  const plate = SPECIAL_ITEMS.find((i) => i.key === 'top-plate');
  const rags = SPECIAL_ITEMS.find((i) => i.key === 'top-rags');
  const dressed = applyPickup(initialState().hero, plate, () => {});

  let s = {
    ...initialState(),
    hero: { ...dressed, x: 50, cooldown: 999 },
    monsters: [],
    wavesLeft: 0,
    waveGap: 0,
    drops: [{ ...rags, id: 31, x: 20, born: 0 }],
  };

  for (let i = 0; i < 40 && !s.travelling; i++) {
    s = withRandom(0.9, () => step(s));
  }

  expect(s.travelling).toBe(true);
});

test('some blades carry an element and some do not', () => {
  const weapons = SPECIAL_ITEMS.filter((i) => i.type === 'weapon');
  const elemental = weapons.filter((w) => w.element);

  expect(elemental.length).toBeGreaterThanOrEqual(3);
  expect(weapons.length).toBeGreaterThan(elemental.length);
  expect(new Set(elemental.map((w) => w.element)).size).toBe(elemental.length);
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

test('every worn piece adds its own defence', () => {
  const base = initialState().hero;
  let hero = base;
  let expected = base.defence;

  for (const slot of ['top', 'legs', 'boots', 'gloves', 'shield']) {
    const piece = SPECIAL_ITEMS.filter((i) => i.type === slot).sort((a, b) => b.tier - a.tier)[0];
    hero = applyPickup(hero, piece, () => {});
    expected += piece.defence || 0;
  }

  expect(hero.defence).toBe(expected);
  expect(hero.maxHp).toBeGreaterThan(base.maxHp);
});

test('taking off a piece takes its bonus with it', () => {
  const base = initialState().hero;
  const top = SPECIAL_ITEMS.find((i) => i.type === 'top' && i.tier === 3);

  const dressed = applyPickup(base, top, () => {});
  const stripped = recalc({ ...dressed, gear: { ...dressed.gear, top: null } });

  expect(stripped.defence).toBe(base.defence);
  expect(stripped.maxHp).toBe(base.maxHp);
});

test('a weaker piece is kept rather than worn', () => {
  const base = initialState().hero;
  const [weak, strong] = SPECIAL_ITEMS.filter((i) => i.type === 'top')
    .sort((a, b) => a.tier - b.tier);

  let hero = applyPickup(base, strong, () => {});
  hero = applyPickup(hero, weak, () => {});

  expect(hero.gear.top.key).toBe(strong.key);
  expect(hero.inventory.some((i) => i.key === weak.key)).toBe(true);
});

test('what a better piece replaces goes into the pack', () => {
  const base = initialState().hero;
  const [weak, strong] = SPECIAL_ITEMS.filter((i) => i.type === 'weapon')
    .sort((a, b) => a.tier - b.tier);

  let hero = applyPickup(base, weak, () => {});
  hero = applyPickup(hero, strong, () => {});

  expect(hero.gear.weapon.key).toBe(strong.key);
  expect(hero.inventory.some((i) => i.key === weak.key)).toBe(true);
});

test('a better piece sitting in the pack is drawn by reequip', () => {
  const base = initialState().hero;
  const strong = SPECIAL_ITEMS.filter((i) => i.type === 'weapon')
    .sort((a, b) => b.tier - a.tier)[0];

  const carrying = { ...base, inventory: [strong] };
  const after = reequip(carrying);

  expect(after.gear.weapon.key).toBe(strong.key);
  expect(after.weapon).toBe(strong.power);
  // The blade it replaced is kept, not discarded.
  expect(after.inventory.map((i) => i.key)).toEqual(['worn-sword']);
});

test('a potion found at full health is kept rather than wasted', () => {
  const base = initialState().hero;
  const potion = { kind: 'potion', label: '+HP', color: '#ff6b8a' };

  const after = applyPickup(base, potion, () => {});

  expect(after.hp).toBe(base.maxHp);
  expect(after.inventory).toHaveLength(1);
});

test('a spell he already knows is kept as a spare book', () => {
  const base = initialState().hero;
  const tome = SPECIAL_ITEMS.find((i) => i.type === 'spell');

  let hero = applyPickup(base, tome, () => {});
  const learned = hero.powers.length;
  hero = applyPickup(hero, tome, () => {});

  expect(hero.powers).toHaveLength(learned);
  expect(hero.inventory.some((i) => i.key === tome.key)).toBe(true);
});

test('levelling stops at ninety nine', () => {
  const base = initialState().hero;
  const after = gainXp(base, XP_PER_LEVEL * 500000);

  expect(after.level).toBe(MAX_LEVEL);
  expect(after.xp).toBe(0);
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
  const armour = SPECIAL_ITEMS.find((i) => i.type === 'top');
  const state = {
    ...heroAt(40, { cooldown: 999 }),
    monsters: [],
    drops: [{ kind: 'chest', name: 'CHEST', color: '#ffd76b', id: 8, x: 40, born: 0, contents: [tome, armour] }],
  };
  const after = withRandom(0.9, () => step(state));

  expect(after.drops).toHaveLength(0);
  expect(after.hero.powers).toContain(tome.grants);
  expect(after.hero.gear.top.key).toBe(armour.key);
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
  const armour = SPECIAL_ITEMS.find((i) => i.type === 'top');
  const state = {
    ...heroAt(40, { cooldown: 999 }),
    monsters: [],
    drops: [{ kind: 'chest', name: 'CHEST', color: '#ffd76b', id: 11, x: 40, born: 0, contents: [tome, armour] }],
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

test('a wounded hero with nothing to drink stands his ground', () => {
  const state = {
    ...heroAt(50, { hp: 6, cooldown: 0 }),
    monsters: [monster('imp', 55)],
    drops: [],
  };
  const after = withRandom(0.9, () => step(state));

  // He does not back away; he swings, and trusts his wounds to close later.
  expect(after.hero.x).toBe(50);
  expect(after.monsters[0].hp).toBeLessThan(after.monsters[0].maxHp);
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

test('a scene whose waves are spent sends the hero travelling', () => {
  let s = { ...heroAt(50, { cooldown: 999 }), monsters: [], drops: [], waveGap: 0, wavesLeft: 0 };
  for (let i = 0; i < 30 && !s.travelling; i++) {
    s = withRandom(0.9, () => step(s));
    s.drops = [];
  }
  expect(s.travelling).toBe(true);
});

test('a scene still owing waves keeps him there', () => {
  let s = { ...heroAt(50, { cooldown: 999 }), monsters: [], drops: [], waveGap: 0, wavesLeft: 3 };

  for (let i = 0; i < 30; i++) {
    s = withRandom(0.9, () => step(s));
    s.drops = [];
    s.monsters = [];
  }

  expect(s.travelling).toBe(false);
  expect(s.wavesLeft).toBeLessThan(3);
});

test('each scene is worth between two and five waves', () => {
  for (let i = 0; i < 200; i++) {
    const n = rollWaveCount();
    expect(n).toBeGreaterThanOrEqual(WAVES_MIN);
    expect(n).toBeLessThanOrEqual(WAVES_MAX);
  }

  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    seen.add(rollWaveCount());
  }
  expect(seen.size).toBeGreaterThan(1);
});

test('arriving somewhere new stocks it with a fresh set of waves', () => {
  let s = { ...heroAt(90, { cooldown: 999 }), monsters: [], drops: [], travelling: true, journey: 2, wavesLeft: 0 };

  for (let i = 0; i < 20 && s.journey === 2; i++) {
    s = withRandom(0.5, () => step(s));
  }

  expect(s.journey).toBe(3);
  expect(s.wavesLeft).toBeGreaterThanOrEqual(WAVES_MIN - 1);
});

test('with nothing to do he wanders the scene rather than standing still', () => {
  let s = { ...heroAt(50, { cooldown: 999 }), monsters: [], drops: [], wavesLeft: 9, waveGap: 0 };
  const visited = new Set();

  for (let i = 0; i < 90; i++) {
    s = withRandom(0.9, () => step(s));
    s.monsters = [];
    s.drops = [];
    visited.add(Math.round(s.hero.x));
  }

  // He does not simply stand where he was left.
  expect(visited.size).toBeGreaterThan(3);
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

test('the hero walks clean off the frame rather than stopping at the edge', () => {
  let s = { ...heroAt(90, { cooldown: 999 }), monsters: [], drops: [], travelling: true, journey: 3 };

  for (let i = 0; i < 8 && s.journey === 3; i++) {
    s = withRandom(0.5, () => step(s));
  }

  // He keeps going past the right edge of the field before anything changes.
  expect(s.hero.x).toBeGreaterThan(94);
});

test('the land changes while he is out of sight, not in view', () => {
  let s = { ...heroAt(90, { cooldown: 999 }), monsters: [], drops: [], travelling: true, journey: 3 };

  for (let i = 0; i < 30 && s.journey === 3; i++) {
    s = withRandom(0.5, () => step(s));
  }

  expect(s.journey).toBe(4);
  // Off the left of the frame, so the swap itself cannot be seen.
  expect(s.hero.x).toBeLessThan(0);
  expect(s.hero.warp).toBe(s.tick);
  expect(s.monsters.length).toBeGreaterThanOrEqual(1);
});

test('he walks back into frame and takes up the fight again', () => {
  let s = { ...heroAt(90, { cooldown: 999 }), monsters: [], drops: [], travelling: true, journey: 3 };

  for (let i = 0; i < 60 && s.travelling; i++) {
    s = withRandom(0.5, () => step(s));
  }

  expect(s.travelling).toBe(false);
  expect(s.hero.x).toBeGreaterThanOrEqual(0);
  expect(s.hero.x).toBeLessThan(30);
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


test('a boss is rare, alone, and far sturdier than a common monster', () => {
  const toughest = Math.max(...MONSTERS.map((m) => m.maxHp));

  for (const boss of BOSSES) {
    expect(boss.boss).toBe(true);
    expect(boss.maxHp).toBeGreaterThan(toughest * 3);
  }

  let bossWaves = 0;
  let normalWaves = 0;
  for (let i = 0; i < 600; i++) {
    const wave = spawnWave(50, 40);
    if (wave.some((m) => m.boss)) {
      bossWaves += 1;
      expect(wave).toHaveLength(1);
    } else {
      normalWaves += 1;
    }
  }

  expect(bossWaves).toBeGreaterThan(0);
  expect(normalWaves).toBeGreaterThan(bossWaves * 2);
});

test('a felled boss always leaves a hoard', () => {
  const dragon = BOSSES[0];
  const state = {
    ...heroAt(40, { cooldown: 999 }),
    monsters: [{ ...dragon, id: 77, hp: 0, x: 90, face: -1, state: 'dead', timer: 1, slot: 0, dead: true }],
    drops: [],
  };
  const after = withRandom(0.99, () => step(state));

  expect(after.drops.some((d) => d.kind === 'chest')).toBe(true);
});


test('no boss comes looking for a hero who has barely started', () => {
  expect(bossChance(1)).toBe(0);
  expect(bossChance(BOSS_MIN_LEVEL - 1)).toBe(0);

  for (let i = 0; i < 800; i++) {
    expect(spawnWave(50, 1).some((m) => m.boss)).toBe(false);
  }
});

test('bosses become likelier as the hero grows, up to a ceiling', () => {
  expect(bossChance(BOSS_MIN_LEVEL)).toBeGreaterThan(0);
  expect(bossChance(20)).toBeGreaterThan(bossChance(BOSS_MIN_LEVEL));
  expect(bossChance(99)).toBeLessThanOrEqual(BOSS_CHANCE_CAP);
  expect(bossChance(99)).toBe(BOSS_CHANCE_CAP);
});

test('a seasoned hero does meet them', () => {
  let seen = false;
  for (let i = 0; i < 800 && !seen; i++) {
    seen = spawnWave(50, 30).some((m) => m.boss);
  }
  expect(seen).toBe(true);
});

test('a new game opens without a boss on the field', () => {
  for (let i = 0; i < 200; i++) {
    const fresh = initialState();
    expect(fresh.hero.level).toBe(1);
    expect(fresh.monsters.some((m) => m.boss)).toBe(false);
  }
});
