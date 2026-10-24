import {
  ARTIFACT_IDS,
  ARTIFACTS,
  DEFAULT_TACTICS,
  LOOT_WEAPON_TYPE_IDS,
  STARTING_SKILLS,
  generateItem,
  levelForPoints,
  newCharacter,
  spentPoints,
  type Learned,
  type Attributes,
  type Build,
  type Character,
  type ConditionId,
  type Item,
} from '@hakusura/core';

/** 支度の中身。キャラたちと、全キャラで共有する拾い物の山と覚えたスキル */
export interface BuildState {
  characters: Character[];
  current: number;
  stash: Item[];
  learned: Learned;
}

/** 作れるキャラの数 */
export const CHARACTER_LIMIT = 12;

// 遠征で育つ形にしたので保存先を変える。前の保存は、振った分に足りるレベルのキャラとして引き継ぐ
const STORAGE_KEY = 'hakusura.characters.v2';
const OLD_CHARACTERS_KEY = 'hakusura.characters.v1';
const OLD_BUILDS_KEY = 'hakusura.build.v3';

function startingLearned(): Learned {
  return { actives: [...STARTING_SKILLS.actives], passives: [...STARTING_SKILLS.passives] };
}

/** 前の保存のキャラを、振った分に足りるレベルにして作り直す */
function migrate(name: string, build: Build, now: number): Character {
  const c = newCharacter(newCharacterId(), name, now, build);
  c.build.attributes = build.attributes ?? starterAttributes();
  c.level = levelForPoints(spentPoints(c.build.attributes));
  return c;
}

/** 新しいキャラの名前の候補 */
const NAMES = ['灰の巡礼者', '錆びた傭兵', '名もなき墓守', '煤けた修道女', '片目の猟師', '骨拾い', '落ちた騎士', '雨乞いの子', '油売り', '鐘撞き'];

export function characterName(index: number): string {
  return NAMES[index % NAMES.length] + (index >= NAMES.length ? `${Math.floor(index / NAMES.length) + 1}` : '');
}

let idCounter = 0;
export function newCharacterId(): string {
  return `char-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}

/** 今選んでいるキャラ */
export function currentCharacter(state: BuildState): Character {
  return state.characters[state.current]!;
}

/** 最初のキャラの振り分け。剣・銃・塗油に足りる */
function starterAttributes(): Attributes {
  return { str: 14, dex: 14, int: 10, fai: 14, vit: 12 };
}

/** 今選んでいるキャラのビルド */
export function currentBuild(state: BuildState): Build {
  return currentCharacter(state).build;
}

/** 最初の支度。これまでの試し斬り場と同じ組み合わせから始める */
function initialState(random: () => number): BuildState {
  // 最初の3つは、これまでの試し斬り場と同じ条件文を、穏やかな補正値で持たせる
  const starter = (id: string, name: string, condition: ConditionId, affix: Item['affixes'][number]): Item => ({
    id: `starter-${id}`,
    name,
    kind: 'accessory',
    affixes: [affix],
    condition,
  });
  const starterItems = [
    starter('twin', '焦げた指輪', 'twinStrikeOnBurning', { affix: 'maxHp', value: -40 }),
    starter('shift', '移ろう数珠', 'shiftingElement', { affix: 'moveSpeed', value: -20 }),
    starter('rain', '雨垂れの護符', 'rainSoaked', { affix: 'damageTaken', value: 10 }),
  ];
  // 武器は鉄の剣と雷管銃。近接の技は剣で、遠距離の技は銃で出る
  const starterWeapons: Item[] = [
    { id: 'starter-sword', name: '鉄の剣', kind: 'weapon', weaponType: 'ironSword', affixes: [{ affix: 'maxHp', value: 10 }] },
    { id: 'starter-gun', name: '雷管銃', kind: 'weapon', weaponType: 'capGun', affixes: [{ affix: 'moveSpeed', value: 10 }] },
  ];
  // 武器の種類を一通り試せるよう、1つずつ山に置いておく
  const weaponSamples = LOOT_WEAPON_TYPE_IDS.filter((t) => t !== 'ironSword' && t !== 'capGun').map((t) =>
    generateItem(random, { kind: 'weapon', slot: 'weapon1', weaponType: t }),
  );
  const artifacts: Item[] = ARTIFACT_IDS.map((id, i) => ({ id: `artifact-${id}-${i}`, name: ARTIFACTS[id].name, kind: 'accessory', affixes: [], artifact: id }));
  const loot = Array.from({ length: 12 }, () => generateItem(random));
  const build: Build = {
    actives: ['slash', 'shoot', 'emberOil'],
    passives: ['sootPrayer', 'bloodCallsThunder', 'readTheBlow', 'parryStance'],
    equipment: {
      weapon1: starterWeapons[0],
      weapon2: starterWeapons[1],
      accessory1: starterItems[0],
      accessory2: starterItems[1],
      accessory3: starterItems[2],
    },
    trump: 'rainBell',
    tactics: DEFAULT_TACTICS.map((t) => ({ ...t })),
    attributes: starterAttributes(),
  };
  // 最初のキャラは、振り分けに足りるレベルまで育った古参として始める
  const first = migrate(characterName(0), build, Date.now());
  return { characters: [first], current: 0, stash: [...starterWeapons, ...weaponSamples, ...artifacts, ...loot], learned: startingLearned() };
}

export function loadBuildState(random: () => number): BuildState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as BuildState | null;
    if (saved && Array.isArray(saved.characters) && saved.characters.length > 0 && Array.isArray(saved.stash)) {
      saved.current = Math.min(Math.max(0, saved.current | 0), saved.characters.length - 1);
      saved.learned ??= startingLearned();
      return saved;
    }
    const now = Date.now();
    const oldChars = JSON.parse(localStorage.getItem(OLD_CHARACTERS_KEY) ?? 'null') as { characters: { name: string; build: Build }[]; stash: Item[] } | null;
    if (oldChars && Array.isArray(oldChars.characters) && oldChars.characters.length > 0 && Array.isArray(oldChars.stash)) {
      return { characters: oldChars.characters.map((c) => migrate(c.name, c.build, now)), current: 0, stash: oldChars.stash, learned: startingLearned() };
    }
    const old = JSON.parse(localStorage.getItem(OLD_BUILDS_KEY) ?? 'null') as { presets: { name: string; build: Build }[]; stash: Item[] } | null;
    if (old && Array.isArray(old.presets) && old.presets.length > 0 && Array.isArray(old.stash)) {
      return { characters: old.presets.map((p, i) => migrate(p.name || characterName(i), p.build, now)), current: 0, stash: old.stash, learned: startingLearned() };
    }
  } catch {
    // 読めなければ最初の支度にする
  }
  return initialState(random);
}

export function saveBuildState(state: BuildState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 保存できなくても、この場では効く
  }
}

/** 支度をやり直す。拾い物も最初から */
export function resetBuildState(random: () => number): BuildState {
  try {
    for (const key of [STORAGE_KEY, OLD_CHARACTERS_KEY, OLD_BUILDS_KEY]) localStorage.removeItem(key);
  } catch {
    // 消せなくても、この場では最初からになる
  }
  return initialState(random);
}
