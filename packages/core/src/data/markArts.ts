import type { ElementId } from './elements';
import type { AttributeNeeds } from './attributes';
import { MARKS, MARK_IDS, markArtPower, type MarkId } from './marks';
import type { Rule } from '../rules';
import type { TechniqueDef } from './skills';

/**
 * 印の技(生成)。使うときに印を消費する技を、拾うたびに作る。消費する印の数(5〜100)・形・ヒットの数・属性・癖が変わる。
 * 威力の合計は消費で決まり(markArtPower)、癖があると少し下がる。印10を回し続ける技から、印10000を貯めて撃つ大技まで出る。
 * ビルドの印の技の枠(壱・弐・参)に入れて使う。拾った技は全キャラで共有する
 */
export type ArtSlot = 'art1' | 'art2' | 'art3';
export const ART_SLOTS: ArtSlot[] = ['art1', 'art2', 'art3'];
export const ART_SLOT_NAMES: Record<ArtSlot, string> = { art1: '印の技・壱', art2: '印の技・弐', art3: '印の技・参' };
/**
 * 手で撃つ枠。壱・弐はプレイヤーが撃つ時を決める(貯めた印をいつ換金するか)。参は作戦に任せる。
 * 手で撃たない者(シミュレーター・遠征の測り・おすすめの測り)は、足りしだい撃つ
 */
export const HAND_ART_SLOTS: readonly ArtSlot[] = ['art1', 'art2'];
export function isHandArt(skill: string): boolean {
  return (HAND_ART_SLOTS as readonly string[]).includes(skill);
}

export type ArtShape = 'swing' | 'shot' | 'nova';

/** 印の技の癖。威力を少し譲って、別の働きを持つ */
export const ART_QUIRKS = {
  pierce: { name: '貫き', text: '弾が3体まで貫く', scale: 0.85 },
  echo: { name: '呼び水', text: '当てると別の印を得る', scale: 0.8 },
  refund: { name: '返し', text: '当てると使った印の3割を取り戻す', scale: 0.8 },
  brand: { name: '焼き付け', text: '状態を3倍溜める', scale: 0.9 },
  swift: { name: '速撃ち', text: '振りかぶりと硬直が半分', scale: 0.8 },
  mend: { name: '癒し', text: '当てると最大HPの2%を回復する', scale: 0.85 },
} as const;
export type ArtQuirk = keyof typeof ART_QUIRKS;

export interface MarkArt {
  id: string;
  name: string;
  mark: MarkId;
  cost: number;
  shape: ArtShape;
  /** 1回で当たる回数(swing・nova) */
  hits: number;
  /** 弾の数(shot) */
  count: number;
  /** 1ヒットの威力(武器の威力に掛ける倍率) */
  power: number;
  arc?: number;
  radius?: number;
  spread?: number;
  /** 熾りの技は火、血潮の技は血。なければ武器の属性 */
  element?: ElementId;
  windup: number;
  interval: number;
  quirk?: ArtQuirk;
  /** 呼び水で得る印 */
  echoMark?: MarkId;
}

/** 消費する印の数の出やすさ。小さい技が多く、1000を超える大技は稀、10000に迫る技はごく稀 */
const COST_BANDS = [
  { weight: 35, min: 10, max: 30 },
  { weight: 25, min: 40, max: 150 },
  { weight: 18, min: 200, max: 600 },
  { weight: 12, min: 800, max: 2000 },
  { weight: 7, min: 2500, max: 5000 },
  { weight: 3, min: 6000, max: 10000 },
] as const;

/** 印ごとの形の出やすさ */
const SHAPES: Record<MarkId, readonly [ArtShape, number][]> = {
  edge: [['swing', 6], ['nova', 4]],
  blood: [['swing', 6], ['nova', 4]],
  stillness: [['shot', 3], ['nova', 1]],
  ember: [['nova', 2], ['shot', 1], ['swing', 1]],
  prayer: [['nova', 3], ['shot', 2]],
};

/** 印ごとの属性。なければ武器の属性で出る */
const ELEMENT: Partial<Record<MarkId, ElementId>> = { ember: 'fire', blood: 'blood' };

/** 印ごとに求める能力値 */
const NEEDS_ATTR: Record<MarkId, keyof AttributeNeeds> = { edge: 'str', blood: 'vit', stillness: 'dex', ember: 'fai', prayer: 'fai' };

