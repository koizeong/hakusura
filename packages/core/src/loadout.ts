import { CombatWorld } from './world';
import { applyBuild, canEquip, type Build } from './build';
import { EQUIP_SLOT_IDS, EQUIP_SLOTS, type EquipSlotId, type Item } from './data/equipment';
import { measureBuildPower } from './expedition';

/**
 * 装備の見比べ。ビルドを早回しして火力(DPS)を、最大HPと被ダメージから耐久を測る。
 * 拾い物の札に「着けると 火力+12%・耐久-5%」と出し、おすすめの組み合わせを選ぶのに使う
 */
export const LOADOUT_RULES = {
  /** 1回の見比べで早回しする秒数。札の数だけ測るので短めにする */
  seconds: 6,
  /** 耐久を測るときの最大HPのもと(試し斬り場の自分と同じ) */
  baseHp: 300,
  /** 点に混ぜる耐久の頭打ち。被ダメージを -100% 近くまで積むと耐久が桁違いになり、火力を顧みなくなるので */
  toughnessCap: 3000,
  /** これ以上変われば、良くなった・悪くなったとみなす */
  threshold: 0.03,
  /** 耐久を点に混ぜる重み。火力×耐久^weight */
  toughnessWeight: 0.5,
  /** 覚えておく測った結果の数 */
  cacheSize: 600,
} as const;

export interface Measure {
  /** 火力。案山子の群れへの DPS */
  power: number;
  /** 耐久。最大HP ÷ 被ダメージの倍率 */
  toughness: number;
}

const cache = new Map<string, Measure>();

/** 測った結果を覚えるための鍵。着けている物の id と、スキル・作戦・能力値 */
function keyOf(build: Build): string {
  const equipment = EQUIP_SLOT_IDS.map((s) => build.equipment[s]?.id ?? '-').join(',');
  return JSON.stringify([equipment, build.actives, build.passives, build.trump, build.tactics, build.attributes, build.variants]);
}

/** ビルドの火力と耐久を測る。同じビルドは覚えておいた結果を返す */
export function measureLoadout(build: Build): Measure {
  const key = keyOf(build);
  const hit = cache.get(key);
  if (hit) return hit;
  const power = measureBuildPower(build, LOADOUT_RULES.seconds);
  const w = new CombatWorld({ seed: 1 });
  const unit = w.addUnit({ id: 'p', name: '測り', team: 'player', x: 0, y: 0, maxHp: LOADOUT_RULES.baseHp });
  applyBuild(w, unit, build);
  const toughness = unit.maxHp / Math.max(0.05, w.statOf(unit, 'damageTaken'));
  const m = { power, toughness };
  if (cache.size >= LOADOUT_RULES.cacheSize) cache.delete(cache.keys().next().value!);
  cache.set(key, m);
  return m;
}

/** 火力と耐久を1つの点にする */
export function loadoutScore(m: Measure): number {
  return m.power * Math.pow(Math.max(1, Math.min(LOADOUT_RULES.toughnessCap, m.toughness)), LOADOUT_RULES.toughnessWeight);
}

export type Verdict = 'better' | 'worse' | 'same';

export interface Comparison {
  /** 着けると一番良くなる部位 */
  slot: EquipSlotId;
  /** 今と比べた火力・耐久・点の倍率(1 で変わらない) */
  power: number;
  toughness: number;
  score: number;
  verdict: Verdict;
}

function withItem(build: Build, slot: EquipSlotId, item: Item | undefined): Build {
  const equipment = { ...build.equipment };
  // 同じ物を2つの枠には着けられない
  for (const s of EQUIP_SLOT_IDS) if (item && equipment[s]?.id === item.id) delete equipment[s];
  if (item) equipment[slot] = item;
  else delete equipment[slot];
  return { ...build, equipment };
}

function verdictOf(power: number, toughness: number, score: number): Verdict {
  const t = LOADOUT_RULES.threshold;
  if (score > 1 + t) return 'better';
  // 火力も耐久も上がらず、点が下がるものだけを「悪くなる」とする
  if (score < 1 - t && power <= 1 + t && toughness <= 1 + t) return 'worse';
  return 'same';
}

function compare(before: Measure, after: Measure, slot: EquipSlotId): Comparison {
  const power = after.power / Math.max(1e-6, before.power);
  const toughness = after.toughness / Math.max(1e-6, before.toughness);
  const score = loadoutScore(after) / Math.max(1e-6, loadoutScore(before));
  return { slot, power, toughness, score, verdict: verdictOf(power, toughness, score) };
}

/** 着けられる枠。装飾品と武器は、空いている枠を先に、なければ全ての枠を試す */
function candidateSlots(build: Build, item: Item): EquipSlotId[] {
  const slots = EQUIP_SLOT_IDS.filter((s) => canEquip(item, s));
  const empty = slots.filter((s) => !build.equipment[s]);
  return empty.length > 0 && EQUIP_SLOTS[slots[0]!].kind !== 'weapon' ? [empty[0]!] : slots;
}

/** 拾い物を今のビルドに着けたらどうなるか。一番良くなる枠で比べる */
export function compareItem(build: Build, item: Item): Comparison | undefined {
  const before = measureLoadout(build);
  let best: Comparison | undefined;
  for (const slot of candidateSlots(build, item)) {
    if (build.equipment[slot]?.id === item.id) continue;
    const c = compare(before, measureLoadout(withItem(build, slot, item)), slot);
    if (!best || c.score > best.score) best = c;
  }
  return best;
}

/** 着けている物を外したらどうなるか。その物の寄与を見せるのに使う */
export function contributionOf(build: Build, slot: EquipSlotId): Comparison | undefined {
  if (!build.equipment[slot]) return undefined;
  return compare(measureLoadout(withItem(build, slot, undefined)), measureLoadout(build), slot);
}

/**
 * おすすめの組み合わせを選ぶ。部位ごとに、拾い物の山と今の物から一番点の高いものを選ぶ。
 * 武器で出る技が決まるので武器の枠から先に選び、変わらなくなるまで(最大 passes 回)繰り返す。
 * 測るたびに一度戻るので、少しずつ進められる
 */
export function* recommendLoadout(build: Build, stash: readonly Item[], passes = 1): Generator<number, Build, void> {
  let current = build;
  const fits = (slot: EquipSlotId) => stash.filter((item) => canEquip(item, slot));
  const total = Math.max(1, EQUIP_SLOT_IDS.reduce((n, slot) => n + fits(slot).length, 0) * passes);
  let step = 0;
  const order = [...EQUIP_SLOT_IDS].sort((a, b) => Number(EQUIP_SLOTS[b].kind === 'weapon') - Number(EQUIP_SLOTS[a].kind === 'weapon'));
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (const slot of order) {
      let bestBuild = current;
      let bestScore = loadoutScore(measureLoadout(current));
      for (const item of fits(slot)) {
        yield step++ / total;
        if (current.equipment[slot]?.id === item.id) continue;
        const next = withItem(current, slot, item);
        const score = loadoutScore(measureLoadout(next));
        if (score > bestScore * (1 + 1e-6)) {
          bestScore = score;
          bestBuild = next;
        }
      }
      if (bestBuild !== current) {
        current = bestBuild;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return current;
}

/** おすすめを一気に選ぶ(試験やシミュレーター向け) */
export function recommendNow(build: Build, stash: readonly Item[], passes = 1): Build {
  const it = recommendLoadout(build, stash, passes);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
