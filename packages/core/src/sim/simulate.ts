import { CombatWorld, type Unit } from '../world';
import { applyBuild, lootFit, type Build } from '../build';
import { Encounter } from '../encounter';
import type { EncounterId } from '../data/encounters';
import { generateItem, type Item } from '../data/equipment';
import { dealtBy, summarize } from '../breakdown';
import { comboDef } from '../data/combos';
import { measureBuildPower } from '../expedition';
import { measureLoadout, recommendNow } from '../loadout';
import { actionReach, type ActiveSkillId } from '../data/skills';
import { STEP } from '../constants';

/**
 * 調整用のシミュレーター。ビルドを入力なしで戦わせ、強さの傾向を数字で見る。
 * 一戦では、プレイヤーの足の代わりに「操り手」が歩く:届く間合いへ寄り、敵の弾と予兆から逃げる
 */

/** 試し斬り場の自分と同じ。最大HPのもとと、自動の時の歩く速さ */
export const SIM_PLAYER = { maxHp: 300, radius: 8, moveSpeed: 330 } as const;

const ARENA = { width: 1600, height: 1000 };

/**
 * ビルドに防具と装飾品を揃える。同じ種から count 個の拾い物(ビルドに寄せる)を作り、
 * おすすめの組み合わせを選ぶ。武器の枠はビルドのまま
 */
export function outfit(build: Build, count = 80, seed = 7): Build {
  const w = new CombatWorld({ seed });
  const fit = lootFit(build);
  const stash: Item[] = [];
  while (stash.length < count) {
    const item = generateItem(() => w.random(), { fit });
    if (item.kind !== 'weapon') stash.push(item);
  }
  return recommendNow(build, stash);
}

/** 1体の硬い案山子を斬り続けたときの DPS */
export function singleTargetDps(build: Build, seconds = 30, seed = 1): number {
  const w = new CombatWorld({ seed });
  const p = w.addUnit({ id: 'p', name: '試し', team: 'player', x: 0, y: 0, maxHp: 1e9, autoBattle: true });
  applyBuild(w, p, build);
  w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 70, y: 0, maxHp: 1e9 });
  if (p.trump) w.queueSkill('p', p.trump, 5000);
  for (let t = 0; t < seconds * 1000; t += 25) w.update(25);
  return summarize(dealtBy(w.log, 'p'), w.time).total / seconds;
}

export interface EncounterRun {
  result: string;
  seconds: number;
  kills: number;
  spawned: number;
  falls: number;
  dps: number;
  /** 受けた傷の合計 */
  taken: number;
  /** ステップを踏んだ回数(避けた・詰めた) */
  steps: { dodges: number; closes: number };
  /** 大物の一戦なら、与えた傷のうち大物に当たった割合 */
  bossShare?: number;
  /** 傷の多い順に、発動元・条件文・コンボの割合 */
  topSources: [string, number][];
  topVia: [string, number][];
  topCombos: [string, number][];
}

/** 遠距離だけのビルドが下がり始める間合い(届く距離に対する割合)。0.6 にすると下がってばかりで撃つ手が減った */
export const KITE = { backOff: 0.45 };

/** 操り手のステップの状態。跳んでいる間の速さと、次に踏めるようになる時刻 */
interface PilotState {
  step?: { vx: number; vy: number; until: number };
  readyAt: number;
  /** ステップを踏んだ回数(避け・詰め) */
  dodges: number;
  closes: number;
  /**
   * 気づく確率(1 で全て気づく)。迫る弾や振りかぶりに気づかなければ、blindUntil まで避けない。
   * 人は全ての攻めに気づけないので、実戦に近い場では1より小さくする
   */
  awareness?: number;
  blindUntil?: number;
  nextLook?: number;
  /** 気づくかを決める乱数の種(戦いの乱数とは別にする) */
  rngSeed?: number;
}

