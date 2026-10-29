import {
  ELEMENTS,
  ELEMENT_IDS,
  FIELDS,
  FIELD_IDS,
  STATUSES,
  STATUS_IDS,
  ENCOUNTERS,
  ENCOUNTER_IDS,
  ENEMIES,
  ENEMY_IDS,
  type CombatWorld,
  type StatusDef,
  type ElementId,
  type EncounterId,
  type EnemyId,
  type FieldId,
  type Unit,
} from '@hakusura/core';
import { INPUT_ACTIONS, INPUT_ACTION_IDS, bindingLabel, saveKeybinds, type Binding, type Keybinds } from '../input/keybinds';
import type { InputController } from '../input/InputController';
import { h, signedPercent } from './dom';

export type BattleMode = 'auto' | 'manual';

export const ENEMY_ATTACKS = { none: 'しない', swipe: '薙ぎだけ', barrage: '薙ぎと弾幕' } as const;
export type EnemyAttack = keyof typeof ENEMY_ATTACKS;

export interface TrainingHost {
  world: CombatWorld;
  player: Unit;
  scarecrows: Unit[];
  input: InputController;
  keybinds: Keybinds;
  walking: boolean;
  mode: BattleMode;
  setEnemyAttack(attack: EnemyAttack): void;
  setFloor(field: FieldId, on: boolean): void;
  resetMeasure(): void;
  spawnEnemy(kind: EnemyId): void;
  clearEnemies(): void;
  startEncounter(id: EncounterId, level: number): void;
  /** 一戦の開いたレベル。討ち果たすたびに上がる */
  encounterLevel(id: EncounterId): number;
}

/** 一戦のレベルが変わったとき、パネルに送る知らせ */
export const LEVELS_CHANGED = 'levels-changed';

const RESIST_STEPS = [-1, -0.5, 0, 0.25, 0.5, 0.75, 1];

