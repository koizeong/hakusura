import { MARKS, type MarkId } from './marks';
import type { Predicate, Rule } from '../rules';
import type { ElementId } from './elements';
import type { StatusId } from './statuses';

/**
 * 印紋。装備に1〜3個刻まれる、印に関わる短い効果。長い条件文の代わりに、小さな部品を重ねて組む。
 * 1つの印紋は印(と、変える印紋なら別の印)を受け取って効果になる。全ての装備が必ず何かの印に関わる。
 * 1件足すだけで増やせる(name・text・marks・rules)
 */
export interface SigilDef {
  /** 短い名前。札には「〔頂〕」のように出る */
  name: string;
  /** 別の印も要る(変える・糧・名残・生贄) */
  other?: boolean;
  /** 補正値換算のコスト(%)。装備の合計に含める */
  cost: number;
  /** m・o は印の呼び名(〈研ぎ〉)、id は印そのもの */
  text(m: string, o: string, id: MarkId): string;
  marks(m: MarkId, o: MarkId): { gives?: MarkId[]; uses?: MarkId[] };
  rules(m: MarkId, o: MarkId, label: string): Rule[];
}

/** 装備に刻まれた印紋。印と、要るなら別の印 */
export interface SigilInstance {
  sigil: SigilId;
  mark: MarkId;
  other?: MarkId;
}

/** 当てたときの1度(分けた当たり・増えたヒットでは数えない) */
const ONCE: Predicate[] = [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }];

/** 印に縁のある当たり。どれか1つを満たせば縁がある */
const AFFINITY: Record<MarkId, { text: string; when: Predicate[][] }> = {
  ember: { text: '火・雷・灰の技', when: [[{ type: 'hitElementIs', element: 'fire' }], [{ type: 'hitElementIs', element: 'lightning' }], [{ type: 'hitElementIs', element: 'ash' }]] },
  edge: { text: '近攻撃', when: [[{ type: 'hitHasTag', tag: 'melee' }]] },
  blood: { text: '血・腐の技か、出血した敵への攻撃', when: [[{ type: 'hitElementIs', element: 'blood' }], [{ type: 'hitElementIs', element: 'rot' }], [{ type: 'targetHas', status: 'bleed' }]] },
  stillness: { text: '遠攻撃か、氷・闇の技', when: [[{ type: 'hitHasTag', tag: 'ranged' }], [{ type: 'hitElementIs', element: 'ice' }], [{ type: 'hitElementIs', element: 'dark' }]] },
  prayer: { text: '儀式を宿した技か、呪の技', when: [[{ type: 'ritesReleased', min: 1 }], [{ type: 'hitElementIs', element: 'curse' }]] },
};

const n = (m: MarkId) => `〈${MARKS[m].name}〉`;

/** 印ごとの属性と状態(一閃の追撃・焼き印の状態) */
const MARK_ELEMENT: Record<MarkId, ElementId> = { ember: 'fire', edge: 'slash', blood: 'blood', stillness: 'ice', prayer: 'curse' };
const ELEMENT_NAME: Record<MarkId, string> = { ember: '火', edge: '斬', blood: '血', stillness: '氷', prayer: '呪' };
const MARK_STATUS: Record<MarkId, StatusId> = { ember: 'burn', edge: 'bleed', blood: 'thirst', stillness: 'frozen', prayer: 'bind' };
const STATUS_NAME: Record<MarkId, string> = { ember: '炎上', edge: '出血', blood: '渇き', stillness: '凍結', prayer: '呪縛' };

