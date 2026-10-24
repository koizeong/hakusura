import type { AffixId, EquipKind } from './equipment';
import type { ConditionId } from './conditions';
import type { ElementId } from './elements';
import type { FieldId } from './fields';
import type { WeaponTypeId } from './weapons';
import type { ActiveSkillId } from './skills';
import type { PassiveId } from './passives';
import type { VariationId } from './variations';

/**
 * 遠征の行き先。長く危ない所ほど多く持ち帰る。
 * 行き先ごとに戦う環境があり、ビルドの強さはその環境で測る。持ち帰る物にもその地らしさが出る
 */
export interface ExpeditionDef {
  name: string;
  description: string;
  /** かかる時間(ミリ秒) */
  duration: number;
  /** 手強さ。その地で測ったビルドの強さがこれと同じなら、持ち帰る量は1倍 */
  threat: number;
  exp: number;
  /** 持ち帰る装備の数 */
  items: number;
  /** 戦う環境。天候、足元に敷かれた床、敵の耐性 */
  environment: { weather?: FieldId; floor?: FieldId; resist?: Partial<Record<ElementId, number>> };
  /** 出やすい装備の種類・武器・補正値・条件文 */
  itemKinds?: readonly EquipKind[];
  weaponTypes?: readonly WeaponTypeId[];
  preferAffixes?: readonly AffixId[];
  preferConditions?: readonly ConditionId[];
  /** 条件文つきの装備が出る確率 */
  conditionChance: number;
  /** まだ覚えていないスキルを1つ見つける確率と、その地で見つかりやすいスキル */
  skillChance: number;
  preferSkills?: readonly (ActiveSkillId | PassiveId)[];
  /** 変化つきの技を1つ持ち帰る確率と、その地で付きやすい変化 */
  variantChance: number;
  preferVariations?: readonly VariationId[];
}

const MIN = 60 * 1000;

export const EXPEDITIONS = {
  outskirts: {
    name: '野営地の見回り',
    description: '近場を一回りする。すぐ戻るが、得る物も少ない',
    duration: 2 * MIN,
    threat: 60,
    exp: 30,
    items: 1,
    environment: {},
    conditionChance: 0.1,
    skillChance: 0.1,
    preferSkills: ['quickShot', 'lunge'],
    variantChance: 0.1,
  },
  ashRoad: {
    name: '灰の街道',
    description: '崩れた街道を辿る。斬り合いの跡が多く、斬と出血の物が出やすい',
    duration: 30 * MIN,
    threat: 120,
    exp: 600,
    items: 4,
    environment: { resist: { lightning: 0.3 } },
    preferAffixes: ['slashDamage', 'bleedBuildup', 'meleeDamage', 'moveSpeed'],
    preferConditions: ['bleedingSprint', 'bleedBack', 'runningBlade', 'untouched'],
    conditionChance: 0.25,
    skillChance: 0.3,
    preferSkills: ['gouge', 'thrust', 'flurry', 'bloodCut', 'whetstone', 'bloodRush', 'bloodletter', 'fleetFoot'],
    variantChance: 0.3,
    preferVariations: ['bloodHound', 'vengeful', 'quick'],
  },
  rustMine: {
    name: '錆の廃坑',
    description: '油の染みた坑道。武器と火の物が出やすい。坑の敵は火に強い',
    duration: 2 * 60 * MIN,
    threat: 220,
    exp: 3000,
    items: 6,
    environment: { floor: 'oilPool', resist: { fire: 0.5 } },
    itemKinds: ['weapon', 'weapon', 'armor'],
    weaponTypes: ['rustGreatsword', 'cinderAxe', 'boneFlail', 'emberSling'],
    preferAffixes: ['fireDamage', 'burnBuildup', 'meleeDamage', 'maxHp'],
    preferConditions: ['oilWalker', 'twinStrikeOnBurning', 'twoHandedReach', 'mirroredBlades'],
    conditionChance: 0.3,
    skillChance: 0.5,
    preferSkills: ['scorch', 'cleave', 'breaker', 'quake', 'oilFlask', 'oilSoaked', 'pyromaniac', 'emberHeart', 'heavyHand'],
    variantChance: 0.5,
    preferVariations: ['smoldering', 'stunning', 'heavy', 'wide'],
  },
  drownedChapel: {
    name: '沈んだ聖堂',
    description: '雨の止まない聖堂の奥。雷と濡れの物、条件文つきの装備、古い技が見つかる',
    duration: 8 * 60 * MIN,
    threat: 400,
    exp: 16000,
    items: 10,
    environment: { weather: 'rain', resist: { slash: 0.3 } },
    itemKinds: ['accessory', 'armor', 'weapon'],
    weaponTypes: ['stormSpear', 'capGun', 'boneBow'],
    preferAffixes: ['lightningDamage', 'shockBuildup', 'statusDamage', 'cooldown'],
    preferConditions: ['rainSoaked', 'manyAilments', 'cleanBody', 'crowdCleaver'],
    conditionChance: 0.6,
    skillChance: 0.9,
    preferSkills: ['discharge', 'volley', 'aimedShot', 'pierceShot', 'scatterShot', 'stormOil', 'thunderPrayer', 'stormCaller', 'stormFinger'],
    variantChance: 0.8,
    preferVariations: ['wetting', 'rainSwift', 'thirdThunder', 'echoing'],
  },
} as const satisfies Record<string, ExpeditionDef>;

export type ExpeditionId = keyof typeof EXPEDITIONS;
export const EXPEDITION_IDS = Object.keys(EXPEDITIONS) as ExpeditionId[];

export function expeditionDef(id: ExpeditionId): ExpeditionDef {
  return EXPEDITIONS[id];
}

/** 持ち帰る量に掛ける倍率の幅。弱すぎても少しは持ち帰り、強すぎても取り過ぎない */
export const EXPEDITION_YIELD = { min: 0.3, max: 1.5 } as const;

/**
 * 負傷。その地で測った強さが手強さの below 倍に満たないと、負傷して戻ることがある。
 * 足りないほど負傷しやすく(最大 maxChance)、負傷の間は戦えず遠征にも出せない
 */
export const EXPEDITION_INJURY = {
  below: 0.7,
  maxChance: 0.8,
  /** 負傷が治るまで。遠征にかかった時間のこの割合(短くても minMs) */
  durationRatio: 0.5,
  minMs: 5 * MIN,
} as const;
