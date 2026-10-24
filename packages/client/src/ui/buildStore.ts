import { ARTIFACT_IDS, ARTIFACTS, DEFAULT_TACTICS, generateItem, type Build, type ConditionId, type Item } from '@hakusura/core';

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

const STORAGE_KEY = 'hakusura.build.v2';
/** プリセットを入れる前の保存先。読めたら引き継ぐ */
const OLD_STORAGE_KEY = 'hakusura.build.v1';

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 新しいビルドの名前 */
export function presetName(index: number): string {
  return `支度${NUMERALS[index] ?? index + 1}`;
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
  const artifacts: Item[] = ARTIFACT_IDS.map((id, i) => ({ id: `artifact-${id}-${i}`, name: ARTIFACTS[id].name, kind: 'accessory', affixes: [], artifact: id }));
  const loot = Array.from({ length: 12 }, () => generateItem(random));
  const build: Build = {
    actives: ['rustGreatsword', 'thunderGun', 'emberOil'],
    passives: ['sootPrayer', 'bloodCallsThunder', 'readTheBlow', 'parryStance'],
    equipment: { accessory1: starterItems[0], accessory2: starterItems[1], accessory3: starterItems[2] },
    trump: 'rainBell',
    tactics: DEFAULT_TACTICS.map((t) => ({ ...t })),
  };
  return { presets: [{ name: presetName(0), build }], current: 0, stash: [...artifacts, ...loot] };
}

export function loadBuildState(random: () => number): BuildState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as BuildState | null;
    if (saved && Array.isArray(saved.presets) && saved.presets.length > 0 && Array.isArray(saved.stash)) {
      saved.current = Math.min(Math.max(0, saved.current | 0), saved.presets.length - 1);
      return saved;
    }
    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) ?? 'null') as { build: Build; stash: Item[] } | null;
    if (old?.build && Array.isArray(old.stash)) return { presets: [{ name: presetName(0), build: old.build }], current: 0, stash: old.stash };
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
