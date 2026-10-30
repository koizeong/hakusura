import { DEFENSE, FALL, FATIGUE, MAX_TRIGGER_DEPTH, STACKING, STATUS_RULES, WEAPON_HITS } from './constants';
import { computeDamage, type RuleBonus } from './damage';
import { ELEMENTS, ELEMENT_IDS, type ElementId } from './data/elements';
import { FLOOR_RULES, fieldDef, type FieldId } from './data/fields';
import { STATUS_IDS, statusDef, statusForElement, type StatusDef, type StatusId } from './data/statuses';
import { actionReach, activeSkillDef, resolveSkill, skillElement, techniqueFits, isTechnique, type ActiveSkillId, type ResolvedSkill, type SkillAction, type RiteEmpower } from './data/skills';
import { WEAPON_TYPES, toWeaponSpec, type WeaponRef, type WeaponSpec, type WeaponTypeDef, type WeaponTypeId } from './data/weapons';
import { shieldBurstElement, shieldDef, shieldName, type ShieldSpec } from './data/shields';
import type { SkillVariant } from './data/variations';
import { enemyDef, type EnemyId } from './data/enemies';
import { FERVOR, STARTING_FORMS, formDef, type FormId } from './data/forms';
import { attributeModifiers, type Attributes } from './data/attributes';
import { FOLLOW_UP, TACTIC_CONDITIONS, type Tactic } from './data/tactics';
import { matchCombos, type ComboId } from './data/combos';
import { artifactDef, type ArtifactId, type ArtifactTraits } from './data/artifacts';
import { affixModifier, type Item } from './data/equipment';
import { statDef, type StatId } from './data/stats';
import { GRIPS, type GripId } from './data/grips';
import { multiplierOf } from './damage';
import { passiveDef, type PassiveId } from './data/passives';
import { conditionDef, type ConditionId } from './data/conditions';
import { INTERACTIONS } from './data/interactions';
import { DEFENSE_RULES } from './data/defense';
import { levelHp, levelModifiers } from './data/levels';
import { markDef, type MarkId } from './data/marks';
import { evaluatePredicate, ruleMatches, type Action, type Modifier, type Predicate, type PredicateContext, type Rule } from './rules';

export type Team = 'player' | 'enemy';

export interface StatusState {
  buildup: number;
  /** 呪縛のように、発動中に溜めたダメージ */
  stored: number;
  /** この時刻まで発動している */
  activeUntil: number;
  /** 試し斬り場で固定された状態。時間で切れず、相互作用でも消えない */
  forced: boolean;
  radiusScale: number;
  /** 発動させた者。継続ダメージの持ち主になる */
  activatorId?: string;
  skill: string;
  source: string;
  via: string[];
  depth: number;
  nextTick: number;
  moveAcc: number;
}

export interface Unit {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  /** 属性ごとの耐性。0.5 で半減、負の値は弱点 */
  resist: Record<ElementId, number>;
  statuses: Record<StatusId, StatusState>;
  lastElement?: ElementId;
  cooldowns: Partial<Record<ActiveSkillId, number>>;
  imbue?: { skill: ActiveSkillId; until: number };
  invulnerableUntil: number;
  /** 向いている方向(ラジアン)。ガードの正面になる */
  facing: number;
  /** この時刻まで、振りかぶりか硬直で次の行動ができない */
  busyUntil: number;
  /** 振りかぶり中なら効果が出る時刻 */
  windupUntil: number;
  dodgeStartedAt: number;
  /** 回避を始めた位置。ここに当たる攻撃ならジャスト回避になる */
  dodgeOrigin: Point;
  /** 今の回避でもうジャスト回避したか */
  justDodged: boolean;
  /** ガードを構えた時刻。構えていなければ null */
  guardSince: number | null;
  guardReleasedAt: number;
  /** ジャストガードになる構えか。連打した構えはならない */
  guardIsFresh: boolean;
  buffs: Buff[];
  /** 自分で動く者。並んだ順に、使えて届くスキルを近くの相手に使う */
  ai?: { skills: ActiveSkillId[]; enabled: boolean };
  /** 回る弾幕の今の向き */
  barrageSpin: number;
  /** ビルドに入れた切り札 */
  trump?: ActiveSkillId;
  /** 予約したスキル。作戦より先に、使えるようになりしだい使う */
  queued?: { skill: ActiveSkillId; until: number };
  /** 作戦。autoBattle が真なら、上の行から順に見て最初に使えるスキルを使う */
  tactics: Tactic[];
  autoBattle: boolean;
  /** 作戦で優先して狙う相手 */
  focusId?: string;
  passives: PassiveId[];
  conditions: ConditionId[];
  /** 着けている装備。アーティファクトもここに入る */
  equipment: Item[];
  artifacts: ArtifactId[];
  /** ビルドに入れたアクティブ。空なら制限しない */
  actives: ActiveSkillId[];
  /** 補正値をかける前の最大HP */
  baseMaxHp: number;
  /** 最後に動いた時刻 */
  lastMovedAt: number;
  /** 歩いた跡を残すまでの距離 */
  trailAcc: number;
  /** 武器の持ち方。戦う者だけが持つ */
  grip?: GripId;
  /** 本人のタグ(持ち方など)。条件から参照する */
  tags: string[];
  /** 最後に被弾した時刻。一度もなければ -Infinity */
  lastHurtAt: number;
  /** 前の攻撃から歩いた距離。次の攻撃の溜めになる */
  distanceSinceSkill: number;
  /** 着けている武器(枠の順)。技はこの中から条件に合うものを使う。空なら素手 */
  weapons: WeaponSpec[];
  /** 着けている盾。ready の間は直撃を1回防ぎ、砕けたら readyAt に張り直す */
  shields: (ShieldSpec & { readyAt: number; ready: boolean })[];
  /** 二刀流で両手とも技に合うとき、次にどちらで出すか */
  hand: number;
  /** 最後に使ったときのクールダウンの長さ。残りの割合を出すのに使う */
  cooldownSpans: Partial<Record<ActiveSkillId, number>>;
  /** 能力値。なければ(敵など)、能力値の足りなさで威力は落ちない */
  attributes?: Attributes;
  /** 技の型として使う変化つきの技 */
  variants: Partial<Record<ActiveSkillId, SkillVariant>>;
  /** 技を使った回数 */
  skillUses: Partial<Record<ActiveSkillId, number>>;
  /** 敵の種類。あれば ENEMIES の動き方で自分で歩く */
  kind?: EnemyId;
  /** 倒れたら消える。なければ(案山子と自分)起き上がる */
  mortal: boolean;
  /** 倒れて起き上がった回数 */
  falls: number;
  /** 倒れて起き上がるまでの時刻。それまでは動けない */
  downUntil: number;
  /** 自分に溜まった印 */
  marks: Partial<Record<MarkId, { count: number; until: number }>>;
  /** 同じ技を続けて出した数(連用の疲れ) */
  streak: { skill?: ActiveSkillId; count: number };
  /** 最後にスキルを使った時刻。戦っている間かどうかを見る */
  lastAttackAt: number;
  /** 直近に使ったスキル。型と「直前の手」の条件で見る */
  history: { skill: ActiveSkillId; at: number; element?: ElementId; category: string; applies: StatusId[] }[];
  /** 知っている型 */
  forms: FormId[];
  /** 昂り。コンボと型で溜まる */
  fervor: number;
  /** 直近のコンボ。同じものが続くと昂りが溜まりにくい */
  recentCombos: string[];
  /** 作戦の連携の続き。次に出すスキルと、待つ期限 */
  followUp?: { skills: ActiveSkillId[]; until: number };
  /** 生まれつき持つルール(敵の棘など) */
  innateRules: Rule[];
  /** 敵のレベル(1 が素の強さ)。呼び出した取り巻きにも受け継ぐ */
  level: number;
  /** 呼び出した者(屍術師が起こした屍喰いなど) */
  minions: string[];
  /** この時刻まで空を飛んでいる。飛んでいる間は近攻撃と周りに放つ技が届かず、床も踏まない */
  airborneUntil: number;
  /** 体力が減って怒っている(大物の逆鱗) */
  enraged: boolean;
  /** 飛ぶ時間が切れたとき、降りるのに使う技 */
  landWith?: ActiveSkillId;
  /** コンボで溜まる力(杖の魔力の高まり)。最後に溜まった時刻から window を過ぎると消える */
  comboStacks: number;
  comboStackAt: number;
  /** 同じ相手に当て続けた数(弓・銃・投石紐の狙いの締まり)。focusId は当て続けている相手 */
  focusStacks: number;
  focusTargetId?: string;
  focusAt: number;
  /** 回り込むステップの左右。踏むたびに入れ替わる */
  stepSide?: number;
  /** 最後に回避(ステップ)した時刻。短剣の返しの踏み込みで見る */
  lastStepAt?: number;
  /** 宿している儀式。次の技で全て使い切る */
  rites: { skill: ActiveSkillId; name: string; empower: RiteEmpower; until: number }[];
}

export interface Buff {
  label: string;
  add: number;
  tags: readonly string[];
  until: number;
  charges: number;
  /** 最後に回数を使った当たり。手数で分けた同じ当たりには、回数を使わずに乗る */
  strike?: number;
}

export interface UnitSpec {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  radius?: number;
  maxHp?: number;
  resist?: Partial<Record<ElementId, number>>;
  passives?: PassiveId[];
  conditions?: ConditionId[];
  ai?: ActiveSkillId | ActiveSkillId[];
  tactics?: Tactic[];
  autoBattle?: boolean;
  trump?: ActiveSkillId;
  weapons?: WeaponRef[];
  attributes?: Attributes;
  mortal?: boolean;
  kind?: EnemyId;
}

export interface Hit {
  attackerId?: string;
  targetId: string;
  element: ElementId;
  power: number;
  buildup: number;
  tags: ReadonlySet<string>;
  /** 大元のスキル名 */
  skill: string;
  /** 直接の発動元の名前 */
  source: string;
  /** 0 がスキルの直撃。トリガーや状態の発動を挟むたびに 1 増える */
  depth: number;
  /** このヒットに関わった条件文・パッシブ */
  via: readonly string[];
  /** 攻撃の前に歩いた距離(駆ける刃などで使う) */
  charge?: number;
  /** このヒットだけに効くルール(技と変化から) */
  rules?: readonly Rule[];
  /** 技を何回目に使ったか */
  useIndex?: number;
  /** 1回の当たりの番号。手数で分けたヒットは同じ番号を持つ */
  strike?: number;
  /** このヒットを出したスキルの、1つ前の手(繋ぎの条件文で見る) */
  prev?: PrevStep;
  /** このヒットを出した技に宿した儀式の数 */
  rites?: number;
}

/** スキルを使ったときの、1つ前の手と、その間 */
export type PrevStep = NonNullable<ResolvedSkill['prev']>;

export interface DamageRecord {
  time: number;
  attackerId?: string;
  attackerTeam?: Team;
  targetId: string;
  targetTeam: Team;
  skill: string;
  source: string;
  element: ElementId;
  amount: number;
  depth: number;
  via: string[];
  /** 発動元に添えた相互作用のラベル(濡れで倍など) */
  qualifiers: string[];
  tags: string[];
  /** 成立したコンボ */
  combos: ComboId[];
  /** 連鎖や条件が絡んだヒット。大きく表示する */
  emphasized: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export type CombatEvent =
  | { type: 'damage'; record: DamageRecord; x: number; y: number }
  | { type: 'statusActivated'; unitId: string; status: StatusId; source: string }
  | { type: 'statusEnded'; unitId: string; status: StatusId }
  | { type: 'burst'; status: StatusId; x: number; y: number; radius: number }
  | { type: 'chain'; status: StatusId; from: Point; to: Point }
  | { type: 'swing'; unitId: string; x: number; y: number; angle: number; range: number; arc: number; element: ElementId }
  /** 振りかぶりの予兆。at に効果が出る */
  | { type: 'windup'; unitId: string; skill: ActiveSkillId; angle: number; at: number; action: SkillAction; element?: ElementId; aim: Point }
  | { type: 'interrupted'; unitId: string }
  /** label があれば、パッシブによる自動の見切り・弾き */
  | { type: 'justDodge'; unitId: string; attackerId?: string; label?: string }
  | { type: 'justGuard'; unitId: string; attackerId?: string; label?: string }
  | { type: 'guarded'; unitId: string; blocked: number }
  | { type: 'dodged'; unitId: string }
  | { type: 'weatherCalled'; field: FieldId; until: number }
  | { type: 'imbue'; unitId: string; element: ElementId; until: number }
  /** cleared なら近攻撃でかき消された */
  | { type: 'projectileEnd'; projectileId: number; x: number; y: number; hit: boolean; cleared?: boolean }
  | { type: 'nova'; unitId: string; x: number; y: number; radius: number; element: ElementId }
  | { type: 'fell'; unitId: string }
  /** 盾が砕けた。readyAt に張り直す */
  | { type: 'shieldBroke'; unitId: string; name: string; readyAt: number }
  | { type: 'shieldReady'; unitId: string; name: string }
  /** 影渡りや跳びかかりで一瞬で移った */
  | { type: 'blink'; unitId: string; from: Point; to: Point }
  /** 空へ飛び上がった(until まで)か、地に降りた */
  | { type: 'takeOff'; unitId: string; until: number }
  | { type: 'landed'; unitId: string; x: number; y: number }
  /** 大物が怒った */
  | { type: 'enraged'; unitId: string; label: string }
  /** 儀式を宿した(count は宿している数) */
  | { type: 'rite'; unitId: string; name: string; count: number }
  /** 宿した儀式を技で使い切った */
  | { type: 'riteReleased'; unitId: string; skill: string; names: string[] }
  /** 呼び出された(死体起こし・産み落とし) */
  | { type: 'summoned'; unitId: string; by: string; x: number; y: number; skill: string }
  /** 型が決まった */
  | { type: 'form'; unitId: string; form: FormId; name: string }
  /** 昂りが満ちた */
  | { type: 'fervor'; unitId: string }
  /** 印が増えた・使われた(spent は使った数) */
  | { type: 'marks'; unitId: string; mark: MarkId; count: number; spent?: number; label?: string }
  /** 床が別の床に変わった */
  | { type: 'floorChanged'; id: number; from: FieldId; to: FieldId; x: number; y: number }
  /** 盲目で攻撃が外れた */
  | { type: 'missed'; unitId: string; targetId: string }
  /** 加護が攻撃を無効にした */
  | { type: 'warded'; unitId: string; label: string }
  | { type: 'healed'; unitId: string; amount: number }
  /** 弾が弾けた */
  | { type: 'explosion'; x: number; y: number; radius: number; element: ElementId }
  /** 倒れて消えた(mortal な者) */
  | { type: 'died'; unitId: string; name: string; kind?: EnemyId; team: Team; x: number; y: number };

export interface Projectile {
  id: number;
  ownerId: string;
  skill: ActiveSkillId;
  /** 撃ったときの中身。当たったときの威力はこれで決まる */
  resolved: ResolvedSkill;
  element: ElementId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  traveled: number;
  range: number;
  charge?: number;
  /** 貫く弾が当てた相手 */
  struck?: string[];
}

export interface FloorPatch {
  id: number;
  field: FieldId;
  x: number;
  y: number;
  radius: number;
  /** この時刻に消える。なければ消えない */
  until?: number;
  /** 敷いた者。床で溜まった状態とそのダメージは、この者の手柄になる */
  ownerId?: string;
}

interface Source {
  attacker?: Unit;
  skill: string;
  via: readonly string[];
  depth: number;
  hit?: Hit;
  /** 受けたダメージ(on: 'hurt' のとき) */
  amount?: number;
}

type RuleKind = 'interaction' | 'reaction' | 'passive' | 'condition' | 'artifact' | 'skill';

interface PendingAction {
  unitId: string;
  skill: ActiveSkillId;
  resolved: ResolvedSkill;
  at: number;
  angle: number;
  /** 指定があれば、効果が出る瞬間にこの相手へ向き直す(ターゲット固定) */
  targetId?: string;
  /** 振りかぶったときに狙った所(急降下の降りる所) */
  aim: Point;
  /** この技に宿して使い切った儀式。技が潰れたら戻す */
  releasedRites?: Unit['rites'];
}
interface OwnedRule {
  rule: Rule;
  kind: RuleKind;
}

export interface WorldOptions {
  maxTriggerDepth?: number;
  /** 乱数の種 */
  seed?: number;
  /** 場の広さ。敵はこの中を歩く */
  bounds?: { width: number; height: number };
}

/**
 * 戦闘の状態とその進め方。描画には依存しない。
 * 時間はミリ秒。自キャラの移動は外から moveUnit で渡す
 */
export class CombatWorld {
  time = 0;
  weather: FieldId | null = null;
  /** スキルで呼んだ天候。切れたら previous に戻す */
  weatherCall: { field: FieldId; until: number; previous: FieldId | null } | null = null;
  floors: FloorPatch[] = [];
  readonly units = new Map<string, Unit>();
  projectiles: Projectile[] = [];
  log: DamageRecord[] = [];
  readonly maxTriggerDepth: number;
  readonly bounds?: { width: number; height: number };
  /** 倒れて消えた者の記録 */
  deaths: { unitId: string; kind?: EnemyId; team: Team; time: number }[] = [];

