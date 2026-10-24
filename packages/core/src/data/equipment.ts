import { statDef, type StatId } from './stats';
import { CONDITIONS, CONDITION_IDS, type ConditionId } from './conditions';
import type { ArtifactId } from './artifacts';
import { LOOT_WEAPON_TYPE_IDS, rollWeapon, weaponName, type TemperId, type WeaponSpec, type WeaponTypeId } from './weapons';
import { SHIELD_TYPE_IDS, rollShield, shieldName, type ShieldSpec, type ShieldTypeId } from './shields';
import type { ElementId } from './elements';

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
  // 防具は部位ごとの名前を使う(ARMOR_NAMES)
  armor: [],
  accessory: ['欠けた指輪', '灰の数珠', '名も知れぬ護符', '錆びた鈴', '割れた鏡片', '褪せた徽章'],
  // 武器は武器の種類の名前を使う
  weapon: [],
};

/** 防具の部位ごとの形の名前 */
const ARMOR_NAMES: Partial<Record<EquipSlotId, readonly string[]>> = {
  head: ['兜', '頭巾', '面頬', '冠'],
  body: ['外套', '鎧', '肩当て', '帷子'],
  hands: ['籠手', '手甲', '手袋'],
  feet: ['長靴', '脛当て', '革靴'],
};

/**
 * 防具の素材。名前の頭に付き、出やすい補正値と重さが決まる。
 * 「血染めの外套」なら出血の物が、「鎖の帷子」なら守りの物が出やすい
 */
export const ARMOR_MATERIALS = {
  leather: { prefix: '擦り切れた革の', weight: 2, affixes: ['moveSpeed', 'cooldown'] },
  chain: { prefix: '錆びた鎖の', weight: 6, affixes: ['damageTaken', 'maxHp'] },
  bone: { prefix: '骨の', weight: 3, affixes: ['statusDamage', 'bleedBuildup', 'burnBuildup', 'shockBuildup'] },
  soot: { prefix: '煤けた', weight: 2, affixes: ['fireDamage', 'burnBuildup'] },
  storm: { prefix: '雷に焼けた', weight: 3, affixes: ['lightningDamage', 'shockBuildup'] },
  blood: { prefix: '血染めの', weight: 3, affixes: ['slashDamage', 'bleedBuildup', 'meleeDamage'] },
  pilgrim: { prefix: '巡礼者の', weight: 2, affixes: ['maxHp', 'damage'] },
  hunter: { prefix: '狩人の', weight: 2, affixes: ['rangedDamage', 'moveSpeed'] },
  frost: { prefix: '霜の降りた', weight: 4, affixes: ['iceDamage', 'freezeBuildup'] },
  mire: { prefix: '腐れた', weight: 3, affixes: ['rotDamage', 'rotBuildup'] },
  hex: { prefix: '呪われた', weight: 2, affixes: ['curseDamage', 'bindBuildup', 'darkDamage'] },
  pyre: { prefix: '灰を被った', weight: 3, affixes: ['ashDamage', 'ashBuildup'] },
  bloodpact: { prefix: '血の誓いの', weight: 3, affixes: ['bloodDamage', 'thirstBuildup', 'healing'] },
  iron: { prefix: '鋲打ちの', weight: 7, affixes: ['bluntDamage', 'stunBuildup', 'pierceDamage'] },
} as const satisfies Record<string, { prefix: string; weight: number; affixes: readonly AffixId[] }>;
export type ArmorMaterialId = keyof typeof ARMOR_MATERIALS;
export const ARMOR_MATERIAL_IDS = Object.keys(ARMOR_MATERIALS) as ArmorMaterialId[];

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
  bluntDamage: { name: '打ダメージ', stat: 'damage', tags: ['blunt'] },
  pierceDamage: { name: '刺ダメージ', stat: 'damage', tags: ['pierce'] },
  rotDamage: { name: '腐ダメージ', stat: 'damage', tags: ['rot'] },
  curseDamage: { name: '呪ダメージ', stat: 'damage', tags: ['curse'] },
  iceDamage: { name: '氷ダメージ', stat: 'damage', tags: ['ice'] },
  darkDamage: { name: '闇ダメージ', stat: 'damage', tags: ['dark'] },
  ashDamage: { name: '灰ダメージ', stat: 'damage', tags: ['ash'] },
  bloodDamage: { name: '血ダメージ', stat: 'damage', tags: ['blood'] },
  stunBuildup: { name: '昏倒の蓄積', stat: 'buildup', tags: ['blunt'] },
  exposeBuildup: { name: '露出の蓄積', stat: 'buildup', tags: ['pierce'] },
  rotBuildup: { name: '腐敗の蓄積', stat: 'buildup', tags: ['rot'] },
  bindBuildup: { name: '呪縛の蓄積', stat: 'buildup', tags: ['curse'] },
  freezeBuildup: { name: '凍結の蓄積', stat: 'buildup', tags: ['ice'] },
  blindBuildup: { name: '盲目の蓄積', stat: 'buildup', tags: ['dark'] },
  ashBuildup: { name: '灰化の蓄積', stat: 'buildup', tags: ['ash'] },
  thirstBuildup: { name: '渇きの蓄積', stat: 'buildup', tags: ['blood'] },
  healing: { name: '回復', stat: 'healing', tags: [] },
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
  /** 武器の枠のとき、盾が出る確率 */
  shieldChance: 0.2,
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
  /** 武器の形。攻撃の速さ・範囲・近接か遠距離かはここで決まる */
  weaponType?: WeaponTypeId;
  /** 武器と盾の属性。なければ形のもとの属性(盾は属性なし) */
  element?: ElementId;
  /** 武器の性質 */
  tempers?: TemperId[];
  /** 盾の形。盾は武器の枠に着ける */
  shieldType?: ShieldTypeId;
  /** 防具の素材 */
  material?: ArmorMaterialId;
}

