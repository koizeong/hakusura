import { CombatWorld } from '../world';
import { applyBuild, lootFit, type Build } from '../build';
import { dealtBy, summarize } from '../breakdown';
import { measureBuildPower } from '../expedition';
import { AFFIXES, AFFIX_IDS, EQUIP_RULES, EQUIP_SLOTS, affixFits, type AffixId, type EquipSlotId, type Item } from '../data/equipment';
import { CONDITION_IDS, conditionDef, type ConditionId } from '../data/conditions';
import { ARTIFACT_IDS, ARTIFACTS, type ArtifactId } from '../data/artifacts';
import { statDef } from '../data/stats';
import { measureLoadout } from '../loadout';

/**
 * 理論値。装備の決まり(1項目±200%・合計±100%・項目は4つまで・共通の項目が必ず1つ・条件文はコスト込みで1枠)の中で、
 * 一番火力の出る装備を作って測る。拾い物の運は入れない。
 *
 * 作り方:どの装備も共通の項目の移動速度を -200% に捨て(移動速度は下限があるので、捨てても火力は落ちない)、
 * その分で火力の項目に振る(共通の項目の損は合計に半分しか数えないので、+200%)。振り先は 100% ずつ、測って一番伸びる項目へ足していく。
 * 条件文とアーティファクトは、1つずつ足して伸びるうちは足す
 */
export const THEORY = {
  /** 1回の測りの秒数(探すとき) */
  seconds: 15,
  /** 出来上がりを測る秒数 */
  finalSeconds: 30,
  /** 移動速度を捨てて、1つの装備で振れる火力の項目の合計 */
  perItem: EQUIP_RULES.totalMax - EQUIP_RULES.affixMin * EQUIP_RULES.commonPenaltyWeight,
  /** 振り分けの刻み */
  unit: 100,
  /** 条件文の下見で残す数 */
  conditionShortlist: 14,
} as const;

/** 1体の硬い案山子と戦ったときの DPS と、一番大きい1ヒット */
export function measureSingle(build: Build, seconds: number = THEORY.seconds): { dps: number; maxHit: number; maxHitVia: string } {
  const w = new CombatWorld({ seed: 1 });
  const p = w.addUnit({ id: 'p', name: '試し', team: 'player', x: 0, y: 0, autoBattle: true });
  applyBuild(w, p, build);
  w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 70, y: 0, maxHp: 1e15 });
  if (p.trump) w.queueSkill('p', p.trump, 5000);
  for (let t = 0; t < seconds * 1000; t += 25) w.update(25);
  const log = dealtBy(w.log, 'p');
  const top = log.reduce((a, b) => (b.amount > (a?.amount ?? 0) ? b : a), log[0]);
  return { dps: summarize(log, w.time).total / seconds, maxHit: top?.amount ?? 0, maxHitVia: top ? [top.skill, ...top.via].join('・') : '' };
}

interface Plan {
  /** 火力の項目ごとの合計(%) */
  alloc: Partial<Record<AffixId, number>>;
  conditions: ConditionId[];
  artifacts: ArtifactId[];
}

/** 火力に効く項目。ビルドの属性と技の種類に合うものと、どのビルドにも効くもの */
function offenseAffixes(build: Build): AffixId[] {
  const fit = lootFit(build);
  const rites = build.actives.some((a) => ['stillPrayer', 'whetRite', 'bloodOath', 'ashLitany', 'stormSigil', 'pyreOffering'].includes(a));
  return AFFIX_IDS.filter((id) => {
    const def = AFFIXES[id];
    if ('common' in def && def.common) return false;
    if (id === 'healing') return false;
    if (id === 'riteDamage' || id === 'riteCooldown') return rites;
    if (def.stat === 'damage' || def.stat === 'cooldown') return def.tags.length === 0 || affixFits(id, fit) || id === 'statusDamage';
    if (def.stat === 'buildup') return affixFits(id, fit);
    return false;
  });
}

