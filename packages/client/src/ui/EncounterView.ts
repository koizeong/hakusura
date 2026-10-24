import { ENEMIES, type Breakdown, type Encounter, type EnemyId } from '@hakusura/core';
import { h } from './dom';

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 一戦の残り時間・群れ・討った数と、終わったときの知らせ */
export class EncounterView {
  readonly el: HTMLElement;
  private bar: HTMLElement;
  private text: HTMLElement;
  private result: HTMLElement;

  constructor(private readonly onQuit: () => void) {
    this.text = h('span', {});
    this.bar = h('div', { class: 'encounter-bar' }, this.text, h('button', { onclick: () => this.onQuit() }, '退く'));
    this.result = h('div', { class: 'encounter-result' });
    this.el = h('div', { class: 'encounter' }, this.bar, this.result);
    this.hide();
  }

  update(e: Encounter): void {
    this.bar.style.display = '';
    const next = e.nextWaveIn;
    const left = e.alive().length;
    this.text.textContent =
      `${e.def.name} ${clock(e.elapsed)} / ${clock(e.def.duration)}・第${e.wave}波 / ${e.def.waves.length}・討った ${e.kills}・残る ${left}` +
      (next !== undefined ? `・次の群れまで ${Math.ceil(next / 1000)}秒` : '');
  }

  showResult(e: Encounter, breakdown: Breakdown, falls: number, onClose: () => void): void {
    this.bar.style.display = 'none';
    const kills = new Map<EnemyId, number>();
    for (const id of e.spawned) {
      const kind = id.split('-')[0] as EnemyId;
      if (!kills.has(kind)) kills.set(kind, 0);
    }
    for (const d of e.deadKinds()) kills.set(d, (kills.get(d) ?? 0) + 1);
    const seconds = e.elapsed / 1000;
    this.result.replaceChildren(
      h('h2', {}, e.result === 'cleared' ? '討ち尽くした' : '夜が明けた'),
      h('p', {}, e.result === 'cleared' ? `${clock(e.elapsed)}で全ての群れを退けた` : `${clock(e.elapsed)}を持ちこたえた。残った敵は闇へ退いた`),
      h(
        'dl',
        {},
        h('dt', {}, '討った数'),
        h('dd', {}, `${e.kills} / ${e.spawned.length}`),
        h('dt', {}, '倒れた回数'),
        h('dd', {}, `${falls}`),
        h('dt', {}, '与えた傷'),
        h('dd', {}, `${Math.round(breakdown.total)}(毎秒 ${(breakdown.total / Math.max(1, seconds)).toFixed(0)})`),
      ),
      h(
        'ul',
        { class: 'kills' },
        ...[...kills].map(([kind, n]) => h('li', {}, `${ENEMIES[kind].name} ${n}`)),
      ),
      h('button', { onclick: () => (this.hide(), onClose()) }, '試し斬り場に戻る'),
    );
    this.result.style.display = '';
  }

  hide(): void {
    this.bar.style.display = 'none';
    this.result.style.display = 'none';
  }
}
