import {
  CONDITIONS,
  CONDITION_IDS,
  ELEMENTS,
  ELEMENT_IDS,
  FIELDS,
  FIELD_IDS,
  PASSIVES,
  PASSIVE_IDS,
  STATUSES,
  STATUS_IDS,
  type CombatWorld,
  type ElementId,
  type FieldId,
  type Unit,
} from '@hakusura/core';
import { INPUT_ACTIONS, INPUT_ACTION_IDS, bindingLabel, saveKeybinds, type Binding, type Keybinds } from '../input/keybinds';
import type { InputController } from '../input/InputController';
import { h, signedPercent } from './dom';

export interface TrainingHost {
  world: CombatWorld;
  player: Unit;
  scarecrows: Unit[];
  input: InputController;
  keybinds: Keybinds;
  walking: boolean;
  setFloor(field: FieldId, on: boolean): void;
  resetMeasure(): void;
}

const RESIST_STEPS = [-1, -0.5, 0, 0.25, 0.5, 0.75, 1];

/** 試し斬り場の支度。天候・床・案山子・装備をここで切り替える */
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
      checkbox(FIELDS[id].name, world.floors.some((f) => f.field === id), (on) => host.setFloor(id, on)),
    ),
  );

  const statuses = h(
    'div',
    { class: 'choices' },
    ...STATUS_IDS.map((id) =>
      checkbox(
        STATUSES[id].name,
        false,
        (on) => host.scarecrows.forEach((s) => world.forceStatus(s.id, id, on)),
        STATUSES[id].color,
      ),
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

  const toggleLoadout = <T extends string>(list: T[], id: T, on: boolean) => {
    const i = list.indexOf(id);
    if (on && i < 0) list.push(id);
    if (!on && i >= 0) list.splice(i, 1);
  };

  const passives = h(
    'div',
    { class: 'loadout' },
    ...PASSIVE_IDS.map((id) =>
      checkbox(
        PASSIVES[id].name,
        host.player.passives.includes(id),
        (on) => toggleLoadout(host.player.passives, id, on),
        undefined,
        PASSIVES[id].description,
      ),
    ),
  );

  const conditions = h(
    'div',
    { class: 'loadout' },
    ...CONDITION_IDS.map((id) =>
      checkbox(
        `${CONDITIONS[id].rule.label}`,
        host.player.conditions.includes(id),
        (on) => toggleLoadout(host.player.conditions, id, on),
        undefined,
        `${CONDITIONS[id].no}. ${CONDITIONS[id].text}(コスト ${CONDITIONS[id].cost}%)`,
      ),
    ),
  );

  return h(
    'aside',
    { class: 'panel' },
    h('h2', {}, '試し斬り場'),
    section('天候', weather),
    section('床', floors),
    section('案山子に刻む状態', statuses),
    section('案山子の耐性', resists),
    section(
      '案山子',
      h('div', { class: 'choices' }, checkbox('歩かせる', host.walking, (on) => (host.walking = on))),
    ),
    section('パッシブ', passives),
    section('条件文', conditions),
    h('button', { class: 'reset', onclick: blurAfter(() => host.resetMeasure()) }, '勘定をやり直す'),
    keybindSection(host),
  );

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
