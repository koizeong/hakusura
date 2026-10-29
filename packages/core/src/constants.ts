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

/** 自動のときのステップ。跳ぶ速さ(1秒あたり)・跳ぶ間・戻り(ミリ秒)。画面とシミュレーターで同じものを使う */
export const STEP = { speed: 900, duration: 170, cooldown: 1100 } as const;

/** 状態の決まり */
export const STATUS_RULES = {
  /** HPがこの割合以下で瀕死 */
  dyingBelow: 0.25,
  /** 最後に攻撃したか受けてからこの間は、戦っているとみなす(飢えが溜まる) */
  combatWindow: 5000,
  /** 相手の向きからこの角度(度、片側)より外から攻めると、背後からの攻撃 */
  behindArc: 100,
  /** 死の宣告のまま倒れたとき、呪縛を撒く範囲 */
  doomSpreadRadius: 160,
} as const;
