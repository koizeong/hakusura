import type { Build } from '../build';
import type { Attributes } from '../data/attributes';
import type { ConditionId } from '../data/conditions';
import type { EquipSlotId, Item } from '../data/equipment';
import type { WeaponSpec } from '../data/weapons';
import type { ShieldTypeId } from '../data/shields';
import { RITE_TACTICS, type Tactic } from '../data/tactics';

/**
 * 印・技の型・+と×で組んだ、考えて組むビルドの見本。
 * 条件文の働きだけを見るため、装備は補正値なしで条件文だけを宿す。
 * full は札を全て揃えたもの、givers は生む札だけ(使う札がないので何も起きないはず)
 */
export interface ComboBuild {
  name: string;
  idea: string;
  build: Build;
  full: ConditionId[];
  givers: ConditionId[];
}

const attrs = (a: Partial<Attributes>): Attributes => ({ str: 8, dex: 8, int: 8, fai: 8, vit: 8, ...a });
const weapon = (id: string, spec: WeaponSpec): Item => ({ id: `w-${id}`, name: id, kind: 'weapon', weaponType: spec.type, element: spec.element, affixes: [] });
const shield = (id: string, type: ShieldTypeId): Item => ({ id: `s-${id}`, name: id, kind: 'weapon', shieldType: type, affixes: [] });
const always = (skill: Build['actives'][number], then?: Tactic['then']): Tactic => ({ skill, condition: 'always', enabled: true, ...(then ? { then } : {}) });

/** 条件文を宿す枠。防具と装飾品、空いていれば武器の枠も */
const SLOTS: EquipSlotId[] = ['head', 'body', 'hands', 'feet', 'accessory1', 'accessory2', 'accessory3', 'weapon1', 'weapon2'];

/** ビルドに条件文を宿す。空いた枠には補正値なしの装備を置き、武器や盾にはそのまま条件文を足す */
export function withConditions(build: Build, conditions: readonly ConditionId[]): Build {
  const equipment = { ...build.equipment };
  let i = 0;
  for (const slot of SLOTS) {
    const condition = conditions[i];
    if (!condition) break;
    const held = equipment[slot];
    if (slot.startsWith('weapon') && !held) continue;
    const kind = slot.startsWith('accessory') ? 'accessory' : slot.startsWith('weapon') ? 'weapon' : 'armor';
    equipment[slot] = held
      ? { ...held, condition }
      : { id: `c-${slot}`, name: slot, kind, ...(kind === 'armor' ? { slot } : {}), affixes: [{ affix: 'maxHp', value: 0 }], condition };
    i++;
  }
  if (i < conditions.length) throw new Error(`条件文が枠に収まらない(${conditions.length}個)`);
  return { ...build, equipment };
}

