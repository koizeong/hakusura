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
  ELEMENTS,
  LOOT_WEAPON_TYPE_IDS,
  WEAPON_KINDS,
  WEAPON_TYPES,
  activeSkillDef,
  buildWeapons,
  isTechnique,
  resolveSkill,
  techniqueFits,
  techniqueRequirement,
  unusableActives,
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
  type WeaponTypeId,
  ATTRIBUTES,
  ATTRIBUTE_IDS,
  ATTRIBUTE_RULES,
  baseAttributes,
  missingPoints,
  needsText,
  shortfallPenalty,
  weaponDef,
  spentPoints,
  type AttributeId,
  type Attributes,
} from '@hakusura/core';
import { h, signedPercent } from './dom';
import { createTacticsEditor } from './TacticsEditor';
import { PRESET_LIMIT, currentBuild, presetName, type BuildState } from './buildStore';

type Tab = 'equipment' | 'attributes' | 'skills' | 'tactics' | 'trump' | 'code';
const TABS: Record<Tab, string> = { equipment: '装備', attributes: '能力', skills: 'スキル', tactics: '作戦', trump: '切り札', code: 'コード' };

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
  private lootWeapon: WeaponTypeId = LOOT_WEAPON_TYPE_IDS[0]!;
  private codeMessage = '';

  constructor(private host: BuildScreenHost) {}

  /** 今選んでいるビルド */
  private get build() {
    return currentBuild(this.host.state);
  }

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
    const build = this.build;
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
        this.renderPresets(),
        this.renderStats(),
        problems.length > 0 ? h('p', { class: 'problems' }, problems.join(' / ')) : '',
        this.renderUnusable(),
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
      case 'attributes':
        return this.renderAttributes();
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

  /** ビルドの切り替え。拾い物の山は全てのビルドで共有する */
  private renderPresets(): HTMLElement {
    const { state } = this.host;
    return h(
      'div',
      { class: 'presets' },
      h(
        'select',
        {
          onchange: (e: Event) => {
            state.current = Number((e.target as HTMLSelectElement).value);
            this.changed();
          },
        },
        ...state.presets.map((p, i) => h('option', { value: i, selected: i === state.current }, p.name)),
      ),
      h(
        'button',
        {
          disabled: state.presets.length >= PRESET_LIMIT,
          title: `今のビルドを写して、新しいビルドを作る(${PRESET_LIMIT}つまで)`,
          onclick: () => {
            const copy = JSON.parse(JSON.stringify(this.build)) as typeof this.build;
            state.presets.push({ name: presetName(state.presets.length), build: copy });
            state.current = state.presets.length - 1;
            this.changed();
          },
        },
        '写して増やす',
      ),
      h(
        'button',
        {
          onclick: () => {
            const preset = state.presets[state.current]!;
            const name = prompt('ビルドの名前', preset.name)?.trim();
            if (!name) return;
            preset.name = name.slice(0, 20);
            this.changed();
          },
        },
        '名を変える',
      ),
      h(
        'button',
        {
          class: 'discard',
          disabled: state.presets.length <= 1,
          onclick: () => {
            if (!confirm(`「${state.presets[state.current]!.name}」を消す。よいか`)) return;
            state.presets.splice(state.current, 1);
            state.current = Math.max(0, state.current - 1);
            this.changed();
          },
        },
        '消す',
      ),
    );
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
    const equipped = this.build.equipment;
    const slots = h(
      'div',
      { class: 'slots-list' },
      ...EQUIP_SLOT_IDS.map((slot) => {
        const item = equipped[slot];
        return h(
          'div',
          { class: `slot-row${slot === this.selectedSlot ? ' selected' : ''}`, onclick: () => this.selectSlot(slot) },
          h('span', { class: 'slot-name' }, EQUIP_SLOTS[slot].name),
          item ? itemCard(this.attrs, item, h('button', { onclick: (e: Event) => (e.stopPropagation(), this.unequip(slot)) }, '外す')) : h('span', { class: 'empty' }, '空き'),
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
      EQUIP_SLOTS[this.selectedSlot].kind === 'weapon'
        ? h(
            'label',
            {},
            '武器を選んで1つ拾う ',
            h(
              'select',
              { onchange: (e: Event) => (this.lootWeapon = (e.target as HTMLSelectElement).value as WeaponTypeId) },
              ...LOOT_WEAPON_TYPE_IDS.map((id) => h('option', { value: id, selected: id === this.lootWeapon }, `${WEAPON_TYPES[id].name}(${weaponSummary(id)})`)),
            ),
            h('button', { onclick: () => this.lootWeaponType() }, '拾う'),
          )
        : '',
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
                  this.attrs,
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
    this.build.equipment[this.selectedSlot] = item;
    this.changed();
  }

  private unequip(slot: EquipSlotId): void {
    delete this.build.equipment[slot];
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

  private lootWeaponType(): void {
    this.host.state.stash.unshift(generateItem(() => this.host.random(), { slot: this.selectedSlot, kind: 'weapon', weaponType: this.lootWeapon }));
    this.changed();
  }

  /** 今の武器では出ない技を知らせる */
  /** 今のビルドの能力値。古い保存で持っていなければ基礎値 */
  private get attrs(): Attributes {
    return this.build.attributes ?? baseAttributes();
  }

  // ---- 能力 ----

  private renderAttributes(): HTMLElement {
    const build = this.build;
    const attrs = (build.attributes ??= baseAttributes());
    const left = ATTRIBUTE_RULES.points - spentPoints(attrs);
    const step = (id: AttributeId, by: number) => {
      const next = attrs[id] + by;
      if (next < ATTRIBUTE_RULES.base || (by > 0 && left <= 0)) return;
      attrs[id] = next;
      this.changed();
    };
    // 今の武器と技のうち、能力値が足りないもの
    const shortages: string[] = [];
    for (const w of new Set(buildWeapons(build))) {
      const m = missingPoints(weaponDef(w).needs, attrs);
      if (m) shortages.push(`${WEAPON_TYPES[w].name}:要 ${needsText(weaponDef(w).needs)}`);
    }
    for (const id of build.actives) {
      const def = activeSkillDef(id);
      if (missingPoints(def.needs, attrs)) shortages.push(`${def.name}:要 ${needsText(def.needs)}`);
    }
    if (build.trump && missingPoints(activeSkillDef(build.trump).needs, attrs)) {
      const def = activeSkillDef(build.trump);
      shortages.push(`${def.name}:要 ${needsText(def.needs)}`);
    }
    return h(
      'div',
      { class: 'attributes' },
      h('p', { class: 'counter' }, `残り ${left} 点(振り直しは無料)`),
      ...ATTRIBUTE_IDS.map((id) =>
        h(
          'div',
          { class: 'attr-row' },
          h('span', { class: 'attr-name' }, ATTRIBUTES[id].name),
          h('button', { disabled: attrs[id] <= ATTRIBUTE_RULES.base, onclick: () => step(id, -1) }, '−'),
          h('b', { class: 'attr-value' }, String(attrs[id])),
          h('button', { disabled: left <= 0, onclick: () => step(id, 1) }, '+'),
          h('small', {}, ATTRIBUTES[id].description),
        ),
      ),
      h(
        'button',
        {
          class: 'discard',
          onclick: () => {
            build.attributes = baseAttributes();
            this.changed();
          },
        },
        '全て振り直す',
      ),
      h('h3', {}, '足りないもの'),
      shortages.length === 0
        ? h('p', { class: 'note' }, '今の武器と技は、全て足りている')
        : h('ul', { class: 'shortages' }, ...shortages.map((t) => h('li', {}, t))),
      h(
        'p',
        { class: 'note' },
        `足りなくても使えるが、足りない1点ごとに威力-${ATTRIBUTE_RULES.powerPerMissing * 100}%・間隔+${ATTRIBUTE_RULES.intervalPerMissing * 100}%(武器と技の分を合わせる)`,
      ),
    );
  }

  private renderUnusable(): HTMLElement | string {
    const ids = unusableActives(this.build);
    if (ids.length === 0) return '';
    const names = ids.map((id) => {
      const def = activeSkillDef(id);
      return isTechnique(def) ? `${def.name}(${techniqueRequirement(def, (e) => ELEMENTS[e].name)}が要る)` : def.name;
    });
    return h('p', { class: 'problems' }, `今の武器では出ない:${names.join('、')}`);
  }

  // ---- スキル ----

  private renderSkills(): HTMLElement {
    const build = this.build;
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
      h('p', { class: 'note' }, `技は武器の速さ・範囲・属性で出る。今の武器:${buildWeapons(build).map((w) => WEAPON_TYPES[w].name).join('・')}`),
      ...BUILD_ACTIVE_IDS.map((id) => {
        const def = activeSkillDef(id);
        let detail: string;
        let usable = true;
        if (isTechnique(def)) {
          // 今の武器のうち、最初に合うもので出したときの数値を見せる
          const weapon = buildWeapons(build).find((w) => techniqueFits(def, w));
          const r = weapon ? resolveSkill(id, weapon, this.attrs) : undefined;
          usable = !!r;
          detail = `${techniqueRequirement(def, (e) => ELEMENTS[e].name)}・${r ? `${WEAPON_TYPES[weapon!].name}で ${(r.cooldown / 1000).toFixed(1)}秒` : '今の武器では出ない'}・${def.description ?? ''}`;
          if (r?.missing) detail += `・${shortfallText(r.missing)}`;
        } else {
          const r = resolveSkill(id, undefined, this.attrs)!;
          detail = `${SKILL_CATEGORIES[def.category]}・${(r.cooldown / 1000).toFixed(1)}秒・${def.description ?? ''}`;
          if (r.missing) detail += `・${shortfallText(r.missing)}`;
        }
        if (def.needs) detail = `要 ${needsText(def.needs)}・${detail}`;
        return h(
          'label',
          { class: `skill-row${usable ? '' : ' unusable'}` },
          h('input', { type: 'checkbox', checked: build.actives.includes(id), onchange: (e: Event) => toggle(build.actives, id, (e.target as HTMLInputElement).checked) }),
          h('span', {}, def.name),
          h('small', {}, detail),
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
    const build = this.build;
    const editor = createTacticsEditor(build.tactics, { skills: () => build.actives, onChange: () => this.host.onChange() });
    return h('div', {}, editor.el);
  }

  // ---- 切り札 ----

  private renderTrump(): HTMLElement {
    const build = this.build;
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
          h('small', {}, `${activeSkillDef(id).description ?? ''}(${(resolveSkill(id)?.cooldown ?? 0) / 1000}秒)`),
        ),
      ),
    );
  }

  // ---- コード ----

  private renderCode(): HTMLElement {
    const code = encodeBuild(this.build);
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
            state.presets[state.current]!.build = result.build;
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
function itemCard(attrs: Attributes, item: Item, ...actions: HTMLElement[]): HTMLElement {
  const needs = item.weaponType ? weaponDef(item.weaponType).needs : undefined;
  const missing = missingPoints(needs, attrs);
  const artifact = item.artifact ? ARTIFACTS[item.artifact] : undefined;
  const kindName = item.artifact ? 'アーティファクト' : item.kind === 'armor' && item.slot ? EQUIP_SLOTS[item.slot].name : item.kind === 'weapon' ? '武器' : '装飾品';
  const total = itemTotal(item);
  return h(
    'div',
    { class: `item-card${artifact ? ' artifact' : ''}` },
    h('div', { class: 'item-head' }, h('b', {}, item.name), h('small', {}, kindName), artifact ? '' : h('small', { class: 'total' }, `合計 ${signedPercent(total / 100)}`)),
    artifact ? h('p', { class: 'artifact-text' }, artifact.text) : '',
    item.weaponType ? h('div', { class: 'weapon-stats' }, weaponSummary(item.weaponType)) : '',
    needs ? h('div', { class: `needs${missing ? ' short' : ''}` }, `要 ${needsText(needs)}${missing ? `(${shortfallText(missing)})` : ''}`) : '',
    ...item.affixes.map((a) =>
      h('div', { class: `affix ${benefitOf(a) >= 0 ? 'good' : 'bad'}` }, `${AFFIXES[a.affix].name} ${signedPercent(a.value / 100)}`),
    ),
    item.condition ? h('div', { class: 'affix condition' }, `${CONDITIONS[item.condition].text}(コスト ${CONDITIONS[item.condition].cost}%)`) : '',
    actions.length > 0 ? h('div', { class: 'item-actions' }, ...actions) : '',
  );
}

/** 武器の性能を一行で */
function weaponSummary(id: WeaponTypeId): string {
  const w = WEAPON_TYPES[id];
  const shape = w.kind === 'melee' ? `扇${w.arc}°` : `弾速${w.speed}`;
  return `${WEAPON_KINDS[w.kind]}・${ELEMENTS[w.element].name}・威力${w.power}・間隔${(w.interval / 1000).toFixed(2)}秒・射程${w.range}・${shape}`;
}

/** 能力値が足りないときの影響を一言で */
function shortfallText(missing: number): string {
  const p = shortfallPenalty(missing);
  return `${missing}点足りない:威力${signedPercent(p.power - 1)}・間隔${signedPercent(p.interval - 1)}`;
}
