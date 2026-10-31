import { describe, it } from 'vitest';
import { CombatWorld } from '../world';
import { applyBuild } from '../build';
import { dealtBy, summarize } from '../breakdown';
import { ENEMIES } from '../data/enemies';
import { ARCHETYPES } from './archetypes';
import { measureField, outfit, reportArchetype, runEncounter } from './simulate';
import { measureSingle, theoreticalMax, THEORY } from './theory';
import { COMBO_BUILDS, withConditions } from './comboBuilds';
import { MARKS, type MarkId } from '../data/marks';
import { measureBuildPower } from '../expedition';
import { measureLoadout } from '../loadout';
import { conditionDef } from '../data/conditions';
import type { EncounterId } from '../data/encounters';

declare const console: { log(...a: unknown[]): void };
declare const process: { env: Record<string, string | undefined> };

/**
 * ビルドの強さの傾向の報告。重いので普段は回さない。
 * `npm run sim`(`SIM=1 npx vitest run --root packages/core src/sim/report.test.ts`)で、表を Markdown で出す
 */
const ENCOUNTERS: EncounterId[] = ['ashNight', 'fogVigil', 'plagueMarch', 'ashWyvern'];
const SEEDS = [1, 2, 3];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');

describe.skipIf(!process.env.SIM)('ビルドの強さの報告', () => {
  it('型どおりのビルドを測る', () => {
    const lines: string[] = [];
    const rows: string[] = [];
    const enc: string[] = [];
    const sources: string[] = [];
    for (const [id, a] of Object.entries(ARCHETYPES)) {
      const r = reportArchetype(a.build, ENCOUNTERS, SEEDS);
      const geared = r.geared;
      const conds = geared.equipment.filter((e) => e.includes('〔'));
      const links = conds.filter((e) => e.includes('〔link:'));
      rows.push(
        `| ${a.name} | ${n0(r.bare.single)} | ${n0(r.bare.pack)} | ${n0(geared.single)} | ${n0(geared.pack)} | ×${(geared.pack / Math.max(1, r.bare.pack)).toFixed(1)} | ${n0(geared.toughness)} | ${conds.length}(繋ぎ${links.length}) |`,
      );
      const cells = ENCOUNTERS.map((e) => {
        const runs = r.encounters[e]!;
        const wins = runs.filter((x) => x.result === 'cleared').length;
        const time = runs.reduce((s, x) => s + x.seconds, 0) / runs.length;
        const falls = runs.reduce((s, x) => s + x.falls, 0) / runs.length;
        const dps = runs.reduce((s, x) => s + x.dps, 0) / runs.length;
        return `${wins}/${runs.length} ${Math.round(time)}秒 倒${falls.toFixed(1)} ${n0(dps)}/秒`;
      });
      enc.push(`| ${a.name} | ${cells.join(' | ')} |`);
      const first = r.encounters.ashNight![0]!;
      const boss = r.encounters.ashWyvern![0]!;
      sources.push(
        `| ${a.name} | ${first.topSources.map(([k, v]) => `${k} ${pct(v)}`).join('、')} | ${first.topVia.map(([k, v]) => `${k} ${pct(v)}`).join('、') || '—'} | ${first.topCombos.map(([k, v]) => `${k} ${pct(v)}`).join('、') || '—'} | ${boss.topSources.slice(0, 2).map(([k, v]) => `${k} ${pct(v)}`).join('、')} |`,
      );
      lines.push(`- **${a.name}**の揃えた装備:${geared.equipment.map((e) => e.replace(/〔([^〕]+)〕/, (_, c) => `〔${conditionDef(c).text}〕`)).join(' / ') || 'なし'}`);
    }
    const out = [
      '## 火力と耐久(Lv30・能力値32点)',
      '',
      '| ビルド | 素・1体 | 素・群れ | 揃え・1体 | 揃え・群れ | 装備で | 耐久 | 条件文 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...rows,
      '',
      '## 一戦(操り手つき、3回ずつ。勝ち数・平均の時間・倒れた回数・毎秒の傷)',
      '',
      `| ビルド | ${ENCOUNTERS.join(' | ')} |`,
      `| --- | ${ENCOUNTERS.map(() => '---').join(' | ')} |`,
      ...enc,
      '',
      '## 傷の出どころ(灰の街道の夜の1回目と、灰翼の巣の1回目)',
      '',
      '| ビルド | 発動元(夜) | 条件文・パッシブ(夜) | コンボ(夜) | 発動元(飛竜) |',
      '| --- | --- | --- | --- | --- |',
      ...sources,
      '',
      '## 揃えた装備',
      '',
      ...lines,
    ];
    console.log(['<<<REPORT', ...out, 'REPORT>>>'].join('\n'));
  }, 3_600_000);
});

