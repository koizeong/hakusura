import { ELEMENTS, type ElementDef, type ElementId } from './elements';
import { ATTRIBUTE_IDS, type AttributeNeeds } from './attributes';
import type { Rule } from '../rules';

/**
 * 武器の形。攻撃の速さ・範囲・近接か遠距離かは形が持つ。属性と性質は拾うたびに変わり、
 * 「重い雷の槍」のように形・属性・性質の組み合わせで1本の武器になる。
 * アクティブスキル(技)は、この数値に倍率を掛けて使う
 */
export type WeaponKind = 'melee' | 'ranged';

export const WEAPON_KINDS: Record<WeaponKind, string> = { melee: '近接', ranged: '遠距離' };

interface WeaponBase {
  name: string;
  element: ElementId;
  /** 1回の威力 */
  power: number;
  /** 状態の蓄積 */
  buildup: number;
  /** 攻撃の間隔(ミリ秒)。技のクールダウンの土台 */
  interval: number;
  /** 振りかぶりと硬直(ミリ秒) */
  windup: number;
  recovery: number;
  /** 届く距離 */
  range: number;
  tags: readonly string[];
  /** 必要な能力値。足りなくても使えるが、威力が落ち間隔が延びる */
  needs?: AttributeNeeds;
  /** 重さ。装備の重さの合計が担える重さを超えると鈍重になる */
  weight: number;
  /** この形で当てたときに効くルール(戦槌の昏倒など) */
  rules?: readonly Rule[];
  /**
   * コンボが続くほど伸びる力(杖)。コンボのヒットごとに1つ溜まり、window の間コンボがなければ消える。
   * 溜まった数 × perStack を、tag を持つヒットの与ダメージに足す
   */
  comboGrowth?: { label: string; perStack: number; max: number; window: number; tag: string };
  /**
   * 同じ相手に当て続けるほど伸びる力(弓・銃・投石紐)。武器のタグ tag を持つ直撃が同じ相手に当たるたびに1つ溜まり、
   * 別の相手に当てるか window の間当てなければ数え直す。溜まった数 × perStack を与ダメージに足す
   */
  focusGrowth?: { label: string; perStack: number; max: number; window: number; tag: string };
  /**
   * ステップの後の一撃(短剣の返しの踏み込み)。ステップから window の間に、この武器で出す最初の近攻撃は
   * 届く距離が range 倍になり、与ダメージに add を足す。避けてすぐ刺せる
   */
  stepStrike?: { label: string; window: number; range: number; add: number };
}

export interface MeleeWeaponDef extends WeaponBase {
  kind: 'melee';
  /** 振る扇の角度(度) */
  arc: number;
}

export interface RangedWeaponDef extends WeaponBase {
  kind: 'ranged';
  /** 弾の速さと大きさ */
  speed: number;
  radius: number;
  /** 当たると弾ける。周り radius の相手にも ratio の威力で当たる(杖の魔弾) */
  explode?: { radius: number; ratio: number };
}

export type WeaponTypeDef = MeleeWeaponDef | RangedWeaponDef;

