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

/**
 * 手数。武器の技は1回の当たりを split 回に分けて当てる(1回ごとの威力は 1/split、蓄積は分けない)。
 * 素の火力は変わらず、状態は split 倍の速さで満ちて連鎖や燃え広がりが多く起き、
 * 当てたときの効果(条件文・繋ぎ・魔力の高まり・狙いの締まり・コンボ)も split 倍出る
 */
export const WEAPON_HITS = { split: 2 } as const;

/**
 * 倒れたとき。起き上がるまで downtime の間は動けず(その間は直撃を受けない)、宿した儀式と力(見切りなど)を失う。
 * 倒れてもすぐ満タンで起き上がるだけでは、最大HPを捨てたガラスの大砲が損をしないので
 */
export const FALL = { downtime: 3000 } as const;

/**
 * 同じ条件文(同じ名前の力)を重ねたとき。2つ目からは repeatWeight の割合しか効かない。
 * 一番強い条件文を何枚重ねられるかで火力が決まらないように(3倍を5つで11倍→7倍)
 */
export const STACKING = { repeatWeight: 0.5 } as const;

/**
 * 連用の疲れ。自分の側が同じ技を続けて出すと、その技の間隔が 1 + perRepeat × 続けた数 倍(max まで)に延びる。
 * 別の技を挟めば戻る。一番強い技を連打するより、作戦で技を回し型を決める方が強くなるように
 */
export const FATIGUE = { perRepeat: 0.5, max: 2.5 } as const;
