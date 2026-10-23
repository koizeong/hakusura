import { DEFENSE, MAX_TRIGGER_DEPTH } from './constants';
import { computeDamage, type RuleBonus } from './damage';
import { ELEMENTS, ELEMENT_IDS, type ElementId } from './data/elements';
import { fieldDef, type FieldId } from './data/fields';
import { STATUS_IDS, statusDef, statusForElement, type StatusId } from './data/statuses';
import { activeSkillDef, skillElement, skillReach, type ActiveSkillId } from './data/skills';
import { TACTIC_CONDITIONS, type Tactic } from './data/tactics';
import { matchCombos, type ComboId } from './data/combos';
import { passiveDef, type PassiveId } from './data/passives';
import { conditionDef, type ConditionId } from './data/conditions';
import { INTERACTIONS } from './data/interactions';
import { DEFENSE_RULES } from './data/defense';
import { evaluatePredicate, ruleMatches, type Action, type Modifier, type PredicateContext, type Rule } from './rules';

export type Team = 'player' | 'enemy';

export interface StatusState {
  buildup: number;
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
}

export interface Buff {
  label: string;
  add: number;
  tags: readonly string[];
  until: number;
  charges: number;
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
}

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
  | { type: 'windup'; unitId: string; skill: ActiveSkillId; angle: number; at: number }
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
  | { type: 'fell'; unitId: string };

export interface Projectile {
  id: number;
  ownerId: string;
  skill: ActiveSkillId;
  element: ElementId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  traveled: number;
  range: number;
}

export interface FloorPatch {
  id: number;
  field: FieldId;
  x: number;
  y: number;
  radius: number;
  /** この時刻に消える。なければ消えない */
  until?: number;
}

interface Source {
  attacker?: Unit;
  skill: string;
  via: readonly string[];
  depth: number;
  hit?: Hit;
}

type RuleKind = 'interaction' | 'reaction' | 'passive' | 'condition';

interface PendingAction {
  unitId: string;
  skill: ActiveSkillId;
  at: number;
  angle: number;
  /** 指定があれば、効果が出る瞬間にこの相手へ向き直す(ターゲット固定) */
  targetId?: string;
}
interface OwnedRule {
  rule: Rule;
  kind: RuleKind;
}

export interface WorldOptions {
  maxTriggerDepth?: number;
  /** 乱数の種 */
  seed?: number;
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

  private events: CombatEvent[] = [];
  private queue: Hit[] = [];
  private pending: PendingAction[] = [];
  private nextId = 1;
  private seed: number;

