import {
  ACTIVE_SKILLS,
  AFFIXES,
  ARTIFACTS,
  BUILD_ACTIVE_IDS,
  BUILD_LIMITS,
  CONDITIONS,
  CONDITION_IDS,
  EQUIP_SLOTS,
  EQUIP_SLOT_IDS,
  GRIPS,
  PASSIVES,
  PASSIVE_IDS,
  SKILL_CATEGORIES,
  TRUMP_SKILL_IDS,
  activeSkillDef,
  benefitOf,
  buildProblems,
  canEquip,
  decodeBuild,
  encodeBuild,
  generateItem,
  itemTotal,
  type CombatWorld,
  type ConditionId,
  type EquipSlotId,
  type Item,
  type Unit,
} from '@hakusura/core';
import { h, signedPercent } from './dom';
import { createTacticsEditor } from './TacticsEditor';
import type { BuildState } from './buildStore';

type Tab = 'equipment' | 'skills' | 'tactics' | 'trump' | 'code';
const TABS: Record<Tab, string> = { equipment: '装備', skills: 'スキル', tactics: '作戦', trump: '切り札', code: 'コード' };

/** 拾い物を一度に拾う数 */
const LOOT_COUNT = 6;

export interface BuildScreenHost {
  state: BuildState;
  world: CombatWorld;
  player: Unit;
  random(): number;
  /** ビルドが変わったら呼ぶ。反映と保存は呼び出し側で行う */
  onChange(): void;
  onClose(): void;
  /** 支度を最初からやり直す */
  onReset(): void;
}

/** 支度の画面。装備・スキル・作戦・切り札を組み、ビルドコードで見せ合う */
export class BuildScreen {
  readonly el = h('div', { class: 'build-screen hidden' });
  private tab: Tab = 'equipment';
  private selectedSlot: EquipSlotId = 'head';
  private lootCondition: ConditionId | '' = '';
  private codeMessage = '';

  constructor(private host: BuildScreenHost) {}

  get visible(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    this.el.classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.el.classList.add('hidden');
    this.host.onClose();
  }

  private changed(): void {
    this.host.onChange();
    this.render();
  }

  render(): void {
    const { build } = this.host.state;
    const problems = buildProblems(build);
    this.el.replaceChildren(
      h(
        'div',
        { class: 'build-inner' },
        h(
          'header',
          {},
          h('h2', {}, '支度'),
          h('button', { class: 'close', onclick: () => this.close() }, '戦いに戻る'),
        ),
        this.renderStats(),
        problems.length > 0 ? h('p', { class: 'problems' }, problems.join(' / ')) : '',
        h(
          'nav',
          { class: 'tabs' },
          ...(Object.keys(TABS) as Tab[]).map((t) =>
            h('button', { class: t === this.tab ? 'on' : '', onclick: () => ((this.tab = t), this.render()) }, TABS[t]),
          ),
        ),
        h('div', { class: 'tab-body' }, this.renderTab()),
      ),
    );
  }

  private renderTab(): HTMLElement {
    switch (this.tab) {
      case 'equipment':
        return this.renderEquipment();
      case 'skills':
        return this.renderSkills();
      case 'tactics':
        return this.renderTactics();
      case 'trump':
        return this.renderTrump();
      case 'code':
        return this.renderCode();
    }
  }

  /** 今のビルドで変わった能力。条件つきの補正は、今満たしているものだけ入る */
  private renderStats(): HTMLElement {
    const { world, player } = this.host;
    const pct = (v: number) => signedPercent(v - 1);
    const rows: [string, string][] = [
      ['持ち方', player.grip ? GRIPS[player.grip].name : '—'],
      ['最大HP', String(player.maxHp)],
      ['移動速度', pct(world.statOf(player, 'moveSpeed'))],
      ['被ダメージ', pct(world.statOf(player, 'damageTaken'))],
      ['クールダウン', pct(world.statOf(player, 'cooldown'))],
      ['近攻撃', pct(world.statOf(player, 'damage', ['melee']))],
      ['遠攻撃', pct(world.statOf(player, 'damage', ['ranged', 'projectile']))],
      ['斬', pct(world.statOf(player, 'damage', ['slash']))],
      ['火', pct(world.statOf(player, 'damage', ['fire']))],
      ['雷', pct(world.statOf(player, 'damage', ['lightning']))],
    ];
    return h('div', { class: 'build-stats' }, ...rows.map(([k, v]) => h('span', {}, h('small', {}, k), v)));
  }

  // ---- 装備 ----

