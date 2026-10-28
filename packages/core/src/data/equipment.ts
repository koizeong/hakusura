import { statDef, type StatId } from './stats';
import { CONDITION_IDS, HANDMADE_CONDITION_IDS, LINK_CONDITION_IDS, conditionDef, type ConditionId } from './conditions';
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
  priest: { prefix: '祭司の', weight: 2, affixes: ['riteDamage', 'riteCooldown', 'maxHp'] },
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
  riteDamage: { name: '儀式を宿した技のダメージ', stat: 'damage', tags: ['rited'] },
  riteCooldown: { name: '儀式のクールダウン', stat: 'cooldown', tags: ['rite'] },
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
  /**
   * 合計の出方。大半は得の向き(goodMin〜totalMax)に出る。
   * cursedChance の確率で、合計がマイナスの「忌まわしき品」になり、代わりに重い条件文が必ず付く
   */
  goodMin: 20,
  cursedChance: 0.12,
  cursedMax: -20,
  /** 忌まわしき品に付く条件文のコストの下限 */
  cursedConditionCost: 40,
  /** 1項目の振れ幅。たいていは usualMin〜usualMax、extremeChance の確率で affixMin〜affixMax まで振れる */
  usualMin: -40,
  usualMax: 120,
  extremeChance: 0.1,
  /** 条件文を選ぶとき、繋ぎの条件文になる確率(手で書いたものと半々より少し多め) */
  linkChance: 0.6,
  /** ビルドに合うものから選ぶ確率(fit を渡したとき) */
  fitChance: 0.6,
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
  /** 忌まわしき品。補正値の合計がマイナスで、代わりに重い条件文が付く */
  cursed?: boolean;
}

/** 忌まわしき品の名前の頭 */
export const CURSED_PREFIX = '忌まわしき';

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
  return item.affixes.reduce((s, a) => s + benefitOf(a), 0) + (item.condition ? conditionDef(item.condition).cost : 0);
}

/**
 * 装備の補正値の種類。同じ種類は足し算、違う種類は掛け算になる。
 * 与ダメージと状態の蓄積は、全体・技の種類(近攻撃・遠攻撃・儀式を宿した技)・属性・状態 の4つにまとめる。
 * 属性ごとに別の種類にすると、7部位に散らばった補正値が掛け算で膨らむので
 */
export function affixGroup(def: AffixDef): string {
  const t = def.tags;
  if (def.stat !== 'damage' && def.stat !== 'buildup') return `${def.stat}:${[...t].sort().join('+')}`;
  // 全体はパッシブの全体と同じ種類(足し算)にする
  if (t.length === 0) return `${def.stat}:`;
  if (t.every((x) => x === 'melee' || x === 'ranged' || x === 'rited')) return `${def.stat}:kind`;
  if (t.includes('status')) return `${def.stat}:status`;
  return `${def.stat}:element`;
}

/** 補正値を Modifier の値(1 = 100%)に直す */
export function affixModifier(a: ItemAffix) {
  const def = affixDef(a.affix);
  return { stat: def.stat, tags: def.tags, value: a.value / 100, group: affixGroup(def) };
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
  /** 今のビルドの属性と技の種類。渡すと、補正値・条件文・武器の属性がビルドに寄る */
  fit?: LootFit;
}

/** 拾い物を寄せる先。ビルドの使う属性と、技の種類(近攻撃・遠攻撃・付与) */
export interface LootFit {
  elements: readonly ElementId[];
  categories: readonly string[];
}

/** その補正値の項目がビルドに合うか。タグのない項目(与ダメージ・クールダウンなど)はどのビルドにも合う */
export function affixFits(id: AffixId, fit: LootFit): boolean {
  const tags = (AFFIXES[id] as AffixDef).tags;
  if ((AFFIXES[id] as AffixDef).common) return false;
  // 儀式を宿した技のダメージは、儀式を組んだビルドに合う
  return tags.length === 0 || tags.some((t) => (fit.elements as readonly string[]).includes(t) || fit.categories.includes(t) || (t === 'rited' && fit.categories.includes('rite')));
}