export const SIGILS = {
  // ---- 生む ----
  kindle: {
    name: '縁',
    cost: 15,
    // 縁の中身は印で変わるので、説明は sigilText で作る
    text: (m) => `縁ある技を当てると${m}+1`,
    marks: (m) => ({ gives: [m] }),
    // 縁のどれか1つに当たれば1度だけ(縁が2つ重なっても2つ得ない)
    rules: (m, _o, label) =>
      AFFINITY[m].when.map((w, i) => ({
        label,
        on: 'hit' as const,
        when: [...ONCE, ...w, ...AFFINITY[m].when.slice(0, i).map((p) => ({ type: 'not' as const, p: p[0]! }))],
        do: [{ type: 'gainMark' as const, mark: m, amount: 1 }],
      })),
  },
  throng: {
    name: '群れ',
    cost: 12,
    text: (m) => `1回の攻撃で3体以上に当てると${m}+2`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [{ label, on: 'multiHit', min: 3, when: [], do: [{ type: 'gainMark', mark: m, amount: 2 }] }],
  },
  wound: {
    name: '傷',
    cost: 10,
    text: (m) => `攻撃を受けると${m}+2`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [{ label, on: 'hurt', when: [], do: [{ type: 'gainMark', mark: m, amount: 2 }] }],
  },
  evade: {
    name: '見切り',
    cost: 10,
    text: (m) => `ジャスト回避・ジャストガードで${m}+3`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [
      { label, on: 'justDodge', when: [], do: [{ type: 'gainMark', mark: m, amount: 3 }] },
      { label, on: 'justGuard', when: [], do: [{ type: 'gainMark', mark: m, amount: 3 }] },
    ],
  },
  // ---- 変える ----
  convert: {
    name: '移ろい',
    other: true,
    cost: 15,
    text: (m, o) => `${o}を得るたび${m}+1`,
    marks: (m, o) => ({ gives: [m], uses: [o] }),
    rules: (m, o, label) => [{ label, on: 'markGained', mark: o, when: [], do: [{ type: 'gainMark', mark: m, amount: 1 }] }],
  },
  turn: {
    name: '転じ',
    other: true,
    cost: 15,
    text: (m, o) => `${o}を使うたび、使った数の3割の${m}を得る`,
    marks: (m, o) => ({ gives: [m], uses: [o] }),
    rules: (m, o, label) => [{ label, on: 'markSpent', mark: o, when: [], do: [{ type: 'gainMark', mark: m, amount: 0, per: 0.3 }] }],
  },
  feed: {
    name: '糧',
    other: true,
    cost: 18,
    text: (m, o) => `${o}100ごとに、${m}の生成力+1倍`,
    marks: (m, o) => ({ gives: [m], uses: [o] }),
    rules: (m, o, label) => [{ label, on: 'markGrowth', mark: m, by: o, per: 100, when: [] }],
  },
  linger: {
    name: '名残',
    other: true,
    cost: 10,
    text: (m, o) => `${m}を失うとき、失った数の3割を${o}として得る`,
    marks: (m, o) => ({ gives: [o], uses: [m] }),
    rules: (m, o, label) => [{ label, on: 'markLost', mark: m, when: [], do: [{ type: 'gainMark', mark: o, amount: 0, per: 0.3 }] }],
  },
  sacrifice: {
    name: '生贄',
    other: true,
    cost: 15,
    text: (m, o) => `${o}が50以上あれば、当てたとき${o}を20捧げて${m}を10得る`,
    marks: (m, o) => ({ gives: [m], uses: [o] }),
    rules: (m, o, label) => [
      {
        label,
        on: 'hit',
        when: [...ONCE, { type: 'selfMarks', mark: o, min: 50 }],
        do: [{ type: 'spendMarks', mark: o, min: 50, amount: 20 }, { type: 'gainMark', mark: m, amount: 10 }],
      },
    ],
  },
  // ---- 抱える・守る ----
  bless: {
    name: '恩恵',
    cost: 15,
    text: (m) => `${m}の抱えの恩恵+40%`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'stat', stat: 'markBlessing', tags: [m], when: [], add: 0.4 }],
  },
  unhurt: {
    name: '無傷',
    cost: 15,
    text: (m) => `10秒被弾していなければ、${m}の抱えの恩恵+100%`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'stat', stat: 'markBlessing', tags: [m], when: [{ type: 'not', p: { type: 'afterHurt', within: 10000 } }], add: 1 }],
  },
  keep: {
    name: '留め',
    cost: 10,
    text: (m) => `${m}が消えるまでの時間が2倍`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'markKeep', mark: m, when: [], scale: 2 }],
  },
  guard: {
    name: '守り',
    cost: 10,
    text: (m) => `直撃で失う${m}が半分`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'stat', stat: 'markLoss', tags: [m], when: [], add: -0.5 }],
  },
  hold: {
    name: '保ち',
    cost: 15,
    text: (m) => `${m}が100以上の間、与ダメージ+15%`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'damage', when: [{ type: 'selfMarks', mark: m, min: 100 }], add: 0.15 }],
  },
  // ---- 使う・節目 ----
  crest: {
    name: '頂',
    cost: 12,
    text: (m) => `${m}が100に届いた瞬間、続く3撃の与ダメージ+80%`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'markGained', mark: m, reach: 100, when: [], do: [{ type: 'grantBuff', label, add: 0.8, tags: ['weapon'], duration: 8000, charges: 3 }] }],
  },
  vent: {
    name: '吐き',
    cost: 18,
    text: (m) => `${m}が30以上あれば、当てた技が${m}を10使い、威力8割で2回多く当たる`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [
      {
        label,
        on: 'hit',
        when: [...ONCE, { type: 'selfMarks', mark: m, min: 30 }],
        do: [{ type: 'spendMarks', mark: m, min: 30, amount: 10 }, { type: 'repeatHit', power: 0.8, times: 2 }],
      },
    ],
  },
  proliferate: {
    name: '増殖',
    cost: 18,
    text: (m) => `${m}を使うたび、持っている印を全て3%増やす`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'markSpent', mark: m, when: [], do: [{ type: 'proliferate', ratio: 0.03 }] }],
  },
  overload: {
    name: '過負荷',
    cost: 15,
    text: (m) => `札から得る${m}が2倍。ただし${m}を使ってから4秒は得られない`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [
      { label, on: 'markGrowth', mark: m, add: 1, when: [{ type: 'not', p: { type: 'selfHasBuff', label } }] },
      { label, on: 'markGrowth', mark: m, add: -1000, when: [{ type: 'selfHasBuff', label }] },
      { label, on: 'markSpent', mark: m, when: [], do: [{ type: 'grantBuff', label, add: 0, tags: ['__none'], duration: 4000 }] },
    ],
  },
  // ---- 生む(二の巻) ----
  stand: {
    name: '据え',
    cost: 12,
    text: (m) => `1秒以上足を止めて当てると${m}+1`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [{ label, on: 'hit', when: [...ONCE, { type: 'selfStill', ms: 1000 }], do: [{ type: 'gainMark', mark: m, amount: 1 }] }],
  },
  afar: {
    name: '遠間',
    cost: 12,
    text: (m) => `離れた相手(200以上)に当てると${m}+1`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [{ label, on: 'hit', when: [...ONCE, { type: 'targetFar', min: 200 }], do: [{ type: 'gainMark', mark: m, amount: 1 }] }],
  },
  behind: {
    name: '背討ち',
    cost: 10,
    text: (m) => `背後から当てると${m}+3`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [{ label, on: 'hit', when: [...ONCE, { type: 'fromBehind' }], do: [{ type: 'gainMark', mark: m, amount: 3 }] }],
  },
  afflict: {
    name: '病み狩り',
    cost: 12,
    text: (m) => `3種類以上の状態にかかった敵に当てると${m}+2`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [{ label, on: 'hit', when: [...ONCE, { type: 'targetStatusCount', min: 3 }], do: [{ type: 'gainMark', mark: m, amount: 2 }] }],
  },
  flare: {
    name: '発火',
    cost: 12,
    text: (m) => `敵の状態が発動するたび${m}+2`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [{ label, on: 'statusActivate', when: [], do: [{ type: 'gainMark', mark: m, amount: 2 }] }],
  },
  shatter: {
    name: '砕け',
    cost: 8,
    text: (m) => `盾が砕けると${m}+6`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [{ label, on: 'shieldBreak', when: [], do: [{ type: 'gainMark', mark: m, amount: 6 }] }],
  },
  rite: {
    name: '儀',
    cost: 10,
    text: (m) => `儀式を宿した技を当てると${m}+3`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [{ label, on: 'hit', when: [{ type: 'ritesReleased', min: 1 }, { type: 'hitLacksTag', tag: 'multi' }, { type: 'hitLacksTag', tag: 'repeat' }], do: [{ type: 'gainMark', mark: m, amount: 3 }] }],
  },
  brink: {
    name: '瀬戸際',
    cost: 10,
    text: (m) => `瀕死の間、当てると${m}+3`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [{ label, on: 'hit', when: [...ONCE, { type: 'attackerHas', status: 'dying' }], do: [{ type: 'gainMark', mark: m, amount: 3 }] }],
  },
  pristine: {
    name: '無垢',
    cost: 12,
    text: (m) => `HPが満タンの間、当てると${m}+1`,
    marks: (m) => ({ gives: [m] }),
    rules: (m, _o, label) => [{ label, on: 'hit', when: [...ONCE, { type: 'selfHpRatio', min: 1 }], do: [{ type: 'gainMark', mark: m, amount: 1 }] }],
  },
  // ---- 変える(二の巻) ----
  spill: {
    name: 'こぼれ受け',
    other: true,
    cost: 10,
    text: (m, o) => `直撃で${o}をこぼすと、こぼした数の半分を${m}として得る`,
    marks: (m, o) => ({ gives: [m], uses: [o] }),
    rules: (m, o, label) => [{ label, on: 'markLost', mark: o, cause: 'hurt', when: [], do: [{ type: 'gainMark', mark: m, amount: 0, per: 0.5 }] }],
  },
  summit: {
    name: '峰越え',
    other: true,
    cost: 10,
    text: (m, o) => `${o}が100に届いた瞬間、${m}+30`,
    marks: (m, o) => ({ gives: [m], uses: [o] }),
    rules: (m, o, label) => [{ label, on: 'markGained', mark: o, reach: 100, when: [], do: [{ type: 'gainMark', mark: m, amount: 30 }] }],
  },
  exchange: {
    name: '引き換え',
    other: true,
    cost: 12,
    text: (m, o) => `${o}を使うたび${m}+5`,
    marks: (m, o) => ({ gives: [m], uses: [o] }),
    rules: (m, o, label) => [{ label, on: 'markSpent', mark: o, when: [], do: [{ type: 'gainMark', mark: m, amount: 5 }] }],
  },
  // ---- 抱える(二の巻) ----
  burden: {
    name: '重荷',
    cost: 15,
    text: (m) => `${m}が1000以上の間、与ダメージ+30%・移動速度-15%`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [
      { label, on: 'damage', when: [{ type: 'selfMarks', mark: m, min: 1000 }], add: 0.3 },
      { label, on: 'stat', stat: 'moveSpeed', when: [{ type: 'selfMarks', mark: m, min: 1000 }], add: -0.15 },
    ],
  },
  ward: {
    name: '鎧',
    cost: 15,
    text: (m) => `${m}が100以上の間、被ダメージ-15%`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'stat', stat: 'damageTaken', when: [{ type: 'selfMarks', mark: m, min: 100 }], add: -0.15 }],
  },
  swift: {
    name: '足',
    cost: 10,
    text: (m) => `${m}が100以上の間、移動速度+12%`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'stat', stat: 'moveSpeed', when: [{ type: 'selfMarks', mark: m, min: 100 }], add: 0.12 }],
  },
  cool: {
    name: '冷め',
    cost: 15,
    text: (m) => `${m}が100以上の間、クールダウン-12%`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'stat', stat: 'cooldown', when: [{ type: 'selfMarks', mark: m, min: 100 }], add: -0.12 }],
  },
  reach: {
    name: '間合い',
    cost: 12,
    text: (m) => `${m}が100以上の間、近攻撃の射程+15%`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'stat', stat: 'meleeRange', when: [{ type: 'selfMarks', mark: m, min: 100 }], add: 0.15 }],
  },
  each: {
    name: '粒',
    cost: 15,
    text: (m) => `${m}1つにつき与ダメージ+2%(10まで)`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'damage', when: [], add: 0.02, perMark: m }],
  },
  hoard: {
    name: '蓄え',
    cost: 15,
    text: (m) => `${m}が1000以上の間、${m}の抱えの恩恵+100%`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'stat', stat: 'markBlessing', tags: [m], when: [{ type: 'selfMarks', mark: m, min: 1000 }], add: 1 }],
  },
  hunger: {
    name: '飢え',
    cost: 12,
    text: (m) => `${m}がないとき、与ダメージ+20%`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'damage', when: [{ type: 'selfMarksAtMost', mark: m, max: 0 }], add: 0.2 }],
  },
  // ---- 使う(二の巻) ----
  smite: {
    name: '一閃',
    cost: 15,
    text: (m, _o, id) => `${m}が50以上あれば、当てたとき${m}を20使い、${ELEMENT_NAME[id]}の追撃(威力30)を落とす`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [
      {
        label,
        on: 'hit',
        when: [...ONCE, { type: 'selfMarks', mark: m, min: 50 }],
        do: [{ type: 'spendMarks', mark: m, min: 50, amount: 20 }, { type: 'strike', element: MARK_ELEMENT[m], power: 30, buildup: 20 }],
      },
    ],
  },
  mend: {
    name: '癒え',
    cost: 12,
    text: (m) => `${m}を使うたび、最大HPの3%を回復する`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'markSpent', mark: m, when: [], do: [{ type: 'heal', ratio: 0.03 }] }],
  },
  rush: {
    name: '急き',
    cost: 15,
    text: (m) => `${m}を使うたび、全てのクールダウンが0.5秒縮む`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'markSpent', mark: m, when: [], do: [{ type: 'cooldown', ms: 500 }] }],
  },
  breath: {
    name: '吐息',
    cost: 12,
    text: (m) => `${m}を一度に30以上使うと、次の2つの技の振りかぶりと硬直が半分`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'markSpent', mark: m, when: [{ type: 'spentAtLeast', min: 30 }], do: [{ type: 'quicken', scale: 0.5, charges: 2, duration: 6000 }] }],
  },
  thrift: {
    name: '倹約',
    cost: 15,
    text: (m) => `${m}を使うたび、使った数の2割を取り戻す`,
    marks: (m) => ({ gives: [m], uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'markSpent', mark: m, when: [], do: [{ type: 'gainMark', mark: m, amount: 0, per: 0.2, flat: true }] }],
  },
  brand: {
    name: '焼き印',
    cost: 12,
    text: (m, _o, id) => `${m}を使うたび、相手に${STATUS_NAME[id]}を溜める`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'markSpent', mark: m, when: [], do: [{ type: 'applyBuildup', status: MARK_STATUS[m], amount: 60 }] }],
  },
  // ---- 守る(二の巻) ----
  poise: {
    name: '構え',
    cost: 10,
    text: (m) => `ジャスト回避から2秒の間、直撃を受けても${m}を失わない`,
    marks: (m) => ({ uses: [m] }),
    rules: (m, _o, label) => [{ label, on: 'stat', stat: 'markLoss', tags: [m], when: [{ type: 'afterJustDodge', within: 2000 }], add: -1 }],
  },
} as const satisfies Record<string, SigilDef>;