  private renderEquipment(): HTMLElement {
    const { state } = this.host;
    const equipped = state.build.equipment;
    const slots = h(
      'div',
      { class: 'slots-list' },
      ...EQUIP_SLOT_IDS.map((slot) => {
        const item = equipped[slot];
        return h(
          'div',
          { class: `slot-row${slot === this.selectedSlot ? ' selected' : ''}`, onclick: () => this.selectSlot(slot) },
          h('span', { class: 'slot-name' }, EQUIP_SLOTS[slot].name),
          item ? itemCard(item, h('button', { onclick: (e: Event) => (e.stopPropagation(), this.unequip(slot)) }, '外す')) : h('span', { class: 'empty' }, '空き'),
        );
      }),
    );

    const equippedIds = new Set(Object.values(equipped).map((i) => i?.id));
    const candidates = state.stash.filter((item) => !equippedIds.has(item.id) && canEquip(item, this.selectedSlot));
    const loot = h(
      'div',
      { class: 'loot' },
      h('button', { onclick: () => this.loot() }, `拾い物をする(${LOOT_COUNT}個)`),
      h(
        'label',
        {},
        '条件文つきで1つ拾う ',
        h(
          'select',
          { onchange: (e: Event) => (this.lootCondition = (e.target as HTMLSelectElement).value as ConditionId | '') },
          h('option', { value: '' }, '—'),
          ...CONDITION_IDS.map((id) => h('option', { value: id, selected: id === this.lootCondition }, `${CONDITIONS[id].no}. ${CONDITIONS[id].text}`)),
        ),
        h('button', { disabled: !this.lootCondition, onclick: () => this.lootWithCondition() }, '拾う'),
      ),
      h('small', {}, `拾い物の山:${state.stash.length - equippedIds.size}個(放置で手に入る想定)`),
    );

    return h(
      'div',
      { class: 'equipment' },
      slots,
      h(
        'section',
        { class: 'candidates' },
        h('h3', {}, `${EQUIP_SLOTS[this.selectedSlot].name}に着けられるもの`),
        loot,
        candidates.length === 0
          ? h('p', { class: 'empty' }, '着けられるものがない。拾い物をしよう')
          : h(
              'div',
              { class: 'item-list' },
              ...candidates.map((item) =>
                itemCard(
                  item,
                  h('button', { onclick: () => this.equip(item) }, '着ける'),
                  h('button', { class: 'discard', onclick: () => this.discard(item) }, '捨てる'),
                ),
              ),
            ),
      ),
    );
  }

