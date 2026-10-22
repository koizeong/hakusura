import { MAX_TRIGGER_DEPTH } from './constants';
import { computeDamage, type RuleBonus } from './damage';
import { ELEMENTS, ELEMENT_IDS, type ElementId } from './data/elements';
import { fieldDef, type FieldId } from './data/fields';
import { STATUS_IDS, statusDef, statusForElement, type StatusId } from './data/statuses';
import { activeSkillDef, type ActiveSkillId } from './data/skills';
import { passiveDef, type PassiveId } from './data/passives';
import { conditionDef, type ConditionId } from './data/conditions';
import { INTERACTIONS } from './data/interactions';
import { ruleMatches, type Action, type Modifier, type PredicateContext, type Rule } from './rules';

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
  passives: PassiveId[];
  conditions: ConditionId[];
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
  | { type: 'imbue'; unitId: string; element: ElementId; until: number }
  | { type: 'projectileEnd'; projectileId: number; x: number; y: number; hit: boolean }
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
}

interface Source {
  attacker?: Unit;
  skill: string;
  via: readonly string[];
  depth: number;
  hit?: Hit;
}

type RuleKind = 'interaction' | 'passive' | 'condition';
interface OwnedRule {
  rule: Rule;
  kind: RuleKind;
}

export interface WorldOptions {
  maxTriggerDepth?: number;
}

/**
 * 戦闘の状態とその進め方。描画には依存しない。
 * 時間はミリ秒。自キャラの移動は外から moveUnit で渡す
 */
export class CombatWorld {
  time = 0;
  weather: FieldId | null = null;
  floors: FloorPatch[] = [];
  readonly units = new Map<string, Unit>();
  projectiles: Projectile[] = [];
  log: DamageRecord[] = [];
  readonly maxTriggerDepth: number;

  private events: CombatEvent[] = [];
  private queue: Hit[] = [];
  private nextId = 1;

  constructor(options: WorldOptions = {}) {
    this.maxTriggerDepth = options.maxTriggerDepth ?? MAX_TRIGGER_DEPTH;
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
      passives: spec.passives ?? [],
      conditions: spec.conditions ?? [],
    };
    this.units.set(unit.id, unit);
    return unit;
  }

  addFloor(field: FieldId, x: number, y: number, radius: number): FloorPatch {
    const patch = { id: this.nextId++, field, x, y, radius };
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

  canUseSkill(unitId: string, skillId: ActiveSkillId): boolean {
    const unit = this.units.get(unitId);
    return !!unit && (unit.cooldowns[skillId] ?? 0) <= this.time;
  }

  useSkill(unitId: string, skillId: ActiveSkillId, aim: Point): boolean {
    const unit = this.units.get(unitId);
    if (!unit || !this.canUseSkill(unitId, skillId)) return false;
    const def = activeSkillDef(skillId);
    unit.cooldowns[skillId] = this.time + def.cooldown;
    const angle = Math.atan2(aim.y - unit.y, aim.x - unit.x);
    const action = def.action;
    switch (action.type) {
      case 'melee': {
        this.events.push({
          type: 'swing',
          unitId,
          x: unit.x,
          y: unit.y,
          angle,
          range: action.range,
          arc: action.arc,
          element: def.element,
        });
        const half = (action.arc * Math.PI) / 360;
        for (const target of this.opponentsOf(unit)) {
          const dx = target.x - unit.x;
          const dy = target.y - unit.y;
          const dist = Math.hypot(dx, dy);
          if (dist > action.range + target.radius) continue;
          const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - angle));
          if (dist > unit.radius + target.radius && diff > half) continue;
          this.queueAttack(unit, target, skillId);
        }
        this.processHits();
        break;
      }
      case 'projectile': {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        this.projectiles.push({
          id: this.nextId++,
          ownerId: unitId,
          skill: skillId,
          element: def.element,
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
        unit.imbue = { skill: skillId, until: this.time + action.duration };
        this.events.push({ type: 'imbue', unitId, element: def.element, until: unit.imbue.until });
        break;
      }
    }
    return true;
  }

  update(dt: number): void {
    this.time += dt;
    const sec = dt / 1000;

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
    if (action.type === 'imbue') return;
    this.enqueue({
      attackerId: attacker.id,
      targetId: target.id,
      element: def.element,
      power: action.power,
      buildup: action.buildup,
      tags: hitTags(def.element, [...def.tags, def.category, 'weapon', skillId]),
      skill: def.name,
      source: def.name,
      depth: 0,
      via: [],
    });
    if (attacker.imbue && attacker.imbue.until > this.time) {
      const imbue = activeSkillDef(attacker.imbue.skill);
      if (imbue.action.type === 'imbue') {
        this.enqueue({
          attackerId: attacker.id,
          targetId: target.id,
          element: imbue.element,
          power: action.power * imbue.action.ratio,
          buildup: imbue.action.buildup,
          tags: hitTags(imbue.element, [...imbue.tags, imbue.category, 'weapon', attacker.imbue.skill]),
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
    const out: OwnedRule[] = INTERACTIONS.map((rule) => ({ rule, kind: 'interaction' as const }));
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
      ...extra,
    };
  }

  private resolveHit(hit: Hit): void {
    const target = this.units.get(hit.targetId);
    if (!target) return;
    if (!hit.tags.has('dot') && target.invulnerableUntil > this.time) return;
    const attacker = hit.attackerId ? this.units.get(hit.attackerId) : undefined;
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

    const amount = computeDamage({
      power: hit.power,
      hitTags: hit.tags,
      modifiers: this.modifiersFor(attacker),
      ruleBonuses: bonuses,
      resist: target.resist[hit.element],
    });
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
