import { CombatWorld } from './world';
import { applyBuild, addExp, type Build, type Character } from './build';
import { dealtBy, summarize } from './breakdown';
import { generateItem, type Item } from './data/equipment';
import { EXPEDITION_YIELD, expeditionDef, type ExpeditionId } from './data/expeditions';
import { ACTIVE_SKILLS, ACTIVE_SKILL_IDS, TRUMP_SKILL_IDS, type ActiveSkillId } from './data/skills';
import { PASSIVE_IDS, type PassiveId } from './data/passives';
import { CONDITION_IDS } from './data/conditions';

/** 覚えたスキル。アカウント全体で共有し、遠征で増える */
export interface Learned {
  actives: ActiveSkillId[];
  passives: PassiveId[];
}

/** 最初から覚えているスキル */
export const STARTING_SKILLS: Learned = {
  actives: ['slash', 'shoot', 'sweep', 'emberOil', 'rainBell'],
  passives: ['sootPrayer', 'bloodCallsThunder', 'readTheBlow', 'parryStance'],
};

/** 遠征で見つかるスキル。敵のスキルは出ない */
const FINDABLE_ACTIVES = ACTIVE_SKILL_IDS.filter((id) => !(ACTIVE_SKILLS[id].tags as readonly string[]).includes('enemy'));

export function isLearned(learned: Learned, id: ActiveSkillId | PassiveId): boolean {
  return (learned.actives as string[]).includes(id) || (learned.passives as string[]).includes(id);
}

/** まだ覚えていない、見つけられるスキル */
export function unlearnedSkills(learned: Learned): { kind: 'active' | 'passive'; id: ActiveSkillId | PassiveId }[] {
  return [
    ...FINDABLE_ACTIVES.filter((id) => !learned.actives.includes(id)).map((id) => ({ kind: 'active' as const, id })),
    ...PASSIVE_IDS.filter((id) => !learned.passives.includes(id)).map((id) => ({ kind: 'passive' as const, id })),
  ];
}

/** 切り札として選べる、覚えたスキル */
export function learnedTrumps(learned: Learned): ActiveSkillId[] {
  return TRUMP_SKILL_IDS.filter((id) => learned.actives.includes(id));
}

/** 寄ってきた5体に囲まれた所。ビルドの強さを測る場 */
const PACK = [
  { x: 70, y: 0 },
  { x: 40, y: 70 },
  { x: -50, y: 60 },
  { x: -60, y: -50 },
  { x: 30, y: -80 },
];

/**
 * ビルドの強さ。そのビルドで案山子の群れと短く戦わせ、DPSを測る。
 * 放置の進み方も、手で戦うときと同じ戦闘を早回しして求める
 */
export function measureBuildPower(build: Build, seconds = 20, seed = 1): number {
  const w = new CombatWorld({ seed });
  const p = w.addUnit({ id: 'p', name: '遠征', team: 'player', x: 0, y: 0, maxHp: 1e9, autoBattle: true });
  applyBuild(w, p, build);
  p.hp = p.maxHp;
  PACK.forEach((at, i) => w.addUnit({ id: `e${i}`, name: '案山子', team: 'enemy', ...at, maxHp: 1e9 }));
  if (p.trump) w.queueSkill('p', p.trump, 5000);
  for (let t = 0; t < seconds * 1000; t += 25) w.update(25);
  return summarize(dealtBy(w.log, 'p'), w.time).total / seconds;
}

/** 持ち帰る量に掛ける倍率。ビルドの強さと行き先の手強さの比 */
export function expeditionYield(power: number, destination: ExpeditionId): number {
  const ratio = power / expeditionDef(destination).threat;
  return Math.min(EXPEDITION_YIELD.max, Math.max(EXPEDITION_YIELD.min, ratio));
}

/** 遠征に送り出す */
export function startExpedition(c: Character, destination: ExpeditionId, now: number, seed: number): void {
  c.expedition = { destination, startedAt: now, endsAt: now + expeditionDef(destination).duration, seed };
}

export function expeditionDone(c: Character, now: number): boolean {
  return !!c.expedition && c.expedition.endsAt <= now;
}

/** 遠征から持ち帰った物 */
export interface ExpeditionReport {
  destination: ExpeditionId;
  power: number;
  yield: number;
  exp: number;
  levelsGained: number;
  items: Item[];
  skills: (ActiveSkillId | PassiveId)[];
}

/**
 * 帰りを迎える。経験値を足し、持ち帰った装備と見つけたスキルを返す。
 * 乱数は遠征に出たときの種で決まるので、同じ遠征なら同じ物を持ち帰る
 */
export function finishExpedition(c: Character, learned: Learned): ExpeditionReport | undefined {
  const ex = c.expedition;
  if (!ex) return undefined;
  const def = expeditionDef(ex.destination);
  const random = new CombatWorld({ seed: ex.seed });
  const rand = () => random.random();

  const power = measureBuildPower(c.build, 20, ex.seed);
  const y = expeditionYield(power, ex.destination);
  const exp = Math.round(def.exp * y);
  const levelsGained = addExp(c, exp);

  const count = Math.max(1, Math.round(def.items * y));
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    const kind = def.itemKinds ? def.itemKinds[Math.floor(rand() * def.itemKinds.length)] : undefined;
    const item = generateItem(rand, kind ? { kind, ...(kind === 'weapon' ? { slot: 'weapon1' as const } : {}) } : {});
    // 条件文の出やすさは行き先で変わる。出なかった装備はそのまま
    if (!item.condition && item.affixes.length >= 2 && rand() < def.conditionChance) {
      const condition = CONDITION_IDS[Math.floor(rand() * CONDITION_IDS.length)]!;
      items.push(generateItem(rand, { kind: item.kind, slot: item.slot, weaponType: item.weaponType, condition }));
    } else items.push(item);
  }

  const skills: (ActiveSkillId | PassiveId)[] = [];
  const pool = unlearnedSkills(learned);
  if (pool.length > 0 && rand() < Math.min(1, def.skillChance * y)) {
    const found = pool[Math.floor(rand() * pool.length)]!;
    if (found.kind === 'active') learned.actives.push(found.id as ActiveSkillId);
    else learned.passives.push(found.id as PassiveId);
    skills.push(found.id);
  }

  c.expedition = undefined;
  return { destination: ex.destination, power, yield: y, exp, levelsGained, items, skills };
}
