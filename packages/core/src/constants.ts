/** 1回の発動から連鎖できるトリガーの段数の上限。無限ループを防ぐ */
export const MAX_TRIGGER_DEPTH = 3;

/** 回避と防御の手触り。時間はミリ秒 */
export const DEFENSE = {
  /** 回避の無敵時間 */
  dodgeInvulnerable: 300,
  /** 回避を始めてからこの間に攻撃を受けるとジャスト回避 */
  justDodgeWindow: 170,
  /** ガードを構えてからこの間に攻撃を受けるとジャストガード */
  justGuardWindow: 180,
  /** ガードを解いてからこの間に構え直しても、ジャストガードにならない。連打を防ぐ */
  guardRepressLockout: 450,
  /** 正面からの攻撃をガードしたときの軽減率 */
  guardReduction: 0.7,
  /** 正面とみなす角度(度、片側) */
  guardArc: 75,
} as const;