  private events: CombatEvent[] = [];
  private queue: Hit[] = [];
  private pending: PendingAction[] = [];
  private nextId = 1;
  private seed: number;

  constructor(options: WorldOptions = {}) {
    this.maxTriggerDepth = options.maxTriggerDepth ?? MAX_TRIGGER_DEPTH;
    this.seed = options.seed ?? 1;
    this.bounds = options.bounds;
  }

  /** 敵を1体置く。数値と動き方は ENEMIES から。level が高いほど硬く、重く、速く、技が増える */
  spawnEnemy(kind: EnemyId, id: string, x: number, y: number, team: Team = 'enemy', level = 1): Unit {
    const def = enemyDef(kind);
    const skills = [...(def.levelSkills ?? []).filter((s) => level >= s.from).map((s) => s.skill), ...def.skills];
    const unit = this.addUnit({
      id,
      name: def.name,
      team,
      x,
      y,
      radius: def.radius,
      maxHp: Math.round(def.maxHp * levelHp(level)),
      resist: def.resist,
      ai: skills,
      mortal: true,
      kind,
    });
    unit.innateRules = [...(def.rules ?? [])];
    unit.level = level;
    // 現れてすぐ一斉に撃たないよう、最初の間を少しずらす。opening のある技は、その間だけ待つ
    for (const skill of skills) {
      const opening = (activeSkillDef(skill) as { opening?: number }).opening;
      unit.cooldowns[skill] = this.time + (opening ?? 600 + this.random() * 1400);
    }
    return unit;
  }

