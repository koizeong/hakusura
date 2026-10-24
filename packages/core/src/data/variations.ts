import type { Predicate, Rule } from '../rules';
import type { ActiveSkillId, Technique } from './skills';
import type { WeaponKind } from './weapons';

/**
 * 技の変化。手作りの技に、ランダムに1〜2個刻まれて「雨垂れの薙ぎ払い」のような変化つきの技になる。
 * 数値の上下より、振る舞いが変わるものを中心にする。強い変化ほどコストが高く、代償の変化と組み合わさる
 */
export interface VariationDef {
  /** 技の名前の前に付ける */
  prefix: string;
  text: string;
  /** 強さの見積もり。変化つきの技の合計は VARIANT_RULES.costMax までに収める。代償はマイナス */
  cost: number;
  /** 付けられる技。なければどの技にも付く */
  appliesTo?: { shapes?: readonly Technique['shape'][]; kind?: WeaponKind };
  /** 技の倍率に掛ける・足すもの。power は状態の蓄積にも掛かる(buildup があればそちら) */
  power?: number;
  interval?: number;
  range?: number;
  buildup?: number;
  arc?: number;
  addCount?: number;
  addHits?: number;
  addPierce?: number;
  /** 弾が当たると弾ける(shot) */
  explode?: { radius: number; ratio: number };
  /** この技で当てたときだけ効くルール */
  rules?: readonly Rule[];
  /** 条件を満たしているときだけ、間隔に掛ける倍率 */
  intervalWhen?: { when: readonly Predicate[]; mult: number };
}

const SWING_OR_NOVA = { shapes: ['swing', 'nova'] } as const;

