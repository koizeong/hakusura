import { describe, it } from 'vitest';
import { ARCHETYPES } from './archetypes';
import { outfit, reportArchetype, runEncounter } from './simulate';
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