/** 操り手の乱数。戦いの乱数の並びを変えないよう、操り手だけで持つ */
function pilotRandom(state: PilotState): number {
  let t = (state.rngSeed = ((state.rngSeed ?? 1) + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * 操り手。届く間合いへ寄り(近攻撃なら寄せ、遠攻撃なら離れ気味)、
 * 近くの敵の弾と、自分に向いた振りかぶりから横へ逃げる。完璧ではなく、人が遊ぶときの粗い近似。
 * useStep なら、当たりそうな弾や振りかぶりをステップで避け、離れた相手へステップで詰める
 */
function pilot(w: CombatWorld, p: Unit, reach: BuildReach, dt: number, state: PilotState, useStep: boolean): void {
  if (w.isIncapacitated(p)) return;
  const move = (dx: number, dy: number) => {
    const nx = Math.min(ARENA.width - p.radius, Math.max(p.radius, p.x + dx));
    const ny = Math.min(ARENA.height - p.radius, Math.max(p.radius, p.y + dy));
    w.moveUnit(p.id, nx, ny);
  };
  // 跳んでいる間は、跳ぶ向きへ進むだけ
  if (state.step) {
    if (w.time < state.step.until) return move((state.step.vx * dt) / 1000, (state.step.vy * dt) / 1000);
    state.step = undefined;
  }
  const foes = [...w.units.values()].filter((u) => u.team !== p.team && u.hp > 0);
  if (foes.length === 0) return;
  const near = foes.reduce((a, b) => (Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? a : b));
  const focus = (p.focusId && w.units.get(p.focusId)) || near;
  // 迫る攻めに気づくか。気づかなければしばらく避けない
  if (state.awareness !== undefined && state.awareness < 1 && w.time >= (state.nextLook ?? 0)) {
    const threat =
      w.projectiles.some((pr) => w.units.get(pr.ownerId)?.team !== p.team && Math.hypot(pr.x - p.x, pr.y - p.y) < 160) ||
      foes.some((u) => u.windupUntil > w.time && Math.hypot(u.x - p.x, u.y - p.y) < u.radius + 190);
    if (threat) {
      state.nextLook = w.time + FIELD.lookEvery;
      if (pilotRandom(state) > state.awareness) state.blindUntil = w.time + FIELD.lookEvery;
    }
  }
  const blind = w.time < (state.blindUntil ?? 0);
  let mx = 0;
  let my = 0;
  let danger = false;
  let projDanger = false;
  const d = Math.hypot(focus.x - p.x, focus.y - p.y) || 1;
  // 寄る間合いは、作戦が次に出したい技の届く距離(人が遊ぶときの自動の歩みと同じ)。
  // 何も出せないときは、近接を持つビルドは近接の間合い(飛んでいる相手には遠攻撃の間合い)、遠距離だけのビルドは遠い間合い
  const goal = w.autoMoveGoal(p.id);
  const fallback = reach.melee !== undefined && !w.isAirborne(focus) ? reach.melee : reach.max;
  const want = goal ? Math.max(30, goal.stopAt - focus.radius) : Math.max(40, fallback * 0.8);
  const gd = goal ? Math.hypot(goal.x - p.x, goal.y - p.y) || 1 : 0;
  if (goal && gd > goal.stopAt) {
    mx += (goal.x - p.x) / gd;
    my += (goal.y - p.y) / gd;
  } else if (!goal && d - focus.radius > want) {
    mx += (focus.x - p.x) / d;
    my += (focus.y - p.y) / d;
  } else if (reach.melee === undefined && reach.max > 200 && d < reach.max * KITE.backOff) {
    mx -= (focus.x - p.x) / d;
    my -= (focus.y - p.y) / d;
  }
  // 弾から横へ逃げる。こちらへ向かってくる近い弾は、当たりそうとみなす
  for (const proj of blind ? [] : w.projectiles) {
    const owner = w.units.get(proj.ownerId);
    if (!owner || owner.team === p.team) continue;
    const dx = p.x - proj.x;
    const dy = p.y - proj.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 110) continue;
    const speed = Math.hypot(proj.vx, proj.vy) || 1;
    // 弾の進む向きに対して、自分のいる側へ押し出す
    const side = Math.sign((proj.vx * dy - proj.vy * dx) / speed) || 1;
    const strength = (110 - dist) / 110;
    mx += (-proj.vy / speed) * side * strength * 2.5;
    my += (proj.vx / speed) * side * strength * 2.5;
    const coming = (proj.vx * dx + proj.vy * dy) / (speed * dist) > 0.8;
    if (coming && dist < 55) {
      danger = true;
      projDanger = true;
    }
  }
  // 振りかぶっている敵の届く所から離れる。満ちる直前なら、当たりそうとみなす。
  // ステップを使うときは歩いて離れず、満ちる直前にステップで抜ける(人が遊ぶときのように、寄ったまま殴る)
  let flee = { x: 0, y: 0 };
  for (const u of foes) {
    if (u.windupUntil <= w.time) continue;
    const dist = Math.hypot(p.x - u.x, p.y - u.y) || 1;
    if (dist > u.radius + 190) continue;
    flee = { x: flee.x + ((p.x - u.x) / dist) * 2, y: flee.y + ((p.y - u.y) / dist) * 2 };
    if (!blind && u.windupUntil - w.time < 220 && dist < u.radius + 150) danger = true;
  }
  if (!useStep) {
    mx += flee.x;
    my += flee.y;
  }
  const len = Math.hypot(mx, my);
  if (useStep && w.time >= state.readyAt) {
    // 避けるステップ:逃げる向きへ。詰めるステップ:遠い相手へ(自分が振りかぶっていないときだけ)
    const close = !danger && d - focus.radius > want + 160 && p.windupUntil <= w.time;
    // 自分の技がもうすぐ出るなら、潰さずに受ける。儀式を重ねて溜めた一撃も、潰さずに打ち切る
    const winding = p.windupUntil > w.time;
    const charged = p.rites.filter((r) => r.until > w.time).length >= 2;
    const committed = winding && (p.windupUntil - w.time < 200 || charged);
    const away = { x: mx + flee.x, y: my + flee.y };
    const awayLen = Math.hypot(away.x, away.y);
    // 盾が張られていれば、振りかぶりは盾で受ける(受けてから返す)。弾は避ける
    const shielded = p.shields.some((sh) => sh.ready) && !projDanger;
    if ((danger && awayLen > 0.01 && !committed && !shielded) || close) {
      // 振りかぶりから抜けるときは、画面と同じステップの向き(近接は回り込み、遠距離は離れる)。弾は横へ
      const dir = danger && !projDanger ? w.stepDirection(p, near) : undefined;
      const ux = dir ? dir.x : danger ? away.x / awayLen : (focus.x - p.x) / d;
      const uy = dir ? dir.y : danger ? away.y / awayLen : (focus.y - p.y) / d;
      if (w.dodge(p.id, true)) {
        state.step = { vx: ux * STEP.speed, vy: uy * STEP.speed, until: w.time + STEP.duration };
        state.readyAt = w.time + STEP.cooldown;
        if (danger) state.dodges++;
        else state.closes++;
        return move((state.step.vx * dt) / 1000, (state.step.vy * dt) / 1000);
      }
    }
  }
  if (len < 0.01) return;
  const step = (SIM_PLAYER.moveSpeed * w.statOf(p, 'moveSpeed') * dt) / 1000;
  move((mx / len) * step, (my / len) * step);
}

/** そのビルドの攻撃の技の届く距離。一番長いものと、近攻撃の一番長いもの */
interface BuildReach {
  max: number;
  melee?: number;
}

function buildReach(w: CombatWorld, p: Unit): BuildReach {
  const reaches = p.actives.flatMap((id) => {
    const def = w.skillFor(p, id);
    if (!def || !def.tags.includes('attack')) return [];
    const r = actionReach(def.action);
    return r === undefined ? [] : [{ r, melee: def.action.type === 'melee' }];
  });
  const melee = reaches.filter((x) => x.melee).map((x) => x.r);
  return { max: reaches.length > 0 ? Math.max(...reaches.map((x) => x.r)) : 60, ...(melee.length > 0 ? { melee: Math.max(...melee) } : {}) };
}

const share = (rows: { key: string; share: number }[], n = 4): [string, number][] => rows.slice(0, n).map((r) => [r.key, r.share]);

/** 一戦を入力なし(操り手つき)で最後まで戦わせる。切り札は戻りしだい切る */
export function runEncounter(
  build: Build,
  id: EncounterId,
  seed = 1,
  useStep = true,
  /** 刻みごとに呼ぶ(調べもの用) */
  trace?: (w: CombatWorld, p: Unit, e: Encounter) => void,
  /** 一戦のレベル */
  level = 1,
): EncounterRun {
  const w = new CombatWorld({ seed, bounds: ARENA });
  const p = w.addUnit({ id: 'player', name: '巡礼者', team: 'player', x: ARENA.width / 2, y: ARENA.height / 2, ...SIM_PLAYER, autoBattle: true });
  applyBuild(w, p, build);
  p.hp = p.maxHp;
  const e = new Encounter(w, id, p, level);
  const reach = buildReach(w, p);
  let taken = 0;
  const dt = 25;
  const state: PilotState = { readyAt: 0, dodges: 0, closes: 0 };
  // 倒れて消えた者の種類も分かるよう、名前と種類を覚えておく
  const kinds = new Map<string, string | undefined>();
  while (!e.result) {
    e.update();
    if (e.result) break;
    if (p.trump && w.canUseSkill(p.id, p.trump) && !p.queued) w.queueSkill(p.id, p.trump, 3000);
    for (const u of w.units.values()) if (!kinds.has(u.id)) kinds.set(u.id, u.kind);
    pilot(w, p, reach, dt, state, useStep);
    trace?.(w, p, e);
    w.update(dt);
    for (const ev of w.drainEvents()) if (ev.type === 'damage' && ev.record.targetId === p.id) taken += ev.record.amount;
  }
  const b = summarize(dealtBy(w.log, p.id), w.time);
  const bossKind = e.def.boss;
  const bossDamage = bossKind ? dealtBy(w.log, p.id).filter((r) => kinds.get(r.targetId) === bossKind).reduce((s, r) => s + r.amount, 0) : 0;
  return {
    result: e.result,
    seconds: e.elapsed / 1000,
    kills: e.kills,
    spawned: e.spawned.length,
    falls: p.falls,
    dps: b.total / Math.max(1, e.elapsed / 1000),
    taken,
    steps: { dodges: state.dodges, closes: state.closes },
    ...(bossKind ? { bossShare: bossDamage / Math.max(1, b.total) } : {}),
    topSources: share(b.bySource),
    topVia: share(b.byVia),
    topCombos: b.byCombo.slice(0, 4).map((r) => [comboDef(r.combo).name, r.share]),
  };
}

/**
 * 実戦に近い場の決まり。count 体の倒れない案山子が別々の向きから寄ってきて(1秒に speed)、薙ぎと弾幕で攻めてくる。
 * 1体の薙ぎとゆるい弾幕では操り手に避け切られ、最大HPを捨てても倒れなかったので、群れで囲む
 */
export const FIELD = {
  speed: 90,
  count: 3,
  /** 操り手が迫る攻めに気づく確率と、気づき直すまでの間 */
  awareness: 0.7,
  lookEvery: 600,
  skills: ['strawSwipe', 'strawScatter', 'emberFan', 'sootSpit'] as ActiveSkillId[],
} as const;

/**
 * 実戦に近い場で測る。寄ってきて攻める倒れない案山子の群れを、操り手つきで seconds 秒戦う。DPS は案山子全てへの合計。
 * 止まって撃つ・離れて撃つ・盾で受ける・最大HPを捨てるといったことは、ここで初めて正しく測れる(動かない案山子では測れない)
 */
export function measureField(
  build: Build,
  seconds = 30,
  seed = 1,
  skills: readonly ActiveSkillId[] = FIELD.skills,
  count: number = FIELD.count,
): { dps: number; maxHit: number; maxHitVia: string; falls: number; hitsTaken: number } {
  const w = new CombatWorld({ seed, bounds: ARENA });
  const cx = ARENA.width / 2;
  const cy = ARENA.height / 2;
  const p = w.addUnit({ id: 'player', name: '巡礼者', team: 'player', x: cx, y: cy, ...SIM_PLAYER, autoBattle: true });
  applyBuild(w, p, build);
  p.hp = p.maxHp;
  const dummies = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return w.addUnit({ id: `dummy${i}`, name: '案山子', team: 'enemy', x: cx + Math.cos(a) * 300, y: cy + Math.sin(a) * 300, maxHp: 1e15, ai: [...skills] });
  });
  const reach = buildReach(w, p);
  const state: PilotState = { readyAt: 0, dodges: 0, closes: 0, awareness: FIELD.awareness, rngSeed: seed };
  const dt = 25;
  for (let time = 0; time < seconds * 1000; time += dt) {
    if (p.trump && w.canUseSkill(p.id, p.trump) && !p.queued) w.queueSkill(p.id, p.trump, 3000);
    // 案山子は寄ってくる。振りかぶり中と動けない間は止まる
    for (const t of dummies) {
      const gap = Math.hypot(p.x - t.x, p.y - t.y);
      if (w.isBusy(t) || w.isIncapacitated(t) || gap <= t.radius + p.radius + 20) continue;
      const step = (FIELD.speed * w.statOf(t, 'moveSpeed') * dt) / 1000 / gap;
      w.moveUnit(t.id, t.x + (p.x - t.x) * step, t.y + (p.y - t.y) * step);
    }
    pilot(w, p, reach, dt, state, true);
    w.update(dt);
  }
  const log = dealtBy(w.log, p.id);
  const top = log.reduce((a, b) => (b.amount > (a?.amount ?? 0) ? b : a), log[0]);
  const hitsTaken = w.log.filter((r) => r.targetId === p.id && r.attackerId?.startsWith('dummy') && r.depth === 0).length;
  return { dps: summarize(log, w.time).total / seconds, maxHit: top?.amount ?? 0, maxHitVia: top ? [top.skill, ...top.via].join('・') : '', falls: p.falls, hitsTaken };
}

export interface ArchetypeReport {
  bare: { single: number; pack: number };
  geared: { single: number; pack: number; toughness: number; equipment: string[] };
  encounters: Partial<Record<EncounterId, EncounterRun[]>>;
}

/** 1つのビルドを、素と揃えた装備で測り、一戦を seeds 回ずつ戦わせる */
export function reportArchetype(build: Build, encounters: readonly EncounterId[], seeds: readonly number[]): ArchetypeReport {
  const geared = outfit(build);
  const out: ArchetypeReport = {
    bare: { single: singleTargetDps(build), pack: measureBuildPower(build, 30) },
    geared: {
      single: singleTargetDps(geared),
      pack: measureBuildPower(geared, 30),
      toughness: measureLoadout(geared).toughness,
      equipment: Object.values(geared.equipment).flatMap((i) => (i && i.kind !== 'weapon' ? [i.name + (i.condition ? `〔${i.condition}〕` : '')] : [])),
    },
    encounters: {},
  };
  for (const id of encounters) out.encounters[id] = seeds.map((s) => runEncounter(geared, id, s));
  return out;
}