export const VARIATIONS = {
  wetting: {
    prefix: '雨垂れの',
    text: '当てると、濡れが溜まる',
    cost: 25,
    rules: [{ label: '雨垂れ', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }], do: [{ type: 'applyBuildup', status: 'wet', amount: 45 }] }],
  },
  smoldering: {
    prefix: '燻る',
    text: '当てると、炎上が溜まる',
    cost: 30,
    rules: [{ label: '燻り', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }], do: [{ type: 'applyBuildup', status: 'burn', amount: 35 }] }],
  },
  stunning: {
    prefix: '打ち据える',
    text: '当てると、昏倒が溜まる',
    cost: 35,
    rules: [{ label: '打ち据え', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }], do: [{ type: 'applyBuildup', status: 'stun', amount: 30 }] }],
  },
  thirdThunder: {
    prefix: '三度目の',
    text: '3回目に使うごとに、当てた相手へ雷が落ちる',
    cost: 40,
    rules: [
      {
        label: '三度目の雷',
        on: 'hit',
        when: [{ type: 'useEvery', n: 3 }, { type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'hitLacksTag', tag: 'multi' }],
        do: [{ type: 'strike', element: 'lightning', power: 14, buildup: 40 }],
      },
    ],
  },
  bloodHound: {
    prefix: '血を追う',
    text: '出血している相手には、2回当たる',
    cost: 45,
    rules: [
      {
        label: '血を追う',
        on: 'hit',
        when: [{ type: 'targetHas', status: 'bleed' }, { type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'repeat' }],
        do: [{ type: 'repeatHit' }],
      },
    ],
  },
  echoing: {
    prefix: '木霊する',
    text: '当てると、4割の威力でもう一度当たる',
    cost: 40,
    rules: [
      {
        label: '木霊',
        on: 'hit',
        when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'repeat' }],
        do: [{ type: 'repeatHit', power: 0.4 }],
      },
    ],
  },
  vengeful: {
    prefix: '空を切る',
    text: '誰にも当たらなかったら、次の一撃が+80%',
    cost: 15,
    appliesTo: SWING_OR_NOVA,
    rules: [{ label: '空を切る', on: 'miss', when: [], do: [{ type: 'grantBuff', label: '空を切る', add: 0.8, tags: ['weapon'], duration: 4000, charges: 1 }] }],
  },
  rainSwift: {
    prefix: '雨乞う',
    text: '雨の間、間隔が4割縮む',
    cost: 30,
    intervalWhen: { when: [{ type: 'weather', weather: 'rain' }], mult: 0.6 },
  },
  wide: {
    prefix: '大振りの',
    text: '扇が1.8倍に広がるが、威力は0.6倍',
    cost: 15,
    appliesTo: { shapes: ['swing'] },
    arc: 1.8,
    power: 0.6,
  },
  split: {
    prefix: '割れた',
    text: '弾が2発増えるが、1発ごとの威力は0.45倍',
    cost: 30,
    appliesTo: { shapes: ['shot'] },
    addCount: 2,
    power: 0.45,
  },
  gouging: {
    prefix: '抉る',
    text: '当てると、出血が溜まる',
    cost: 25,
    rules: [{ label: '抉り', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }], do: [{ type: 'applyBuildup', status: 'bleed', amount: 40 }] }],
  },
  numbing: {
    prefix: '痺れる',
    text: '当てると、感電が溜まる',
    cost: 30,
    rules: [{ label: '痺れ', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }], do: [{ type: 'applyBuildup', status: 'shock', amount: 16 }] }],
  },
  oiling: {
    prefix: '油を引く',
    text: '当てると、油まみれが溜まる',
    cost: 25,
    rules: [{ label: '油引き', on: 'hit', when: [{ type: 'hitHasTag', tag: 'attack' }], do: [{ type: 'applyBuildup', status: 'oiled', amount: 40 }] }],
  },
  doubled: {
    prefix: '二連の',
    text: '1回で2度当たるが、1度ごとの威力は0.6倍',
    cost: 30,
    appliesTo: SWING_OR_NOVA,
    addHits: 1,
    power: 0.6,
  },
  bursting: {
    prefix: '弾ける',
    text: '弾が当たると弾け、周りにも5割の威力。威力は0.9倍',
    cost: 35,
    appliesTo: { shapes: ['shot'] },
    explode: { radius: 70, ratio: 0.5 },
    power: 0.9,
  },
  piercing: {
    prefix: '貫く',
    text: '弾が2体まで貫く',
    cost: 25,
    appliesTo: { shapes: ['shot'] },
    addPierce: 2,
  },
  stillHand: {
    prefix: '静かな',
    text: '0.8秒動かずに放つと、威力+40%',
    cost: 25,
    rules: [{ label: '静かな手', on: 'damage', when: [{ type: 'selfStill', ms: 800 }, { type: 'hitHasTag', tag: 'attack' }], add: 0.4 }],
  },
  firstCut: {
    prefix: '初太刀の',
    text: '一度も被弾していない間、威力+35%',
    cost: 25,
    rules: [{ label: '初太刀', on: 'damage', when: [{ type: 'selfUnhurt' }, { type: 'hitHasTag', tag: 'attack' }], add: 0.35 }],
  },
  shielded: {
    prefix: '盾越しの',
    text: '盾が張られている間、威力+35%',
    cost: 20,
    rules: [{ label: '盾越し', on: 'damage', when: [{ type: 'selfShieldReady' }, { type: 'hitHasTag', tag: 'attack' }], add: 0.35 }],
  },
  heavy: { prefix: '重い', text: '威力1.5倍、間隔1.4倍', cost: 10, power: 1.5, interval: 1.4 },
  quick: { prefix: '速い', text: '威力0.75倍、間隔0.65倍', cost: 10, power: 0.75, interval: 0.65 },
  long: { prefix: '長い', text: '射程1.4倍', cost: 20, range: 1.4 },
  dull: { prefix: '鈍った', text: '威力0.8倍(代償)', cost: -20, power: 0.8 },
  slow: { prefix: '遅い', text: '間隔1.25倍(代償)', cost: -20, interval: 1.25 },
  short: { prefix: '短い', text: '射程0.75倍(代償)', cost: -15, range: 0.75 },
} as const satisfies Record<string, VariationDef>;

export type VariationId = keyof typeof VARIATIONS;
export const VARIATION_IDS = Object.keys(VARIATIONS) as VariationId[];

/** 変化つきの技の決まり */
export const VARIANT_RULES = {
  /** 変化の数(代償を除く) */
  minVariations: 1,
  maxVariations: 2,
  /** 変化のコストの合計の上限。超えたら代償の変化を足して収める */
  costMax: 50,
  /** 早回しで測って、元の技のこの倍より強ければ外れ値として作り直す */
  maxPowerRatio: 2,
} as const;

/** 変化つきの技。元の技の「型」として、ビルドで差し替えて使う */
export interface SkillVariant {
  id: string;
  base: ActiveSkillId;
  variations: VariationId[];
}

export function variationDef(id: VariationId): VariationDef {
  return VARIATIONS[id];
}

export function variantCost(v: SkillVariant): number {
  return v.variations.reduce((s, id) => s + variationDef(id).cost, 0);
}