export const COMBO_BUILDS: Record<string, ComboBuild> = {
  edgeWheel: {
    name: '研ぎ回しの剣',
    idea: '近攻撃で研ぎを溜めて吐き、研ぎ傷で出血、出血から血潮、血潮を吐いて研ぎに戻す輪。吐き出す息で輪を速める',
    build: {
      attributes: attrs({ str: 20, dex: 20, vit: 16 }),
      actives: ['slash', 'lunge', 'thrust', 'flurry'],
      passives: [],
      equipment: { weapon1: weapon('sword', { type: 'ironSword' }) },
      trump: 'frenzyDraught',
      tactics: [always('slash', ['lunge']), always('thrust'), always('flurry'), always('lunge')],
    },
    full: ['honeEdge', 'keenEdge', 'edgeRelease', 'edgeBleed', 'bloodHarvest', 'bloodRewhet', 'spentHaste', 'bloodOffering'],
    givers: ['honeEdge', 'bloodHarvest'],
  },
  emberAxe: {
    name: '熾火の斧',
    idea: '火で熾りを溜めて昂り、5つで破裂させて温もりで癒す。破裂で祈り、祈りがまた熾りを呼ぶ',
    build: {
      attributes: attrs({ fai: 20, str: 18, vit: 18 }),
      actives: ['emberOil', 'scorch', 'slash', 'shoot'],
      passives: [],
      equipment: { weapon1: weapon('axe', { type: 'cinderAxe', element: 'fire' }), weapon2: weapon('sling', { type: 'emberSling', element: 'fire' }) },
      trump: 'oilFlask',
      tactics: [{ skill: 'emberOil', condition: 'imbueOff', enabled: true }, always('shoot', ['scorch']), always('slash'), always('scorch')],
    },
    full: ['kindleEmber', 'emberBlaze', 'emberBurst', 'emberMend', 'pyreHymn', 'spentPrayer', 'prayerKindling', 'prayerHalo'],
    givers: ['kindleEmber'],
  },
  quietArcher: {
    name: '静寂の射手',
    idea: '足を止め、離れて撃って静寂を溜める。静寂は祈りに変わり、祈り5つで裁きの一矢',
    build: {
      attributes: attrs({ dex: 28, vit: 16 }),
      actives: ['quickShot', 'aimedShot', 'boneVolley', 'shoot'],
      passives: [],
      equipment: { weapon1: weapon('bow', { type: 'boneBow' }) },
      trump: 'oilFlask',
      tactics: [always('quickShot', ['aimedShot']), always('boneVolley'), always('shoot'), always('aimedShot')],
    },
    full: ['holdBreath', 'distantQuiet', 'stillAim', 'quietPrayer', 'prayerJudgement', 'focusedVolley', 'farHunter', 'spentHaste'],
    givers: ['holdBreath', 'distantQuiet'],
  },
  bloodShield: {
    name: '血潮の盾',
    idea: '盾を構えて斬り、受け止めて血潮を溜める。血潮を研ぎに変えて斬り返し、溜まれば血の捧げで癒す',
    build: {
      attributes: attrs({ str: 18, vit: 30 }),
      actives: ['slash', 'lunge', 'breaker'],
      passives: [],
      equipment: { weapon1: weapon('sword', { type: 'ironSword' }), weapon2: shield('tower', 'towerShield') },
      trump: 'blessedPrayer',
      tactics: [always('slash', ['lunge']), always('breaker'), always('lunge')],
    },
    full: ['bloodTithe', 'shieldOath', 'bloodWhetstone', 'keenEdge', 'bloodFrenzy', 'bloodOffering', 'edgeRelease', 'bloodRewhet'],
    givers: ['bloodTithe', 'shieldOath'],
  },
  prayerRites: {
    name: '祈りの儀式',
    idea: '儀式を宿した技で祈りを溜め、光輪で守り、5つで裁き。祈りを使えば熾りが燃え上がる',
    build: {
      attributes: attrs({ str: 16, dex: 16, vit: 16, fai: 16 }),
      actives: ['stillPrayer', 'whetRite', 'bloodOath', 'pyreOffering', 'slash', 'lunge'],
      passives: [],
      equipment: { weapon1: weapon('sword', { type: 'ironSword' }) },
      trump: 'blessedPrayer',
      tactics: RITE_TACTICS.map((t) => ({ ...t })),
    },
    full: ['riteEcho', 'prayerHalo', 'prayerJudgement', 'prayerKindling', 'emberBlaze', 'ritualMaster', 'spentPrayer', 'prayerSpendBurst'],
    givers: ['riteEcho'],
  },
  sparkStaff: {
    name: '雷火の術師',
    idea: '雷で熾りを溜め、魂送りの型で締める。感電した敵に雷の通い路、魔力の高まりで溢れる魔力',
    build: {
      attributes: attrs({ int: 30, vit: 18 }),
      actives: ['soulOrbs', 'burstBolt', 'discharge', 'shoot'],
      passives: [],
      equipment: { weapon1: weapon('staff', { type: 'staff', element: 'lightning' }) },
      trump: 'rainBell',
      tactics: [always('soulOrbs', ['burstBolt']), always('discharge'), always('shoot'), always('burstBolt')],
    },
    full: ['sparkEmber', 'emberBlaze', 'emberBurst', 'stormConduit', 'arcaneSurge', 'emberMend', 'spentPrayer', 'prayerKindling'],
    givers: ['sparkEmber'],
  },
  castleHammer: {
    name: '城崩しの戦槌',
    idea: '城崩しの型(崩し→地鳴り→叩き割り)で研ぎを溜めて吐く。両手の重みで一撃を重く',
    build: {
      attributes: attrs({ str: 30, vit: 18 }),
      actives: ['breaker', 'quake', 'cleave', 'slash'],
      passives: [],
      equipment: { weapon1: weapon('hammer', { type: 'warHammer' }) },
      trump: 'frenzyDraught',
      tactics: [always('breaker', ['quake', 'cleave']), always('slash'), always('quake'), always('cleave')],
    },
    full: ['honeEdge', 'keenEdge', 'edgeRelease', 'heavyGrip', 'edgeBleed', 'bloodHarvest', 'bloodRewhet', 'spentHaste'],
    givers: ['honeEdge'],
  },
  stormSpear: {
    name: '嵐の槍',
    idea: '嵐の穂先の型(突き→薙ぎ払い→旋風)を間合いの端で。雷で熾り、近攻撃で研ぎを溜める二つの印',
    build: {
      attributes: attrs({ str: 18, dex: 18, int: 12, vit: 16 }),
      actives: ['thrust', 'sweep', 'whirlwind', 'slash'],
      passives: [],
      equipment: { weapon1: weapon('spear', { type: 'stormSpear', element: 'lightning' }) },
      trump: 'rainBell',
      tactics: [always('thrust', ['sweep', 'whirlwind']), always('slash'), always('sweep'), always('whirlwind')],
    },
    full: ['sparkEmber', 'emberBlaze', 'emberBurst', 'spearEdge', 'stormConduit', 'honeEdge', 'keenEdge', 'edgeRelease'],
    givers: ['sparkEmber', 'honeEdge'],
  },
};