  /** 0以上1未満の乱数。種が同じなら同じ並びになる(シミュレーターで再現できるように) */
  random(): number {
    // mulberry32
    let t = (this.seed = (this.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  addUnit(spec: UnitSpec): Unit {
    const maxHp = spec.maxHp ?? 100;
    const resist = Object.fromEntries(ELEMENT_IDS.map((e) => [e, spec.resist?.[e] ?? 0])) as Record<ElementId, number>;
    const statuses = Object.fromEntries(
      STATUS_IDS.map((s): [StatusId, StatusState] => [
        s,
        { buildup: 0, stored: 0, activeUntil: 0, forced: false, radiusScale: 1, skill: '', source: '', via: [], depth: 0, nextTick: 0, moveAcc: 0 },
      ]),
    ) as Record<StatusId, StatusState>;
    const unit: Unit = {
      id: spec.id,
      name: spec.name,
      team: spec.team,
      x: spec.x,
      y: spec.y,
      radius: spec.radius ?? 18,
      hp: maxHp,
      maxHp,
      resist,
      statuses,
      cooldowns: {},
      invulnerableUntil: 0,
      facing: 0,
      busyUntil: 0,
      windupUntil: 0,
      dodgeStartedAt: -Infinity,
      dodgeOrigin: { x: spec.x, y: spec.y },
      justDodged: false,
      guardSince: null,
      guardReleasedAt: -Infinity,
      guardIsFresh: false,
      buffs: [],
      ai: spec.ai ? { skills: Array.isArray(spec.ai) ? [...spec.ai] : [spec.ai], enabled: true } : undefined,
      barrageSpin: 0,
      tactics: spec.tactics ? spec.tactics.map((t) => ({ ...t })) : [],
      autoBattle: spec.autoBattle ?? false,
      trump: spec.trump,
      passives: spec.passives ?? [],
      conditions: spec.conditions ?? [],
      equipment: [],
      artifacts: [],
      actives: [],
      baseMaxHp: maxHp,
      lastMovedAt: 0,
      trailAcc: 0,
      tags: [],
      lastHurtAt: -Infinity,
      distanceSinceSkill: 0,
      weapons: spec.weapons ? spec.weapons.map(toWeaponSpec) : [],
      shields: [],
      hand: 0,
      cooldownSpans: {},
      variants: {},
      skillUses: {},
      kind: spec.kind,
      mortal: spec.mortal ?? false,
      falls: 0,
      downUntil: 0,
      streak: { count: 0 },
      marks: {},
      lastAttackAt: -Infinity,
      history: [],
      forms: [...STARTING_FORMS],
      fervor: 0,
      recentCombos: [],
      innateRules: [],
      level: 1,
      minions: [],
      airborneUntil: 0,
      enraged: false,
      rites: [],
      comboStacks: 0,
      comboStackAt: -Infinity,
      focusStacks: 0,
      focusAt: -Infinity,
      attributes: spec.attributes ? { ...spec.attributes } : undefined,
    };
    this.units.set(unit.id, unit);
    return unit;
  }

  addFloor(field: FieldId, x: number, y: number, radius: number, until?: number, ownerId?: string): FloorPatch {
    const patch: FloorPatch = { id: this.nextId++, field, x, y, radius, until, ownerId };
    this.floors.push(patch);
    // 消える床が増えすぎたら、古い順に消す
    const temporary = this.floors.filter((f) => f.until !== undefined);
    if (temporary.length > FLOOR_RULES.maxTemporary) {
      const drop = new Set(temporary.slice(0, temporary.length - FLOOR_RULES.maxTemporary));
      this.floors = this.floors.filter((f) => !drop.has(f));
    }
    return patch;
  }

  /** その者が立っている床 */
  floorsUnder(unit: { x: number; y: number }): FloorPatch[] {
    return this.floors.filter((f) => Math.hypot(unit.x - f.x, unit.y - f.y) <= f.radius);
  }

  /** 天候が弾の届く距離に掛ける倍率 */
  private projectileRangeScale(): number {
    return this.weather ? (fieldDef(this.weather).projectileRange ?? 1) : 1;
  }

  isActive(unit: Unit, status: StatusId): boolean {
    const st = unit.statuses[status];
    if (st.forced) return true;
    const derived = statusDef(status).derived;
    if (derived === 'dying') return unit.hp > 0 && unit.hp <= unit.maxHp * STATUS_RULES.dyingBelow;
    if (derived === 'unhurt') return unit.lastHurtAt === -Infinity;
    if (derived === 'overweight') return unit.tags.includes('overweight');
    return st.activeUntil > this.time;
  }

  /** 発動中の状態で、flag を持つものがあるか */
  private hasStatusFlag(unit: Unit, flag: keyof StatusDef): boolean {
    return STATUS_IDS.some((s) => !!statusDef(s)[flag] && this.isActive(unit, s));
  }

  drainEvents(): CombatEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** 勘定をやり直す。新しく戦い始めたことにして、無傷も戻す */
  resetLog(): void {
    this.log = [];
    for (const unit of this.units.values()) unit.lastHurtAt = -Infinity;
  }

  setInvulnerable(unitId: string, ms: number): void {
    const unit = this.units.get(unitId);
    if (unit) unit.invulnerableUntil = Math.max(unit.invulnerableUntil, this.time + ms);
  }

  /** 試し斬り場用。状態を固定でかける・外す */
  /** 状態を外から溜める(試し斬り場や試験から)。攻撃した者はいない扱い */
  applyBuildup(unitId: string, status: StatusId, amount: number): void {
    const unit = this.units.get(unitId);
    if (unit) this.addBuildup(unit, status, amount, { skill: '', via: [], depth: 0 });
  }

  forceStatus(unitId: string, status: StatusId, on: boolean): void {
    const unit = this.units.get(unitId);
    if (!unit) return;
    const st = unit.statuses[status];
    st.forced = on;
    if (on) {
      const def = statusDef(status);
      st.activatorId = undefined;
      st.skill = def.name;
      st.source = def.name;
      st.via = [];
      st.depth = 0;
      st.radiusScale = 1;
      st.nextTick = this.time + (def.dot?.interval ?? 0);
      if (def.incapacitates) this.interrupt(unit);
    } else {
      st.activeUntil = 0;
      st.buildup = 0;
      this.events.push({ type: 'statusEnded', unitId, status });
    }
  }

  /** 移動を反映する。出血のように動くとダメージを受ける状態はここで効く */
  moveUnit(unitId: string, x: number, y: number): void {
    const unit = this.units.get(unitId);
    if (!unit) return;
    const dist = Math.hypot(x - unit.x, y - unit.y);
    unit.x = x;
    unit.y = y;
    if (dist > 0.5) unit.lastMovedAt = this.time;
    unit.distanceSinceSkill += dist;
    const trail = this.traitsOf(unit).trail;
    if (trail) {
      unit.trailAcc += dist;
      if (unit.trailAcc >= trail.every) {
        unit.trailAcc = 0;
        this.addFloor(trail.field, x, y, trail.radius, this.time + trail.duration, unit.id);
      }
    }
    for (const status of STATUS_IDS) {
      const def = statusDef(status);
      if (!def.moveDamage || !def.element || !this.isActive(unit, status)) continue;
      const st = unit.statuses[status];
      st.moveAcc += dist;
      while (st.moveAcc >= def.moveDamage.per) {
        st.moveAcc -= def.moveDamage.per;
        this.enqueueStatusHit(unit, status, unit, def.moveDamage.power, 0, ['dot']);
      }
    }
    this.processHits();
  }

  /** 昏倒のように行動できない状態にかかっている */
  isIncapacitated(unit: Unit): boolean {
    return unit.downUntil > this.time || STATUS_IDS.some((s) => statusDef(s).incapacitates && this.isActive(unit, s));
  }

  /** 振りかぶりか硬直の最中 */
  isBusy(unit: Unit): boolean {
    return unit.busyUntil > this.time;
  }

  canUseSkill(unitId: string, skillId: ActiveSkillId): boolean {
    const unit = this.units.get(unitId);
    return (
      !!unit &&
      !!this.skillFor(unit, skillId) &&
      (unit.cooldowns[skillId] ?? 0) <= this.time &&
      !this.isBusy(unit) &&
      unit.guardSince === null &&
      !this.isIncapacitated(unit) &&
      this.fitsAltitude(unit, skillId) &&
      // 静寂と恐怖の間は、アクティブスキルを使えない。切り札は使える
      (!this.hasStatusFlag(unit, 'silences') || (activeSkillDef(skillId).tags as readonly string[]).includes('trump'))
    );
  }

  /** 空を飛んでいるか */
  isAirborne(unit: Unit): boolean {
    return unit.airborneUntil > this.time;
  }

  /** 飛んでいる間だけ・地にいる間だけの技が、今の高さで使えるか */
  private fitsAltitude(unit: Unit, skillId: ActiveSkillId): boolean {
    const aloft = (activeSkillDef(skillId) as { aloft?: boolean }).aloft;
    return aloft === undefined || aloft === this.isAirborne(unit);
  }

  /**
   * 歩く向きを決めずにステップを踏んだときの向き。近接の武器が中心なら、相手の周りを回り込んで間合いに残り、
   * 遠距離や持ち合わせなら相手から離れる。回り込む向きは踏むたびに左右を入れ替える
   */
  stepDirection(unit: Unit, from: Point | undefined): Point {
    if (!from) return { x: -Math.cos(unit.facing), y: -Math.sin(unit.facing) };
    const dx = unit.x - from.x;
    const dy = unit.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const away = { x: dx / d, y: dy / d };
    const kinds = unit.weapons.map((w) => (WEAPON_TYPES[w.type] as WeaponTypeDef).kind);
    // 近接の武器だけ(または近接が多い)なら回り込む。剣と銃のような持ち合わせは、撃ちやすいよう離れる
    const melee = kinds.length === 0 || kinds.filter((k) => k === 'melee').length > kinds.filter((k) => k === 'ranged').length;
    if (!melee) return away;
    unit.stepSide = -(unit.stepSide || 1);
    // 横へ回り込みつつ、少しだけ相手へ寄せる(跳んだ後も近攻撃が届くように)
    const x = -away.y * unit.stepSide * 0.9 - away.x * 0.35;
    const y = away.x * unit.stepSide * 0.9 - away.y * 0.35;
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  /** 回避できるか。振りかぶり中と昏倒中はできない。硬直は回避で抜けられる */
  canDodge(unitId: string): boolean {
    const unit = this.units.get(unitId);
    return !!unit && unit.windupUntil <= this.time && !this.isIncapacitated(unit);
  }

  setFacing(unitId: string, angle: number): void {
    const unit = this.units.get(unitId);
    if (unit) unit.facing = angle;
  }

  /** 回避を始める。移動そのものは呼び出し側が行う */
  /**
   * cancelWindup なら、振りかぶりを潰してでも避ける(自動で戦うときのステップ。撃つか避けるかを選ぶ)
   */
  dodge(unitId: string, cancelWindup = false): boolean {
    const unit = this.units.get(unitId);
    if (!unit) return false;
    if (cancelWindup && unit.windupUntil > this.time && !this.isIncapacitated(unit)) this.interrupt(unit);
    if (!this.canDodge(unitId)) return false;
    unit.busyUntil = this.time;
    unit.dodgeStartedAt = this.time;
    unit.lastStepAt = this.time;
    unit.dodgeOrigin = { x: unit.x, y: unit.y };
    unit.justDodged = false;
    unit.invulnerableUntil = Math.max(unit.invulnerableUntil, this.time + DEFENSE.dodgeInvulnerable);
    this.events.push({ type: 'dodged', unitId });
    return true;
  }

  canGuard(unitId: string): boolean {
    const unit = this.units.get(unitId);
    return !!unit && !this.isBusy(unit) && !this.isIncapacitated(unit);
  }

  setGuard(unitId: string, on: boolean): void {
    const unit = this.units.get(unitId);
    if (!unit) return;
    if (on && unit.guardSince === null) {
      if (!this.canGuard(unitId)) return;
      unit.guardSince = this.time;
      unit.guardIsFresh = this.time - unit.guardReleasedAt >= DEFENSE.guardRepressLockout;
    } else if (!on && unit.guardSince !== null) {
      unit.guardSince = null;
      unit.guardReleasedAt = this.time;
    }
  }

  /**
   * スキルを使う。振りかぶりの後に効果が出る。
   * targetId を渡すと、効果が出る瞬間にその相手へ向き直す
   */
  useSkill(unitId: string, skillId: ActiveSkillId, aim: Point, targetId?: string): boolean {
    const unit = this.units.get(unitId);
    if (!unit || !this.canUseSkill(unitId, skillId)) return false;
    unit.lastAttackAt = this.time;
    const uses = (unit.skillUses[skillId] ?? 0) + 1;
    unit.skillUses[skillId] = uses;
    // 1つ前の手。型で手順が空になる前に覚えておく
    const last = unit.history.at(-1);
    const prev: PrevStep | undefined = last ? { element: last.element, category: last.category, gap: this.time - last.at } : undefined;
    let def: ResolvedSkill = { ...this.skillFor(unit, skillId)!, useIndex: uses, prev };
    // 宿した儀式は、攻撃の技(近攻撃・遠攻撃)で全て使い切る。潰れたら戻せるよう覚えておく
    const riteBefore = unit.rites.filter((r) => r.until > this.time);
    def = this.releaseRites(unit, def);
    const released = def.rites ? riteBefore : undefined;
    // 型。直近の手順と合えば決まり、この一手が強くなる
    const form = this.recordStep(unit, skillId, def);
    if (form) {
      const f = formDef(form);
      const formRules: Rule[] = [{ label: f.name, on: 'damage', when: [{ type: 'hitHasTag', tag: 'attack' }], add: f.bonus }];
      if (f.hits) {
        formRules.push({
          label: f.name,
          on: 'hit',
          when: [{ type: 'hitHasTag', tag: 'attack' }, { type: 'hitLacksTag', tag: 'repeat' }, { type: 'hitLacksTag', tag: 'multi' }],
          do: [{ type: 'repeatHit', power: 0.5, times: f.hits }],
        });
      }
      def = { ...def, rules: [...(def.rules ?? []), ...formRules] };
      this.events.push({ type: 'form', unitId, form, name: f.name });
      this.gainFervor(unit, f.fervor);
    }
    // 雨乞うのように、条件を満たしている間だけ間隔が変わる
    const ctx = this.context(unit, unit, {});
    const when = (def.intervalWhen ?? []).reduce((m, w) => (w.when.every((p) => evaluatePredicate(p, ctx)) ? m * w.mult : m), 1);
    const rage = unit.enraged && unit.kind ? (enemyDef(unit.kind).enrage?.cooldown ?? 1) : 1;
    // 連用の疲れ。自分の側が同じ技を続けて出すと、その技の間隔が延びる。別の技を挟めば戻る
    unit.streak = unit.streak.skill === skillId ? { skill: skillId, count: unit.streak.count + 1 } : { skill: skillId, count: 0 };
    const tired = !unit.kind && skillId !== unit.trump ? Math.min(FATIGUE.max, 1 + FATIGUE.perRepeat * unit.streak.count) : 1;
    const span = def.cooldown * when * rage * tired * this.statOf(unit, 'cooldown', [...def.tags, def.category, skillId]);
    unit.cooldowns[skillId] = this.time + span;
    unit.cooldownSpans[skillId] = span;
    unit.windupUntil = this.time + def.windup;
    unit.busyUntil = this.time + def.windup + def.recovery;
    // 二刀流で両手とも合うなら、次は逆の手で出す
    if (def.weapon) unit.hand += 1;
    const angle = Math.atan2(aim.y - unit.y, aim.x - unit.x);
    unit.facing = angle;
    const action: PendingAction = {
      unitId,
      skill: skillId,
      resolved: def,
      at: this.time + def.windup,
      angle,
      targetId,
      aim: { x: aim.x, y: aim.y },
      releasedRites: released,
    };
    this.events.push({ type: 'windup', unitId, skill: skillId, angle, at: action.at, action: def.action, element: def.element, aim: action.aim });
    if (def.windup <= 0) this.executeSkill(action);
    else this.pending.push(action);
    return true;
  }

  /** 儀式の数の上限。これより多く宿すと、古いものから消える */
  static readonly RITE_LIMIT = 5;

  /** 儀式を宿す */
  private addRite(unit: Unit, skill: ActiveSkillId, name: string, empower: RiteEmpower, duration: number): void {
    unit.rites = unit.rites.filter((r) => r.until > this.time);
    if (empower.selfCost) {
      // 血の誓いのように身を削る儀式。これでは倒れない
      unit.hp = Math.max(1, unit.hp - unit.maxHp * empower.selfCost);
      unit.lastHurtAt = this.time;
    }
    unit.rites.push({ skill, name, empower, until: this.time + duration });
    if (unit.rites.length > CombatWorld.RITE_LIMIT) unit.rites.shift();
    this.events.push({ type: 'rite', unitId: unit.id, name, count: unit.rites.length });
  }

  /** 攻撃の技を出すとき、宿した儀式を全て使い切って技に乗せる */
  private releaseRites(unit: Unit, def: ResolvedSkill): ResolvedSkill {
    unit.rites = unit.rites.filter((r) => r.until > this.time);
    if (unit.rites.length === 0 || !def.tags.includes('attack') || (def.category !== 'melee' && def.category !== 'ranged')) return def;
    const rites = unit.rites;
    unit.rites = [];
    const count = rites.length;
    const rules: Rule[] = [...(def.rules ?? [])];
    let element = def.element;
    const attack: Predicate = { type: 'hitHasTag', tag: 'attack' };
    const first: Predicate = { type: 'hitLacksTag', tag: 'repeat' };
    for (const { name, empower: e } of rites) {
      const add = (e.add ?? 0) + (e.perRite ?? 0) * count;
      // 儀式ごとに別のラベルなので、別の種類として掛け合わさる
      if (add !== 0) rules.push({ label: name, on: 'damage', when: [attack], add });
      if (e.hits) rules.push({ label: name, on: 'hit', when: [attack, first], do: [{ type: 'repeatHit', power: 0.5, times: e.hits }] });
      if (e.buildup) rules.push({ label: name, on: 'hit', when: [attack], do: [{ type: 'applyBuildup', status: e.buildup.status, amount: e.buildup.amount }] });
      if (e.strike) rules.push({ label: name, on: 'hit', when: [attack, first], do: [{ type: 'strike', ...e.strike }] });
      if (e.element) element = e.element;
    }
    this.events.push({ type: 'riteReleased', unitId: unit.id, skill: def.name, names: rites.map((r) => r.name) });
    // 儀式を宿した技には rited のタグを付ける(儀式を宿した技のダメージの補正値が効く)
    return { ...def, element, rules, rites: count, tags: [...def.tags, 'rited'] };
  }

  /** 使ったスキルを手順に足し、決まった型を返す。決まったら手順は空にする */
  private recordStep(unit: Unit, skill: ActiveSkillId, def: ResolvedSkill): FormId | undefined {
    unit.history.push({ skill, at: this.time, element: def.element, category: def.category, applies: appliedStatuses(def) });
    if (unit.history.length > 6) unit.history.shift();
    for (const id of unit.forms) {
      const f = formDef(id);
      const n = f.steps.length;
      const tail = unit.history.slice(-n);
      if (tail.length < n) continue;
      const fits = tail.every((h, i) => {
        const step = f.steps[i]!;
        if (i > 0 && h.at - tail[i - 1]!.at > f.window) return false;
        return (
          (!step.skill || step.skill === h.skill) &&
          (!step.element || step.element === h.element) &&
          (!step.category || step.category === h.category) &&
          (!step.applies || h.applies.includes(step.applies))
        );
      });
      if (!fits || (f.distinct && new Set(tail.map((h) => h.skill)).size < n)) continue;
      unit.history = [unit.history.at(-1)!];
      return id;
    }
    return undefined;
  }

  /** 昂りを溜める。満ちたら切り札が早く戻り、続く数撃が強くなる */
  private gainFervor(unit: Unit, amount: number): void {
    unit.fervor += amount;
    if (unit.fervor < FERVOR.max) return;
    unit.fervor = 0;
    if (unit.trump && (unit.cooldowns[unit.trump] ?? 0) > this.time) {
      unit.cooldowns[unit.trump] = Math.max(this.time, unit.cooldowns[unit.trump]! - FERVOR.trumpCut);
    }
    const b = FERVOR.buff;
    unit.buffs.push({ label: b.label, add: b.add, tags: ['weapon'], until: this.time + b.duration, charges: b.charges });
    this.events.push({ type: 'fervor', unitId: unit.id });
  }

  /** コンボのヒットで昂りが溜まる。同じコンボが続くほど溜まりにくい */
  /** 着けている武器のうち、コンボで伸びる力を持つもの(杖) */
  comboGrowthOf(unit: Unit): NonNullable<WeaponTypeDef['comboGrowth']> | undefined {
    for (const w of unit.weapons) {
      const g = (WEAPON_TYPES[w.type] as WeaponTypeDef).comboGrowth;
      if (g) return g;
    }
    return undefined;
  }

  /** 着けている武器の、同じ相手に当て続けるほど伸びる力(弓・銃・投石紐)。ヒットのタグに合うもの */
  focusGrowthOf(unit: Unit, tags?: ReadonlySet<string>): NonNullable<WeaponTypeDef['focusGrowth']> | undefined {
    for (const w of unit.weapons) {
      const g = (WEAPON_TYPES[w.type] as WeaponTypeDef).focusGrowth;
      if (g && (!tags || tags.has(g.tag))) return g;
    }
    return undefined;
  }

  /** その技を出す武器に、今効いているステップの後の一撃(短剣の返しの踏み込み) */
  stepStrikeFor(unit: Unit, def: { weapon?: WeaponTypeId; action: SkillAction }): NonNullable<WeaponTypeDef['stepStrike']> | undefined {
    if (def.action.type !== 'melee' || !def.weapon || unit.lastStepAt === undefined) return undefined;
    const t = (WEAPON_TYPES[def.weapon] as WeaponTypeDef).stepStrike;
    return t && this.time - unit.lastStepAt <= t.window ? t : undefined;
  }

  /** 今の狙いの締まり。途切れていれば0に戻す */
  focusStacksOf(unit: Unit): number {
    const g = this.focusGrowthOf(unit);
    if (!g || this.time - unit.focusAt > g.window) unit.focusStacks = 0;
    return unit.focusStacks;
  }

  /** 今の魔力の高まり。コンボが途切れていれば0に戻す */
  comboStacksOf(unit: Unit): number {
    const g = this.comboGrowthOf(unit);
    if (!g || this.time - unit.comboStackAt > g.window) unit.comboStacks = 0;
    return unit.comboStacks;
  }

  private onCombo(unit: Unit, combos: readonly string[]): void {
    // 杖はコンボのヒットごとに力が溜まる
    const growth = this.comboGrowthOf(unit);
    if (growth && combos.length > 0) {
      unit.comboStacks = Math.min(growth.max, this.comboStacksOf(unit) + 1);
      unit.comboStackAt = this.time;
    }
    for (const c of combos) {
      const same = unit.recentCombos.filter((r) => r === c).length;
      unit.recentCombos.push(c);
      if (unit.recentCombos.length > FERVOR.recent) unit.recentCombos.shift();
      this.gainFervor(unit, FERVOR.perCombo / (1 + FERVOR.repeatPenalty * same));
    }
  }

  /**
   * そのスキルを今出すときの中身。技は、条件に合う武器(なければ素手)で作る。
   * 二刀流で両手とも合うなら、左右交互に出す。使えなければ undefined
   */
  skillFor(unit: Unit, skillId: ActiveSkillId): ResolvedSkill | undefined {
    const def = activeSkillDef(skillId);
    if (!isTechnique(def)) return resolveSkill(skillId, undefined, unit.attributes);
    const hands: WeaponSpec[] = unit.weapons.length > 0 ? unit.weapons : [{ type: 'fists' }];
    const fits = hands.filter((w) => techniqueFits(def, w));
    if (fits.length === 0) return undefined;
    return resolveSkill(skillId, fits[unit.hand % fits.length], unit.attributes, unit.variants[skillId]);
  }

  private executeSkill(pending: PendingAction): void {
    const unit = this.units.get(pending.unitId);
    if (!unit || this.isIncapacitated(unit)) return;
    let def = pending.resolved;
    const target = pending.targetId ? this.units.get(pending.targetId) : undefined;
    const angle = target ? Math.atan2(target.y - unit.y, target.x - unit.x) : pending.angle;
    unit.facing = angle;
    const action = def.action;
    // 歩いた距離は、この攻撃の溜めとして使い切る
    const charge = unit.distanceSinceSkill;
    unit.distanceSinceSkill = 0;
    switch (action.type) {
      case 'melee': {
        // 短剣はステップの後の一撃だけ、遠くまで届いて重い。1回で使い切る
        const strike = this.stepStrikeFor(unit, def);
        if (strike) {
          unit.lastStepAt = undefined;
          def = { ...def, rules: [...(def.rules ?? []), { label: strike.label, on: 'damage', when: [{ type: 'hitHasTag', tag: 'attack' }], add: strike.add }] };
        }
        const range = action.range * this.statOf(unit, 'meleeRange', def.tags) * (strike?.range ?? 1);
        const minRange = this.traitsOf(unit).meleeMinRange;
        this.events.push({
          type: 'swing',
          unitId: unit.id,
          x: unit.x,
          y: unit.y,
          angle,
          range,
          arc: action.arc,
          element: skillElement(def),
        });
        const half = (action.arc * Math.PI) / 360;
        const reaches = (other: Unit, at: Point) => {
          const dx = at.x - unit.x;
          const dy = at.y - unit.y;
          const dist = Math.hypot(dx, dy);
          if (dist > range + other.radius) return false;
          // 錆鉄の長柄のように、近すぎる相手に当たらない
          if (minRange > 0 && dist - other.radius < minRange) return false;
          const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - angle));
          return (minRange === 0 && dist <= unit.radius + other.radius) || diff <= half;
        };
        let landed = 0;
        for (const other of this.opponentsOf(unit)) {
          // 飛んでいる者に近攻撃は届かない
          if (this.isAirborne(other)) continue;
          // 回避で範囲の外へ抜けていても、避け始めた位置に当たるならジャスト回避の判定に回す
          const justDodging = this.time - other.dodgeStartedAt <= DEFENSE.justDodgeWindow && reaches(other, other.dodgeOrigin);
          if (reaches(other, other)) landed++;
          if (reaches(other, other) || justDodging) this.queueAttack(unit, other, def, charge);
        }
        this.onMultiHit(unit, landed, def.name);
        if (landed === 0) this.onMiss(unit, def);
        if (action.clearsProjectiles) {
          this.projectiles = this.projectiles.filter((p) => {
            const owner = this.units.get(p.ownerId);
            if (!owner || owner.team === unit.team) return true;
            const dx = p.x - unit.x;
            const dy = p.y - unit.y;
            const inArc = Math.hypot(dx, dy) <= range + p.radius && Math.abs(normalizeAngle(Math.atan2(dy, dx) - angle)) <= half;
            if (inArc) this.events.push({ type: 'projectileEnd', projectileId: p.id, x: p.x, y: p.y, hit: false, cleared: true });
            return !inArc;
          });
        }
        this.processHits();
        break;
      }
      case 'barrage': {
        const element = skillElement(def);
        const count = Math.max(1, action.count);
        let angles: number[];
        if (action.pattern === 'ring') {
          unit.barrageSpin += ((action.spin ?? 0) * Math.PI) / 180;
          angles = Array.from({ length: count }, (_, i) => unit.barrageSpin + (i / count) * Math.PI * 2);
        } else {
          const spread = ((action.spread ?? 0) * Math.PI) / 180;
          angles = Array.from({ length: count }, (_, i) => angle - spread / 2 + (count > 1 ? (spread * i) / (count - 1) : spread / 2));
        }
        for (const a of angles) {
          this.projectiles.push({
            id: this.nextId++,
            ownerId: unit.id,
            skill: pending.skill,
            resolved: def,
            element,
            x: unit.x + Math.cos(a) * unit.radius,
            y: unit.y + Math.sin(a) * unit.radius,
            vx: Math.cos(a) * action.speed,
            vy: Math.sin(a) * action.speed,
            radius: action.radius,
            traveled: 0,
            range: action.range * this.projectileRangeScale(),
          });
        }
        break;
      }
      case 'projectile': {
        // 三連射や双子の銃のように弾が増えたら、少しずつ角度をずらして撃つ
        const count = Math.max(1, (action.count ?? 1) + Math.round(this.statOf(unit, 'projectiles', def.tags)));
        const spread = ((action.spread ?? 7) * Math.PI) / 180;
        for (let i = 0; i < count; i++) {
          const a = angle + (i - (count - 1) / 2) * spread;
          this.projectiles.push({
            id: this.nextId++,
            ownerId: unit.id,
            skill: pending.skill,
            resolved: def,
            element: skillElement(def),
            x: unit.x + Math.cos(a) * unit.radius,
            y: unit.y + Math.sin(a) * unit.radius,
            vx: Math.cos(a) * action.speed,
            vy: Math.sin(a) * action.speed,
            radius: action.radius,
            traveled: 0,
            range: action.range * this.projectileRangeScale(),
            charge,
          });
        }
        break;
      }
      case 'imbue': {
        unit.imbue = { skill: pending.skill, until: this.time + action.duration };
        this.events.push({ type: 'imbue', unitId: unit.id, element: skillElement(def), until: unit.imbue.until });
        break;
      }
      case 'weather': {
        this.callWeather(action.field, action.duration);
        break;
      }
      case 'nova': {
        this.events.push({ type: 'nova', unitId: unit.id, x: unit.x, y: unit.y, radius: action.radius, element: skillElement(def) });
        let landed = 0;
        for (const other of this.opponentsOf(unit)) {
          if (this.isAirborne(other) || Math.hypot(other.x - unit.x, other.y - unit.y) > action.radius + other.radius) continue;
          landed++;
          this.queueAttack(unit, other, def, charge);
        }
        this.onMultiHit(unit, landed, def.name);
        if (landed === 0) this.onMiss(unit, def);
        this.processHits();
        break;
      }
      case 'summon': {
        this.summon(unit, action, def.name);
        break;
      }
      case 'blink': {
        const from = { x: unit.x, y: unit.y };
        let x: number;
        let y: number;
        if (action.where === 'at') {
          // 振りかぶったときに狙った所へ。見てから離れれば避けられる
          x = pending.aim.x;
          y = pending.aim.y;
        } else {
          if (!target) break;
          // 背後なら相手の向きの逆側、正面なら相手と自分の間に移る
          const a = action.where === 'behind' ? target.facing + Math.PI : Math.atan2(unit.y - target.y, unit.x - target.x);
          x = target.x + Math.cos(a) * (action.distance + target.radius);
          y = target.y + Math.sin(a) * (action.distance + target.radius);
        }
        if (this.bounds) {
          x = Math.min(this.bounds.width - unit.radius, Math.max(unit.radius, x));
          y = Math.min(this.bounds.height - unit.radius, Math.max(unit.radius, y));
        }
        this.moveUnit(unit.id, x, y);
        if (target) unit.facing = Math.atan2(target.y - y, target.x - x);
        this.events.push({ type: 'blink', unitId: unit.id, from, to: { x, y } });
        if (action.land) {
          // 降りた周りを砕く。飛んでいれば、ここで地に降りる
          if (this.isAirborne(unit)) {
            unit.airborneUntil = 0;
            this.events.push({ type: 'landed', unitId: unit.id, x, y });
          }
          const land: ResolvedSkill = { ...def, action: { type: 'nova', ...action.land } };
          this.events.push({ type: 'nova', unitId: unit.id, x, y, radius: action.land.radius, element: skillElement(def) });
          let landed = 0;
          for (const other of this.opponentsOf(unit)) {
            if (Math.hypot(other.x - x, other.y - y) > action.land.radius + other.radius) continue;
            landed++;
            this.queueAttack(unit, other, land, charge);
          }
          this.onMultiHit(unit, landed, def.name);
          this.processHits();
        }
        break;
      }
      case 'rite': {
        this.addRite(unit, pending.skill, def.name, action.empower, action.duration);
        break;
      }
      case 'takeOff': {
        unit.airborneUntil = this.time + action.duration;
        unit.landWith = action.land as ActiveSkillId | undefined;
        this.events.push({ type: 'takeOff', unitId: unit.id, until: unit.airborneUntil });
        break;
      }
      case 'healAllies': {
        this.events.push({ type: 'nova', unitId: unit.id, x: unit.x, y: unit.y, radius: action.radius, element: 'rot' });
        for (const ally of this.units.values()) {
          if (ally.team !== unit.team || Math.hypot(ally.x - unit.x, ally.y - unit.y) > action.radius) continue;
          this.heal(ally, ally.maxHp * action.ratio, { attacker: unit, skill: def.name, via: [], depth: 0 });
        }
        this.processHits();
        break;
      }
      case 'selfCare': {
        if (action.heal) this.heal(unit, unit.maxHp * action.heal, { attacker: unit, skill: def.name, via: [], depth: 0 });
        if (action.status) this.addBuildup(unit, action.status, statusDef(action.status).max, { attacker: unit, skill: def.name, via: [], depth: 0 });
        break;
      }
      case 'floor': {
        const at = target ?? { x: unit.x + Math.cos(angle) * 200, y: unit.y + Math.sin(angle) * 200 };
        this.addFloor(action.field, at.x, at.y, action.radius, this.time + action.duration, unit.id);
        break;
      }
    }
  }

  /** 一定時間だけ天候を変える。切れると元の天候に戻る */
  callWeather(field: FieldId, duration: number): void {
    const previous = this.weatherCall ? this.weatherCall.previous : this.weather;
    this.weather = field;
    this.weatherCall = { field, until: this.time + duration, previous };
    this.events.push({ type: 'weatherCalled', field, until: this.weatherCall.until });
  }

  /** 振りかぶり中の行動を潰す */
  private interrupt(unit: Unit): void {
    const before = this.pending.length;
    // 儀式は潰れても失われない。潰れた技に宿した儀式は戻り、潰れた儀式はクールダウンが戻る
    for (const p of this.pending) {
      if (p.unitId !== unit.id) continue;
      if (p.releasedRites?.length) unit.rites = [...p.releasedRites, ...unit.rites].slice(-CombatWorld.RITE_LIMIT);
      if (p.resolved.action.type === 'rite') unit.cooldowns[p.skill] = this.time;
    }
    this.pending = this.pending.filter((p) => p.unitId !== unit.id);
    unit.windupUntil = this.time;
    unit.guardSince = null;
    if (this.pending.length !== before) this.events.push({ type: 'interrupted', unitId: unit.id });
  }

  /** 作戦で狙う相手。指定した相手がいればそれ、いなければ一番近い相手 */
  tacticTarget(unit: Unit): Unit | undefined {
    const focus = unit.focusId ? this.units.get(unit.focusId) : undefined;
    if (focus && focus.team !== unit.team) return focus;
    return this.opponentsOf(unit)
      .map((u) => ({ u, d: Math.hypot(u.x - unit.x, u.y - unit.y) }))
      .sort((a, b) => a.d - b.d)[0]?.u;
  }

  /** 作戦の1行が今使えるか。届くかどうかは見ない */
  private tacticReady(unit: Unit, tactic: Tactic, target: Unit | undefined): boolean {
    if (!tactic.enabled || !this.canUseSkill(unit.id, tactic.skill)) return false;
    if (unit.actives.length > 0 && !unit.actives.includes(tactic.skill)) return false;
    const def = this.skillFor(unit, tactic.skill);
    if (!def || (actionReach(def.action) !== undefined && !target)) return false;
    // 飛んでいる相手に、届かない近攻撃と周りに放つ技は出さない(下の行の遠攻撃へ回す)
    if (target && this.isAirborne(target) && (def.action.type === 'melee' || def.action.type === 'nova')) return false;
    const ctx = this.context(target ?? unit, unit, {});
    // 知らない条件(古い作戦など)の行は使わない
    const condition = TACTIC_CONDITIONS[tactic.condition];
    return !!condition && condition.when.every((p) => evaluatePredicate(p, ctx));
  }

  /** そのスキルが届く距離。近攻撃の射程の補正も含む。届かせる必要がなければ undefined */
  reachOf(unit: Unit, skill: ActiveSkillId): number | undefined {
    const def = this.skillFor(unit, skill);
    if (!def) return undefined;
    const reach = actionReach(def.action);
    if (reach === undefined) return undefined;
    if (def.action.type === 'melee') return reach * this.statOf(unit, 'meleeRange', def.tags) * (this.stepStrikeFor(unit, def)?.range ?? 1);
    // 砂嵐や霧の中では、弾が遠くへ届かない
    return def.action.type === 'projectile' || def.action.type === 'barrage' ? reach * this.projectileRangeScale() : reach;
  }

  private inReach(unit: Unit, target: Unit, reach: number): boolean {
    return Math.hypot(target.x - unit.x, target.y - unit.y) - target.radius <= reach;
  }

  /**
   * 作戦に従って動くとき、どこへ寄ればよいか。
   * 使えるのに届かない最初の行の相手を返す。stopAt まで近づけば届く
   */
  autoMoveGoal(unitId: string): { x: number; y: number; stopAt: number } | null {
    const unit = this.units.get(unitId);
    if (!unit?.autoBattle || this.isBusy(unit) || this.isIncapacitated(unit)) return null;
    const target = this.tacticTarget(unit);
    if (!target) return null;
    for (const tactic of unit.tactics) {
      if (!this.tacticReady(unit, tactic, target)) continue;
      const reach = this.reachOf(unit, tactic.skill);
      if (reach === undefined || this.inReach(unit, target, reach)) return null;
      return { x: target.x, y: target.y, stopAt: reach * 0.8 + target.radius };
    }
    return null;
  }

  /** スキルを予約する。硬直中なら明けしだい、届かなければ届きしだい使う */
  queueSkill(unitId: string, skill: ActiveSkillId, ms: number): void {
    const unit = this.units.get(unitId);
    if (!unit || (unit.cooldowns[skill] ?? 0) > this.time) return;
    unit.queued = { skill, until: this.time + ms };
  }

  /** 予約したスキルが届かない相手。届くまで寄る先になる */
  queuedGoal(unitId: string): Unit | undefined {
    const unit = this.units.get(unitId);
    if (!unit?.queued || unit.queued.until < this.time) return undefined;
    const reach = this.reachOf(unit, unit.queued.skill);
    const target = this.tacticTarget(unit);
    if (reach === undefined || !target) return undefined;
    return this.inReach(unit, target, reach) ? undefined : target;
  }

  /** 予約を使えたか。使えないのが届かないせいだけなら、作戦は続けてよい */
  private runQueued(unit: Unit): 'used' | 'wait' | 'continue' {
    const queued = unit.queued;
    if (!queued) return 'continue';
    if (queued.until < this.time) {
      unit.queued = undefined;
      return 'continue';
    }
    if (!this.canUseSkill(unit.id, queued.skill)) return 'wait';
    if (this.queuedGoal(unit.id)) return 'continue';
    const target = this.tacticTarget(unit);
    const aim = target ?? { x: unit.x + Math.cos(unit.facing), y: unit.y + Math.sin(unit.facing) };
    if (!this.useSkill(unit.id, queued.skill, aim, target?.id)) return 'wait';
    unit.queued = undefined;
    return 'used';
  }

  private runTactics(unit: Unit): void {
    if (this.runQueued(unit) !== 'continue') return;
    const target = this.tacticTarget(unit);
    const aim = target ?? { x: unit.x + Math.cos(unit.facing), y: unit.y + Math.sin(unit.facing) };
    // 連携の続きがあれば、期限までそれを待って出す。他の行は使わない
    const follow = unit.followUp;
    if (follow && follow.until >= this.time && follow.skills.length > 0) {
      const next = follow.skills[0]!;
      const reach = this.reachOf(unit, next);
      const reachable = reach === undefined || (!!target && this.inReach(unit, target, reach));
      const usable = this.canUseSkill(unit.id, next) && (unit.actives.length === 0 || unit.actives.includes(next));
      if (!usable && !this.skillFor(unit, next)) {
        unit.followUp = undefined;
      } else {
        if (usable && reachable && this.useSkill(unit.id, next, aim, reach !== undefined ? target?.id : undefined)) {
          const rest = follow.skills.slice(1);
          const used = this.skillFor(unit, next);
          unit.followUp = rest.length > 0 ? { skills: rest, until: this.time + (used?.windup ?? 0) + FOLLOW_UP.window } : undefined;
        }
        return;
      }
    } else if (follow) {
      unit.followUp = undefined;
    }
    for (const tactic of unit.tactics) {
      if (!this.tacticReady(unit, tactic, target)) continue;
      const reach = this.reachOf(unit, tactic.skill);
      if (reach !== undefined && (!target || !this.inReach(unit, target, reach))) continue;
      const windup = this.skillFor(unit, tactic.skill)?.windup ?? 0;
      if (this.useSkill(unit.id, tactic.skill, aim, reach !== undefined ? target?.id : undefined)) {
        const then = (tactic.then ?? []).slice(0, FOLLOW_UP.max);
        unit.followUp = then.length > 0 ? { skills: then, until: this.time + windup + FOLLOW_UP.window } : undefined;
        return;
      }
    }
  }

  private updateAi(): void {
    for (const unit of this.units.values()) {
      if (unit.autoBattle) this.runTactics(unit);
      if (!unit.ai?.enabled) continue;
      // 大物は深手を負うと怒り、攻めが速まる
      const rage = unit.kind ? enemyDef(unit.kind).enrage : undefined;
      if (rage && !unit.enraged && unit.hp > 0 && unit.hp < unit.maxHp * rage.below) {
        unit.enraged = true;
        this.events.push({ type: 'enraged', unitId: unit.id, label: rage.label });
      }
      for (const skill of unit.ai.skills) {
        if (!this.canUseSkill(unit.id, skill)) continue;
        const reach = this.reachOf(unit, skill);
        if (reach === undefined) {
          // 天候のように届かせる必要のないものは、相手が近くにいて、まだその天候でないときに使う
          const def = this.skillFor(unit, skill);
          if (def?.action.type === 'weather' && this.weather === def.action.field) continue;
          if (def && !this.worthUsing(unit, def.action)) continue;
          const near = this.opponentsOf(unit).find((u) => Math.hypot(u.x - unit.x, u.y - unit.y) < 700);
          if (near && this.useSkill(unit.id, skill, near)) break;
          continue;
        }
        // 狙い撃ちのように、近すぎる相手には使わない技がある。その技は一番遠い相手を狙う
        const minRange = (activeSkillDef(skill) as { minRange?: number }).minRange;
        const target = this.opponentsOf(unit)
          .map((u) => ({ u, d: Math.hypot(u.x - unit.x, u.y - unit.y) - u.radius }))
          .filter(({ d }) => d <= reach * 0.9 && (minRange === undefined || d >= minRange))
          .sort((a, b) => (minRange === undefined ? a.d - b.d : b.d - a.d))[0]?.u;
        // 敵の振りかぶりは向きを決め打ちにする。見てから横へ避けられるように
        // 影渡りのように相手のそばへ移るものだけは、相手を追う
        const follows = this.skillFor(unit, skill)?.action.type === 'blink';
        if (target && this.useSkill(unit.id, skill, target, follows ? target.id : undefined)) break;
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    const sec = dt / 1000;
    if (this.weatherCall && this.weatherCall.until <= this.time) {
      // 途中で天候を変えられていたら、そちらを優先する
      if (this.weather === this.weatherCall.field) this.weather = this.weatherCall.previous;
      this.weatherCall = null;
    }

    for (const unit of this.units.values()) {
      const weatherApplies = this.weather ? fieldDef(this.weather).applies : undefined;
      if (weatherApplies) this.addBuildup(unit, weatherApplies.status, weatherApplies.perSec * sec, { skill: '', via: [], depth: 0 });
      // 飛んでいる者は床を踏まない。飛ぶ時間が切れたら地に降りる
      if (unit.airborneUntil > 0 && unit.airborneUntil <= this.time) {
        const dive = unit.landWith ? this.skillFor(unit, unit.landWith) : undefined;
        const target = dive ? this.tacticTarget(unit) : undefined;
        unit.landWith = undefined;
        if (dive && target) {
          // 急降下で降りる。振りかぶりの間は飛んだまま、狙った所へ落ちる
          unit.airborneUntil = this.time + dive.windup + 50;
          unit.busyUntil = this.time;
          delete unit.cooldowns[dive.id];
          this.useSkill(unit.id, dive.id, { x: target.x, y: target.y });
        } else {
          unit.airborneUntil = 0;
          this.events.push({ type: 'landed', unitId: unit.id, x: unit.x, y: unit.y });
        }
      }
      for (const patch of this.isAirborne(unit) ? [] : this.floorsUnder(unit)) {
        const applies = fieldDef(patch.field).applies;
        const owner = patch.ownerId ? this.units.get(patch.ownerId) : undefined;
        if (applies) this.addBuildup(unit, applies.status, applies.perSec * sec, { attacker: owner, skill: owner ? fieldDef(patch.field).name : '', via: [], depth: 0 });
      }

      const fighting = this.time - unit.lastHurtAt < STATUS_RULES.combatWindow || this.time - unit.lastAttackAt < STATUS_RULES.combatWindow;
      for (const status of STATUS_IDS) {
        const def = statusDef(status);
        const st = unit.statuses[status];
        if (def.derived) continue;
        st.buildup = Math.max(0, st.buildup - def.decayPerSec * sec);
        // 飢えのように、戦っている間に溜まるもの
        if (def.gainInCombatPerSec && fighting) this.addBuildup(unit, status, def.gainInCombatPerSec * sec, { skill: '', via: [], depth: 0 });
        if (!this.isActive(unit, status)) {
          if (st.activeUntil > 0) {
            st.activeUntil = 0;
            this.events.push({ type: 'statusEnded', unitId: unit.id, status });
            this.onStatusExpired(unit, status);
            if (!this.units.has(unit.id)) break;
          }
          continue;
        }
        if (!st.forced && this.isBlocked(unit, status, st.activatorId ? this.units.get(st.activatorId) : undefined)) {
          st.activeUntil = 0;
          this.events.push({ type: 'statusEnded', unitId: unit.id, status });
          continue;
        }
        if (def.dot && def.element) {
          while (st.nextTick <= this.time) {
            st.nextTick += def.dot.interval;
            this.enqueueStatusHit(unit, status, unit, def.dot.power, 0, ['dot']);
          }
        }
      }
    }

    this.floors = this.floors.filter((f) => f.until === undefined || f.until > this.time);

    const due = this.pending.filter((p) => p.at <= this.time);
    this.pending = this.pending.filter((p) => p.at > this.time);
    for (const p of due) this.executeSkill(p);

    for (const unit of this.units.values()) {
      unit.buffs = unit.buffs.filter((b) => b.until > this.time && b.charges > 0);
      // 砕けた盾は、時間で張り直す
      for (const s of unit.shields) {
        if (s.ready || s.readyAt > this.time) continue;
        s.ready = true;
        this.events.push({ type: 'shieldReady', unitId: unit.id, name: shieldName(s) });
      }
    }

    this.updateAi();
    this.moveEnemies(dt);
    this.updateProjectiles(dt);
    this.processHits();
  }

  // ---- 敵の動き ----

  /** 敵の種類ごとの動き方で歩かせる。振りかぶり・硬直・昏倒の間は止まる */
  private moveEnemies(dt: number): void {
    const sec = dt / 1000;
    for (const unit of this.units.values()) {
      if (!unit.kind || unit.hp <= 0 || this.isBusy(unit) || this.isIncapacitated(unit)) continue;
      const def = enemyDef(unit.kind);
      if (def.behavior === 'stationary') continue;
      // 飛んでいる間は、間合いを取って周りを回る
      const flying = this.isAirborne(unit);
      const target = this.tacticTarget(unit);
      if (!target) continue;
      const dx = target.x - unit.x;
      const dy = target.y - unit.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      let mx = 0;
      let my = 0;
      if (this.hasStatusFlag(unit, 'flees')) {
        // 恐怖の間は背を向けて逃げる。背後から斬られやすい
        mx = -ux;
        my = -uy;
      } else if (!flying && (def.behavior === 'chase' || def.behavior === 'swarm')) {
        // 目安の技(なければ最初の技)が届く所まで寄る
        const reach = this.reachOf(unit, def.approach ?? def.skills[0]!) ?? 60;
        if (dist - target.radius > reach * 0.7) {
          mx = ux;
          my = uy;
          if (def.behavior === 'swarm') {
            // 群れは名前ごとに決まった側から回り込み、囲むように散る
            const side = (hashOf(unit.id) % 2 === 0 ? 1 : -1) * Math.min(1, dist / 300);
            mx += -uy * side * 0.6;
            my += ux * side * 0.6;
          }
        }
      } else {
        const keep = flying ? 320 : (def.keepAt ?? 300);
        if (dist < keep * 0.75) {
          mx = -ux;
          my = -uy;
        } else if (dist > keep * 1.1) {
          mx = ux;
          my = uy;
        } else {
          // 間合いの中では横へ歩いて、狙いを外させる
          const side = Math.sin(this.time / 1400 + hashOf(unit.id)) > 0 ? 1 : -1;
          mx = -uy * side * 0.5;
          my = ux * side * 0.5;
        }
        if (def.behavior === 'support') {
          // 一番近い仲間の、相手から見て陰へ寄る
          const ally = [...this.units.values()]
            .filter((u) => u !== unit && u.team === unit.team && u.kind && enemyDef(u.kind).behavior !== 'support')
            .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y))[0];
          if (ally) {
            const ax = ally.x - target.x;
            const ay = ally.y - target.y;
            const ad = Math.hypot(ax, ay) || 1;
            const gx = ally.x + (ax / ad) * 90 - unit.x;
            const gy = ally.y + (ay / ad) * 90 - unit.y;
            const gd = Math.hypot(gx, gy);
            if (gd > 30) {
              mx += (gx / gd) * 0.7;
              my += (gy / gd) * 0.7;
            }
          }
        }
      }
      // 仲間と重ならないよう押し合う
      for (const other of this.units.values()) {
        if (other === unit || other.team !== unit.team) continue;
        const ox = unit.x - other.x;
        const oy = unit.y - other.y;
        const od = Math.hypot(ox, oy);
        const min = unit.radius + other.radius + 4;
        if (od < min && od > 0.01) {
          mx += (ox / od) * ((min - od) / min) * 1.5;
          my += (oy / od) * ((min - od) / min) * 1.5;
        }
      }
      const len = Math.hypot(mx, my);
      if (len < 0.01) continue;
      const pace = (flying ? 1.6 : 1) * (unit.enraged ? (def.enrage?.speed ?? 1) : 1);
      const step = (def.speed * pace * this.statOf(unit, 'moveSpeed') * sec) / Math.max(1, len);
      unit.facing = Math.atan2(my, mx);
      let nx = unit.x + mx * step;
      let ny = unit.y + my * step;
      if (this.bounds) {
        nx = Math.min(this.bounds.width - unit.radius, Math.max(unit.radius, nx));
        ny = Math.min(this.bounds.height - unit.radius, Math.max(unit.radius, ny));
      }
      this.moveUnit(unit.id, nx, ny);
    }
  }

  /** 状態を消す(凍結を砕いたときなど)。固定された状態は消えない */
  private clearStatus(unit: Unit, status: StatusId): void {
    const st = unit.statuses[status];
    if (st.forced || st.activeUntil <= this.time) return;
    st.activeUntil = 0;
    this.events.push({ type: 'statusEnded', unitId: unit.id, status });
    this.onStatusExpired(unit, status);
  }

  /** 状態が切れたとき。呪縛は溜めた分をまとめて受け、死の宣告は倒れる */
  private onStatusExpired(unit: Unit, status: StatusId): void {
    const def = statusDef(status);
    const st = unit.statuses[status];
    if (def.leavesFloor?.on === 'end') this.leaveFloor(unit, status, def.leavesFloor);
    if (def.storesDamage && st.stored > 0) {
      const element = def.element ?? 'curse';
      this.enqueue({
        attackerId: st.activatorId,
        targetId: unit.id,
        element,
        power: st.stored,
        buildup: 0,
        tags: hitTags(element, ['status', 'bindRelease', ...def.tags]),
        skill: st.skill,
        source: `${def.name}の清算`,
        depth: st.depth,
        via: [...st.via, `${def.name}の清算`],
      });
      st.stored = 0;
      this.processHits();
    }
    if (def.lethalOnExpire) {
      this.events.push({ type: 'statusActivated', unitId: unit.id, status, source: `${def.name}が満ちた` });
      const killer = st.activatorId ? this.units.get(st.activatorId) : undefined;
      if (unit.mortal) this.kill(unit, killer);
      else this.fall(unit);
    }
  }

  /** 状態が足元に床を残す(出血の血だまり、解けた氷の水たまりなど) */
  private leaveFloor(unit: Unit, status: StatusId, floor: NonNullable<StatusDef['leavesFloor']>): void {
    this.addFloor(floor.field as FieldId, unit.x, unit.y, floor.radius, this.time + floor.duration, unit.statuses[status].activatorId);
  }

  /** 床の上の者に発動した状態で、床が変わる(水たまりが凍る、油が燃え跡になるなど) */
  private transformFloors(target: Unit, status: StatusId): void {
    for (const patch of this.floorsUnder(target)) {
      const into = fieldDef(patch.field).transforms?.find((t) => t.status === status)?.into as FieldId | undefined;
      if (!into) continue;
      const from = patch.field;
      patch.field = into;
      // 変わった床は、変わったときから数え直す
      if (patch.until !== undefined) patch.until = this.time + FLOOR_RULES.transformedDuration;
      this.events.push({ type: 'floorChanged', id: patch.id, from, to: into, x: patch.x, y: patch.y });
    }
  }

  /** 倒れて起き上がる(自分と案山子) */
  private fall(unit: Unit): void {
    unit.hp = unit.maxHp;
    unit.lastHurtAt = -Infinity;
    unit.falls += 1;
    // 自分の側は、起き上がるまで動けない。宿した儀式と力は失う(案山子はすぐ起き上がる。試し斬りの的なので)
    if (unit.team !== 'player') {
      this.events.push({ type: 'fell', unitId: unit.id });
      return;
    }
    unit.downUntil = this.time + FALL.downtime;
    unit.invulnerableUntil = Math.max(unit.invulnerableUntil, unit.downUntil);
    unit.rites = [];
    unit.buffs = [];
    unit.marks = {};
    this.pending = this.pending.filter((p) => p.unitId !== unit.id);
    unit.busyUntil = 0;
    unit.windupUntil = 0;
    this.events.push({ type: 'fell', unitId: unit.id });
  }

  /** 回復する。腐敗の間は回復がダメージになる */
  heal(unit: Unit, amount: number, src: Source = { skill: '', via: [], depth: 0 }): void {
    const value = amount * this.statOf(unit, 'healing');
    if (value <= 0) return;
    const rot = STATUS_IDS.find((s) => statusDef(s).reversesHealing && this.isActive(unit, s));
    if (rot) {
      const def = statusDef(rot);
      const st = unit.statuses[rot];
      const element = def.element ?? 'rot';
      this.enqueue({
        attackerId: st.activatorId,
        targetId: unit.id,
        element,
        power: value,
        buildup: 0,
        tags: hitTags(element, ['status', 'rotHeal', ...def.tags]),
        skill: src.skill || def.name,
        source: '腐れ癒し',
        depth: src.depth + 1,
        via: [...src.via, '腐れ癒し'],
      });
      return;
    }
    unit.hp = Math.min(unit.maxHp, unit.hp + value);
    this.events.push({ type: 'healed', unitId: unit.id, amount: value });
  }

  /** 届かせる必要のないスキルを、今使う意味があるか(敵の判断) */
  private worthUsing(unit: Unit, action: SkillAction): boolean {
    if (action.type === 'summon') {
      const alive = unit.minions.filter((id) => this.units.has(id)).length;
      if (alive >= action.max) return false;
      return !action.fromCorpse || this.floors.some((f) => f.field === 'corpse' && Math.hypot(f.x - unit.x, f.y - unit.y) <= action.radius);
    }
    if (action.type === 'healAllies') {
      return [...this.units.values()].some(
        (u) => u.team === unit.team && u.hp < u.maxHp * 0.85 && Math.hypot(u.x - unit.x, u.y - unit.y) <= action.radius,
      );
    }
    return true;
  }

  /** 敵を呼ぶ。死体から起こすなら、近い死体を起こして消す */
  private summon(unit: Unit, action: Extract<SkillAction, { type: 'summon' }>, skill: string): void {
    unit.minions = unit.minions.filter((id) => this.units.has(id));
    const room = Math.max(0, action.max - unit.minions.length);
    const corpses = action.fromCorpse
      ? this.floors
          .filter((f) => f.field === 'corpse' && Math.hypot(f.x - unit.x, f.y - unit.y) <= action.radius)
          .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y))
      : [];
    const count = Math.min(room, action.count, action.fromCorpse ? corpses.length : action.count);
    for (let i = 0; i < count; i++) {
      const corpse = corpses[i];
      const a = this.random() * Math.PI * 2;
      const at = corpse ?? { x: unit.x + Math.cos(a) * (unit.radius + action.radius), y: unit.y + Math.sin(a) * (unit.radius + action.radius) };
      if (corpse) this.floors = this.floors.filter((f) => f !== corpse);
      const id = `${unit.id}:${action.enemy}-${this.nextId++}`;
      this.spawnEnemy(action.enemy as EnemyId, id, at.x, at.y, unit.team, unit.level);
      unit.minions.push(id);
      this.events.push({ type: 'summoned', unitId: id, by: unit.id, x: at.x, y: at.y, skill });
    }
  }