/**
 * ステップの有無で一戦を比べる。`npm run sim:step`
 * 近接は射手や支援役に追いつけず、群れを討ち尽くせなかったので、ステップで詰め・避けたときを測る
 */
describe.skipIf(!process.env.SIM_STEP)('ステップの有無', () => {
  it('近接を中心に、歩くだけとステップを比べる', () => {
    const ids = ['greatsword', 'bleedDual', 'shieldWall', 'hammer', 'oilFire', 'starter', 'archer'];
    const waves: EncounterId[] = ['ashNight', 'fogVigil', 'plagueMarch', 'ashWyvern'];
    const rows: string[] = [];
    for (const id of ids) {
      const geared = outfit(ARCHETYPES[id]!.build);
      for (const useStep of [false, true]) {
        const cells = waves.map((e) => {
          const runs = SEEDS.map((s) => runEncounter(geared, e, s, useStep));
          const wins = runs.filter((x) => x.result === 'cleared').length;
          const kills = runs.reduce((s, x) => s + x.kills / x.spawned, 0) / runs.length;
          const time = runs.reduce((s, x) => s + x.seconds, 0) / runs.length;
          const falls = runs.reduce((s, x) => s + x.falls, 0) / runs.length;
          const taken = runs.reduce((s, x) => s + x.taken, 0) / runs.length;
          const steps = runs.reduce((s, x) => s + x.steps.dodges + x.steps.closes, 0) / runs.length;
          return `${wins}/3 討${pct(kills)} ${Math.round(time)}秒 倒${falls.toFixed(1)} 受${n0(taken)}${useStep ? ` 踏${Math.round(steps)}` : ''}`;
        });
        rows.push(`| ${ARCHETYPES[id]!.name} | ${useStep ? 'ステップ' : '歩くだけ'} | ${cells.join(' | ')} |`);
      }
    }
    console.log(
      [
        '<<<REPORT',
        '| ビルド | 足 | ' + waves.join(' | ') + ' |',
        '| --- | --- | ' + waves.map(() => '---').join(' | ') + ' |',
        ...rows,
        'REPORT>>>',
      ].join('\n'),
    );
  }, 3_600_000);
});

/**
 * レベルを上げて、どこまで大物を討てるか。`npm run sim:level`
 * 2回とも討てたレベルを上へ辿り、初めて討ち漏らしたところで止める。装備は Lv30 で揃えたまま(高いレベルの持ち帰りは入れない)
 */
describe.skipIf(!process.env.SIM_LEVEL)('レベルの上り', () => {
  it('型どおりのビルドが、灰翼の巣を何レベルまで討てるか', () => {
    const rows: string[] = [];
    const LEVEL_SEEDS = [1, 2];
    for (const a of Object.values(ARCHETYPES)) {
      const geared = outfit(a.build);
      const cells: string[] = [];
      let best = 0;
      for (let level = 1; level <= 15; level++) {
        const runs = LEVEL_SEEDS.map((s) => runEncounter(geared, 'ashWyvern', s, true, undefined, level));
        const wins = runs.filter((x) => x.result === 'cleared').length;
        const time = runs.reduce((s, x) => s + x.seconds, 0) / runs.length;
        const falls = runs.reduce((s, x) => s + x.falls, 0) / runs.length;
        cells.push(`Lv${level} ${wins}/${runs.length} ${Math.round(time)}秒 倒${falls.toFixed(1)}`);
        if (wins < runs.length) break;
        best = level;
      }
      rows.push(`| ${a.name} | ${best} | ${cells.slice(-3).join('、')} |`);
    }
    console.log(['<<<REPORT', '| ビルド | 討てた最高のLv | 最後の3段 |', '| --- | --- | --- |', ...rows, 'REPORT>>>'].join('\n'));
  }, 3_600_000);
});

