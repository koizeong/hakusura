import { ACTIVE_SKILLS, ENEMIES, FORMS, PASSIVES, variantName, type Breakdown, type Encounter, type EncounterSpoils, type EnemyId } from '@hakusura/core';
import { itemIconUrl } from '../art/items';
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
  /** 大物の体力の棒 */
  private bossBar: HTMLElement;
  private bossName: HTMLElement;
  private bossFill: HTMLElement;
  private bossLag: HTMLElement;
  /** 減った分を遅れて追う棒の割合 */
  private lag = 1;

  constructor(private readonly onQuit: () => void) {
    this.text = h('span', {});
    this.bar = h('div', { class: 'encounter-bar' }, this.text, h('button', { onclick: () => this.onQuit() }, '退く'));
    this.bossName = h('div', { class: 'boss-name' });
    this.bossFill = h('div', { class: 'boss-fill' });
    this.bossLag = h('div', { class: 'boss-lag' });
    this.bossBar = h('div', { class: 'boss-bar' }, this.bossName, h('div', { class: 'boss-track' }, this.bossLag, this.bossFill));
    this.result = h('div', { class: 'encounter-result' });
    this.el = h('div', { class: 'encounter' }, this.bar, this.bossBar, this.result);
    this.hide();
  }

  update(e: Encounter): void {
    this.bar.style.display = '';
    const next = e.nextWaveIn;
    const left = e.alive().length;
    if (e.def.boss) {
      this.text.textContent = `${e.def.name} ${clock(e.elapsed)} / ${clock(e.def.duration)}`;
      const boss = e.boss();
      this.bossBar.style.display = boss ? '' : 'none';
      if (boss) {
        const ratio = Math.max(0, boss.hp) / boss.maxHp;
        this.lag = Math.max(ratio, this.lag - 0.004);
        this.bossName.textContent = `${boss.name}${boss.enraged ? '・逆鱗' : ''}`;
        this.bossBar.classList.toggle('enraged', boss.enraged);
        this.bossFill.style.width = `${ratio * 100}%`;
        this.bossLag.style.width = `${this.lag * 100}%`;
      }
      return;
    }
    this.text.textContent =
      `${e.def.name} ${clock(e.elapsed)} / ${clock(e.def.duration)}・第${e.wave}波 / ${e.def.waves.length}・討った ${e.kills}・残る ${left}` +
      (next !== undefined ? `・次の群れまで ${Math.ceil(next / 1000)}秒` : '');
  }

  showResult(e: Encounter, breakdown: Breakdown, falls: number, onClose: () => void, spoils?: EncounterSpoils): void {
    this.bar.style.display = 'none';
    this.bossBar.style.display = 'none';
    const boss = e.def.boss ? ENEMIES[e.def.boss].name : undefined;
    const title = boss ? (e.result === 'cleared' ? '討ち果たした' : `${boss}は去った`) : e.result === 'cleared' ? '討ち尽くした' : '夜が明けた';
    const lead = boss
      ? e.result === 'cleared'
        ? `${clock(e.elapsed)}で${boss}を討ち果たした`
        : `${clock(e.elapsed)}を凌いだが、${boss}は灰の峰へ飛び去った`
      : e.result === 'cleared'
        ? `${clock(e.elapsed)}で全ての群れを退けた`
        : `${clock(e.elapsed)}を持ちこたえた。残った敵は闇へ退いた`;
    const kills = new Map<EnemyId, number>();
    for (const id of e.spawned) {
      const kind = id.split('-')[0] as EnemyId;
      if (!kills.has(kind)) kills.set(kind, 0);
    }
    for (const d of e.deadKinds()) kills.set(d, (kills.get(d) ?? 0) + 1);
    const seconds = e.elapsed / 1000;
    this.result.replaceChildren(
      h('h2', {}, title),
      h('p', {}, lead),
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
      spoils ? this.renderSpoils(spoils) : '',
      h('button', { onclick: () => (this.hide(), onClose()) }, '試し斬り場に戻る'),
    );
    this.result.style.display = '';
  }

  /** 持ち帰った物 */
  private renderSpoils(s: EncounterSpoils): HTMLElement {
    const skillName = (id: string) => (id in PASSIVES ? PASSIVES[id as keyof typeof PASSIVES].name : ACTIVE_SKILLS[id as keyof typeof ACTIVE_SKILLS].name);
    const lines = [
      `経験値 ${s.exp}${s.levelsGained > 0 ? `(レベル +${s.levelsGained})` : ''}`,
      ...s.skills.map((id) => `覚えた:${skillName(id)}`),
      ...s.forms.map((id) => `型の書:${FORMS[id].name}`),
      ...s.variants.map((v) => `変化つきの技:${variantName(v, ACTIVE_SKILLS[v.base].name)}`),
    ];
    return h(
      'section',
      { class: 'spoils' },
      h('h3', {}, s.share < 1 ? '拾えた物(僅か)' : '持ち帰った物'),
      h('ul', { class: 'spoils-items' }, ...s.items.map((item) => h('li', {}, h('img', { class: 'item-icon', src: itemIconUrl(item), alt: '' }), item.name))),
      h('ul', { class: 'spoils-lines' }, ...lines.map((l) => h('li', {}, l))),
      h('p', { class: 'spoils-note' }, '装備と技は拾い物の山に積んだ(支度で着けられる)'),
    );
  }

  hide(): void {
    this.bar.style.display = 'none';
    this.bossBar.style.display = 'none';
    this.lag = 1;
    this.result.style.display = 'none';
  }
}