  /** 盾が砕ける。属性つきの盾は、その属性で周りの相手へ弾ける */
  private breakShield(unit: Unit, shield: Unit['shields'][number], attacker: Unit, hit: Hit): void {
    const def = shieldDef(shield.type);
    shield.ready = false;
    shield.readyAt = this.time + def.recharge * this.statOf(unit, 'cooldown', ['shield']);
    const name = shieldName(shield);
    this.events.push({ type: 'shieldBroke', unitId: unit.id, name, readyAt: shield.readyAt });
    const element = shieldBurstElement(shield);
    if (element) {
      this.events.push({ type: 'nova', unitId: unit.id, x: unit.x, y: unit.y, radius: def.burst.radius, element });
      for (const other of this.opponentsOf(unit)) {
        if (Math.hypot(other.x - unit.x, other.y - unit.y) > def.burst.radius + other.radius) continue;
        this.enqueue({
          attackerId: unit.id,
          targetId: other.id,
          element,
          power: def.burst.power,
          buildup: def.burst.buildup,
          tags: hitTags(element, ['burst', 'shield']),
          skill: `${name}の砕け`,
          source: `${name}の砕け`,
          depth: 1,
          via: [],
        });
      }
    }
    this.react('shieldBreak', unit, attacker, hit);
  }

