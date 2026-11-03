import { MARKS, type MarkId } from './marks';
import type { Predicate, Rule } from '../rules';

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
  text(m: string, o: string): string;
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
  return def.text(n(s.mark), n(s.other ?? s.mark));
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