function dummy(build: Parameters<typeof applyBuild>[2], seconds = 60): number {
  const w = new CombatWorld({ seed: 1 });
  const p = w.addUnit({ id: 'p', name: '試し', team: 'player', x: 0, y: 0, maxHp: 1e9, autoBattle: true });
  applyBuild(w, p, build);
  w.addUnit({ id: 't', name: '案山子', team: 'enemy', x: 90, y: 0, maxHp: 1e9, radius: 46, resist: ENEMIES.wyvern.resist });
  if (p.trump) w.queueSkill('p', p.trump, 5000);
  for (let t = 0; t < seconds * 1000; t += 25) w.update(25);
  return summarize(dealtBy(w.log, 'p'), w.time).total / seconds;
}

/**
 * 操り手の働きの切り分け。`npm run sim:pilot`
 * 飛竜と同じ耐性の動かない案山子を理想として、本物の飛竜の地上の間にどれだけ出せたか、離れていた・手が空いていた割合を出す。
 * 案山子比が低く「遠い」が多ければ操り手の寄り方、「手が空く」が多ければ作戦か足の問題
 */
describe.skipIf(!process.env.SIM_PILOT)('操り手の働き', () => {
  it('灰翼の巣で、地上の間の火力を案山子と比べる', () => {
  const rows: string[] = [];
  for (const a of Object.values(ARCHETYPES)) {
    const g = outfit(a.build);
    const ideal = dummy(g);
    let ticks = 0, air = 0, groundDmg = 0, far = 0, idleNear = 0, last = 0;
    const real = runEncounter(g, 'ashWyvern', 1, true, (w, p) => {
      const b = [...w.units.values()].find((u) => u.kind === 'wyvern');
      if (!b) return;
      ticks++;
      const dealt = w.log.filter((r) => r.targetId === b.id).reduce((s, r) => s + r.amount, 0);
      const d = dealt - last; last = dealt;
      if (w.isAirborne(b)) air++;
      else {
        groundDmg += d;
        const gap = Math.hypot(b.x - p.x, b.y - p.y) - b.radius - p.radius;
        if (gap > 120) far++;
        else if (p.busyUntil <= w.time && p.windupUntil <= w.time) idleNear++;
      }
    });
    const ground = ticks - air;
    const pc = (v: number) => `${Math.round(v * 100)}%`;
    const gdps = groundDmg / Math.max(1, (ground * 25) / 1000);
    rows.push(`| ${a.name} | ${Math.round(ideal)} | ${pc(air / ticks)} | ${Math.round(gdps)} (${pc(gdps / ideal)}) | ${pc(far / Math.max(1, ground))} | ${pc(idleNear / Math.max(1, ground))} | ${real.result} ${Math.round(real.seconds)}秒 倒${real.falls} |`);
  }
  console.log(['<<<REPORT', '| ビルド | 案山子 | 飛ぶ間 | 地上のDPS(案山子比) | 地上で遠い | 近く手が空く | 結果 |', ...rows, 'REPORT>>>'].join('\n'));
  }, 3_600_000);
});

/**
 * 理論値。`npm run sim:theory`(THEORY_ONLY=id,id で絞れる)
 * ビルドごとに、素・拾い物300個から揃えた装備・決まりの中で一番火力の出る装備(理論値)を測り、1行ずつ JSON で出す
 */