  constructor(options: WorldOptions = {}) {
    this.maxTriggerDepth = options.maxTriggerDepth ?? MAX_TRIGGER_DEPTH;
    this.seed = options.seed ?? 1;
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
        { buildup: 0, activeUntil: 0, forced: false, radiusScale: 1, skill: '', source: '', via: [], depth: 0, nextTick: 0, moveAcc: 0 },
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
    };
    this.units.set(unit.id, unit);
    return unit;
  }

  addFloor(field: FieldId, x: number, y: number, radius: number, until?: number): FloorPatch {
    const patch: FloorPatch = { id: this.nextId++, field, x, y, radius, until };
    this.floors.push(patch);
    return patch;
  }

  isActive(unit: Unit, status: StatusId): boolean {
    const st = unit.statuses[status];
    return st.forced || st.activeUntil > this.time;
  }

  drainEvents(): CombatEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  resetLog(): void {
    this.log = [];
  }

  setInvulnerable(unitId: string, ms: number): void {
    const unit = this.units.get(unitId);
    if (unit) unit.invulnerableUntil = Math.max(unit.invulnerableUntil, this.time + ms);
  }

  /** 試し斬り場用。状態を固定でかける・外す */
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
    return STATUS_IDS.some((s) => statusDef(s).incapacitates && this.isActive(unit, s));
  }

  /** 振りかぶりか硬直の最中 */
  isBusy(unit: Unit): boolean {
    return unit.busyUntil > this.time;
  }

  canUseSkill(unitId: string, skillId: ActiveSkillId): boolean {
    const unit = this.units.get(unitId);
    return (
      !!unit &&
      (unit.cooldowns[skillId] ?? 0) <= this.time &&
      !this.isBusy(unit) &&
      unit.guardSince === null &&
      !this.isIncapacitated(unit)
    );
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
  dodge(unitId: string): boolean {
    const unit = this.units.get(unitId);
    if (!unit || !this.canDodge(unitId)) return false;
    unit.busyUntil = this.time;
    unit.dodgeStartedAt = this.time;
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
    const def = activeSkillDef(skillId);
    unit.cooldowns[skillId] = this.time + def.cooldown;
    unit.windupUntil = this.time + def.windup;
    unit.busyUntil = this.time + def.windup + def.recovery;
    const angle = Math.atan2(aim.y - unit.y, aim.x - unit.x);
    unit.facing = angle;
    const action: PendingAction = { unitId, skill: skillId, at: this.time + def.windup, angle, targetId };
    this.events.push({ type: 'windup', unitId, skill: skillId, angle, at: action.at });
    if (def.windup <= 0) this.executeSkill(action);
    else this.pending.push(action);
    return true;
  }

  private executeSkill(pending: PendingAction): void {
    const unit = this.units.get(pending.unitId);
    if (!unit || this.isIncapacitated(unit)) return;
    const def = activeSkillDef(pending.skill);
    const target = pending.targetId ? this.units.get(pending.targetId) : undefined;
    const angle = target ? Math.atan2(target.y - unit.y, target.x - unit.x) : pending.angle;
    unit.facing = angle;
    const action = def.action;
    switch (action.type) {
      case 'melee': {
        this.events.push({
          type: 'swing',
          unitId: unit.id,
          x: unit.x,
          y: unit.y,
          angle,
          range: action.range,
          arc: action.arc,
          element: skillElement(def),
        });
        const half = (action.arc * Math.PI) / 360;
        const reaches = (other: Unit, at: Point) => {
          const dx = at.x - unit.x;
          const dy = at.y - unit.y;
          const dist = Math.hypot(dx, dy);
          if (dist > action.range + other.radius) return false;
          const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - angle));
          return dist <= unit.radius + other.radius || diff <= half;
        };
        for (const other of this.opponentsOf(unit)) {
          // 回避で範囲の外へ抜けていても、避け始めた位置に当たるならジャスト回避の判定に回す
          const justDodging = this.time - other.dodgeStartedAt <= DEFENSE.justDodgeWindow && reaches(other, other.dodgeOrigin);
          if (reaches(other, other) || justDodging) this.queueAttack(unit, other, pending.skill);
        }
        if (action.clearsProjectiles) {
          this.projectiles = this.projectiles.filter((p) => {
            const owner = this.units.get(p.ownerId);
            if (!owner || owner.team === unit.team) return true;
            const dx = p.x - unit.x;
            const dy = p.y - unit.y;
            const inArc = Math.hypot(dx, dy) <= action.range + p.radius && Math.abs(normalizeAngle(Math.atan2(dy, dx) - angle)) <= half;
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
            element,
            x: unit.x + Math.cos(a) * unit.radius,
            y: unit.y + Math.sin(a) * unit.radius,
            vx: Math.cos(a) * action.speed,
            vy: Math.sin(a) * action.speed,
            radius: action.radius,
            traveled: 0,
            range: action.range,
          });
        }
        break;
      }
      case 'projectile': {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        this.projectiles.push({
          id: this.nextId++,
          ownerId: unit.id,
          skill: pending.skill,
          element: skillElement(def),
          x: unit.x + cos * unit.radius,
          y: unit.y + sin * unit.radius,
          vx: cos * action.speed,
          vy: sin * action.speed,
          radius: action.radius,
          traveled: 0,
          range: action.range,
        });
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
        for (const other of this.opponentsOf(unit)) {
          if (Math.hypot(other.x - unit.x, other.y - unit.y) <= action.radius + other.radius) this.queueAttack(unit, other, pending.skill);
        }
        this.processHits();
        break;
      }
      case 'floor': {
        const at = target ?? { x: unit.x + Math.cos(angle) * 200, y: unit.y + Math.sin(angle) * 200 };
        this.addFloor(action.field, at.x, at.y, action.radius, this.time + action.duration);
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
    const def = activeSkillDef(tactic.skill);
    if (skillReach(def) !== undefined && !target) return false;
    const ctx = this.context(target ?? unit, unit, {});
    return TACTIC_CONDITIONS[tactic.condition].when.every((p) => evaluatePredicate(p, ctx));
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
      const reach = skillReach(activeSkillDef(tactic.skill));
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
    const reach = skillReach(activeSkillDef(unit.queued.skill));
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
    for (const tactic of unit.tactics) {
      if (!this.tacticReady(unit, tactic, target)) continue;
      const reach = skillReach(activeSkillDef(tactic.skill));
      if (reach !== undefined && (!target || !this.inReach(unit, target, reach))) continue;
      const aim = target ?? { x: unit.x + Math.cos(unit.facing), y: unit.y + Math.sin(unit.facing) };
      if (this.useSkill(unit.id, tactic.skill, aim, reach !== undefined ? target?.id : undefined)) return;
    }
  }

  private updateAi(): void {
    for (const unit of this.units.values()) {
      if (unit.autoBattle) this.runTactics(unit);
      if (!unit.ai?.enabled) continue;
      for (const skill of unit.ai.skills) {
        if (!this.canUseSkill(unit.id, skill)) continue;
        const reach = skillReach(activeSkillDef(skill)) ?? 0;
        const target = this.opponentsOf(unit)
          .map((u) => ({ u, d: Math.hypot(u.x - unit.x, u.y - unit.y) - u.radius }))
          .filter(({ d }) => d <= reach * 0.9)
          .sort((a, b) => a.d - b.d)[0]?.u;
        // 敵の振りかぶりは向きを決め打ちにする。見てから横へ避けられるように
        if (target && this.useSkill(unit.id, skill, target)) break;
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
      if (this.weather) {
        const applies = fieldDef(this.weather).applies;
        this.addBuildup(unit, applies.status, applies.perSec * sec, { skill: '', via: [], depth: 0 });
      }
      for (const patch of this.floors) {
        if (Math.hypot(unit.x - patch.x, unit.y - patch.y) > patch.radius) continue;
        const applies = fieldDef(patch.field).applies;
        this.addBuildup(unit, applies.status, applies.perSec * sec, { skill: '', via: [], depth: 0 });
      }

      for (const status of STATUS_IDS) {
        const def = statusDef(status);
        const st = unit.statuses[status];
        st.buildup = Math.max(0, st.buildup - def.decayPerSec * sec);
        if (!this.isActive(unit, status)) {
          if (st.activeUntil > 0) {
            st.activeUntil = 0;
            this.events.push({ type: 'statusEnded', unitId: unit.id, status });
          }
          continue;
        }
        if (!st.forced && this.isBlocked(unit, status, undefined)) {
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

    for (const unit of this.units.values()) unit.buffs = unit.buffs.filter((b) => b.until > this.time && b.charges > 0);

    this.updateAi();
    this.updateProjectiles(dt);
    this.processHits();
  }

  // ---- ヒットの解決 ----

  private opponentsOf(unit: Unit): Unit[] {
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
      const target = owner && this.opponentsOf(owner).find((u) => Math.hypot(u.x - p.x, u.y - p.y) <= u.radius + p.radius);
      if (owner && target) {
        this.queueAttack(owner, target, p.skill);
        this.events.push({ type: 'projectileEnd', projectileId: p.id, x: p.x, y: p.y, hit: true });
      } else if (!owner || p.traveled >= p.range) {
        this.events.push({ type: 'projectileEnd', projectileId: p.id, x: p.x, y: p.y, hit: false });
      } else {
        alive.push(p);
      }
    }
    this.projectiles = alive;
  }

  /** スキルの直撃と、付与による追撃を積む */
  private queueAttack(attacker: Unit, target: Unit, skillId: ActiveSkillId): void {
    const def = activeSkillDef(skillId);
    const action = def.action;
    if (action.type !== 'melee' && action.type !== 'projectile' && action.type !== 'barrage' && action.type !== 'nova') return;
    const element = skillElement(def);
    this.enqueue({
      attackerId: attacker.id,
      targetId: target.id,
      element,
      power: action.power,
      buildup: action.buildup,
      tags: hitTags(element, [...def.tags, def.category, 'weapon', skillId]),
      skill: def.name,
      source: def.name,
      depth: 0,
      via: [],
    });
    if (attacker.imbue && attacker.imbue.until > this.time) {
      const imbue = activeSkillDef(attacker.imbue.skill);
      if (imbue.action.type === 'imbue') {
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
    for (const id of attacker.conditions) out.push({ rule: conditionDef(id).rule, kind: 'condition' });
    return out;
  }

  private modifiersFor(attacker: Unit | undefined): Modifier[] {
    if (!attacker) return [];
    return attacker.passives.flatMap((id) => passiveDef(id).modifiers ?? []);
  }

  private context(target: Unit, attacker: Unit | undefined, extra: Partial<PredicateContext>): PredicateContext {
    return {
      targetHas: (s) => this.isActive(target, s),
      attackerHas: (s) => (attacker ? this.isActive(attacker, s) : false),
      weather: this.weather,
      attackerImbued: !!attacker?.imbue && attacker.imbue.until > this.time,
      attackerHasBuff: (label) => !!attacker?.buffs.some((b) => b.label === label && b.until > this.time && b.charges > 0),
      ...extra,
    };
  }

  private resolveHit(hit: Hit): void {
    const target = this.units.get(hit.targetId);
    if (!target) return;
    const attacker = hit.attackerId ? this.units.get(hit.attackerId) : undefined;
    const defended = this.defend(target, attacker, hit);
    if (defended === 'avoided') return;
    const rules = this.rulesFor(attacker);

    const damageCtx = this.context(target, attacker, {
      hitTags: hit.tags,
      hitElement: hit.element,
      attackerLastElement: attacker?.lastElement,
    });
    const bonuses: RuleBonus[] = [];
    const qualifiers: string[] = [];
    const via = [...hit.via];
    for (const { rule, kind } of rules) {
      if (rule.on !== 'damage' || !ruleMatches(rule, damageCtx)) continue;
      bonuses.push({ label: rule.label, add: rule.add });
      if (kind === 'interaction') qualifiers.push(rule.label);
      else via.push(rule.label);
    }
    for (const buff of attacker?.buffs ?? []) {
      if (buff.until <= this.time || buff.charges <= 0 || !buff.tags.every((t) => hit.tags.has(t))) continue;
      buff.charges -= 1;
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
    const amount = defended === 'guarded' ? raw * (1 - DEFENSE.guardReduction) : raw;
    if (defended === 'guarded') this.events.push({ type: 'guarded', unitId: target.id, blocked: raw - amount });
    target.hp -= amount;
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
    if (target.hp <= 0) {
      // 試作では倒れても起き上がる
      target.hp = target.maxHp;
      this.events.push({ type: 'fell', unitId: target.id });
    }
    if (attacker && hit.tags.has('weapon')) attacker.lastElement = hit.element;

    const source: Source = { attacker, skill: hit.skill, via: hit.via, depth: hit.depth, hit };
    const status = statusForElement(hit.element);
    if (status && hit.buildup > 0) this.addBuildup(target, status, hit.buildup, source);

    const hitCtx = this.context(target, attacker, { hitTags: hit.tags, hitElement: hit.element });
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

  /** ジャスト回避・ジャストガードの見返り。defender が持ち主、attacker が対象 */
  private react(on: 'justDodge' | 'justGuard', defender: Unit, attacker: Unit | undefined, hit: Hit): void {
    const ctx = attacker
      ? this.context(attacker, defender, { hitTags: hit.tags, hitElement: hit.element })
      : this.context(defender, defender, {});
    const src: Source = { attacker: defender, skill: on === 'justDodge' ? 'ジャスト回避' : 'ジャストガード', via: [], depth: 0 };
    for (const { rule } of this.rulesFor(defender)) {
      if (rule.on !== on || !ruleMatches(rule, ctx)) continue;
      for (const action of rule.do) {
        if (action.type === 'grantBuff' || attacker) this.runAction(action, rule.label, attacker ?? defender, src);
      }
    }
  }

  private runAction(action: Action, label: string, target: Unit, src: Source): void {
    const via = [...src.via, label];
    switch (action.type) {
      case 'repeatHit':
        if (src.hit) this.enqueue({ ...src.hit, tags: new Set([...src.hit.tags, 'repeat']), depth: src.depth + 1, via });
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

  private isBlocked(unit: Unit, status: StatusId, attacker: Unit | undefined): boolean {
    const ctx = this.context(unit, attacker, { status });
    return this.rulesFor(attacker).some(({ rule }) => rule.on === 'buildup' && ruleMatches(rule, ctx));
  }

  private addBuildup(unit: Unit, status: StatusId, amount: number, src: Source): void {
    const def = statusDef(status);
    const st = unit.statuses[status];
    if (this.isBlocked(unit, status, src.attacker)) return;
    const active = this.isActive(unit, status);
    if (active && !def.refresh) return;
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
