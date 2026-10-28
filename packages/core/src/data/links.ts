import type { Predicate, Rule } from '../rules';
import { ELEMENTS, ELEMENT_IDS, type ElementId } from './elements';
import { SKILL_CATEGORIES } from './skills';

/**
 * 繋ぎ。「〈前の手〉の次に〈今の手〉を当てると〈見返り〉」の条件文。
 * 前の手・今の手は属性かスキルの種類(近攻撃・遠攻撃・付与)で、前の手は LINK_RULES.window 以内に使ったもの。
 * 見返りは与ダメージの倍率か、ヒットの数。属性どうしのように細かい繋ぎほど見返りが大きい。
 * 属性や種類を1件足せば、繋ぎも増える
 */
export const LINK_RULES = {
  /** 前の手からこの間(ミリ秒)に使えば繋がる */
  window: 3000,
  /** 増えたヒットの威力(元の何倍か) */
  extraHitPower: 0.5,
} as const;

/** 繋ぎの手。属性か、スキルの種類 */
export type LinkStep = { element: ElementId } | { category: 'melee' | 'ranged' | 'imbue' | 'rite' };

const PREV_CATEGORIES = ['melee', 'ranged', 'imbue', 'rite'] as const;
const NOW_CATEGORIES = ['melee', 'ranged'] as const;

function stepName(s: LinkStep): string {
  return 'element' in s ? ELEMENTS[s.element].name : SKILL_CATEGORIES[s.category];
}

function stepKey(s: LinkStep): string {
  return 'element' in s ? s.element : s.category;
}

/** 今の手の条件。属性はヒットの属性で、種類はヒットのタグで見る(斬の技の名前と斬の属性を取り違えないよう) */
function nowPredicate(s: LinkStep): Predicate {
  return 'element' in s ? { type: 'hitElementIs', element: s.element } : { type: 'hitHasTag', tag: s.category };
}

/** 前の手の条件 */
function afterPredicate(s: LinkStep): Predicate {
  return { type: 'afterStep', ...('element' in s ? { element: s.element } : { category: s.category }), within: LINK_RULES.window };
}

export interface LinkConditionDef {
  no: number;
  text: string;
  cost: number;
  rule: Rule;
  /** 繋ぎの前の手と今の手(装備をビルドに寄せるときに見る) */
  link: { prev: LinkStep; now: LinkStep; reward: 'mult' | 'hits' };
}

/** 細かさ。属性は種類より細かい。細かいほど見返りが大きい */
function fineness(prev: LinkStep, now: LinkStep): 0 | 1 | 2 {
  return (('element' in prev ? 1 : 0) + ('element' in now ? 1 : 0)) as 0 | 1 | 2;
}

const MULT = [2, 2.5, 3] as const;
const HITS = [3, 4, 5] as const;

function generate(): Record<`link:${string}`, LinkConditionDef> {
  const prevs: LinkStep[] = [...PREV_CATEGORIES.map((category) => ({ category })), ...ELEMENT_IDS.map((element) => ({ element }))];
  const nows: LinkStep[] = [...NOW_CATEGORIES.map((category) => ({ category })), ...ELEMENT_IDS.map((element) => ({ element }))];
  const out: Record<`link:${string}`, LinkConditionDef> = {};
  let no = 1001;
  for (const prev of prevs) {
    for (const now of nows) {
      if (stepKey(prev) === stepKey(now)) continue;
      const f = fineness(prev, now);
      const label = `繋ぎ・${stepName(prev)}→${stepName(now)}`;
      const head = `${'element' in prev ? `${stepName(prev)}で攻めた` : `${stepName(prev)}を出した`}次に${'element' in now ? `${stepName(now)}の攻撃` : stepName(now)}を当てると`;
      const when: Predicate[] = [{ type: 'hitHasTag', tag: 'attack' }, nowPredicate(now), afterPredicate(prev)];
      const mult = MULT[f];
      out[`link:${stepKey(prev)}>${stepKey(now)}:mult`] = {
        no: no++,
        text: `${head}、与ダメージ${mult}倍`,
        cost: Math.round((mult - 1) * 25),
        rule: { label, on: 'damage', when, add: mult - 1 },
        link: { prev, now, reward: 'mult' },
      };
      const hits = HITS[f];
      out[`link:${stepKey(prev)}>${stepKey(now)}:hits`] = {
        no: no++,
        text: `${head}、${hits}回多く当たる(威力は半分)`,
        cost: hits * 10,
        rule: {
          label,
          on: 'hit',
          when: [...when, { type: 'hitLacksTag', tag: 'repeat' }],
          do: [{ type: 'repeatHit', power: LINK_RULES.extraHitPower, times: hits }],
        },
        link: { prev, now, reward: 'hits' },
      };
    }
  }
  return out;
}

/** 繋ぎの条件文。条件文の一覧に混ぜて使う */
export const LINK_CONDITIONS = generate();

/** 繋ぎの名前(ラベル)の一覧。コンボとして名前を出すのに使う */
export const LINK_LABELS = [...new Set(Object.values(LINK_CONDITIONS).map((c) => c.rule.label))];