  /** 部位を選ぶ。狭い画面では候補が下にあるので、そこまで送る */
  private selectSlot(slot: EquipSlotId): void {
    this.selectedSlot = slot;
    this.render();
    if (window.innerWidth < 760) this.el.querySelector('.candidates')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private equip(item: Item): void {
    this.host.state.build.equipment[this.selectedSlot] = item;
    this.changed();
  }

  private unequip(slot: EquipSlotId): void {
    delete this.host.state.build.equipment[slot];
    this.changed();
  }

  private discard(item: Item): void {
    this.host.state.stash = this.host.state.stash.filter((i) => i.id !== item.id);
    this.changed();
  }

  private loot(): void {
    for (let i = 0; i < LOOT_COUNT; i++) this.host.state.stash.unshift(generateItem(() => this.host.random()));
    this.changed();
  }

  private lootWithCondition(): void {
    if (!this.lootCondition) return;
    const slot = this.selectedSlot;
    this.host.state.stash.unshift(generateItem(() => this.host.random(), { slot, kind: EQUIP_SLOTS[slot].kind, condition: this.lootCondition }));
    this.changed();
  }

  // ---- スキル ----

  private renderSkills(): HTMLElement {
    const { build } = this.host.state;
    const toggle = <T>(list: T[], id: T, on: boolean) => {
      const i = list.indexOf(id);
      if (on && i < 0) list.push(id);
      if (!on && i >= 0) list.splice(i, 1);
      this.changed();
    };
    const total = build.actives.length + build.passives.length;
    return h(
      'div',
      { class: 'skills' },
      h('p', { class: 'counter' }, `アクティブ ${build.actives.length} / ${BUILD_LIMITS.actives}  ・  スキル合計 ${total} / ${BUILD_LIMITS.skills}`),
      h('h3', {}, 'アクティブ'),
      ...BUILD_ACTIVE_IDS.map((id) => {
        const def = activeSkillDef(id);
        return h(
          'label',
          { class: 'skill-row' },
          h('input', { type: 'checkbox', checked: build.actives.includes(id), onchange: (e: Event) => toggle(build.actives, id, (e.target as HTMLInputElement).checked) }),
          h('span', {}, def.name),
          h('small', {}, `${SKILL_CATEGORIES[def.category]}・${(def.cooldown / 1000).toFixed(1)}秒・${def.description ?? ''}`),
        );
      }),
      h('h3', {}, 'パッシブ'),
      ...PASSIVE_IDS.map((id) =>
        h(
          'label',
          { class: 'skill-row' },
          h('input', { type: 'checkbox', checked: build.passives.includes(id), onchange: (e: Event) => toggle(build.passives, id, (e.target as HTMLInputElement).checked) }),
          h('span', {}, PASSIVES[id].name),
          h('small', {}, PASSIVES[id].description),
        ),
      ),
    );
  }

  // ---- 作戦 ----

  private renderTactics(): HTMLElement {
    const { build } = this.host.state;
    const editor = createTacticsEditor(build.tactics, { skills: () => build.actives, onChange: () => this.host.onChange() });
    return h('div', {}, editor.el);
  }

  // ---- 切り札 ----

  private renderTrump(): HTMLElement {
    const { build } = this.host.state;
    return h(
      'div',
      { class: 'trumps' },
      ...TRUMP_SKILL_IDS.map((id) =>
        h(
          'label',
          { class: 'skill-row' },
          h('input', {
            type: 'radio',
            name: 'trump',
            checked: build.trump === id,
            onchange: () => {
              build.trump = id;
              this.changed();
            },
          }),
          h('span', {}, ACTIVE_SKILLS[id].name),
          h('small', {}, `${activeSkillDef(id).description ?? ''}(${ACTIVE_SKILLS[id].cooldown / 1000}秒)`),
        ),
      ),
    );
  }

  // ---- コード ----

  private renderCode(): HTMLElement {
    const code = encodeBuild(this.host.state.build);
    const out = h('textarea', { readonly: true, rows: 4 }) as HTMLTextAreaElement;
    out.value = code;
    const input = h('textarea', { rows: 4, placeholder: 'ここにビルドコードを貼る' }) as HTMLTextAreaElement;
    return h(
      'div',
      { class: 'code' },
      h('h3', {}, '今のビルド'),
      out,
      h(
        'button',
        {
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(code);
              this.codeMessage = '写した';
            } catch {
              out.select();
              this.codeMessage = '選んだので、手で写してほしい';
            }
            this.render();
          },
        },
        '写す',
      ),
      h('h3', {}, '読み込む'),
      input,
      h(
        'button',
        {
          onclick: () => {
            const result = decodeBuild(input.value);
            if ('error' in result) {
              this.codeMessage = `読み込めない:${result.error}`;
              this.render();
              return;
            }
            // 読み込んだ装備は拾い物の山にも入れておく
            const { state } = this.host;
            const known = new Set(state.stash.map((i) => i.id));
            for (const item of Object.values(result.build.equipment)) if (item && !known.has(item.id)) state.stash.unshift(item);
            state.build = result.build;
            this.codeMessage = '読み込んだ';
            this.changed();
          },
        },
        '読み込む',
      ),
      this.codeMessage ? h('p', { class: 'message' }, this.codeMessage) : '',
      h('h3', {}, 'やり直す'),
      h(
        'button',
        {
          class: 'discard',
          onclick: () => {
            if (!confirm('支度と拾い物を最初に戻す。よいか')) return;
            this.host.onReset();
            this.render();
          },
        },
        '支度を最初に戻す',
      ),
    );
  }
}

/** 装備1つの札。補正値は得になる向きを明るく、損になる向きを赤くする */
function itemCard(item: Item, ...actions: HTMLElement[]): HTMLElement {
  const artifact = item.artifact ? ARTIFACTS[item.artifact] : undefined;
  const kindName = item.artifact ? 'アーティファクト' : item.kind === 'armor' && item.slot ? EQUIP_SLOTS[item.slot].name : item.kind === 'weapon' ? '武器' : '装飾品';
  const total = itemTotal(item);
  return h(
    'div',
    { class: `item-card${artifact ? ' artifact' : ''}` },
    h('div', { class: 'item-head' }, h('b', {}, item.name), h('small', {}, kindName), artifact ? '' : h('small', { class: 'total' }, `合計 ${signedPercent(total / 100)}`)),
    artifact ? h('p', { class: 'artifact-text' }, artifact.text) : '',
    ...item.affixes.map((a) =>
      h('div', { class: `affix ${benefitOf(a) >= 0 ? 'good' : 'bad'}` }, `${AFFIXES[a.affix].name} ${signedPercent(a.value / 100)}`),
    ),
    item.condition ? h('div', { class: 'affix condition' }, `${CONDITIONS[item.condition].text}(コスト ${CONDITIONS[item.condition].cost}%)`) : '',
    actions.length > 0 ? h('div', { class: 'item-actions' }, ...actions) : '',
  );
}