describe.skipIf(!process.env.SIM_THEORY)('理論値', () => {
  it('ビルドごとの最大火力', () => {
    const only = process.env.THEORY_ONLY?.split(',');
    for (const [id, a] of Object.entries(ARCHETYPES)) {
      if (only && !only.includes(id)) continue;
      const t0 = Date.now();
      const bare = measureSingle(a.build, THEORY.finalSeconds);
      const geared = outfit(a.build, 300);
      const real = measureSingle(geared, THEORY.finalSeconds);
      const realField = measureField(geared, THEORY.finalSeconds);
      const theory = theoreticalMax(a.build, (line) => console.log(`[${id}] ${line}`));
      const row = {
        id,
        name: a.name,
        bare: { single: bare.dps, pack: measureBuildPower(a.build, THEORY.finalSeconds), maxHit: bare.maxHit },
        real: { field: realField.dps, falls: realField.falls, single: real.dps, pack: measureBuildPower(geared, THEORY.finalSeconds), maxHit: real.maxHit, toughness: measureLoadout(geared).toughness },
        theory: { ...theory, build: undefined },
        seconds: Math.round((Date.now() - t0) / 1000),
      };
      console.log(`THEORY ${JSON.stringify(row)}`);
    }
  }, 36_000_000);
});

/**
 * 印・技の型で組んだビルドの見本を測る。`npm run sim:combo`
 * 札なし・生む札だけ・全て揃えたものを、実戦に近い場で2回ずつ(30秒)戦わせ、印の出入りと型の回数も出す
 */
describe.skipIf(!process.env.SIM_COMBO)('印と型のビルド', () => {
  it('札なし・生むだけ・揃えを比べる', () => {
    const avg = (b: Parameters<typeof measureField>[0]) => {
      const runs = [1, 2].map((s) => measureField(b, 30, s));
      const sum = <T>(f: (r: (typeof runs)[number]) => T) => runs.map(f);
      const merge = (key: 'marksGained' | 'marksSpent' | 'forms') => {
        const out: Record<string, number> = {};
        for (const r of runs) for (const [k, v] of Object.entries(r[key])) out[k] = (out[k] ?? 0) + (v as number) / runs.length;
        return out;
      };
      return {
        dps: sum((r) => r.dps).reduce((a, b) => a + b, 0) / runs.length,
        falls: sum((r) => r.falls).reduce((a, b) => a + b, 0) / runs.length,
        gained: merge('marksGained'),
        spent: merge('marksSpent'),
        forms: merge('forms'),
        via: runs[0]!.topVia,
        sources: runs[0]!.topSources,
      };
    };
    const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
    const rows: string[] = [];
    const notes: string[] = [];
    for (const c of Object.values(COMBO_BUILDS)) {
      const bare = avg(c.build);
      const givers = avg(withConditions(c.build, c.givers));
      const full = avg(withConditions(c.build, c.full));
      const marks = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${MARKS[k as MarkId].name}${Math.round(v)}`).join('・') || '—';
      rows.push(
        `| ${c.name} | ${n0(bare.dps)} | ${n0(givers.dps)} | ${n0(full.dps)} | ×${(full.dps / Math.max(1, bare.dps)).toFixed(2)} | ${full.falls.toFixed(1)} | ${marks(full.gained)} | ${marks(full.spent)} | ${Object.entries(full.forms).map(([k, v]) => `${k}${Math.round(v)}`).join('・') || '—'} |`,
      );
      notes.push(`- **${c.name}**:${c.idea}。揃えの傷の出どころ:${full.sources.map(([k, v]) => `${k} ${pct(v)}`).join('、')}。効いた札:${full.via.map(([k, v]) => `${k} ${pct(v)}`).join('、') || '—'}`);
    }
    console.log(
      [
        '<<<REPORT',
        '| ビルド | 札なし | 生む札だけ | 揃え | 揃え/札なし | 倒れた | 印を得た回数 | 印を使った数 | 型 |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        ...rows,
        '',
        ...notes,
        'REPORT>>>',
      ].join('\n'),
    );
  }, 3_600_000);
});