  /** 倒れて消える。倒れたときの効果(油溜まり・破裂)はここで起きる */
  private kill(unit: Unit, killer: Unit | undefined): void {
    if (!this.units.has(unit.id)) return;
    this.units.delete(unit.id);
    this.pending = this.pending.filter((p) => p.unitId !== unit.id);
    this.deaths.push({ unitId: unit.id, kind: unit.kind, team: unit.team, time: this.time });
    this.events.push({ type: 'died', unitId: unit.id, name: unit.name, kind: unit.kind, team: unit.team, x: unit.x, y: unit.y });
    // 死の宣告のまま倒れると、周りの仲間に呪縛を撒く
    const doomed = STATUS_IDS.find((s) => statusDef(s).lethalOnExpire && this.isActive(unit, s));
    if (doomed) {
      const bind = STATUS_IDS.find((s) => statusDef(s).storesDamage);
      for (const other of this.units.values()) {
        if (!bind || other.team !== unit.team || Math.hypot(other.x - unit.x, other.y - unit.y) > STATUS_RULES.doomSpreadRadius) continue;
        this.addBuildup(other, bind, statusDef(bind).max, { attacker: killer, skill: statusDef(doomed).name, via: [statusDef(doomed).name], depth: 1 });
      }
    }
    // 倒れた者は死体を残す。灰になって崩れた者は残らない
    if (!this.isActive(unit, 'ashen')) this.addFloor('corpse', unit.x, unit.y, FLOOR_RULES.corpse.radius, this.time + FLOOR_RULES.corpse.duration, killer?.id);
    const onDeath = unit.kind ? enemyDef(unit.kind).onDeath : undefined;
    if (!onDeath) return;
    if (onDeath.floor) this.addFloor(onDeath.floor.field, unit.x, unit.y, onDeath.floor.radius, this.time + onDeath.floor.duration, killer?.id);
    if (onDeath.burst) {
      const b = onDeath.burst;
      // 破裂は敵味方の区別なく当たる。倒した者の手柄にする
      for (const other of this.units.values()) {
        if (Math.hypot(other.x - unit.x, other.y - unit.y) > b.radius + other.radius) continue;
        this.enqueue({
          attackerId: killer?.id,
          targetId: other.id,
          element: b.element,
          power: b.power,
          buildup: b.buildup,
          tags: hitTags(b.element, ['burst', 'deathBurst']),
          skill: `${unit.name}の破裂`,
          source: `${unit.name}の破裂`,
          depth: 1,
          via: [],
        });
      }
    }
  }