/** 補正値を載せられる枠。武器の枠は、ビルドが武器か盾を持っているときだけ */
function slotsOf(build: Build): EquipSlotId[] {
  return (Object.keys(EQUIP_SLOTS) as EquipSlotId[]).filter((s) => EQUIP_SLOTS[s].kind !== 'weapon' || !!build.equipment[s]);
}

/** 計画を装備に詰める。詰められなければ undefined */
function pack(build: Build, plan: Plan): Build | undefined {
  const slots = slotsOf(build);
  const accessories = slots.filter((s) => EQUIP_SLOTS[s].kind === 'accessory');
  if (plan.artifacts.length > accessories.length) return undefined;
  const artifactSlots = accessories.slice(0, plan.artifacts.length);
  const free = slots.filter((s) => !artifactSlots.includes(s));
  if (plan.conditions.length > free.length) return undefined;
  const bins = free.map((slot, i) => {
    const condition = plan.conditions[i];
    return { slot, condition, cap: THEORY.perItem - (condition ? conditionDef(condition).cost : 0), entries: EQUIP_RULES.countMax - 1 - (condition ? 1 : 0), affixes: [] as { affix: AffixId; value: number }[] };
  });
  // 多い項目から、1つの装備に 200% までずつ詰める
  const wants = (Object.entries(plan.alloc) as [AffixId, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  for (const [affix, total] of wants) {
    let left = total;
    for (const bin of [...bins].sort((a, b) => b.cap - a.cap)) {
      if (left <= 0) break;
      if (bin.cap <= 0 || bin.entries <= 0) continue;
      const put = Math.min(left, EQUIP_RULES.affixMax, bin.cap);
      bin.affixes.push({ affix, value: put });
      bin.cap -= put;
      bin.entries -= 1;
      left -= put;
    }
    if (left > 0) return undefined;
  }
  const equipment = { ...build.equipment };
  artifactSlots.forEach((slot, i) => {
    const id = plan.artifacts[i]!;
    equipment[slot] = { id: `theory-${slot}`, name: ARTIFACTS[id].name, kind: 'accessory', affixes: [], artifact: id };
  });
  for (const bin of bins) {
    const kind = EQUIP_SLOTS[bin.slot].kind;
    const base: Item = build.equipment[bin.slot] ?? { id: '', name: '', kind, ...(kind === 'armor' ? { slot: bin.slot } : {}), affixes: [] };
    const affixes = [
      { affix: 'moveSpeed' as AffixId, value: EQUIP_RULES.affixMin },
      ...bin.affixes.map((a) => ({ affix: a.affix, value: statDef(AFFIXES[a.affix].stat).lowerIsBetter ? -a.value : a.value })),
    ];
    equipment[bin.slot] = { ...base, id: `theory-${bin.slot}`, name: base.name || EQUIP_SLOTS[bin.slot].name, affixes, ...(bin.condition ? { condition: bin.condition } : {}) };
  }
  return { ...build, equipment };
}

/** 振れる合計。装備の数 × 300% から、条件文のコストとアーティファクトの枠を引く */
function budget(build: Build, plan: Plan): number {
  const items = slotsOf(build).length - plan.artifacts.length;
  return items * THEORY.perItem - plan.conditions.reduce((s, c) => s + conditionDef(c).cost, 0);
}

function allocated(plan: Plan): number {
  return Object.values(plan.alloc).reduce((s, v) => s + (v ?? 0), 0);
}

export interface TheoryResult {
  build: Build;
  single: number;
  pack: number;
  maxHit: number;
  maxHitVia: string;
  toughness: number;
  conditions: string[];
  artifacts: string[];
  alloc: string[];
  evaluations: number;
}

/** そのビルドの理論値の装備を作って測る */
export function theoreticalMax(build: Build, log: (line: string) => void = () => {}): TheoryResult {
  let evaluations = 0;
  const score = (b: Build | undefined): number => {
    if (!b) return -1;
    evaluations++;
    return measureSingle(b).dps;
  };
  const affixes = offenseAffixes(build);
  const empty: Plan = { alloc: {}, conditions: [], artifacts: [] };

  // 条件文の下見:何も着けないビルドに1つだけ足して、伸びるものを残す
  const base = score(pack(build, empty));
  const shortlist = CONDITION_IDS.map((c) => ({ c, v: score(pack(build, { ...empty, conditions: [c] })) }))
    .filter((x) => x.v > base * 1.02)
    .sort((a, b) => b.v - a.v)
    .slice(0, THEORY.conditionShortlist)
    .map((x) => x.c);
  log(`条件文の下見 ${shortlist.length}件`);

  /** 残りの合計を、100% ずつ一番伸びる項目へ足す */
  const fill = (plan: Plan): Plan => {
    let current = plan;
    let currentScore = score(pack(build, current));
    while (budget(build, current) - allocated(current) >= THEORY.unit) {
      let best: { plan: Plan; v: number } | undefined;
      for (const a of affixes) {
        const next = { ...current, alloc: { ...current.alloc, [a]: (current.alloc[a] ?? 0) + THEORY.unit } };
        const v = score(pack(build, next));
        if (!best || v > best.v) best = { plan: next, v };
      }
      if (!best || best.v < 0) break;
      current = best.plan;
      currentScore = best.v;
    }
    // 端数は一番多い項目に足す
    const rest = budget(build, current) - allocated(current);
    const top = (Object.entries(current.alloc) as [AffixId, number][]).sort((a, b) => b[1] - a[1])[0];
    if (rest > 0 && top) {
      const next = { ...current, alloc: { ...current.alloc, [top[0]]: top[1] + rest } };
      if (score(pack(build, next)) >= currentScore) current = next;
    }
    return current;
  };

  /** 合計を減らす(条件文やアーティファクトの分を空ける)。一番減らしても落ちない項目から削る */
  const trim = (plan: Plan): Plan => {
    let current = plan;
    while (allocated(current) > budget(build, current)) {
      let best: { plan: Plan; v: number } | undefined;
      for (const [a, v0] of Object.entries(current.alloc) as [AffixId, number][]) {
        if (v0 <= 0) continue;
        const cut = Math.min(v0, THEORY.unit, allocated(current) - budget(build, current));
        const next = { ...current, alloc: { ...current.alloc, [a]: v0 - cut } };
        const v = score(pack(build, next));
        if (!best || v > best.v) best = { plan: next, v };
      }
      if (!best) break;
      current = best.plan;
    }
    return current;
  };

  let plan = fill(empty);
  let planScore = score(pack(build, plan));
  log(`補正値だけ ${Math.round(planScore)}`);
  // 条件文とアーティファクトを、伸びるうちは1つずつ足す(足した分は補正値を削って空け、空いた分は振り直す)
  for (let round = 0; round < 12; round++) {
    const options: Plan[] = [
      ...shortlist.map((c) => ({ ...plan, conditions: [...plan.conditions, c] })),
      ...ARTIFACT_IDS.filter((a) => !plan.artifacts.includes(a)).map((a) => ({ ...plan, artifacts: [...plan.artifacts, a] })),
    ];
    let best: { plan: Plan; v: number } | undefined;
    for (const o of options) {
      const p = fill(trim(o));
      const v = score(pack(build, p));
      if (!best || v > best.v) best = { plan: p, v };
    }
    if (!best || best.v <= planScore * 1.01) break;
    plan = best.plan;
    planScore = best.v;
    log(`  ${round + 1}: ${Math.round(planScore)}(条件文 ${plan.conditions.length}・アーティファクト ${plan.artifacts.length})`);
  }

  const final = pack(build, plan)!;
  const single = measureSingle(final, THEORY.finalSeconds);
  return {
    build: final,
    single: single.dps,
    pack: measureBuildPower(final, THEORY.finalSeconds),
    maxHit: single.maxHit,
    maxHitVia: single.maxHitVia,
    toughness: measureLoadout(final).toughness,
    conditions: plan.conditions.map((c) => conditionDef(c).text),
    artifacts: plan.artifacts.map((a) => ARTIFACTS[a].name),
    alloc: (Object.entries(plan.alloc) as [AffixId, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([a, v]) => `${AFFIXES[a].name}${statDef(AFFIXES[a].stat).lowerIsBetter ? '-' : '+'}${v}%`),
    evaluations,
  };
}