/** その条件文がビルドに合うか。繋ぎなら、前の手と今の手がどちらもビルドにあるもの */
export function conditionFits(id: ConditionId, fit: LootFit): boolean {
  const link = conditionDef(id).link;
  if (!link) return true;
  const has = (step: { element: ElementId } | { category: string }) =>
    'element' in step ? fit.elements.includes(step.element) : fit.categories.includes(step.category);
  return has(link.prev) && has(link.now);
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
  const fit = options.fit;
  // ビルドに合う項目は、素材や行き先の項目と同じく出やすくする
  const fitting = fit ? AFFIX_IDS.filter((id) => affixFits(id, fit)) : [];
  const materialAffixes = material ? ARMOR_MATERIALS[material].affixes : [];
  const preferAffixes = [...(options.preferAffixes ?? []), ...materialAffixes];
  const pickAffix = (): AffixId => {
    if (fitting.length > 0 && random() < R.fitChance) return pick(fitting);
    return pickPreferred(AFFIX_IDS, preferAffixes);
  };

  // 忌まわしき品は、合計がマイナスになる代わりに重い条件文が必ず付く
  const cursed = !options.condition && random() < R.cursedChance;
  const count = Math.max(cursed ? 2 : R.countMin, R.countMin + Math.floor(random() * (R.countMax - R.countMin + 1)));
  const conditionChance = options.conditionChance ?? R.conditionChance;
  const pickCondition = (minCost = 0): ConditionId => {
    const pool = (ids: readonly ConditionId[]) => ids.filter((id) => conditionDef(id).cost >= minCost);
    if (options.preferConditions && options.preferConditions.length > 0 && random() < 0.5) {
      const preferred = pool(options.preferConditions);
      if (preferred.length > 0) return pick(preferred);
    }
    let ids = pool(random() < R.linkChance ? LINK_CONDITION_IDS : HANDMADE_CONDITION_IDS);
    if (fit && random() < R.fitChance) {
      const fits = ids.filter((id) => conditionFits(id, fit));
      if (fits.length > 0) ids = fits;
    }
    return pick(ids.length > 0 ? ids : CONDITION_IDS);
  };
  const condition =
    options.condition ?? (cursed ? pickCondition(R.cursedConditionCost) : count >= 2 && random() < conditionChance ? pickCondition() : undefined);
  const affixCount = Math.max(1, count - (condition ? 1 : 0));

  const commons = AFFIX_IDS.filter((id) => (AFFIXES[id] as AffixDef).common);
  const chosen: AffixId[] = [pick(commons)];
  for (let guard = 0; chosen.length < affixCount && guard < 100; guard++) {
    const id = pickAffix();
    if (!chosen.includes(id)) chosen.push(id);
  }

  // 合計を決め、条件文のコストを引いた残りを振り分ける。たいていは得の向きに出る
  const total = cursed
    ? roundStep(R.totalMin + random() * (R.cursedMax - R.totalMin))
    : roundStep(R.goodMin + random() * (R.totalMax - R.goodMin));
  const remain = total - (condition ? conditionDef(condition).cost : 0);
  const swing = () =>
    random() < R.extremeChance ? R.affixMin + random() * (R.affixMax - R.affixMin) : R.usualMin + random() * (R.usualMax - R.usualMin);
  let benefits: number[] = [];
  for (let attempt = 0; attempt < 200; attempt++) {
    const head = chosen.slice(1).map(() => roundStep(swing()));
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
      return { id, name: `${cursed ? CURSED_PREFIX : ''}${shieldName(shield)}`, kind, affixes, condition, shieldType, element: shield.element, ...(cursed ? { cursed } : {}) };
    }
    const elements = [...(options.preferElements ?? []), ...(fit && random() < R.fitChance ? fit.elements : [])];
    const weapon = rollWeapon(random, options.weaponType ?? pick(options.weaponTypes ?? LOOT_WEAPON_TYPE_IDS), { elements: elements.length > 0 ? elements : undefined });
    return {
      id,
      name: `${cursed ? CURSED_PREFIX : ''}${weaponName(weapon)}`,
      kind,
      affixes,
      condition,
      weaponType: weapon.type,
      element: weapon.element,
      tempers: [...(weapon.tempers ?? [])],
      ...(cursed ? { cursed } : {}),
    };
  }
  const name = kind === 'armor' && slot && material ? `${ARMOR_MATERIALS[material].prefix}${pick(ARMOR_NAMES[slot] ?? ['防具'])}` : pick(BASE_NAMES[kind]);
  return { id, name: `${cursed ? CURSED_PREFIX : ''}${name}`, kind, slot, affixes, condition, material, ...(cursed ? { cursed } : {}) };
}