  // ---- ヒットの解決 ----

  private opponentsOf(unit: Unit): Unit[] {
    // 狂気の間は、敵味方の区別なく当たる
    if (this.hasStatusFlag(unit, 'friendlyFire')) return [...this.units.values()].filter((u) => u !== unit);
    return [...this.units.values()].filter((u) => u.team !== unit.team);
  }

  private updateProjectiles(dt: number): void {
    const sec = dt / 1000;
    const alive: Projectile[] = [];
    for (const p of this.projectiles) {
      const owner = this.units.get(p.ownerId);
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      p.traveled += Math.hypot(p.vx, p.vy) * sec;
      const target =
        owner && this.opponentsOf(owner).find((u) => !p.struck?.includes(u.id) && Math.hypot(u.x - p.x, u.y - p.y) <= u.radius + p.radius);
      const pierce = p.resolved.action.type === 'projectile' ? (p.resolved.action.pierce ?? 0) : 0;
      if (owner && target) {
        this.queueAttack(owner, target, p.resolved, p.charge);
        // 杖の魔弾のように、当たると弾けて周りにも当たる
        const explode = p.resolved.action.type === 'projectile' ? p.resolved.action.explode : undefined;
        if (explode) {
          this.events.push({ type: 'explosion', x: p.x, y: p.y, radius: explode.radius, element: p.element });
          for (const other of this.opponentsOf(owner)) {
            if (other === target || Math.hypot(other.x - p.x, other.y - p.y) > explode.radius + other.radius) continue;
            this.queueAttack(owner, other, p.resolved, p.charge, explode.ratio);
          }
        }
        // 貫く弾は、同じ相手に二度当たらないよう覚えて飛び続ける
        p.struck = [...(p.struck ?? []), target.id];
        if (p.struck.length > pierce) this.events.push({ type: 'projectileEnd', projectileId: p.id, x: p.x, y: p.y, hit: true });
        else alive.push(p);
      } else if (!owner || p.traveled >= p.range) {
        this.events.push({ type: 'projectileEnd', projectileId: p.id, x: p.x, y: p.y, hit: false });
      } else {
        alive.push(p);
      }
    }
    this.projectiles = alive;
  }

  /** スキルの直撃と、付与による追撃を積む */
  /** 1回の攻撃で何体に当たったか。多く当てたときのルールを動かす */
  private onMultiHit(unit: Unit, landed: number, skill: string): void {
    if (landed === 0) return;
    const ctx = this.context(unit, unit, {});
    for (const { rule } of this.rulesFor(unit)) {
      if (rule.on !== 'multiHit' || landed < rule.min || !ruleMatches(rule, ctx)) continue;
      for (const action of rule.do) this.runAction(action, rule.label, unit, { attacker: unit, skill, via: [], depth: 0 });
    }
  }

  /** 近攻撃・周りに放つ技が誰にも当たらなかったとき。技に付くルールだけが動く */
  private onMiss(unit: Unit, def: ResolvedSkill): void {
    const ctx = this.context(unit, unit, { useIndex: def.useIndex });
    for (const rule of def.rules ?? []) {
      if (rule.on !== 'miss' || !ruleMatches(rule, ctx)) continue;
      for (const action of rule.do) this.runAction(action, rule.label, unit, { attacker: unit, skill: def.name, via: [], depth: 0 });
    }
  }

  /** scale は弾けた分のように、威力と蓄積を割り引くとき */
  private queueAttack(attacker: Unit, target: Unit, def: ResolvedSkill, charge?: number, scale = 1): void {
    const skillId = def.id;
    const action = def.action;
    if (action.type !== 'melee' && action.type !== 'projectile' && action.type !== 'barrage' && action.type !== 'nova') return;
    const element = skillElement(def);
    // 連撃のように、1回で何度も当たる技がある
    // 武器の技は手数を増やし、1回の当たりを分けて当てる(威力は分け、当てたときの効果が多く出る)
    const split = def.weapon ? WEAPON_HITS.split : 1;
    const hits = (action.type === 'melee' || action.type === 'nova' ? Math.max(1, action.hits ?? 1) : 1) * split;
    const strike = this.nextId++;
    for (let i = 0; i < hits; i++) {
      this.enqueue({
        attackerId: attacker.id,
        targetId: target.id,
        element,
        power: (action.power * scale) / split,
        // 蓄積は分けない。手数の分だけ状態が早く満ち、連鎖や燃え広がりが多く起きる
        buildup: action.buildup * scale,
        // 2回目からは multi を付ける。1回の技につき1度だけ効かせたいルールが見分ける
        tags: hitTags(element, [...def.tags, def.category, 'weapon', skillId, ...(i > 0 ? ['multi'] : [])]),
        skill: def.name,
        source: def.name,
        depth: 0,
        via: [],
        charge,
        rules: def.rules,
        useIndex: def.useIndex,
        strike,
        prev: def.prev,
        rites: def.rites,
      });
    }
    if (attacker.imbue && attacker.imbue.until > this.time) {
      const imbue = resolveSkill(attacker.imbue.skill, undefined, attacker.attributes);
      if (imbue && imbue.action.type === 'imbue') {
        const imbueElement = skillElement(imbue);
        this.enqueue({
          attackerId: attacker.id,
          targetId: target.id,
          element: imbueElement,
          power: action.power * imbue.action.ratio,
          buildup: imbue.action.buildup,
          tags: hitTags(imbueElement, [...imbue.tags, imbue.category, 'weapon', attacker.imbue.skill]),
          skill: imbue.name,
          source: imbue.name,
          depth: 0,
          via: [],
        });
      }
    }
  }

  private enqueue(hit: Hit): void {
    if (hit.depth > this.maxTriggerDepth) return;
    this.queue.push(hit);
  }

  private processHits(): void {
    // 連鎖の上限は enqueue で効くが、念のため1回の処理量にも上限を置く
    let guard = 10000;
    while (this.queue.length > 0 && guard-- > 0) {
      this.resolveHit(this.queue.shift()!);
    }
    this.queue = [];
  }

  private rulesFor(attacker: Unit | undefined): OwnedRule[] {
    const out: OwnedRule[] = [
      ...INTERACTIONS.map((rule) => ({ rule, kind: 'interaction' as const })),
      ...DEFENSE_RULES.map((rule) => ({ rule, kind: 'reaction' as const })),
    ];
    if (!attacker) return out;
    for (const id of attacker.passives) {
      for (const rule of passiveDef(id).rules ?? []) out.push({ rule, kind: 'passive' });
    }
    // 同じ条件文の2つ目からは、増えるヒットの威力も一部だけにする(与ダメージは multiplierOf で同じ名前ごとに割り引く)
    const copies = new Map<ConditionId, number>();
    for (const id of attacker.conditions) {
      const def = conditionDef(id);
      const n = copies.get(id) ?? 0;
      copies.set(id, n + 1);
      for (const rule of [def.rule, ...(def.extraRules ?? [])]) out.push({ rule: n > 0 ? repeatedRule(rule) : rule, kind: 'condition' });
    }
    for (const id of attacker.artifacts) {
      for (const rule of artifactDef(id).rules ?? []) out.push({ rule, kind: 'artifact' });
    }
    for (const rule of attacker.innateRules) out.push({ rule, kind: 'passive' });
    // 煤けた聖火のように、自分には効かせないルールを除く
    const ignored = this.traitsOf(attacker).ignoreRules;
    return ignored.length > 0 ? out.filter(({ rule }) => !ignored.includes(rule.label)) : out;
  }

