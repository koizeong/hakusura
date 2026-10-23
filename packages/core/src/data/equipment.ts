import { statDef, type StatId } from './stats';
import { CONDITIONS, CONDITION_IDS, type ConditionId } from './conditions';
import type { ArtifactId } from './artifacts';

/** 装備の部位 */
export const EQUIP_SLOTS = {
  head: { name: '頭', kind: 'armor' },
  body: { name: '体', kind: 'armor' },
  hands: { name: '手', kind: 'armor' },
  feet: { name: '足', kind: 'armor' },
  accessory1: { name: '装飾品1', kind: 'accessory' },
  accessory2: { name: '装飾品2', kind: 'accessory' },
  accessory3: { name: '装飾品3', kind: 'accessory' },
  weapon1: { name: '武器1', kind: 'weapon' },
  weapon2: { name: '武器2', kind: 'weapon' },
} as const;
export type EquipSlotId = keyof typeof EQUIP_SLOTS;
export type EquipKind = (typeof EQUIP_SLOTS)[EquipSlotId]['kind'];
export const EQUIP_SLOT_IDS = Object.keys(EQUIP_SLOTS) as EquipSlotId[];

/** 部位の種類ごとの名前の候補 */
const BASE_NAMES: Record<EquipKind, readonly string[]> = {
  armor: ['錆びた兜', '継ぎ接ぎの外套', '煤けた籠手', '擦り切れた長靴', '骨の肩当て', '古い革鎧', '鎖の頭巾', '腐りかけた脛当て'],
  accessory: ['欠けた指輪', '灰の数珠', '名も知れぬ護符', '錆びた鈴', '割れた鏡片', '褪せた徽章'],
  weapon: ['刃こぼれの剣', '曲がった槍', '錆びた斧', '黒ずんだ短銃', '骨の杖', '鈍い鉈'],
};

/** 補正値の項目。common の項目は、どの装備にも必ず1つ入る */
export interface AffixDef {
  name: string;
  stat: StatId;
  tags: readonly string[];
  common?: boolean;
}

export const AFFIXES = {
  maxHp: { name: '最大HP', stat: 'maxHp', tags: [], common: true },
  moveSpeed: { name: '移動速度', stat: 'moveSpeed', tags: [], common: true },
  damageTaken: { name: '被ダメージ', stat: 'damageTaken', tags: [], common: true },
  damage: { name: '与ダメージ', stat: 'damage', tags: [] },
  meleeDamage: { name: '近攻撃のダメージ', stat: 'damage', tags: ['melee'] },
  rangedDamage: { name: '遠攻撃のダメージ', stat: 'damage', tags: ['ranged'] },
  slashDamage: { name: '斬ダメージ', stat: 'damage', tags: ['slash'] },
  fireDamage: { name: '火ダメージ', stat: 'damage', tags: ['fire'] },
  lightningDamage: { name: '雷ダメージ', stat: 'damage', tags: ['lightning'] },
  statusDamage: { name: '状態のダメージ', stat: 'damage', tags: ['status'] },
  bleedBuildup: { name: '出血の蓄積', stat: 'buildup', tags: ['slash'] },
  burnBuildup: { name: '炎上の蓄積', stat: 'buildup', tags: ['fire'] },
  shockBuildup: { name: '感電の蓄積', stat: 'buildup', tags: ['lightning'] },
  cooldown: { name: 'クールダウン', stat: 'cooldown', tags: [] },
} as const satisfies Record<string, AffixDef>;
export type AffixId = keyof typeof AFFIXES;
export const AFFIX_IDS = Object.keys(AFFIXES) as AffixId[];

export function affixDef(id: AffixId): AffixDef {
  return AFFIXES[id];
}

/** 装備の決まりごと */
export const EQUIP_RULES = {
  /** 1項目の補正値 */
  affixMin: -200,
  affixMax: 200,
  /** 1装備の補正値の合計(得になる向きをプラスとして数える。条件文のコストも含む) */
  totalMin: -100,
  totalMax: 100,
  /** 項目の数(条件文の枠も含む) */
  countMin: 1,
  countMax: 4,
  /** 条件文が入る確率 */
  conditionChance: 0.3,
  /** 補正値の刻み */
  step: 5,
} as const;

