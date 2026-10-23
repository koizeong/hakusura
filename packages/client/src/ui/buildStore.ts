import { ARTIFACT_IDS, ARTIFACTS, DEFAULT_TACTICS, generateItem, type Build, type ConditionId, type Item } from '@hakusura/core';

/** 支度の中身。ビルドと、拾い物の山 */
export interface BuildState {
  build: Build;
  stash: Item[];
}

const STORAGE_KEY = 'hakusura.build.v1';

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
  return {
    build: {
      actives: ['rustGreatsword', 'thunderGun', 'emberOil'],
      passives: ['sootPrayer', 'bloodCallsThunder', 'readTheBlow', 'parryStance'],
      equipment: { accessory1: starterItems[0], accessory2: starterItems[1], accessory3: starterItems[2] },
      trump: 'rainBell',
      tactics: DEFAULT_TACTICS.map((t) => ({ ...t })),
    },
    stash: [...artifacts, ...loot],
  };
}

export function loadBuildState(random: () => number): BuildState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as BuildState | null;
    if (saved?.build && Array.isArray(saved.stash)) return saved;
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