/** 試し斬り場。天候・床・案山子をここで切り替える。ビルドは「支度」の画面で組む */
export function createTrainingPanel(host: TrainingHost): HTMLElement {
  const { world } = host;
  // 操作がキーに奪われないよう、触ったら必ずフォーカスを外す
  const blurAfter = (fn: (e: Event) => void) => (e: Event) => {
    fn(e);
    (e.target as HTMLElement).blur();
  };

  const weatherFields = FIELD_IDS.filter((id) => FIELDS[id].kind === 'weather');
  const floorFields = FIELD_IDS.filter((id) => FIELDS[id].kind === 'floor');

  const weather = h(
    'div',
    { class: 'choices' },
    ...[null, ...weatherFields].map((id) =>
      h(
        'label',
        {},
        h('input', {
          type: 'radio',
          name: 'weather',
          checked: world.weather === id,
          onchange: blurAfter(() => (world.weather = id)),
        }),
        id ? FIELDS[id].name : '曇天(なし)',
      ),
    ),
  );

  const floors = h(
    'div',
    { class: 'choices' },
    ...floorFields.map((id) =>
      checkbox(
        FIELDS[id].name,
        world.floors.some((f) => f.field === id),
        (on) => host.setFloor(id, on),
      ),
    ),
  );

  const statuses = h(
    'div',
    { class: 'choices' },
    // 瀕死・無傷・鈍重のように様子で決まるものは刻めない
    ...STATUS_IDS.filter((id) => !(STATUSES[id] as StatusDef).derived).map((id) =>
      checkbox(STATUSES[id].name, false, (on) => host.scarecrows.forEach((s) => world.forceStatus(s.id, id, on)), STATUSES[id].color),
    ),
  );

  const resists = h(
    'div',
    { class: 'resists' },
    ...ELEMENT_IDS.map((id: ElementId) =>
      h(
        'label',
        {},
        h('span', { style: `color:${css(ELEMENTS[id].color)}` }, ELEMENTS[id].name),
        h(
          'select',
          {
            onchange: blurAfter((e) => {
              const v = Number((e.target as HTMLSelectElement).value);
              host.scarecrows.forEach((s) => (s.resist[id] = v));
            }),
          },
          ...RESIST_STEPS.map((v) => h('option', { value: v, selected: v === 0 }, signedPercent(v))),
        ),
      ),
    ),
  );

  const mode = h(
    'div',
    { class: 'choices' },
    ...(
      [
        ['auto', '自動'],
        ['manual', '手動(PC)'],
      ] as const
    ).map(([id, label]) =>
      h(
        'label',
        {},
        h('input', { type: 'radio', name: 'mode', checked: host.mode === id, onchange: blurAfter(() => (host.mode = id)) }),
        label,
      ),
    ),
  );

  // 敵を1体ずつ呼んで試す。選ぶと、その敵が問うことを見せる
  let enemyKind: EnemyId = ENEMY_IDS[0]!;
  const concept = h('small', { class: 'concept' }, ENEMIES[enemyKind].concept);
  const enemies = h(
    'div',
    { class: 'enemy-call' },
    h(
      'div',
      { class: 'row' },
      h(
        'select',
        {
          onchange: blurAfter((e) => {
            enemyKind = (e.target as HTMLSelectElement).value as EnemyId;
            concept.textContent = ENEMIES[enemyKind].concept;
          }),
        },
        ...ENEMY_IDS.map((id) => h('option', { value: id }, ENEMIES[id].name)),
      ),
      h('button', { onclick: blurAfter(() => host.spawnEnemy(enemyKind)) }, '呼ぶ'),
      h('button', { onclick: blurAfter(() => host.clearEnemies()) }, '払う'),
    ),
    concept,
  );
  const levelRefreshers: (() => void)[] = [];
  const battles = h(
    'div',
    { class: 'battles' },
    ...ENCOUNTER_IDS.map((id) => {
      // 開いたレベルまで選べる。既定は一番上
      const pick = h('select', { class: 'battle-level', 'aria-label': 'レベル' }) as HTMLSelectElement;
      const button = h('button', { class: 'start-battle', onclick: blurAfter(() => host.startEncounter(id, Number(pick.value))) });
      const label = () => (button.textContent = `${ENCOUNTERS[id].name}に挑む(${minutesText(ENCOUNTERS[id].duration)})`);
      const refresh = () => {
        const max = host.encounterLevel(id);
        pick.replaceChildren(...Array.from({ length: max }, (_, i) => h('option', { value: String(max - i) }, `Lv${max - i}`)));
        pick.value = String(max);
        label();
      };
      pick.addEventListener('change', blurAfter(label));
      levelRefreshers.push(refresh);
      refresh();
      return h('div', {}, h('div', { class: 'battle-row' }, button, pick), h('small', {}, ENCOUNTERS[id].description));
    }),
  );

  const body = h(
    'div',
    { class: 'panel-body' },
    section('一戦', battles),
    section('敵を呼ぶ', enemies),
    section('戦い方', mode),
    section('天候', weather),
    section('床', floors),
    section('案山子に刻む状態', statuses),
    section('案山子の耐性', resists),
    section(
      '案山子',
      h(
        'div',
        { class: 'choices' },
        checkbox('歩かせる', host.walking, (on) => (host.walking = on)),
        h(
          'label',
          { class: 'attack-select' },
          '攻め ',
          h(
            'select',
            { onchange: blurAfter((e) => host.setEnemyAttack((e.target as HTMLSelectElement).value as EnemyAttack)) },
            ...(Object.keys(ENEMY_ATTACKS) as EnemyAttack[]).map((id) =>
              h('option', { value: id, selected: id === 'barrage' }, ENEMY_ATTACKS[id]),
            ),
          ),
        ),
      ),
    ),
    h('button', { class: 'reset', onclick: blurAfter(() => host.resetMeasure()) }, '勘定をやり直す'),
    keybindSection(host),
  );

  // 狭い画面では畳んでおき、見出しを押して開く
  const panel = h('aside', { class: `panel${window.innerWidth < 760 ? ' closed' : ''}` });
  const title = h('h2', { onclick: () => panel.classList.toggle('closed') }, '試し斬り場', h('span', { class: 'fold' }, ''));
  panel.append(title, body);
  panel.addEventListener(LEVELS_CHANGED, () => levelRefreshers.forEach((f) => f()));
  return panel;

  function checkbox(label: string, checked: boolean, onChange: (on: boolean) => void, color?: number, note?: string) {
    return h(
      'label',
      { class: note ? 'with-note' : '' },
      h('input', {
        type: 'checkbox',
        checked,
        onchange: blurAfter((e) => onChange((e.target as HTMLInputElement).checked)),
      }),
      h('span', color !== undefined ? { style: `color:${css(color)}` } : {}, label),
      note ? h('small', {}, note) : null,
    );
  }
}

/** 「3分半」のように言う */
function minutesText(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return s === 0 ? `${m}分` : s === 30 ? `${m}分半` : `${m}分${s}秒`;
}

function section(title: string, body: HTMLElement): HTMLElement {
  return h('section', {}, h('h3', {}, title), body);
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** キーの割り当て。ボタンを押してから、割り当てたいキーかマウスのボタンを押す */
function keybindSection(host: TrainingHost): HTMLElement {
  const rows = INPUT_ACTION_IDS.map((action) => {
    const button = h('button', {}, bindingLabel(host.keybinds[action]));
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      button.textContent = '…押せ';
      host.input.capturing = true;
      const finish = (binding: Binding | null) => {
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('mousedown', onMouse, true);
        if (binding) {
          host.keybinds[action] = binding;
          saveKeybinds(host.keybinds);
          host.input.setBinds(host.keybinds);
        }
        button.textContent = bindingLabel(host.keybinds[action]);
        button.blur();
        // 押したボタンの mouseup が抜けるまで待ってから操作を戻す
        setTimeout(() => (host.input.capturing = false), 0);
      };
      const onKey = (ev: KeyboardEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        finish(ev.code === 'Escape' ? null : { device: 'key', code: ev.code });
      };
      const onMouse = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        finish({ device: 'mouse', button: ev.button });
      };
      setTimeout(() => {
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('mousedown', onMouse, true);
      }, 0);
    });
    return h('label', {}, h('span', {}, INPUT_ACTIONS[action]), button);
  });
  return h('details', { class: 'keybinds' }, h('summary', {}, 'キーの割り当て'), h('div', { class: 'resists' }, ...rows));
}