export interface ItemAffix {
  affix: AffixId;
  /** % で持つ。被ダメージなら -40 で 40% 減る */
  value: number;
}

export interface Item {
  id: string;
  name: string;
  /** 武器・防具・装飾品のどれか。部位は着けるときに決める */
  kind: EquipKind;
  /** 防具はどの部位か。武器と装飾品は空いている枠に着ける */
  slot?: EquipSlotId;
  affixes: ItemAffix[];
  condition?: ConditionId;
  artifact?: ArtifactId;
}

/** 得になる向きをプラスにした補正値 */
export function benefitOf(a: ItemAffix): number {
  return statDef(AFFIXES[a.affix].stat).lowerIsBetter ? -a.value : a.value;
}

/** 装備の補正値の合計。条件文のコストも含む。-100〜+100 に収まる */
export function itemTotal(item: Item): number {
  return item.affixes.reduce((s, a) => s + benefitOf(a), 0) + (item.condition ? CONDITIONS[item.condition].cost : 0);
}

/** 補正値を Modifier の値(1 = 100%)に直す */
export function affixModifier(a: ItemAffix) {
  const def = affixDef(a.affix);
  return { stat: def.stat, tags: def.tags, value: a.value / 100 };
}

let itemCounter = 0;

export interface GenerateOptions {
  /** 防具なら部位を決めて作る */
  slot?: EquipSlotId;
  kind?: EquipKind;
  /** この条件文を必ず入れる */
  condition?: ConditionId;
}

/**
 * ランダムな装備を作る。項目は1〜4、うち1つは必ず共通項目。
 * 合計を先に決めてから、各項目に -200〜+200 で振り分ける
 */
export function generateItem(random: () => number, options: GenerateOptions = {}): Item {
  const R = EQUIP_RULES;
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const roundStep = (v: number) => Math.round(v / R.step) * R.step;

  const slotId = options.slot ?? pick(EQUIP_SLOT_IDS);
  const kind = options.kind ?? EQUIP_SLOTS[slotId].kind;
  const slot = kind === 'armor' ? (EQUIP_SLOTS[slotId].kind === 'armor' ? slotId : pick(EQUIP_SLOT_IDS.filter((s) => EQUIP_SLOTS[s].kind === 'armor'))) : undefined;

  const count = R.countMin + Math.floor(random() * (R.countMax - R.countMin + 1));
  const condition = options.condition ?? (count >= 2 && random() < R.conditionChance ? pick(CONDITION_IDS) : undefined);
  const affixCount = Math.max(1, count - (condition ? 1 : 0));

  const commons = AFFIX_IDS.filter((id) => (AFFIXES[id] as AffixDef).common);
  const chosen: AffixId[] = [pick(commons)];
  while (chosen.length < affixCount) {
    const id = pick(AFFIX_IDS);
    if (!chosen.includes(id)) chosen.push(id);
  }

  // 合計を決め、条件文のコストを引いた残りを振り分ける
  const total = roundStep(R.totalMin + random() * (R.totalMax - R.totalMin));
  const remain = total - (condition ? CONDITIONS[condition].cost : 0);
  let benefits: number[] = [];
  for (let attempt = 0; attempt < 200; attempt++) {
    const head = chosen.slice(1).map(() => roundStep(R.affixMin + random() * (R.affixMax - R.affixMin)));
    const last = remain - head.reduce((s, v) => s + v, 0);
    if (last >= R.affixMin && last <= R.affixMax) {
      benefits = [last, ...head];
      break;
    }
  }
  if (benefits.length === 0) {
    // 振り分けがうまくいかなければ均等に割る
    const each = roundStep(remain / chosen.length);
    benefits = chosen.map((_, i) => (i === 0 ? remain - each * (chosen.length - 1) : each));
  }

  const affixes = chosen.map((affix, i) => {
    const lower = statDef(AFFIXES[affix].stat).lowerIsBetter;
    return { affix, value: lower ? -benefits[i]! : benefits[i]! };
  });
  return {
    id: `item-${Date.now().toString(36)}-${(itemCounter++).toString(36)}-${Math.floor(random() * 1e6).toString(36)}`,
    name: pick(BASE_NAMES[kind]),
    kind,
    slot,
    affixes,
    condition,
  };
}