/** 「重い雨垂れの薙ぎ払い」のような名前。代償は名前に出さない */
export function variantName(v: SkillVariant, baseName?: string): string {
  // 「重い雨垂れの」のように、数値の変化を先に、振る舞いの変化を技の名前の近くに置く
  const behaves = (id: VariationId) => (variationDef(id).rules || variationDef(id).intervalWhen ? 1 : 0);
  const prefixes = v.variations
    .filter((id) => variationDef(id).cost >= 0)
    .sort((a, b) => behaves(a) - behaves(b))
    .map((id) => variationDef(id).prefix);
  return `${prefixes.join('')}${baseName ?? v.base}`;
}

/** 技に変化を重ねる */
export function applyVariations(t: Technique, ids: readonly VariationId[]): Technique {
  let out: Technique = { ...t };
  for (const id of ids) {
    const v = variationDef(id);
    out = {
      ...out,
      power: out.power * (v.power ?? 1),
      interval: out.interval * (v.interval ?? 1),
      range: (out.range ?? 1) * (v.range ?? 1),
      // 威力の上下は、状態の蓄積にも同じだけ効く。手数で蓄積だけ増えないように
      buildup: (out.buildup ?? 1) * (v.buildup ?? v.power ?? 1),
      arcScale: (out.arcScale ?? 1) * (v.arc ?? 1),
      count: v.addCount ? (out.count ?? 1) + v.addCount : out.count,
      hits: v.addHits ? (out.hits ?? 1) + v.addHits : out.hits,
      pierce: v.addPierce ? (out.pierce ?? 0) + v.addPierce : out.pierce,
      explode: v.explode && (!out.explode || out.explode.radius < v.explode.radius) ? v.explode : out.explode,
    };
  }
  return out;
}

/** その技に付けられる変化か */
export function variationFits(id: VariationId, t: Technique): boolean {
  const a = variationDef(id).appliesTo;
  if (!a) return true;
  if (a.shapes && !a.shapes.includes(t.shape)) return false;
  if (a.kind && t.requires.kind && a.kind !== t.requires.kind) return false;
  return true;
}

/** 変化つきの技が決まりに収まっているか。収まっていなければ理由を返す */
export function variantProblem(v: SkillVariant, t: Technique): string | null {
  if (!Array.isArray(v.variations) || !v.variations.every((id) => id in VARIATIONS)) return '知らない変化がある';
  if (new Set(v.variations).size !== v.variations.length) return '同じ変化が重なっている';
  const boons = v.variations.filter((id) => variationDef(id).cost >= 0).length;
  if (boons < VARIANT_RULES.minVariations || boons > VARIANT_RULES.maxVariations) return '変化の数が決まりの外にある';
  if (!v.variations.every((id) => variationFits(id, t))) return 'その技には付かない変化がある';
  if (variantCost(v) > VARIANT_RULES.costMax) return '変化が強すぎる';
  return null;
}

/**
 * 変化つきの技を1つ作る。変化を1〜2個選び、コストが上限を超えたら代償の変化を足して収める。
 * prefer の変化があれば、半分の確率でその中から選ぶ(その地らしさ)
 */
export function generateVariant(
  random: () => number,
  base: ActiveSkillId,
  t: Technique,
  prefer: readonly VariationId[] = [],
): SkillVariant {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const fits = VARIATION_IDS.filter((id) => variationFits(id, t));
  const boons = fits.filter((id) => variationDef(id).cost >= 0);
  const drawbacks = fits.filter((id) => variationDef(id).cost < 0);
  const id = `v${Math.floor(random() * 2 ** 31).toString(36)}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const n = VARIANT_RULES.minVariations + Math.floor(random() * (VARIANT_RULES.maxVariations - VARIANT_RULES.minVariations + 1));
    const chosen: VariationId[] = [];
    while (chosen.length < n) {
      const local = prefer.filter((p) => boons.includes(p) && !chosen.includes(p));
      const from = local.length > 0 && random() < 0.5 ? local : boons.filter((b) => !chosen.includes(b));
      if (from.length === 0) break;
      chosen.push(pick(from));
    }
    const v: SkillVariant = { id, base, variations: chosen };
    // 強すぎれば、代償を足して収める
    const left = [...drawbacks];
    while (variantCost(v) > VARIANT_RULES.costMax && left.length > 0) {
      v.variations.push(left.splice(Math.floor(random() * left.length), 1)[0]!);
    }
    if (variantProblem(v, t) === null) return v;
  }
  // 決まりに収まらなければ、軽い変化1つにする
  return { id, base, variations: [boons.reduce((a, b) => (variationDef(a).cost <= variationDef(b).cost ? a : b))] };
}
