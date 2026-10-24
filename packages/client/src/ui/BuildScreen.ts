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
  type Build,
  type Character,
  characterPoints,
  newCharacter,
  unspentPoints,
  expToNext,
  EXPEDITIONS,
  EXPEDITION_IDS,
  EXPEDITION_YIELD,
  expeditionDone,
  expeditionYield,
  finishExpedition,
  isLearned,
  measureAt,
  canFight,
  injuryChance,
  isInjured,
  EXPEDITION_INJURY,
  FIELDS,
  type ExpeditionDef,
  startExpedition,
  type ActiveSkillId,
  type ExpeditionId,
  type ExpeditionReport,
  type PassiveId,
} from '@hakusura/core';
import { h, signedPercent } from './dom';
import { createTacticsEditor } from './TacticsEditor';
import { CHARACTER_LIMIT, characterName, currentBuild, currentCharacter, newCharacterId, type BuildState } from './buildStore';

type Tab = 'expedition' | 'equipment' | 'attributes' | 'skills' | 'tactics' | 'trump' | 'code';
const TABS: Record<Tab, string> = {
  expedition: '遠征',
  equipment: '装備',
  attributes: '能力',
  skills: 'スキル',
  tactics: '作戦',
  trump: '切り札',
  code: 'コード',
};

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
  /** 遠征に送り出す者と、最後に迎えたときの知らせ */
  private sender?: Character;
  private lastReport?: { name: string; level: number; report: ExpeditionReport };
  private powerCache = new Map<string, number>();
  /** 能力値の仮振り。「決める」まで反映しない */
  private draft: Partial<Record<AttributeId, number>> = {};
  private codeMessage = '';

  constructor(private host: BuildScreenHost) {}

  /** 今選んでいるキャラとビルド */
  private get character(): Character {
    return currentCharacter(this.host.state);
  }

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
    const problems = buildProblems(build, characterPoints(this.character));
    this.el.replaceChildren(
      h(
        'div',
        { class: 'build-inner' },
        h(
          'header',
          {},
          h('h2', {}, `支度 ― ${this.character.name}`),
          h('button', { class: 'close', onclick: () => this.close() }, '戦いに戻る'),
        ),
        this.renderCharacters(),
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
      case 'expedition':
        return this.renderExpedition();
    }
  }

  /** キャラの切り替え。1キャラ1ビルドで、拾い物の山は全キャラで共有する */
  private renderCharacters(): HTMLElement {
    const { state } = this.host;
    return h(
      'div',
      { class: 'presets' },
      h(
        'select',
        {
          onchange: (e: Event) => {
            state.current = Number((e.target as HTMLSelectElement).value);
            this.draft = {};
            this.changed();
          },
        },
        ...state.characters.map((c, i) => {
          const left = unspentPoints(c);
          const now = Date.now();
          const away = c.expedition ? (expeditionDone(c, now) ? '・帰還' : '・遠征中') : isInjured(c, now) ? '・負傷' : '';
          return h('option', { value: i, selected: i === state.current, disabled: !canFight(c, now) }, `${c.name} Lv${c.level}${away}${left > 0 ? `(未振り ${left})` : ''}`);
        }),
      ),
      h(
        'button',
        {
          disabled: state.characters.length >= CHARACTER_LIMIT,
          title: `新しいキャラを作る(${CHARACTER_LIMIT}人まで)。能力値は低い所から育つ`,
          onclick: () => {
            const name = prompt('新しいキャラの名前', characterName(state.characters.length))?.trim();
            if (!name) return;
            // 装備・スキル・作戦は今のキャラを写して始める。能力値は基礎から
            const { attributes: _, ...rest } = JSON.parse(JSON.stringify(this.build)) as Build;
            void _;
            state.characters.push(newCharacter(newCharacterId(), name.slice(0, 20), Date.now(), rest));
            state.current = state.characters.length - 1;
            this.draft = {};
            this.tab = 'attributes';
            this.changed();
          },
        },
        '新しく作る',
      ),
      h(
        'button',
        {
          onclick: () => {
            const c = this.character;
            const name = prompt('キャラの名前', c.name)?.trim();
            if (!name) return;
            c.name = name.slice(0, 20);
            this.changed();
          },
        },
        '名を変える',
      ),
      h(
        'button',
        {
          class: 'discard',
          disabled: state.characters.length <= 1,
          onclick: () => {
            if (!confirm(`「${this.character.name}」を葬る。育った分も消える。よいか`)) return;
            state.characters.splice(state.current, 1);
            state.current = Math.max(0, state.current - 1);
            this.draft = {};
            this.changed();
          },
        },
        '葬る',
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
    const c = this.character;
    const attrs = (build.attributes ??= baseAttributes());
    const drafted = ATTRIBUTE_IDS.reduce((sum, id) => sum + (this.draft[id] ?? 0), 0);
    const left = unspentPoints(c) - drafted;
    const value = (id: AttributeId) => attrs[id] + (this.draft[id] ?? 0);
    const step = (id: AttributeId, by: number) => {
      const next = (this.draft[id] ?? 0) + by;
      if (next < 0 || (by > 0 && left <= 0)) return;
      this.draft[id] = next;
      this.render();
    };
    // 仮に振った値で、能力値の効き目と足りないものを見せる
    const preview: Attributes = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, value(id)])) as Attributes;
    const R = ATTRIBUTE_RULES;
    const effect = (id: AttributeId): string => {
      const up = preview[id] - R.base;
      switch (id) {
        case 'str':
          return `近攻撃 ${signedPercent(R.meleePerStr * up)}`;
        case 'dex':
          return `間隔 ${signedPercent(Math.pow(R.intervalPerDex, up) - 1)}`;
        case 'int':
          return `雷 ${signedPercent(R.lightningPerInt * up)}`;
        case 'fai':
          return `火 ${signedPercent(R.firePerFai * up)}`;
        case 'vit':
          return `最大HP ${signedPercent(R.hpPerVit * up)}`;
      }
    };
    const shortages: string[] = [];
    for (const w of new Set(buildWeapons(build))) {
      if (missingPoints(weaponDef(w).needs, preview)) shortages.push(`${WEAPON_TYPES[w].name}:要 ${needsText(weaponDef(w).needs)}`);
    }
    for (const id of [...build.actives, ...(build.trump ? [build.trump] : [])]) {
      const def = activeSkillDef(id);
      if (missingPoints(def.needs, preview)) shortages.push(`${def.name}:要 ${needsText(def.needs)}`);
    }
    const atMax = c.level >= R.maxLevel;
    return h(
      'div',
      { class: 'attributes' },
      h(
        'div',
        { class: 'level' },
        h('b', {}, `Lv ${c.level}`),
        h('div', { class: 'exp-bar' }, h('div', { class: 'exp-fill', style: `width:${atMax ? 100 : (c.exp / expToNext(c.level)) * 100}%` })),
        h('small', {}, atMax ? '上限' : `経験値 ${c.exp} / ${expToNext(c.level)}`),
      ),
      h('p', { class: 'counter' }, `振れる点数 残り ${left}(Lv${c.level}で${characterPoints(c)}点。レベルが上がるごとに${R.pointsPerLevel}点)`),
      h('p', { class: 'note' }, '経験値は遠征で得る。能力値は基礎値なので、強さの多くはビルドで決まる'),
      ...ATTRIBUTE_IDS.map((id) =>
        h(
          'div',
          { class: `attr-row${this.draft[id] ? ' drafted' : ''}` },
          h('span', { class: 'attr-name' }, ATTRIBUTES[id].name),
          h('button', { disabled: !this.draft[id], onclick: () => step(id, -1) }, '−'),
          h('b', { class: 'attr-value' }, String(value(id))),
          h('button', { disabled: left <= 0, onclick: () => step(id, 1) }, '+'),
          h('small', {}, h('span', { class: 'attr-effect' }, effect(id)), ` ${ATTRIBUTES[id].description}`),
        ),
      ),
      h(
        'div',
        { class: 'attr-actions' },
        h(
          'button',
          {
            class: 'commit',
            disabled: drafted === 0,
            onclick: () => {
              if (!confirm(`${drafted}点を振る。振った点は戻せない。よいか`)) return;
              for (const id of ATTRIBUTE_IDS) attrs[id] += this.draft[id] ?? 0;
              this.draft = {};
              this.changed();
            },
          },
          '決める',
        ),
        h('button', { disabled: drafted === 0, onclick: () => ((this.draft = {}), this.render()) }, 'やめる'),
      ),
      h('h3', {}, '足りないもの'),
      shortages.length === 0
        ? h('p', { class: 'note' }, '今の武器と技は、全て足りている')
        : h('ul', { class: 'shortages' }, ...shortages.map((t) => h('li', {}, t))),
      h(
        'p',
        { class: 'note' },
        `振り直しはできない。違う振り方を試すなら、新しいキャラを作る。足りなくても使えるが、足りない1点ごとに威力-${R.powerPerMissing * 100}%・間隔+${R.intervalPerMissing * 100}%`,
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
        const known = isLearned(this.host.state.learned, id);
        if (!known) detail = '未修得。遠征で見つかる';
        return h(
          'label',
          { class: `skill-row${usable && known ? '' : ' unusable'}` },
          h('input', {
            type: 'checkbox',
            disabled: !known && !build.actives.includes(id),
            checked: build.actives.includes(id),
            onchange: (e: Event) => toggle(build.actives, id, (e.target as HTMLInputElement).checked),
          }),
          h('span', {}, def.name),
          h('small', {}, detail),
        );
      }),
      h('h3', {}, 'パッシブ'),
      ...PASSIVE_IDS.map((id) => {
        const known = isLearned(this.host.state.learned, id);
        return h(
          'label',
          { class: `skill-row${known ? '' : ' unusable'}` },
          h('input', {
            type: 'checkbox',
            disabled: !known && !build.passives.includes(id),
            checked: build.passives.includes(id),
            onchange: (e: Event) => toggle(build.passives, id, (e.target as HTMLInputElement).checked),
          }),
          h('span', {}, PASSIVES[id].name),
          h('small', {}, known ? PASSIVES[id].description : '未修得。遠征で見つかる'),
        );
      }),
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
          { class: `skill-row${isLearned(this.host.state.learned, id) ? '' : ' unusable'}` },
          h('input', {
            type: 'radio',
            name: 'trump',
            disabled: !isLearned(this.host.state.learned, id),
            checked: build.trump === id,
            onchange: () => {
              build.trump = id;
              this.changed();
            },
          }),
          h('span', {}, ACTIVE_SKILLS[id].name),
          h(
            'small',
            {},
            isLearned(this.host.state.learned, id)
              ? `${activeSkillDef(id).description ?? ''}(${(resolveSkill(id)?.cooldown ?? 0) / 1000}秒)`
              : '未修得。遠征で見つかる',
          ),
        ),
      ),
    );
  }

  // ---- 遠征 ----

  private renderExpedition(): HTMLElement {
    const { state } = this.host;
    const now = Date.now();
    const idle = state.characters.filter((c) => canFight(c, now));
    if (!this.sender || !idle.includes(this.sender)) this.sender = idle.includes(this.character) ? this.character : idle[0];
    const sender = this.sender;
    const minutes = (ms: number) => {
      const m = Math.ceil(ms / 60000);
      return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`;
    };

    const roster = h(
      'div',
      { class: 'roster' },
      ...state.characters.map((c) => {
        const ex = c.expedition;
        let status: HTMLElement;
        if (!ex && isInjured(c, now)) status = h('small', { class: 'injured' }, `負傷・治るまで${minutes((c.injuredUntil ?? now) - now)}`);
        else if (!ex) status = h('small', {}, '待機');
        else if (expeditionDone(c, now))
          status = h('button', { class: 'commit', onclick: () => this.welcome(c) }, `${EXPEDITIONS[ex.destination].name}から迎える`);
        else status = h('small', {}, `${EXPEDITIONS[ex.destination].name}へ・残り${minutes(ex.endsAt - now)}`);
        return h(
          'div',
          { class: `roster-row${c === sender ? ' selected' : ''}`, onclick: () => canFight(c, now) && ((this.sender = c), this.render()) },
          h('b', {}, c.name),
          h('small', {}, `Lv${c.level}`),
          status,
        );
      }),
    );

    // 送り出す者のビルドの強さ。行き先の環境で早回しして測るので、ビルドが変わったときだけ測り直す
    const destinations = h(
      'div',
      { class: 'destinations' },
      ...EXPEDITION_IDS.map((id) => {
        const d = EXPEDITIONS[id];
        const power = sender ? this.powerOf(sender, id) : 0;
        const y = sender ? expeditionYield(power, id) : 0;
        const risk = sender ? injuryChance(power, id) : 0;
        return h(
          'div',
          { class: 'destination' },
          h('div', { class: 'item-head' }, h('b', {}, d.name), h('small', {}, minutes(d.duration)), h('small', { class: 'total' }, `手強さ ${d.threat}`)),
          h('p', { class: 'artifact-text' }, d.description),
          h('small', { class: 'env' }, `環境:${environmentText(d)}`),
          h('small', {}, `経験値 ${d.exp}・装備 ${d.items}つ・新しいスキル ${Math.round(d.skillChance * 100)}%`),
          sender
            ? h(
                'small',
                { class: risk > 0 ? 'risk' : 'safe' },
                `${sender.name}の強さ ${Math.round(power)} → 見込み ×${y.toFixed(2)}${risk > 0 ? `・負傷の恐れ ${Math.round(risk * 100)}%` : ''}`,
              )
            : '',
          h(
            'div',
            { class: 'item-actions' },
            h(
              'button',
              {
                disabled: !sender,
                onclick: () => sender && this.send(sender, id),
              },
              sender ? `${sender.name}を送り出す` : '送り出せる者がいない',
            ),
          ),
        );
      }),
    );

    const report = this.lastReport;
    return h(
      'div',
      { class: 'expedition' },
      report ? this.renderReport(report) : '',
      h('h3', {}, '隊の者'),
      roster,
      h(
        'p',
        { class: 'note' },
        sender
          ? `強さはその地の環境で、そのビルドを早回しして測る。手強さより強いほど多く持ち帰り(${EXPEDITION_YIELD.min}〜${EXPEDITION_YIELD.max}倍)、手強さの${EXPEDITION_INJURY.below * 100}%に満たないと負傷することがある。遠征と負傷の間は戦えない`
          : '戦える者がいない。新しいキャラを作るか、帰りと傷が癒えるのを待つ',
      ),
      h('h3', {}, '行き先'),
      destinations,
      h(
        'button',
        {
          title: '試作用。遠征の時間を1時間進める',
          onclick: () => {
            for (const c of state.characters) {
              if (c.expedition) c.expedition.endsAt -= 60 * 60 * 1000;
              if (c.injuredUntil) c.injuredUntil -= 60 * 60 * 1000;
            }
            this.changed();
          },
        },
        '時を進める(1時間・試作用)',
      ),
    );
  }

  private powerOf(c: Character, destination: ExpeditionId): number {
    const key = `${c.id}:${destination}:${JSON.stringify(c.build)}`;
    let power = this.powerCache.get(key);
    if (power === undefined) {
      power = measureAt(c.build, destination);
      this.powerCache.set(key, power);
    }
    return power;
  }

  private send(c: Character, destination: ExpeditionId): void {
    const { state } = this.host;
    // 戦っている者を送り出したら、残っている者に替える。誰も残らないなら送れない
    if (c === this.character) {
      const other = state.characters.findIndex((o) => o !== c && canFight(o, Date.now()));
      if (other < 0) {
        alert('戦える者が残らない。新しいキャラを作ってから送り出す');
        return;
      }
      state.current = other;
      this.draft = {};
    }
    startExpedition(c, destination, Date.now(), Math.floor(this.host.random() * 1e9));
    this.sender = undefined;
    this.changed();
  }

  private welcome(c: Character): void {
    const report = finishExpedition(c, this.host.state.learned, Date.now());
    if (!report) return;
    this.host.state.stash.unshift(...report.items);
    this.lastReport = { name: c.name, level: c.level, report };
    this.changed();
  }

  private renderReport(r: { name: string; level: number; report: ExpeditionReport }): HTMLElement {
    const skillName = (id: string) => (id in PASSIVES ? PASSIVES[id as PassiveId].name : activeSkillDef(id as ActiveSkillId).name);
    return h(
      'section',
      { class: 'report' },
      h('h3', {}, `${r.name}が${EXPEDITIONS[r.report.destination].name}から戻った`),
      h(
        'p',
        {},
        `経験値 ${r.report.exp}(×${r.report.yield.toFixed(2)})${r.report.levelsGained > 0 ? `・Lv${r.level}に上がった(振れる点数 +${r.report.levelsGained})` : ''}`,
      ),
      r.report.skills.length > 0 ? h('p', { class: 'found' }, `覚えた:${r.report.skills.map(skillName).join('・')}`) : '',
      r.report.injuredFor > 0
        ? h('p', { class: 'injured' }, `深い傷を負って戻った。${Math.ceil(r.report.injuredFor / 60000)}分は戦えず、遠征にも出せない`)
        : '',
      h('p', {}, `持ち帰った装備 ${r.report.items.length}つ(拾い物の山に入れた)`),
      h('div', { class: 'item-list' }, ...r.report.items.map((item) => itemCard(this.attrs, item))),
      h('button', { onclick: () => ((this.lastReport = undefined), this.render()) }, '閉じる'),
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
            // 能力値はキャラのもの。読み込むのは装備・スキル・作戦・切り札だけ
            this.character.build = { ...result.build, attributes: this.build.attributes };
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

/** 行き先の環境を一言で */
function environmentText(d: ExpeditionDef): string {
  const parts: string[] = [];
  if (d.environment.weather) parts.push(FIELDS[d.environment.weather].name);
  if (d.environment.floor) parts.push(`${FIELDS[d.environment.floor].name}の床`);
  for (const [e, v] of Object.entries(d.environment.resist ?? {}) as [keyof typeof ELEMENTS, number][]) {
    parts.push(`敵は${ELEMENTS[e].name}に${v > 0 ? '強い' : '弱い'}`);
  }
  return parts.length > 0 ? parts.join('・') : 'なし';
}
