import type { Rule } from '../rules';

/**
 * ジャスト回避・ジャストガード・盾で受け止めたときの見返り。誰が成功しても効く。
 * 成功した者が持ち主、攻撃してきた者が対象になる
 */
export const DEFENSE_RULES: readonly Rule[] = [
  {
    label: '見切り',
    on: 'justDodge',
    when: [],
    do: [{ type: 'grantBuff', label: '見切り', add: 1, tags: ['weapon'], duration: 3000, charges: 1 }],
  },
  {
    // 盾で直撃を受け止めたら、返しの一撃が重くなる(受けてから返す、大盾の戦い方)
    label: '盾の返し',
    on: 'shieldBreak',
    when: [],
    do: [{ type: 'grantBuff', label: '見切り', add: 1, tags: ['weapon'], duration: 3000, charges: 1 }],
  },
  {
    label: '弾き',
    on: 'justGuard',
    when: [],
    do: [{ type: 'applyBuildup', status: 'stun', amount: 100 }],
  },
];