export type SigilId = keyof typeof SIGILS;
export const SIGIL_IDS = Object.keys(SIGILS) as SigilId[];

export function sigilDef(id: SigilId): SigilDef {
  return SIGILS[id];
}

/** 印紋の名前(内訳やコンボに出る)。「研ぎの頂」 */
export function sigilLabel(s: SigilInstance): string {
  return `${MARKS[s.mark].name}の${SIGILS[s.sigil].name}`;
}

/** 印紋の説明 */
export function sigilText(s: SigilInstance): string {
  const def = sigilDef(s.sigil);
  if (s.sigil === 'kindle') return `${AFFINITY[s.mark].text}を当てると${n(s.mark)}+1`;
  return def.text(n(s.mark), n(s.other ?? s.mark), s.mark);
}

/** 印紋が生む・使う印 */
export function sigilMarks(s: SigilInstance): { gives?: MarkId[]; uses?: MarkId[] } {
  return sigilDef(s.sigil).marks(s.mark, s.other ?? s.mark);
}

/** 印紋のルール */
export function sigilRules(s: SigilInstance): Rule[] {
  return sigilDef(s.sigil).rules(s.mark, s.other ?? s.mark, sigilLabel(s));
}

/** 保存や読み込んだコードの印紋が壊れていないか */
export function sigilProblem(s: unknown): string | null {
  const x = s as Partial<SigilInstance> | undefined;
  if (!x || typeof x !== 'object' || !x.sigil || !(x.sigil in SIGILS)) return '知らない印紋';
  if (!x.mark || !(x.mark in MARKS)) return '知らない印';
  if (sigilDef(x.sigil).other && (!x.other || !(x.other in MARKS) || x.other === x.mark)) return '印紋の印が壊れている';
  return null;
}