  /** stat に効く補正値。パッシブ・装備・アーティファクトから集める */
  modifiersFor(unit: Unit | undefined, stat: StatId = 'damage'): Modifier[] {
    if (!unit) return [];
    const all: Modifier[] = [
      ...unit.passives.flatMap((id) => passiveDef(id).modifiers ?? []),
      ...unit.equipment.flatMap((item) => item.affixes.map(affixModifier)),
      ...unit.artifacts.flatMap((id) => artifactDef(id).modifiers ?? []),
      ...(unit.grip ? GRIPS[unit.grip].modifiers : []),
      // 敵のレベル
      ...levelModifiers(unit.level),
      ...unit.shields.flatMap((s) => shieldDef(s.type).modifiers ?? []),
      // 天候と、立っている床の補正(夜の闇、凍った床の滑りなど)
      ...(this.weather ? (fieldDef(this.weather).modifiers ?? []) : []),
      ...this.floorsUnder(unit).flatMap((f) => fieldDef(f.field).modifiers ?? []),
      // 発動中の状態の補正(露出・憤怒・鈍重など)と、蓄積だけで鈍る灰化
      ...STATUS_IDS.flatMap((s) => (this.isActive(unit, s) ? (statusDef(s).modifiers ?? []) : [])),
      ...STATUS_IDS.flatMap((s): Modifier[] => {
        const slow = statusDef(s).slowByBuildup;
        const ratio = unit.statuses[s].buildup / statusDef(s).max;
        return slow && ratio > 0 ? [{ stat: 'moveSpeed', tags: [], value: -slow * ratio, group: `slow:${s}` }] : [];
      }),
      // 能力値はキャラの基礎の強さとして効く
      ...(unit.attributes ? attributeModifiers(unit.attributes) : []),
    ];
    return all.filter((m) => (m.stat ?? 'damage') === stat);
  }

  /**
   * 能力の値。mult の項目は倍率(1 で補正なし)、add の項目は足した値を返す。
   * 条件つきの補正(on: 'stat' のルール)は、今の状態で満たしていれば含める
   */
  statOf(unit: Unit, stat: StatId, tags: Iterable<string> = []): number {
    const tagSet = new Set(tags);
    const mods = this.modifiersFor(unit, stat);
    const ctx = this.context(unit, unit, { hitTags: tagSet });
    const bonuses: RuleBonus[] = [];
    for (const { rule } of this.rulesFor(unit)) {
      if (rule.on !== 'stat' || rule.stat !== stat || !(rule.tags ?? []).every((t) => tagSet.has(t)) || !ruleMatches(rule, ctx)) continue;
      bonuses.push({ label: rule.label, add: rule.add });
    }
    if (statDef(stat).kind === 'add') {
      return mods.filter((m) => m.tags.every((t) => tagSet.has(t))).reduce((s, m) => s + m.value, 0) + bonuses.reduce((s, b) => s + b.add, 0);
    }
    return Math.max(statDef(stat).min ?? -Infinity, multiplierOf(mods, bonuses, tagSet));
  }

  /** アーティファクトの特別な効果をまとめる */
  traitsOf(unit: Unit | undefined): { ignoreRules: string[]; frontGuard: boolean; trail?: ArtifactTraits['trail']; meleeMinRange: number } {
    const out = { ignoreRules: [] as string[], frontGuard: false, trail: undefined as ArtifactTraits['trail'], meleeMinRange: 0 };
    for (const id of unit?.artifacts ?? []) {
      const t: ArtifactTraits = artifactDef(id).traits ?? {};
      out.ignoreRules.push(...(t.ignoreRules ?? []));
      out.frontGuard ||= !!t.frontGuard;
      out.trail ??= t.trail;
      out.meleeMinRange = Math.max(out.meleeMinRange, t.meleeMinRange ?? 0);
    }
    return out;
  }

  private context(target: Unit, attacker: Unit | undefined, extra: Partial<PredicateContext>): PredicateContext {
    return {
      targetHas: (s) => this.isActive(target, s),
      attackerHas: (s) => (attacker ? this.isActive(attacker, s) : false),
      weather: this.weather,
      attackerImbued: !!attacker?.imbue && attacker.imbue.until > this.time,
      attackerHasBuff: (label) => !!attacker?.buffs.some((b) => b.label === label && b.until > this.time && b.charges > 0),
      // 瀕死・無傷のように様子で決まるものは、かかっている状態の数に入れない
      targetStatusCount: () => COUNTED_STATUSES.filter((s) => this.isActive(target, s)).length,
      attackerStatusCount: () => (attacker ? COUNTED_STATUSES.filter((s) => this.isActive(attacker, s)).length : 0),
      attackerHpRatio: attacker ? attacker.hp / attacker.maxHp : 0,
      attackerStillFor: attacker ? this.time - attacker.lastMovedAt : 0,
      attackerFocus: attacker ? this.focusStacksOf(attacker) : 0,
      attackerMarks: (mark) => (attacker ? this.marksOf(attacker, mark) : 0),
      attackerCombo: attacker ? this.comboStacksOf(attacker) : 0,
      targetGap: attacker && attacker !== target ? Math.hypot(attacker.x - target.x, attacker.y - target.y) - attacker.radius - target.radius : 0,
      attackerTags: attacker?.tags ?? [],
      attackerUnhurt: attacker ? attacker.lastHurtAt === -Infinity : false,
      attackerShieldReady: !!attacker?.shields.some((s) => s.ready),
      targetBuildup: (s) => (this.isActive(target, s) ? 1 : target.statuses[s].buildup / statusDef(s).max),
      attackerOnFloor: (field) => !!attacker && this.floorsUnder(attacker).some((f) => f.field === field),
      attackerLastSkill: attacker?.history.at(-1)?.skill,
      attackerRites: attacker ? attacker.rites.filter((r) => r.until > this.time).length : 0,
      // 相手の向きの後ろ半分から攻めている
      fromBehind:
        !!attacker &&
        attacker !== target &&
        Math.abs(normalizeAngle(Math.atan2(attacker.y - target.y, attacker.x - target.x) - target.facing)) > (STATUS_RULES.behindArc * Math.PI) / 180,
      targetOnFloor: (field) => this.floors.some((f) => f.field === field && Math.hypot(target.x - f.x, target.y - f.y) <= f.radius),
      ...extra,
    };
  }

  private resolveHit(hit: Hit): void {
    const target = this.units.get(hit.targetId);
    if (!target) return;
    const attacker = hit.attackerId ? this.units.get(hit.attackerId) : undefined;
    const defended = this.defend(target, attacker, hit);
    if (defended === 'avoided') return;
    const rules: OwnedRule[] = [...this.rulesFor(attacker), ...(hit.rules ?? []).map((rule) => ({ rule, kind: 'skill' as const }))];

    const damageCtx = this.context(target, attacker, {
      hitTags: hit.tags,
      hitElement: hit.element,
      attackerLastElement: attacker?.lastElement,
      useIndex: hit.useIndex,
      prevStep: hit.prev,
      ritesReleased: hit.rites ?? 0,
    });
    const bonuses: RuleBonus[] = [];
    const qualifiers: string[] = [];
    const via = [...hit.via];
    for (const { rule, kind } of rules) {
      if (rule.on !== 'damage' || !ruleMatches(rule, damageCtx)) continue;
      const add = rule.perCharge
        ? rule.add * Math.min(rule.perCharge.max, Math.floor((hit.charge ?? 0) / rule.perCharge.every))
        : rule.perMark
          ? rule.add * (attacker ? this.marksOf(attacker, rule.perMark) : 0)
          : rule.add;
      if (add === 0) continue;
      bonuses.push({ label: rule.label, add, group: rule.group });
      if (kind === 'interaction') qualifiers.push(rule.label);
      else via.push(rule.label);
    }
    // 杖の魔力の高まり。コンボが続くほど、術のヒットが重くなる
    const growth = attacker ? this.comboGrowthOf(attacker) : undefined;
    if (attacker && growth && hit.tags.has(growth.tag)) {
      const stacks = this.comboStacksOf(attacker);
      if (stacks > 0) {
        bonuses.push({ label: growth.label, add: stacks * growth.perStack });
        via.push(growth.label);
      }
    }
    // 弓・銃・投石紐の狙いの締まり。同じ相手への直撃が続くほど重くなる(この一撃の後に1つ溜まる)
    const focus = attacker && hit.depth === 0 ? this.focusGrowthOf(attacker, hit.tags) : undefined;
    if (attacker && focus) {
      const same = attacker.focusTargetId === target.id && this.time - attacker.focusAt <= focus.window;
      if (!same) attacker.focusStacks = 0;
      if (attacker.focusStacks > 0) {
        bonuses.push({ label: focus.label, add: attacker.focusStacks * focus.perStack });
        via.push(focus.label);
      }
      attacker.focusStacks = Math.min(focus.max, attacker.focusStacks + 1);
      attacker.focusTargetId = target.id;
      attacker.focusAt = this.time;
    }
    for (const buff of attacker?.buffs ?? []) {
      if (buff.until <= this.time || !buff.tags.every((t) => hit.tags.has(t))) continue;
      // 回数は1回の当たりにつき1つ。手数で分けた残りのヒットにも乗る
      const sameStrike = hit.strike !== undefined && buff.strike === hit.strike;
      if (!sameStrike) {
        if (buff.charges <= 0) continue;
        buff.charges -= 1;
        buff.strike = hit.strike;
      }
      bonuses.push({ label: buff.label, add: buff.add });
      via.push(buff.label);
    }

    const raw = computeDamage({
      power: hit.power,
      hitTags: hit.tags,
      modifiers: this.modifiersFor(attacker),
      ruleBonuses: bonuses,
      resist: target.resist[hit.element],
    });
    const taken = raw * this.statOf(target, 'damageTaken', hit.tags);
    const amount = defended === 'guarded' ? taken * (1 - DEFENSE.guardReduction) : taken;
    if (defended === 'guarded') this.events.push({ type: 'guarded', unitId: target.id, blocked: taken - amount });
    target.hp -= amount;
    // 呪縛のように、受けたダメージを溜める状態
    if (!hit.tags.has('bindRelease')) {
      for (const s of STATUS_IDS) {
        const ratio = statusDef(s).storesDamage;
        if (ratio && this.isActive(target, s)) target.statuses[s].stored += amount * ratio;
      }
    }
    const record: DamageRecord = {
      time: this.time,
      attackerId: attacker?.id,
      attackerTeam: attacker?.team,
      targetId: target.id,
      targetTeam: target.team,
      skill: hit.skill,
      source: qualifiers.length > 0 ? `${hit.source}(${qualifiers.join('・')})` : hit.source,
      element: hit.element,
      amount,
      depth: hit.depth,
      via,
      qualifiers,
      tags: [...hit.tags],
      combos: matchCombos([...qualifiers, ...via], hit.tags),
      emphasized: hit.depth > 0 || bonuses.length > 0,
    };
    this.log.push(record);
    this.events.push({ type: 'damage', record, x: target.x, y: target.y });
    if (attacker && attacker.team !== target.team && record.combos.length > 0) this.onCombo(attacker, record.combos);
    if (target.hp <= 0 && target.mortal) {
      this.kill(target, attacker);
      return;
    }
    // 自分と案山子は、倒れても起き上がる
    if (target.hp <= 0) this.fall(target);
    if (attacker && hit.tags.has('weapon')) attacker.lastElement = hit.element;

    const source: Source = { attacker, skill: hit.skill, via: hit.via, depth: hit.depth, hit };
    const status = statusForElement(hit.element);
    if (status && hit.buildup > 0) {
      const buildup = hit.buildup * (attacker ? this.statOf(attacker, 'buildup', hit.tags) : 1);
      // 血の渇きは、当てた側に溜まる
      const holder = statusDef(status).buildsOnAttacker ? attacker : target;
      if (holder) this.addBuildup(holder, status, buildup, source);
    }

    // 渇いている者の直撃は、自分のHPを払い、出血した相手からは吸う
    if (attacker && hit.depth === 0 && hit.tags.has('attack')) {
      for (const s of STATUS_IDS) {
        const t = statusDef(s).thirst;
        if (!t || !this.isActive(attacker, s)) continue;
        attacker.hp = Math.max(1, attacker.hp - attacker.maxHp * t.selfCost);
        if (this.isActive(target, 'bleed')) this.heal(attacker, amount * t.leech, source);
      }
    }

    // 被弾したときのルール(棘の鎧、血の返礼など)。対象は攻撃してきた者
    if (attacker && attacker.team !== target.team && !hit.tags.has('dot') && amount > 0) {
      target.lastHurtAt = this.time;
      // 憤怒のように、被弾するたびに溜まる状態
      for (const s of STATUS_IDS) {
        const gain = statusDef(s).gainOnHurt;
        if (gain) this.addBuildup(target, s, gain, { attacker: target, skill: '', via: [], depth: hit.depth });
      }
      const hurtCtx = this.context(attacker, target, { hitTags: hit.tags, hitElement: hit.element });
      for (const { rule } of this.rulesFor(target)) {
        if (rule.on !== 'hurt' || !ruleMatches(rule, hurtCtx)) continue;
        const src: Source = { attacker: target, skill: rule.label, via: [rule.label], depth: hit.depth, hit, amount };
        for (const action of rule.do) this.runAction(action, rule.label, attacker, src);
      }
    }

    const hitCtx = this.context(target, attacker, { hitTags: hit.tags, hitElement: hit.element, useIndex: hit.useIndex, prevStep: hit.prev, ritesReleased: hit.rites ?? 0 });
    for (const { rule } of rules) {
      if (rule.on !== 'hit' || !ruleMatches(rule, hitCtx)) continue;
      for (const action of rule.do) this.runAction(action, rule.label, target, source);
    }
  }