export const WEAPON_TYPES = {
  fists: {
    name: '素手',
    kind: 'melee',
    element: 'slash',
    weight: 0,
    power: 14,
    buildup: 18,
    interval: 700,
    windup: 150,
    recovery: 220,
    range: 70,
    arc: 100,
    tags: ['unarmed'],
  },
  ironSword: {
    name: '鉄の剣',
    kind: 'melee',
    element: 'slash',
    weight: 5,
    power: 38,
    buildup: 45,
    interval: 850,
    windup: 220,
    recovery: 320,
    range: 100,
    arc: 130,
    needs: { str: 10, dex: 10 },
    tags: ['sword'],
  },
  rustGreatsword: {
    name: '大剣',
    kind: 'melee',
    element: 'slash',
    weight: 10,
    power: 52,
    buildup: 55,
    interval: 1100,
    windup: 280,
    recovery: 420,
    range: 110,
    arc: 150,
    needs: { str: 18 },
    tags: ['sword', 'heavy'],
  },
  boneFlail: {
    name: '骨の連枷',
    kind: 'melee',
    element: 'blunt',
    weight: 4,
    power: 24,
    buildup: 28,
    interval: 550,
    windup: 160,
    recovery: 220,
    range: 90,
    arc: 110,
    needs: { dex: 12 },
    tags: ['light'],
  },
  cinderAxe: {
    name: '戦斧',
    kind: 'melee',
    element: 'fire',
    weight: 9,
    power: 88,
    buildup: 75,
    interval: 1800,
    windup: 450,
    recovery: 500,
    range: 110,
    arc: 120,
    needs: { str: 16 },
    tags: ['axe', 'heavy'],
  },
  stormSpear: {
    name: '槍',
    kind: 'melee',
    element: 'lightning',
    weight: 6,
    power: 46,
    buildup: 55,
    interval: 1200,
    windup: 300,
    recovery: 380,
    range: 170,
    arc: 36,
    needs: { dex: 14 },
    tags: ['spear'],
  },
  capGun: {
    name: '短銃',
    kind: 'ranged',
    element: 'lightning',
    weight: 4,
    power: 26,
    buildup: 60,
    interval: 2400,
    windup: 320,
    recovery: 380,
    range: 750,
    speed: 900,
    radius: 7,
    needs: { dex: 12 },
    tags: ['gun'],
    // 速射で同じ相手に当て続けるほど、狙いが締まって重くなる
    focusGrowth: { label: '狙いの締まり', perStack: 0.03, max: 20, window: 2500, tag: 'gun' },
  },
  emberSling: {
    name: '投石紐',
    kind: 'ranged',
    element: 'fire',
    weight: 1,
    power: 14,
    buildup: 55,
    interval: 2600,
    windup: 300,
    recovery: 350,
    range: 650,
    speed: 700,
    radius: 8,
    needs: { dex: 8 },
    tags: ['sling'],
    // 速射で同じ相手に当て続けるほど、狙いが締まって重くなる
    focusGrowth: { label: '狙いの締まり', perStack: 0.03, max: 20, window: 2500, tag: 'sling' },
  },
  boneBow: {
    name: '骨の短弓',
    kind: 'ranged',
    element: 'pierce',
    weight: 3,
    power: 18,
    buildup: 30,
    interval: 1500,
    windup: 260,
    recovery: 300,
    range: 700,
    speed: 850,
    radius: 5,
    needs: { dex: 14 },
    tags: ['bow'],
    // 速射で同じ相手に当て続けるほど、狙いが締まって重くなる
    focusGrowth: { label: '狙いの締まり', perStack: 0.03, max: 20, window: 2500, tag: 'bow' },
  },
  dagger: {
    name: '短剣',
    kind: 'melee',
    element: 'pierce',
    weight: 2,
    power: 19,
    buildup: 30,
    interval: 480,
    windup: 110,
    recovery: 170,
    range: 72,
    arc: 90,
    needs: { dex: 12 },
    tags: ['dagger', 'light'],
    stepStrike: { label: '返しの踏み込み', window: 1000, range: 2, add: 0.5 },
  },
  warHammer: {
    name: '戦槌',
    kind: 'melee',
    element: 'blunt',
    weight: 12,
    power: 66,
    buildup: 35,
    interval: 1500,
    windup: 420,
    recovery: 480,
    range: 105,
    arc: 110,
    needs: { str: 20 },
    tags: ['hammer', 'heavy'],
    // 叩けば昏倒が溜まる
    rules: [{ label: '槌の重み', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'applyBuildup', status: 'stun', amount: 22 }] }],
  },
  staff: {
    name: '杖',
    kind: 'ranged',
    element: 'lightning',
    weight: 3,
    power: 22,
    buildup: 45,
    interval: 2300,
    windup: 380,
    recovery: 380,
    range: 620,
    speed: 430,
    radius: 11,
    // 速射になったので、弾ける分は控えめにする
    explode: { radius: 70, ratio: 0.2 },
    needs: { int: 12 },
    tags: ['staff', 'magic'],
    // 術はコンボで伸びる。連鎖や雷雨が続くほど、魔弾が重くなる
    comboGrowth: { label: '魔力の高まり', perStack: 0.05, max: 30, window: 8000, tag: 'magic' },
  },
} as const satisfies Record<string, WeaponTypeDef>;