/** 武器なら、その1本 */
export function itemWeapon(item: Item): WeaponSpec | undefined {
  return item.weaponType ? { type: item.weaponType, element: item.element, tempers: item.tempers } : undefined;
}

/** 盾なら、その1枚 */
export function itemShield(item: Item): ShieldSpec | undefined {
  return item.shieldType ? { type: item.shieldType, element: item.element } : undefined;
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
  /** 武器ならこの種類で作る */
  weaponType?: WeaponTypeId;
  /** 武器ならこの中から種類を選ぶ */
  weaponTypes?: readonly WeaponTypeId[];
  /** 武器と盾に出やすい属性 */
  preferElements?: readonly ElementId[];
  /** 武器の枠のとき、盾になる確率 */
  shieldChance?: number;
  /** 盾ならこの形で作る */
  shieldType?: ShieldTypeId;
  /** 出やすい補正値の項目。項目を選ぶたび、半分の確率でこの中から選ぶ */
  preferAffixes?: readonly AffixId[];
  /** 条件文が入る確率と、出やすい条件文。条件文を選ぶとき、半分の確率でこの中から選ぶ */
  conditionChance?: number;
  preferConditions?: readonly ConditionId[];
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

  // 出やすいものがあれば、半分の確率でその中から選ぶ
  const pickPreferred = <T>(all: readonly T[], preferred: readonly T[] | undefined): T =>
    preferred && preferred.length > 0 && random() < 0.5 ? pick(preferred) : pick(all);

  // 防具は素材を決め、その素材らしい補正値を出やすくする
  const material = kind === 'armor' ? pick(ARMOR_MATERIAL_IDS) : undefined;
  const preferAffixes = [...(options.preferAffixes ?? []), ...(material ? ARMOR_MATERIALS[material].affixes : [])];

  const count = R.countMin + Math.floor(random() * (R.countMax - R.countMin + 1));
  const conditionChance = options.conditionChance ?? R.conditionChance;
  const condition = options.condition ?? (count >= 2 && random() < conditionChance ? pickPreferred(CONDITION_IDS, options.preferConditions) : undefined);
  const affixCount = Math.max(1, count - (condition ? 1 : 0));

  const commons = AFFIX_IDS.filter((id) => (AFFIXES[id] as AffixDef).common);
  const chosen: AffixId[] = [pick(commons)];
  for (let guard = 0; chosen.length < affixCount && guard < 100; guard++) {
    const id = pickPreferred(AFFIX_IDS, preferAffixes);
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
  const id = `item-${Date.now().toString(36)}-${(itemCounter++).toString(36)}-${Math.floor(random() * 1e6).toString(36)}`;
  if (kind === 'weapon') {
    // 武器の枠には、ときどき盾が出る
    const shieldType =
      options.shieldType ?? (!options.weaponType && random() < (options.shieldChance ?? EQUIP_RULES.shieldChance) ? pick(SHIELD_TYPE_IDS) : undefined);
    if (shieldType) {
      const shield = rollShield(random, shieldType);
      return { id, name: shieldName(shield), kind, affixes, condition, shieldType, element: shield.element };
    }
    const weapon = rollWeapon(random, options.weaponType ?? pick(options.weaponTypes ?? LOOT_WEAPON_TYPE_IDS), { elements: options.preferElements });
    return { id, name: weaponName(weapon), kind, affixes, condition, weaponType: weapon.type, element: weapon.element, tempers: [...(weapon.tempers ?? [])] };
  }
  const name = kind === 'armor' && slot && material ? `${ARMOR_MATERIALS[material].prefix}${pick(ARMOR_NAMES[slot] ?? ['防具'])}` : pick(BASE_NAMES[kind]);
  return { id, name, kind, slot, affixes, condition, material };
}
