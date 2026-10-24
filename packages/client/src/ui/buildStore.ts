import {
  ARTIFACT_IDS,
  ARTIFACTS,
  ATTRIBUTE_RULES,
  DEFAULT_TACTICS,
  LOOT_WEAPON_TYPE_IDS,
  generateItem,
  growCharacter,
  newCharacter,
  spentPoints,
  type Attributes,
  type Build,
  type Character,
  type ConditionId,
  type Item,
} from '@hakusura/core';

/** 支度の中身。キャラたちと、全キャラで共有する拾い物の山 */
export interface BuildState {
  characters: Character[];
  current: number;
  stash: Item[];
}

/** 作れるキャラの数 */
export const CHARACTER_LIMIT = 12;

// キャラごとに育つ形にしたので保存先を変える。前のビルド(v3)はキャラとして引き継ぐ
const STORAGE_KEY = 'hakusura.characters.v1';
const OLD_STORAGE_KEY = 'hakusura.build.v3';

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
  // 最初のキャラは、少し育った所から始める(振った分と同じだけ育ったことにする)
  const now = Date.now();
  const first = newCharacter(newCharacterId(), characterName(0), now, build);
  first.build.attributes = starterAttributes();
  first.earned = Math.max(0, spentPoints(first.build.attributes) - ATTRIBUTE_RULES.startPoints);
  return { characters: [first], current: 0, stash: [...starterWeapons, ...weaponSamples, ...artifacts, ...loot] };
}

export function loadBuildState(random: () => number): BuildState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as BuildState | null;
    if (saved && Array.isArray(saved.characters) && saved.characters.length > 0 && Array.isArray(saved.stash)) {
      saved.current = Math.min(Math.max(0, saved.current | 0), saved.characters.length - 1);
      // 閉じていた間も育っている
      for (const c of saved.characters) growCharacter(c, Date.now());
      return saved;
    }
    // 前のビルドは、それぞれ振った分だけ育ったキャラとして引き継ぐ
    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) ?? 'null') as { presets: { name: string; build: Build }[]; stash: Item[] } | null;
    if (old && Array.isArray(old.presets) && old.presets.length > 0 && Array.isArray(old.stash)) {
      const now = Date.now();
      const characters = old.presets.map((p, i) => {
        const c = newCharacter(newCharacterId(), p.name || characterName(i), now, p.build);
        c.build.attributes = p.build.attributes ?? starterAttributes();
        c.earned = Math.max(0, spentPoints(c.build.attributes) - ATTRIBUTE_RULES.startPoints);
        return c;
      });
      return { characters, current: 0, stash: old.stash };
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
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(OLD_STORAGE_KEY);
  } catch {
    // 消せなくても、この場では最初からになる
  }
  return initialState(random);
}
