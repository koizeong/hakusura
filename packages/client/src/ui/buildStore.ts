import { ARTIFACT_IDS, ARTIFACTS, LOOT_WEAPON_TYPE_IDS, type Attributes, DEFAULT_TACTICS, generateItem, type Build, type ConditionId, type Item } from '@hakusura/core';

/** 名前つきのビルド。ボス前などで切り替える */
export interface Preset {
  name: string;
  build: Build;
}

/** 支度の中身。いくつかのビルドと、全てで共有する拾い物の山 */
export interface BuildState {
  presets: Preset[];
  current: number;
  stash: Item[];
}

/** 保存できるビルドの数 */
export const PRESET_LIMIT = 8;

// スキルが武器の技になったので、前の保存(v1・v2)は引き継がない
const STORAGE_KEY = 'hakusura.build.v3';

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 新しいビルドの名前 */
export function presetName(index: number): string {
  return `支度${NUMERALS[index] ?? index + 1}`;
}

/** 最初の振り分け。剣・銃・塗油に足り、16点を残す */
function starterAttributes(): Attributes {
  return { str: 14, dex: 14, int: 10, fai: 14, vit: 12 };
}

/** 今選んでいるビルド */
export function currentBuild(state: BuildState): Build {
  return state.presets[state.current]!.build;
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
  return { presets: [{ name: presetName(0), build }], current: 0, stash: [...starterWeapons, ...weaponSamples, ...artifacts, ...loot] };
}

export function loadBuildState(random: () => number): BuildState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as BuildState | null;
    if (saved && Array.isArray(saved.presets) && saved.presets.length > 0 && Array.isArray(saved.stash)) {
      saved.current = Math.min(Math.max(0, saved.current | 0), saved.presets.length - 1);
      // 能力値を入れる前の保存なら、最初の振り分けを持たせる
      for (const p of saved.presets) p.build.attributes ??= starterAttributes();
      return saved;
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
  } catch {
    // 消せなくても、この場では最初からになる
  }
  return initialState(random);
}
