import { CombatWorld } from './world';
import { applyBuild, addExp, lootFit, type Build, type Character } from './build';
import { dealtBy, summarize } from './breakdown';
import { generateItem, type Item } from './data/equipment';
import { EXPEDITION_INJURY, EXPEDITION_YIELD, expeditionDef, type ExpeditionDef, type ExpeditionId } from './data/expeditions';
import { ACTIVE_SKILLS, ACTIVE_SKILL_IDS, TRUMP_SKILL_IDS, activeSkillDef, isTechnique, techniqueFits, type ActiveSkillId } from './data/skills';
import { FORM_IDS, STARTING_FORMS, type FormId } from './data/forms';
import { VARIANT_RULES, generateVariant, type SkillVariant, type VariationId } from './data/variations';
import { WEAPON_TYPE_IDS, weaponDef, type WeaponTypeId } from './data/weapons';
import { ATTRIBUTE_IDS, baseAttributes } from './data/attributes';
import { PASSIVE_IDS, type PassiveId } from './data/passives';

/** 覚えたスキル。アカウント全体で共有し、遠征で増える */
export interface Learned {
  actives: ActiveSkillId[];
  passives: PassiveId[];
  /** 覚えた型。なければ最初の型だけ */
  forms?: FormId[];
}

/** 最初から覚えているスキル */
export const STARTING_SKILLS: Learned = {
  actives: ['slash', 'shoot', 'sweep', 'emberOil', 'rainBell'],
  passives: ['sootPrayer', 'bloodCallsThunder', 'readTheBlow', 'parryStance'],
  forms: [...STARTING_FORMS],
};

/** 覚えている型 */
export function learnedForms(learned: Learned): FormId[] {
  return learned.forms ?? [...STARTING_FORMS];
}

/** 型の書が見つかる確率。スキルを見つける確率にこれを掛ける */
const EXPEDITION_FORM_CHANCE = 0.8;

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
export function measureBuildPower(build: Build, seconds = 20, seed = 1, environment: ExpeditionDef['environment'] = {}): number {
  const w = new CombatWorld({ seed });
  const p = w.addUnit({ id: 'p', name: '遠征', team: 'player', x: 0, y: 0, maxHp: 1e9, autoBattle: true });
  applyBuild(w, p, build);
  p.hp = p.maxHp;
  PACK.forEach((at, i) => w.addUnit({ id: `e${i}`, name: '案山子', team: 'enemy', ...at, maxHp: 1e9, resist: environment.resist }));
  // 行き先の環境。雨なら全員が濡れ、床は群れの足元に敷く
  if (environment.weather) w.weather = environment.weather;
  if (environment.floor) w.addFloor(environment.floor, 0, 0, 160);
  if (p.trump) w.queueSkill('p', p.trump, 5000);
  for (let t = 0; t < seconds * 1000; t += 25) w.update(25);
  return summarize(dealtBy(w.log, 'p'), w.time).total / seconds;
}

/** その行き先の環境で測ったビルドの強さ */
export function measureAt(build: Build, destination: ExpeditionId, seed = 1): number {
  return measureBuildPower(build, 20, seed, expeditionDef(destination).environment);
}

/** その強さで行ったとき、負傷して戻る確率 */
export function injuryChance(power: number, destination: ExpeditionId): number {
  const ratio = power / expeditionDef(destination).threat;
  if (ratio >= EXPEDITION_INJURY.below) return 0;
  return EXPEDITION_INJURY.maxChance * ((EXPEDITION_INJURY.below - ratio) / EXPEDITION_INJURY.below);
}

/** 負傷している間は戦えず、遠征にも出せない */
export function isInjured(c: Character, now: number): boolean {
  return (c.injuredUntil ?? 0) > now;
}

/** 戦える。遠征は隊が行くので、遠征中でも戦える。負傷の間は戦えない */
export function canFight(c: Character, now: number): boolean {
  return !isInjured(c, now);
}

/** 遠征に送り出せる(遠征に出ておらず、負傷もしていない) */
export function canSend(c: Character, now: number): boolean {
  return !c.expedition && !isInjured(c, now);
}

