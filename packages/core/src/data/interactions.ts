import type { Rule } from '../rules';

/**
 * 状態どうしの相互作用。誰の攻撃かに関係なく、常に効く。
 * on: 'damage' のラベルは発動元の名前に添えて「感電(濡れで倍)」のように出る
 */
export const INTERACTIONS: readonly Rule[] = [
  {
    label: '濡れで消火',
    on: 'buildup',
    when: [
      { type: 'statusIs', status: 'burn' },
      { type: 'targetHas', status: 'wet' },
    ],
    block: true,
  },
  {
    label: '濡れで倍',
    on: 'damage',
    when: [
      { type: 'hitHasTag', tag: 'shock' },
      { type: 'targetHas', status: 'wet' },
    ],
    add: 1,
  },
  {
    label: '油で倍',
    on: 'statusActivate',
    when: [
      { type: 'statusIs', status: 'burn' },
      { type: 'targetHas', status: 'oiled' },
    ],
    scale: { duration: 2, radius: 2 },
  },
];