const NAME_HEADS: Record<MarkId, readonly string[]> = {
  edge: ['研ぎの', '冴えの', '千刃の', '万刃の', '億刃の'],
  blood: ['血の', '緋の', '血河の', '血海の', '流血の大海の'],
  stillness: ['静かな', '息止めの', '無音の', '死寂の', '永劫の静寂の'],
  ember: ['熾火の', '焦熱の', '劫火の', '終焉の火の', '世界焼きの'],
  prayer: ['祈りの', '裁きの', '天啓の', '神罰の', '神殺しの'],
};
const NAME_TAILS: Record<ArtShape, readonly string[]> = {
  swing: ['払い', '斬', '舞', '断ち'],
  shot: ['一矢', '射', '矢雨', '穿ち'],
  nova: ['輪', '奔流', '渦', '光'],
};

/** 消費の段。名前の重さに使う */
function tierOf(cost: number): number {
  return cost < 40 ? 0 : cost < 200 ? 1 : cost < 800 ? 2 : cost < 2500 ? 3 : 4;
}

let artCounter = 0;

/** 印の技を1つ作る。mark を渡せばその印の技にする */
export function rollMarkArt(random: () => number, mark?: MarkId, shapes?: readonly ArtShape[]): MarkArt {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const weighted = <T>(list: readonly (readonly [T, number])[]): T => {
    let r = random() * list.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of list) if ((r -= w) < 0) return v;
    return list[list.length - 1]![0];
  };
  const m = mark ?? pick(MARK_IDS);
  const band = weighted(COST_BANDS.map((b) => [b, b.weight] as const));
  // 帯の中は桁で均す(大きい帯ほど細かい数はいらないので、10の倍数に丸める)
  const raw = band.min * (band.max / band.min) ** random();
  const cost = raw >= 100 ? Math.round(raw / 10) * 10 : Math.round(raw);
  // 形を絞るとき(覚醒する武器の技は、その武器で出せる形にする)
  const allowed = SHAPES[m].filter(([s]) => !shapes || shapes.includes(s));
  const shape = weighted(allowed.length > 0 ? allowed : SHAPES[m].filter(([s]) => s === 'nova').concat([['nova', 1]]));
  const quirkPool: ArtQuirk[] = shape === 'shot' ? ['pierce', 'echo', 'refund', 'brand', 'swift', 'mend'] : ['echo', 'refund', 'brand', 'swift', 'mend'];
  const quirk = random() < 0.6 ? pick(quirkPool) : undefined;
  const hits = shape === 'shot' ? 1 : 1 + Math.floor(random() * (shape === 'swing' ? 4 : 3));
  const count = shape === 'shot' ? pick([1, 1, 3, 5, 7]) : 1;
  const total = markArtPower(cost) * (quirk ? ART_QUIRKS[quirk].scale : 1);
  const heavy = Math.log10(cost);
  const art: MarkArt = {
    id: `art-${Date.now().toString(36)}-${(artCounter++).toString(36)}-${Math.floor(random() * 1e6).toString(36)}`,
    name: `${NAME_HEADS[m][tierOf(cost)]}${pick(NAME_TAILS[shape])}`,
    mark: m,
    cost,
    shape,
    hits,
    count,
    power: Math.round((total / (hits * count)) * 10) / 10,
    // 重い技ほど振りかぶりが長い(印5で約1.35倍、印100で2倍)
    windup: Math.round((1 + 0.5 * heavy) * 100) / 100,
    interval: Math.round((1 + 0.3 * heavy) * 100) / 100,
    ...(shape === 'swing' ? { arc: pick([60, 120, 180, 360]) } : {}),
    ...(shape === 'nova' ? { radius: Math.min(280, Math.round(110 + 40 * Math.log10(cost))) } : {}),
    ...(shape === 'shot' && count > 1 ? { spread: 6 + count * 2 } : {}),
    ...(ELEMENT[m] ? { element: ELEMENT[m] } : {}),
    ...(quirk ? { quirk } : {}),
    ...(quirk === 'echo' ? { echoMark: pick(MARK_IDS.filter((k) => k !== m)) } : {}),
  };
  return art;
}