export type WeaponTypeId = keyof typeof WEAPON_TYPES;
export const WEAPON_TYPE_IDS = Object.keys(WEAPON_TYPES) as WeaponTypeId[];
/** 拾い物で出る武器。素手は出ない */
export const LOOT_WEAPON_TYPE_IDS = WEAPON_TYPE_IDS.filter((id) => id !== 'fists');

/**
 * 武器の性質。拾った武器に0〜2個付き、形の数値を少し傾ける。
 * 得と損が釣り合うようにして、補正値の合計には数えない
 */
export interface TemperDef {
  prefix: string;
  text: string;
  /** 付けられる武器。なければどれにも付く */
  kind?: WeaponKind;
  power?: number;
  interval?: number;
  range?: number;
  buildup?: number;
  arc?: number;
  windup?: number;
  /** 必要な能力値に足す点数 */
  needs?: AttributeNeeds;
  /** 必要な能力値に掛ける倍率(錆びた武器は扱いが雑でいい) */
  needsScale?: number;
}

export const WEAPON_TEMPERS = {
  heavy: { prefix: '重い', text: '威力1.2倍・間隔1.15倍・筋力+4', power: 1.2, interval: 1.15, needs: { str: 4 } },
  light: { prefix: '軽い', text: '威力0.85倍・間隔0.82倍', power: 0.85, interval: 0.82 },
  long: { prefix: '長い', text: '射程1.2倍・振りかぶり1.15倍', range: 1.2, windup: 1.15 },
  keen: { prefix: '研がれた', text: '蓄積1.5倍・威力0.92倍', buildup: 1.5, power: 0.92 },
  crude: { prefix: '粗い', text: '威力1.12倍・蓄積0.7倍', power: 1.12, buildup: 0.7 },
  broad: { prefix: '幅広の', text: '扇1.3倍・威力0.9倍', kind: 'melee', arc: 1.3, power: 0.9 },
  rusted: { prefix: '錆びた', text: '威力0.88倍・必要な能力値0.6倍', power: 0.88, needsScale: 0.6 },
  balanced: { prefix: '手に馴染む', text: '振りかぶりと硬直0.75倍', windup: 0.75 },
  hungry: { prefix: '餓えた', text: '威力1.25倍・蓄積0.6倍・技量+4', power: 1.25, buildup: 0.6, needs: { dex: 4 } },
} as const satisfies Record<string, TemperDef>;

export type TemperId = keyof typeof WEAPON_TEMPERS;
export const TEMPER_IDS = Object.keys(WEAPON_TEMPERS) as TemperId[];

/** 1本の武器。形と、拾ったときに決まる属性と性質 */
export interface WeaponSpec {
  type: WeaponTypeId;
  /** なければ形のもとの属性 */
  element?: ElementId;
  tempers?: readonly TemperId[];
}

/** 形だけでも、1本の武器としても渡せる */
export type WeaponRef = WeaponTypeId | WeaponSpec;

export function toWeaponSpec(w: WeaponRef): WeaponSpec {
  return typeof w === 'string' ? { type: w } : w;
}

export type ResolvedWeapon = WeaponTypeDef & { id: WeaponTypeId; tempers: readonly TemperId[] };

/**
 * 近接か遠距離かで、武器の威力に掛ける倍率。近接は敵に寄る危うさを負うので、ここで火力を上乗せする。
 * 近接と遠距離の釣り合いは、まずこの数字で整える(balance.test.ts が確かめる)
 */
export const WEAPON_KIND_POWER = { melee: 1.5, ranged: 0.55 } as const;

/**
 * 近接か遠距離かで、間隔と振りかぶり・硬直に掛ける倍率。遠距離は速射で戦う:1発は軽いが、
 * 間隔が半分なので、付与の追撃・条件文・繋ぎが多く出る。1発の蓄積も半分にして、状態の溜まる速さはほぼ据え置く
 */
export const WEAPON_KIND_PACE = { melee: { interval: 1, windup: 1, buildup: 1 }, ranged: { interval: 0.45, windup: 0.6, buildup: 0.5 } } as const;