/** 持ち帰る量に掛ける倍率。ビルドの強さと行き先の手強さの比 */
export function expeditionYield(power: number, destination: ExpeditionId): number {
  const ratio = power / expeditionDef(destination).threat;
  return Math.min(EXPEDITION_YIELD.max, Math.max(EXPEDITION_YIELD.min, ratio));
}

/** 遠征に送り出す */
export function startExpedition(c: Character, destination: ExpeditionId, now: number, seed: number): void {
  // 送り出したときのビルドで遠征する。その後で支度を変えても、遠征には効かない
  c.expedition = { destination, startedAt: now, endsAt: now + expeditionDef(destination).duration, seed, build: JSON.parse(JSON.stringify(c.build)) as Build };
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
  /** 見つけた変化つきの技 */
  variants: SkillVariant[];
  /** 型の書で覚えた型 */
  forms: FormId[];
  /** 負傷して戻ったなら、治るまでの時間(ミリ秒) */
  injuredFor: number;
}

/**
 * 帰りを迎える。経験値を足し、持ち帰った装備と見つけたスキルを返す。
 * 乱数は遠征に出たときの種で決まるので、同じ遠征なら同じ物を持ち帰る
 */
export function finishExpedition(c: Character, learned: Learned, now: number = ex0(c)): ExpeditionReport | undefined {
  const ex = c.expedition;
  if (!ex) return undefined;
  const def = expeditionDef(ex.destination);
  const random = new CombatWorld({ seed: ex.seed });
  const rand = () => random.random();

  // 強さは、その地の環境(雨・油溜まり・敵の耐性)で測る
  const power = measureBuildPower(ex.build ?? c.build, 20, ex.seed, def.environment);
  const y = expeditionYield(power, ex.destination);
  const exp = Math.round(def.exp * y);
  const levelsGained = addExp(c, exp);

  // 持ち帰る装備には、その地らしい補正値・条件文・武器が出やすい
  const count = Math.max(1, Math.round(def.items * y));
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    const kind = def.itemKinds ? def.itemKinds[Math.floor(rand() * def.itemKinds.length)] : undefined;
    items.push(
      generateItem(rand, {
        ...(kind ? { kind, ...(kind === 'weapon' ? { slot: 'weapon1' as const } : {}) } : {}),
        weaponTypes: def.weaponTypes,
        preferElements: def.preferElements,
        preferAffixes: def.preferAffixes,
        preferConditions: def.preferConditions,
        conditionChance: def.conditionChance,
        // 送り出したときのビルドに半分ほど寄せる
        fit: lootFit(ex.build ?? c.build),
      }),
    );
  }

  // まだ覚えていないスキルを見つける。その地で見つかりやすいものがあれば、半分の確率でそこから
  const skills: (ActiveSkillId | PassiveId)[] = [];
  const pool = unlearnedSkills(learned);
  if (pool.length > 0 && rand() < Math.min(1, def.skillChance * y)) {
    const local = pool.filter((s) => (def.preferSkills as readonly string[] | undefined)?.includes(s.id));
    const from = local.length > 0 && rand() < 0.5 ? local : pool;
    const found = from[Math.floor(rand() * from.length)]!;
    if (found.kind === 'active') learned.actives.push(found.id as ActiveSkillId);
    else learned.passives.push(found.id as PassiveId);
    skills.push(found.id);
  }

  // 型の書を見つける。スキルと同じくらいの頻度で、まだ知らない型を1つ覚える
  const forms: FormId[] = [];
  const knownForms = learnedForms(learned);
  const unknownForms = FORM_IDS.filter((id) => !knownForms.includes(id));
  if (unknownForms.length > 0 && rand() < Math.min(1, def.skillChance * y * EXPEDITION_FORM_CHANCE)) {
    const found = unknownForms[Math.floor(rand() * unknownForms.length)]!;
    learned.forms = [...knownForms, found];
    forms.push(found);
  }

  // 変化つきの技を見つける。元の技を覚えていなければ、一緒に覚える
  const variants: SkillVariant[] = [];
  if (rand() < Math.min(1, def.variantChance * y)) {
    const local = VARIANT_BASES.filter((id) => (def.preferSkills as readonly string[] | undefined)?.includes(id));
    const from = local.length > 0 && rand() < 0.5 ? local : VARIANT_BASES;
    const base = from[Math.floor(rand() * from.length)]!;
    variants.push(rollVariant(rand, base, def.preferVariations));
    if (!learned.actives.includes(base)) {
      learned.actives.push(base);
      skills.push(base);
    }
  }

  // 弱いまま危ない所へ行くと、負傷して戻ることがある
  let injuredFor = 0;
  if (rand() < injuryChance(power, ex.destination)) {
    injuredFor = Math.max(EXPEDITION_INJURY.minMs, def.duration * EXPEDITION_INJURY.durationRatio);
    c.injuredUntil = Math.max(now, ex.endsAt) + injuredFor;
  }

  c.expedition = undefined;
  return { destination: ex.destination, power, yield: y, exp, levelsGained, items, skills, variants, forms, injuredFor };
}

