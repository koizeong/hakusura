import type { CombatWorld, Point, Unit } from './world';
import { encounterDef, type EncounterDef, type EncounterId } from './data/encounters';
import type { EnemyId } from './data/enemies';
import { generateItem, type Item } from './data/equipment';
import { FORM_IDS, type FormId } from './data/forms';
import type { ActiveSkillId } from './data/skills';
import type { PassiveId } from './data/passives';
import type { SkillVariant } from './data/variations';
import { addExp, type Character } from './build';
import { VARIANT_BASES, learnedForms, rollVariant, unlearnedSkills, type Learned } from './expedition';

/** 場を片付けてから、次の群れが来るまでの間 */
export const ENCOUNTER_BREATH = 3000;

export type EncounterResult = 'cleared' | 'survived';

/**
 * 1回の戦闘を進める。決まった時刻に敵の群れを、自分から離れた所へ呼ぶ。
 * 全ての群れを倒せば cleared、時間まで持ちこたえれば survived で終わる
 */
export class Encounter {
  readonly def: EncounterDef;
  readonly startedAt: number;
  /** 呼んだ群れの数 */
  wave = 0;
  spawned: string[] = [];
  result: EncounterResult | null = null;
  endedAt?: number;
  private serial = 0;
  /** 場を早く片付けて、前倒しで呼んだ時間 */
  private ahead = 0;

  constructor(
    private readonly world: CombatWorld,
    readonly id: EncounterId,
    private readonly hero: Unit,
  ) {
    this.def = encounterDef(id);
    this.startedAt = world.time;
    if (this.def.weather) world.weather = this.def.weather;
  }

  get elapsed(): number {
    return (this.endedAt ?? this.world.time) - this.startedAt;
  }

  /** 倒した数。呼び出された敵も数える */
  get kills(): number {
    return this.deadKinds().length;
  }

  /** 倒した敵の種類。倒した順 */
  deadKinds(): EnemyId[] {
    return this.world.deaths.flatMap((d) => (d.time >= this.startedAt && d.team !== this.hero.team && d.kind ? [d.kind] : []));
  }

  /** 大物の一戦なら、その大物(倒れていれば undefined) */
  boss(): Unit | undefined {
    if (!this.def.boss) return undefined;
    return this.alive().find((u) => u.kind === this.def.boss);
  }

  /** 場に残っている敵。この戦闘で呼んだ敵と、それが呼び出した敵 */
  alive(): Unit[] {
    return [...this.world.units.values()].filter((u) => u.mortal && u.team !== this.hero.team);
  }

  update(): void {
    if (this.result) return;
    const waves = this.def.waves;
    // 場を片付けたら、次の群れを待たせずに呼ぶ(少し息をつく間だけ置く)
    const next = waves[this.wave];
    if (next && this.wave > 0 && this.alive().length === 0 && next.at - this.clock > ENCOUNTER_BREATH) {
      this.ahead += next.at - this.clock - ENCOUNTER_BREATH;
    }
    while (this.wave < waves.length && waves[this.wave]!.at <= this.clock) {
      for (const { enemy, count } of waves[this.wave]!.spawn) {
        for (let i = 0; i < count; i++) {
          const at = this.spawnPoint();
          const id = `${enemy}-${++this.serial}`;
          this.world.spawnEnemy(enemy, id, at.x, at.y);
          this.spawned.push(id);
        }
      }
      this.wave++;
    }
    // 大物の一戦は、大物を討てば終わる
    const bossDown = !!this.def.boss && this.wave > 0 && !this.boss();
    if (bossDown || (this.wave >= waves.length && this.alive().length === 0)) this.finish('cleared');
    else if (this.elapsed >= this.def.duration) this.finish('survived');
  }

  /** 群れの予定の上での今の時刻。片付けて前倒しにした分だけ進んでいる */
  private get clock(): number {
    return this.elapsed + this.ahead;
  }