/** 求める能力値。重い技ほど高い */
export function artNeeds(art: MarkArt): AttributeNeeds | undefined {
  if (art.cost < 40) return undefined;
  // 重い技ほど高い。桁で増える(100で16、1000で22、10000で28)
  return { [NEEDS_ATTR[art.mark]]: Math.round(10 + 6 * Math.log10(art.cost / 10)) };
}

/** 印の技の癖のルール */
export function artRules(art: MarkArt): Rule[] {
  const once = [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }] as const;
  switch (art.quirk) {
    case 'echo':
      return [{ label: '呼び水', on: 'hit', when: once, do: [{ type: 'gainMark', mark: art.echoMark ?? 'edge', amount: Math.max(1, Math.round(art.cost * 0.1)), flat: true }] }];
    case 'refund':
      return [{ label: '返し', on: 'hit', when: once, do: [{ type: 'gainMark', mark: art.mark, amount: Math.max(1, Math.round(art.cost * 0.3)), flat: true }] }];
    case 'mend':
      return [{ label: '癒し', on: 'hit', when: once, do: [{ type: 'heal', ratio: 0.02 }] }];
    default:
      return [];
  }
}

/**
 * 印の技を技の定義にする。斬る技は近接の武器、撃つ技は遠距離の武器で出し、周りに放つ技はどの武器でも出る。
 * 威力・振りかぶり・射程などは他の技と同じく武器の数値に掛ける
 */
export function artTechnique(art: MarkArt): TechniqueDef {
  const swift = art.quirk === 'swift' ? 0.5 : 1;
  const needs = artNeeds(art);
  const rules = artRules(art);
  return {
    name: art.name,
    category: art.shape === 'shot' ? 'ranged' : 'melee',
    description: artDescription(art),
    tags: ['attack', 'mark', 'art'],
    ...(needs ? { needs } : {}),
    markCost: { mark: art.mark, amount: art.cost },
    technique: {
      requires: art.shape === 'swing' ? { kind: 'melee' } : art.shape === 'shot' ? { kind: 'ranged' } : {},
      shape: art.shape,
      power: art.power,
      interval: art.interval * swift,
      windup: art.windup * swift,
      ...(art.hits > 1 ? { hits: art.hits } : {}),
      ...(art.count > 1 ? { count: art.count, spread: art.spread ?? 6 + art.count * 2 } : {}),
      ...(art.arc ? { arc: art.arc } : {}),
      ...(art.radius ? { radius: art.radius } : {}),
      ...(art.element ? { element: art.element } : {}),
      ...(art.quirk === 'pierce' ? { pierce: 3 } : {}),
      ...(art.quirk === 'brand' ? { buildup: 3 } : {}),
      ...(rules.length > 0 ? { rules } : {}),
    },
  };
}

/** 保存や読み込んだコードの印の技が壊れていないか。壊れていれば理由 */
export function artProblem(art: unknown): string | null {
  const a = art as Partial<MarkArt> | undefined;
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || typeof a.name !== 'string') return '中身がない';
  if (!a.mark || !(a.mark in MARKS)) return '知らない印';
  if (a.shape !== 'swing' && a.shape !== 'shot' && a.shape !== 'nova') return '知らない形';
  const nums = [a.cost, a.hits, a.count, a.power, a.windup, a.interval];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) return '数値が壊れている';
  if (a.cost! > MARKS[a.mark].max) return '印の数が多すぎる';
  // 威力の合計が消費に見合っているか(手で書き換えたものを弾く)
  if (a.power! * a.hits! * a.count! > markArtPower(a.cost!) * 1.05) return '威力が消費に見合わない';
  if (a.quirk !== undefined && !(a.quirk in ART_QUIRKS)) return '知らない癖';
  return null;
}

const SHAPE_TEXT: Record<ArtShape, string> = { swing: '斬る', shot: '撃つ', nova: '周りに放つ' };