/** 変化が付く技(敵のものでない技) */
export const VARIANT_BASES = FINDABLE_ACTIVES.filter((id) => isTechnique(activeSkillDef(id)));

/** 技を試す武器。素手より、その技に合う最初の武器を使う */
function trialWeapon(base: ActiveSkillId): WeaponTypeId {
  const def = activeSkillDef(base);
  const fits = WEAPON_TYPE_IDS.filter((w) => isTechnique(def) && techniqueFits(def, w));
  return fits.find((w) => w !== 'fists') ?? fits[0] ?? 'fists';
}

export function trialBuild(base: ActiveSkillId, variant?: SkillVariant): Build {
  const weapon = trialWeapon(base);
  // 能力値の足りなさで測り違えないよう、武器と技の必要な分だけは持たせる
  const needs = [activeSkillDef(base).needs, weaponDef(weapon).needs];
  const attributes = baseAttributes();
  for (const id of ATTRIBUTE_IDS) attributes[id] = Math.max(attributes[id], ...needs.map((n) => n?.[id] ?? 0));
  return {
    attributes,
    actives: [base],
    passives: [],
    equipment: { weapon1: { id: 'trial', name: '試し', kind: 'weapon', affixes: [], weaponType: weapon } },
    tactics: [{ skill: base, condition: 'always', enabled: true }],
    ...(variant ? { variants: { [base]: variant } } : {}),
  };
}

/**
 * 変化で元の技より何倍強くなったか。晴れと雨の両方で測り、強く出た方を返す。
 * 雨乞うのように環境で効く変化も、その環境での伸びで見る
 */
export function variantPowerRatio(v: SkillVariant, seconds = 30): number {
  const envs: ExpeditionDef['environment'][] = [{}, { weather: 'rain' }];
  return Math.max(
    ...envs.map((env) => {
      const before = measureBuildPower(trialBuild(v.base), seconds, 1, env);
      const after = measureBuildPower(trialBuild(v.base, v), seconds, 1, env);
      return before > 0 ? after / before : 1;
    }),
  );
}

/** 変化つきの技を作る。早回しで測って強すぎるもの(外れ値)は作り直す */
export function rollVariant(random: () => number, base: ActiveSkillId, prefer: readonly VariationId[] = []): SkillVariant {
  const def = activeSkillDef(base);
  if (!isTechnique(def)) throw new Error(`${def.name} は技ではない`);
  let v = generateVariant(random, base, def.technique, prefer);
  for (let i = 0; i < 5 && variantPowerRatio(v) > VARIANT_RULES.maxPowerRatio; i++) {
    v = generateVariant(random, base, def.technique, prefer);
  }
  return v;
}

/** 迎えた時刻を渡されなければ、戻るはずだった時刻に迎えたことにする */
function ex0(c: Character): number {
  return c.expedition?.endsAt ?? 0;
}