/** 形に属性と性質を重ねた、実際の武器の数値 */
export function weaponDef(ref: WeaponRef): ResolvedWeapon {
  const spec = toWeaponSpec(ref);
  const base: WeaponTypeDef = WEAPON_TYPES[spec.type];
  const element = spec.element ?? base.element;
  const tempers = spec.tempers ?? [];
  const pace = WEAPON_KIND_PACE[base.kind];
  let power = base.power * WEAPON_KIND_POWER[base.kind];
  let interval = base.interval * pace.interval;
  let range = base.range;
  let buildup = base.buildup * pace.buildup;
  let windup = base.windup * pace.windup;
  let recovery = base.recovery * pace.windup;
  let arc = base.kind === 'melee' ? base.arc : 0;
  // 属性の必要な能力値(火は信仰、雷は理力)は、形の必要な能力値に足す
  const needs: Record<string, number> = { ...(base.needs ?? {}) };
  for (const [id, v] of Object.entries((ELEMENTS[element] as ElementDef).weaponNeeds ?? {})) needs[id] = Math.max(needs[id] ?? 0, v as number);
  let needsScale = 1;
  for (const id of tempers) {
    const t: TemperDef = WEAPON_TEMPERS[id];
    power *= t.power ?? 1;
    interval *= t.interval ?? 1;
    range *= t.range ?? 1;
    buildup *= t.buildup ?? 1;
    windup *= t.windup ?? 1;
    recovery *= t.windup ?? 1;
    arc *= t.arc ?? 1;
    needsScale *= t.needsScale ?? 1;
    for (const [a, v] of Object.entries(t.needs ?? {})) needs[a] = (needs[a] ?? 0) + (v as number);
  }
  const scaled = Object.fromEntries(
    ATTRIBUTE_IDS.filter((a) => needs[a]).map((a) => [a, Math.round(needs[a]! * needsScale)]),
  ) as AttributeNeeds;
  const common = {
    name: weaponName(spec),
    element,
    power,
    interval,
    range,
    buildup,
    windup,
    recovery,
    needs: Object.keys(scaled).length > 0 ? scaled : undefined,
    id: spec.type,
    tempers,
  };
  return base.kind === 'melee' ? { ...base, ...common, arc: Math.min(360, arc) } : { ...base, ...common };
}

/** 「重い雷の槍」のような名前。性質、属性、形の順に並べる */
export function weaponName(ref: WeaponRef): string {
  const spec = toWeaponSpec(ref);
  const base = WEAPON_TYPES[spec.type];
  const element = spec.element ?? base.element;
  // 素手は属性を名乗らない。打の槌や刺の弓のように、形のもとの物理の属性も名前に出さない
  const def = ELEMENTS[element] as ElementDef;
  const plain = spec.type === 'fists' || (element === base.element && def.tags.includes('physical'));
  const elementPrefix = plain ? '' : def.weaponPrefix;
  return `${(spec.tempers ?? []).map((t) => WEAPON_TEMPERS[t].prefix).join('')}${elementPrefix}${base.name}`;
}

/** その武器に付けられる性質 */
export function temperFits(id: TemperId, type: WeaponTypeId): boolean {
  const kind: WeaponKind | undefined = (WEAPON_TEMPERS[id] as TemperDef).kind;
  return !kind || kind === WEAPON_TYPES[type].kind;
}

/** 拾う武器の属性と性質を決める。半分はもとの属性、残りは属性も変わる */
export function rollWeapon(random: () => number, type: WeaponTypeId, prefer: { elements?: readonly ElementId[] } = {}): WeaponSpec {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const ids = Object.keys(ELEMENTS) as ElementId[];
  let element: ElementId = WEAPON_TYPES[type].element;
  const r = random();
  if (prefer.elements && prefer.elements.length > 0 && r < 0.35) element = pick(prefer.elements);
  else if (r < 0.65) element = pick(ids);
  const fits = TEMPER_IDS.filter((t) => temperFits(t, type));
  const n = random() < 0.25 ? 0 : random() < 0.8 ? 1 : 2;
  const tempers: TemperId[] = [];
  while (tempers.length < n) {
    const t = pick(fits);
    if (!tempers.includes(t)) tempers.push(t);
  }
  return { type, element, tempers };
}