  /** 次の群れが来るまで(ミリ秒)。もう来なければ undefined */
  get nextWaveIn(): number | undefined {
    const next = this.def.waves[this.wave];
    return next ? next.at - this.clock : undefined;
  }

  private finish(result: EncounterResult): void {
    this.result = result;
    this.endedAt = this.world.time;
  }

  /** 自分から離れた、場の中の所。場の広さがなければ自分の周り */
  private spawnPoint(): Point {
    const b = this.world.bounds;
    for (let i = 0; i < 12; i++) {
      const a = this.world.random() * Math.PI * 2;
      const d = 420 + this.world.random() * 180;
      const p = { x: this.hero.x + Math.cos(a) * d, y: this.hero.y + Math.sin(a) * d };
      if (!b || (p.x > 40 && p.x < b.width - 40 && p.y > 40 && p.y < b.height - 40)) return p;
    }
    // 端に追い詰められていたら、場の中に収める
    const a = this.world.random() * Math.PI * 2;
    const p = { x: this.hero.x + Math.cos(a) * 420, y: this.hero.y + Math.sin(a) * 420 };
    return b ? { x: Math.min(b.width - 40, Math.max(40, p.x)), y: Math.min(b.height - 40, Math.max(40, p.y)) } : p;
  }
}

/** 一戦で持ち帰った物 */
export interface EncounterSpoils {
  /** 持ち帰った割合。討ち果たせば 1、時間切れなら reward.partial */
  share: number;
  exp: number;
  levelsGained: number;
  items: Item[];
  skills: (ActiveSkillId | PassiveId)[];
  forms: FormId[];
  variants: SkillVariant[];
}

/**
 * 一戦の持ち帰りを受け取る。経験値をキャラに足し、スキルと型は覚えたものに足す。
 * 装備と変化つきの技は返すので、呼び出し側が拾い物の山に積む。持ち帰りのない一戦なら undefined
 */
export function claimEncounterReward(e: Encounter, c: Character, learned: Learned, random: () => number): EncounterSpoils | undefined {
  const reward = e.def.reward;
  if (!reward || !e.result) return undefined;
  const share = e.result === 'cleared' ? 1 : reward.partial;
  const exp = Math.round(reward.exp * share);
  const levelsGained = addExp(c, exp);
  const items: Item[] = [];
  const count = Math.max(1, Math.round(reward.items * share));
  for (let i = 0; i < count; i++) {
    const kind = reward.itemKinds ? reward.itemKinds[Math.floor(random() * reward.itemKinds.length)] : undefined;
    items.push(
      generateItem(random, {
        ...(kind ? { kind, ...(kind === 'weapon' ? { slot: 'weapon1' as const } : {}) } : {}),
        preferElements: reward.preferElements,
        preferAffixes: reward.preferAffixes,
        conditionChance: reward.conditionChance,
      }),
    );
  }
  const skills: (ActiveSkillId | PassiveId)[] = [];
  const pool = unlearnedSkills(learned);
  if (pool.length > 0 && random() < reward.skillChance * share) {
    const found = pool[Math.floor(random() * pool.length)]!;
    if (found.kind === 'active') learned.actives.push(found.id as ActiveSkillId);
    else learned.passives.push(found.id as PassiveId);
    skills.push(found.id);
  }
  const forms: FormId[] = [];
  const unknown = FORM_IDS.filter((id) => !learnedForms(learned).includes(id));
  if (unknown.length > 0 && random() < reward.formChance * share) {
    const found = unknown[Math.floor(random() * unknown.length)]!;
    learned.forms = [...learnedForms(learned), found];
    forms.push(found);
  }
  const variants: SkillVariant[] = [];
  for (let i = 0; i < Math.floor(reward.variants * share); i++) {
    const base = VARIANT_BASES[Math.floor(random() * VARIANT_BASES.length)]!;
    variants.push(rollVariant(random, base));
    if (!learned.actives.includes(base)) {
      learned.actives.push(base);
      skills.push(base);
    }
  }
  return { share, exp, levelsGained, items, skills, forms, variants };
}