  /**
   * 回避とガードの判定。'avoided' なら当たらない。
   * スキルの直撃だけがジャストの対象になる。継続ダメージは避けられない
   */
  private defend(target: Unit, attacker: Unit | undefined, hit: Hit): 'avoided' | 'guarded' | 'none' {
    if (hit.tags.has('dot')) return 'none';
    const direct = hit.tags.has('attack') && hit.depth === 0;

    // 盲目の者の攻撃は、ときどき外れる
    if (direct && attacker) {
      const miss = Math.max(0, ...STATUS_IDS.map((s) => (this.isActive(attacker, s) ? (statusDef(s).missChance ?? 0) : 0)));
      if (miss > 0 && this.random() < miss) {
        this.events.push({ type: 'missed', unitId: attacker.id, targetId: target.id });
        return 'avoided';
      }
    }
    // 加護は、次の直撃を1回だけ無効にして消える
    if (direct && attacker && attacker.team !== target.team) {
      const ward = STATUS_IDS.find((s) => statusDef(s).wardsOnce && this.isActive(target, s));
      if (ward) {
        this.clearStatus(target, ward);
        this.events.push({ type: 'warded', unitId: target.id, label: statusDef(ward).name });
        return 'avoided';
      }
    }

    // 見切りの心得のように、確率で自動に見切る・弾く
    if (direct && target.invulnerableUntil <= this.time) {
      const ctx = this.context(attacker ?? target, target, { hitTags: hit.tags, hitElement: hit.element });
      for (const { rule } of this.rulesFor(target)) {
        if (rule.on !== 'incoming' || !ruleMatches(rule, ctx) || this.random() >= rule.chance) continue;
        this.events.push({ type: rule.as, unitId: target.id, attackerId: attacker?.id, label: rule.label });
        this.react(rule.as, target, attacker, hit);
        return 'avoided';
      }
    }

    if (target.invulnerableUntil > this.time) {
      if (direct && !target.justDodged && this.time - target.dodgeStartedAt <= DEFENSE.justDodgeWindow) {
        target.justDodged = true;
        this.events.push({ type: 'justDodge', unitId: target.id, attackerId: attacker?.id });
        this.react('justDodge', target, attacker, hit);
      }
      return 'avoided';
    }

    // 苔むした大盾:正面からの直撃は全て防ぐ
    if (direct && attacker && this.traitsOf(target).frontGuard) {
      const from = Math.atan2(attacker.y - target.y, attacker.x - target.x);
      if (Math.abs(normalizeAngle(from - target.facing)) <= (DEFENSE.guardArc * Math.PI) / 180) {
        this.events.push({ type: 'guarded', unitId: target.id, blocked: hit.power });
        return 'avoided';
      }
    }

    // 盾:張られていれば、直撃を1回だけ防いで砕ける
    if (direct && attacker && attacker.team !== target.team) {
      const shield = target.shields.find((s) => s.ready && (shieldDef(s.type).blocks === 'any' || hit.tags.has('projectile')));
      if (shield) {
        this.breakShield(target, shield, attacker, hit);
        return 'avoided';
      }
    }

    if (target.guardSince === null || !direct) return 'none';
    const from = attacker ? Math.atan2(attacker.y - target.y, attacker.x - target.x) : target.facing;
    if (Math.abs(normalizeAngle(from - target.facing)) > (DEFENSE.guardArc * Math.PI) / 180) return 'none';
    if (target.guardIsFresh && this.time - target.guardSince <= DEFENSE.justGuardWindow) {
      this.events.push({ type: 'justGuard', unitId: target.id, attackerId: attacker?.id });
      this.react('justGuard', target, attacker, hit);
      return 'avoided';
    }
    return 'guarded';
  }

  /** ジャスト回避・ジャストガード・盾が砕けたときの見返り。defender が持ち主、attacker が対象 */
  private react(on: 'justDodge' | 'justGuard' | 'shieldBreak', defender: Unit, attacker: Unit | undefined, hit: Hit): void {
    const ctx = attacker
      ? this.context(attacker, defender, { hitTags: hit.tags, hitElement: hit.element })
      : this.context(defender, defender, {});
    const src: Source = { attacker: defender, skill: on === 'justDodge' ? 'ジャスト回避' : on === 'justGuard' ? 'ジャストガード' : '盾', via: [], depth: 0 };
    for (const { rule } of this.rulesFor(defender)) {
      if (rule.on !== on || !ruleMatches(rule, ctx)) continue;
      for (const action of rule.do) {
        if (action.type === 'grantBuff' || attacker) this.runAction(action, rule.label, attacker ?? defender, src);
      }
    }
  }

  /** 今の印の数。最後に得てから時間が経っていれば0 */
  marksOf(unit: Unit, mark: MarkId): number {
    const m = unit.marks[mark];
    if (!m) return 0;
    if (m.until <= this.time) {
      delete unit.marks[mark];
      return 0;
    }
    return m.count;
  }

  /** 印を得る。得たときのルール(別の印に変える札など)も働く。連鎖は上限の段まで */
  gainMark(unit: Unit, mark: MarkId, amount: number, depth = 0): void {
    const def = markDef(mark);
    const count = Math.min(def.max, this.marksOf(unit, mark) + amount);
    unit.marks[mark] = { count, until: this.time + def.duration };
    this.events.push({ type: 'marks', unitId: unit.id, mark, count });
    if (depth >= this.maxTriggerDepth) return;
    const ctx = this.context(unit, unit, {});
    for (const { rule } of this.rulesFor(unit)) {
      if (rule.on !== 'markGained' || rule.mark !== mark || !ruleMatches(rule, ctx)) continue;
      for (const action of rule.do) this.runAction(action, rule.label, unit, { attacker: unit, skill: rule.label, via: [rule.label], depth: depth + 1 });
    }
  }

  private runAction(action: Action, label: string, target: Unit, src: Source): void {
    const via = [...src.via, label];
    switch (action.type) {
      case 'clearStatus':
        this.clearStatus(target, action.status);
        break;
      case 'heal': {
        const unit = src.attacker ?? target;
        this.heal(unit, unit.maxHp * action.ratio, { ...src, via });
        break;
      }
      case 'repeatHit':
        if (src.hit) {
          for (let i = 0; i < (action.times ?? 1); i++) {
            this.enqueue({
              ...src.hit,
              power: src.hit.power * (action.power ?? 1),
              buildup: src.hit.buildup * (action.power ?? 1),
              tags: new Set([...src.hit.tags, 'repeat']),
              depth: src.depth + 1,
              via,
            });
          }
        }
        break;
      case 'applyBuildup': {
        const unit = action.to === 'attacker' ? src.attacker : target;
        if (unit) this.addBuildup(unit, action.status, action.amount, { ...src, via });
        break;
      }
      case 'strike':
        this.enqueue({
          attackerId: src.attacker?.id,
          targetId: target.id,
          element: action.element,
          power: action.power,
          buildup: action.buildup,
          tags: hitTags(action.element, [...(action.tags ?? []), 'strike']),
          skill: src.skill,
          source: label,
          depth: src.depth + 1,
          via,
        });
        break;
      case 'reflect':
        if (src.amount && src.amount > 0) {
          const element = src.hit?.element ?? 'slash';
          this.enqueue({
            attackerId: src.attacker?.id,
            targetId: target.id,
            element,
            power: src.amount * action.ratio,
            buildup: 0,
            tags: hitTags(element, ['reflect']),
            skill: label,
            source: label,
            depth: src.depth + 1,
            via,
          });
        }
        break;
      case 'cooldown': {
        const owner = src.attacker;
        if (!owner) break;
        for (const id of Object.keys(owner.cooldowns) as ActiveSkillId[]) {
          const def = this.skillFor(owner, id) ?? resolveSkill(id);
          const tags = new Set<string>([...(def?.tags ?? []), ...(def ? [def.category] : []), id]);
          if (!(action.tags ?? []).every((t) => tags.has(t))) continue;
          owner.cooldowns[id] = Math.max(this.time, (owner.cooldowns[id] ?? 0) - action.ms);
        }
        break;
      }
      case 'gainMark':
        if (src.attacker) this.gainMark(src.attacker, action.mark, action.amount, src.depth);
        break;
      case 'spendMarks': {
        const owner = src.attacker;
        if (!owner) break;
        const n = this.marksOf(owner, action.mark);
        if (n < (action.min ?? 1)) break;
        delete owner.marks[action.mark];
        this.events.push({ type: 'marks', unitId: owner.id, mark: action.mark, count: 0, spent: n, label });
        for (let i = 0; i < n; i++) for (const a of action.each ?? []) this.runAction(a, label, target, { ...src, via });
        break;
      }
      case 'grantBuff':
        if (src.attacker) {
          src.attacker.buffs.push({
            label: action.label,
            add: action.add,
            tags: action.tags,
            until: this.time + action.duration,
            charges: action.charges ?? Infinity,
          });
        }
        break;
    }
  }

  /** 状態の蓄積が止まるか。相互作用と攻撃者のルールに加え、かかる本人のルール(油を踏む者など)も見る */
  private isBlocked(unit: Unit, status: StatusId, attacker: Unit | undefined): boolean {
    const ctx = this.context(unit, attacker, { status });
    if (this.rulesFor(attacker).some(({ rule }) => rule.on === 'buildup' && ruleMatches(rule, ctx))) return true;
    if (unit === attacker) return false;
    const own = this.rulesFor(unit).filter(({ kind }) => kind !== 'interaction' && kind !== 'reaction');
    return own.some(({ rule }) => rule.on === 'buildup' && ruleMatches(rule, ctx));
  }

  private addBuildup(unit: Unit, status: StatusId, amount: number, src: Source): void {
    const def = statusDef(status);
    const st = unit.statuses[status];
    if (this.isBlocked(unit, status, src.attacker)) return;
    const active = this.isActive(unit, status);
    if (active && !def.refresh) return;
    // 大物は動きを止める状態が溜まりにくい
    if (def.incapacitates && unit.kind) amount *= enemyDef(unit.kind).poise ?? 1;
    st.buildup += amount;
    if (st.buildup < def.max) return;
    st.buildup = 0;
    if (active) {
      if (!st.forced) st.activeUntil = Math.max(st.activeUntil, this.time + def.duration);
      return;
    }
    this.activate(unit, status, src);
  }

  private activate(unit: Unit, status: StatusId, src: Source): void {
    const def = statusDef(status);
    const st = unit.statuses[status];
    const ctx = this.context(unit, src.attacker, { status });
    let durationScale = 1;
    let radiusScale = 1;
    const qualifiers: string[] = [];
    const triggered: { rule: Rule & { on: 'statusActivate' }; kind: RuleKind }[] = [];
    for (const { rule, kind } of this.rulesFor(src.attacker)) {
      if (rule.on !== 'statusActivate' || !ruleMatches(rule, ctx)) continue;
      if (rule.scale) {
        durationScale *= rule.scale.duration ?? 1;
        radiusScale *= rule.scale.radius ?? 1;
        if (kind === 'interaction') qualifiers.push(rule.label);
      }
      if (rule.do) triggered.push({ rule, kind });
    }

    const name = qualifiers.length > 0 ? `${def.name}(${qualifiers.join('・')})` : def.name;
    st.activeUntil = this.time + def.duration * durationScale;
    st.radiusScale = radiusScale;
    st.activatorId = src.attacker?.id;
    st.skill = src.skill || def.name;
    st.source = name;
    st.via = [...src.via];
    st.depth = src.depth + 1;
    st.nextTick = this.time + (def.dot?.interval ?? 0);
    st.moveAcc = 0;
    this.events.push({ type: 'statusActivated', unitId: unit.id, status, source: name });
    if (def.incapacitates) this.interrupt(unit);
    this.transformFloors(unit, status);
    if (def.leavesFloor?.on === 'activate') this.leaveFloor(unit, status, def.leavesFloor);

    for (const effect of def.onActivate ?? []) {
      if (effect.type === 'burst') {
        const radius = effect.radius * radiusScale;
        const targets = radius > 0 ? this.alliesWithin(unit, radius, true) : [unit];
        if (radius > 0) this.events.push({ type: 'burst', status, x: unit.x, y: unit.y, radius });
        for (const t of targets) this.enqueueStatusHit(unit, status, t, effect.power, effect.buildup ?? 0, []);
      } else {
        const targets = this.alliesWithin(unit, effect.radius * radiusScale, false).slice(0, effect.count);
        for (const t of targets) {
          this.events.push({ type: 'chain', status, from: { x: unit.x, y: unit.y }, to: { x: t.x, y: t.y } });
          this.enqueueStatusHit(unit, status, t, effect.power, effect.buildup, ['chain']);
        }
      }
    }

    for (const { rule } of triggered) {
      for (const action of rule.do ?? []) this.runAction(action, rule.label, unit, src);
    }
  }

  /** 近い順に並べた、unit の仲間 */
  private alliesWithin(unit: Unit, radius: number, includeSelf: boolean): Unit[] {
    return [...this.units.values()]
      .filter((u) => u.team === unit.team && (includeSelf || u !== unit))
      .map((u) => ({ u, d: Math.hypot(u.x - unit.x, u.y - unit.y) }))
      .filter(({ d }) => d <= radius)
      .sort((a, b) => a.d - b.d)
      .map(({ u }) => u);
  }

  /** holder にかかった状態が target に与えるヒットを積む */
  private enqueueStatusHit(holder: Unit, status: StatusId, target: Unit, power: number, buildup: number, extraTags: string[]): void {
    const def = statusDef(status);
    if (!def.element) return;
    const st = holder.statuses[status];
    this.enqueue({
      attackerId: st.activatorId,
      targetId: target.id,
      element: def.element,
      power,
      buildup,
      tags: hitTags(def.element, ['status', ...def.tags, ...extraTags]),
      skill: st.skill,
      source: st.source,
      depth: st.depth,
      via: st.via,
    });
  }
}

function hitTags(element: ElementId, extra: readonly string[]): Set<string> {
  return new Set([element, ...ELEMENTS[element].tags, ...extra]);
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** そのスキルが溜める状態。属性・変化や武器のルール・付与・天候・床から */
function appliedStatuses(def: ResolvedSkill): StatusId[] {
  const out = new Set<StatusId>();
  const a = def.action;
  if (a.type === 'weather' || a.type === 'floor') {
    const applies = fieldDef(a.field).applies;
    if (applies) out.add(applies.status);
  } else if (a.type === 'selfCare') {
    if (a.status) out.add(a.status);
  } else if (def.element) {
    const s = statusForElement(def.element);
    if (s && ('buildup' in a ? a.buildup > 0 : true)) out.add(s);
  }
  for (const rule of def.rules ?? []) {
    if (rule.on !== 'hit') continue;
    for (const act of rule.do) if (act.type === 'applyBuildup') out.add(act.status);
  }
  return [...out];
}

/** 数に入れる状態。蓄積でかかるもの */
const COUNTED_STATUSES = STATUS_IDS.filter((s) => !statusDef(s).derived);

/** 名前から決まる小さな数。群れの散り方などを個体ごとにずらす */
function hashOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const repeatedRules = new WeakMap<Rule, Rule>();

/** 重ねた条件文のルール。増えるヒットの威力を STACKING.repeatWeight 倍にする */
function repeatedRule(rule: Rule): Rule {
  if (rule.on !== 'hit') return rule;
  let r = repeatedRules.get(rule);
  if (!r) {
    r = { ...rule, do: rule.do.map((a) => (a.type === 'repeatHit' ? { ...a, power: (a.power ?? 1) * STACKING.repeatWeight } : a)) };
    repeatedRules.set(rule, r);
  }
  return r;
}