/** 札に出す説明。「〈研ぎ〉を40使い、周り一面を4度斬る。1度59倍。癖:返し」 */
export function artDescription(art: MarkArt): string {
  const how =
    art.shape === 'shot'
      ? `${art.count > 1 ? `${art.count}本を扇に` : ''}撃つ`
      : art.shape === 'swing'
        ? `${art.arc === 360 ? '周り一面を' : ''}${art.hits > 1 ? `${art.hits}度` : ''}斬る`
        : `${art.hits > 1 ? `${art.hits}度` : ''}周りに放つ`;
  const per = art.hits * art.count > 1 ? `1${art.shape === 'shot' ? '本' : '度'}${art.power}倍(合わせて${Math.round(art.power * art.hits * art.count)}倍)` : `${art.power}倍`;
  const quirk = art.quirk ? `。癖:${ART_QUIRKS[art.quirk].name}(${art.quirk === 'echo' && art.echoMark ? `当てると〈${MARKS[art.echoMark].name}〉を得る` : ART_QUIRKS[art.quirk].text})` : '';
  return `〈${MARKS[art.mark].name}〉を${art.cost}使い、${how}。${per}${quirk}`;
}

/** はじめから持っている印の技。小さく回せる技を印ごとに1つ */
export function starterArts(): MarkArt[] {
  const base = (mark: MarkId, shape: ArtShape, name: string, extra: Partial<MarkArt> = {}): MarkArt => ({
    id: `art-starter-${mark}`,
    name,
    mark,
    cost: 10,
    shape,
    hits: 1,
    count: 1,
    power: Math.round(markArtPower(10) * 10) / 10,
    windup: 1.35,
    interval: 1.2,
    ...(ELEMENT[mark] ? { element: ELEMENT[mark] } : {}),
    ...extra,
  });
  return [
    base('edge', 'swing', '研ぎの払い', { arc: 120 }),
    base('stillness', 'shot', '静かな一矢'),
    base('ember', 'nova', '熾火の輪', { radius: 120 }),
    base('blood', 'swing', '血の断ち', { arc: 60 }),
    base('prayer', 'nova', '祈りの光', { radius: 130 }),
  ];
}

/**
 * 覚醒。装備が持つ眠った技。一戦の中で条件(印を合わせてN得る・合わせてN使う・一度にN抱える)を満たすと目覚め、
 * その装備の技(印の技)が使えるようになる。一戦が終われば(ビルドを着け直せば)眠りに戻る。
 * 目覚めた技は、覚醒の枠(壱・弐は手で撃つ、参は作戦)に入る
 */
export type AwakenTrigger = 'gain' | 'spend' | 'hold';
export interface Awakening {
  mark: MarkId;
  trigger: AwakenTrigger;
  amount: number;
  art: MarkArt;
}

export const AWAKEN_TRIGGERS: Record<AwakenTrigger, { text: (mark: string, n: number) => string; scale: number }> = {
  gain: { text: (m, n) => `一戦の中で${m}を合わせて${n}得る`, scale: 3 },
  spend: { text: (m, n) => `一戦の中で${m}を合わせて${n}使う`, scale: 2 },
  hold: { text: (m, n) => `${m}を一度に${n}抱える`, scale: 1 },
};

/** 覚醒を1つ作る。技の重さに見合った条件にする(重い技ほど、目覚めるまで遠い) */
export function rollAwakening(random: () => number, mark: MarkId, shapes?: readonly ArtShape[]): Awakening {
  const art = rollMarkArt(random, mark, shapes);
  const triggers = Object.keys(AWAKEN_TRIGGERS) as AwakenTrigger[];
  const trigger = triggers[Math.floor(random() * triggers.length)]!;
  const raw = Math.max(30, art.cost * AWAKEN_TRIGGERS[trigger].scale);
  const amount = raw >= 100 ? Math.round(raw / 10) * 10 : Math.round(raw);
  return { mark, trigger, amount, art };
}

/** 覚醒の条件の説明。「一戦の中で〈研ぎ〉を合わせて300得る」 */
export function awakeningText(a: Awakening): string {
  return AWAKEN_TRIGGERS[a.trigger].text(`〈${MARKS[a.mark].name}〉`, a.amount);
}

/** 保存や読み込んだコードの覚醒が壊れていないか */
export function awakeningProblem(a: unknown): string | null {
  const x = a as Partial<Awakening> | undefined;
  if (!x || typeof x !== 'object' || !x.mark || !(x.mark in MARKS) || !x.trigger || !(x.trigger in AWAKEN_TRIGGERS)) return '覚醒が壊れている';
  if (typeof x.amount !== 'number' || !(x.amount > 0)) return '覚醒の条件が壊れている';
  return artProblem(x.art);
}
