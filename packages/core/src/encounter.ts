import type { CombatWorld, Point, Unit } from './world';
import { encounterDef, type EncounterDef, type EncounterId } from './data/encounters';
import type { EnemyId } from './data/enemies';

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
  }

  get elapsed(): number {
    return (this.endedAt ?? this.world.time) - this.startedAt;
  }

  /** 倒した数 */
  get kills(): number {
    return this.deadKinds().length;
  }

  /** 倒した敵の種類。倒した順 */
  deadKinds(): EnemyId[] {
    const ids = new Set(this.spawned);
    return this.world.deaths.flatMap((d) => (ids.has(d.unitId) && d.kind ? [d.kind] : []));
  }

  /** 場に残っている、この戦闘で呼んだ敵 */
  alive(): Unit[] {
    return this.spawned.flatMap((id) => this.world.units.get(id) ?? []);
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
    if (this.wave >= waves.length && this.alive().length === 0) this.finish('cleared');
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
