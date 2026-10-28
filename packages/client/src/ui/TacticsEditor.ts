import {
  ACTIVE_SKILLS,
  DEFAULT_TACTICS,
  ELEMENTS,
  FOLLOW_UP,
  FORMS,
  FORM_IDS,
  SKILL_CATEGORIES,
  STATUSES,
  TACTIC_CONDITIONS,
  TACTIC_CONDITION_GROUPS,
  TACTIC_CONDITION_IDS,
  stepText,
  type ActiveSkillId,
  type FormId,
  type Tactic,
  type TacticConditionId,
} from '@hakusura/core';
import { h } from './dom';

export interface TacticsEditorOptions {
  /** 作戦に入れられるスキル。ビルドに入れたアクティブ */
  skills(): readonly ActiveSkillId[];
  /** 覚えている型 */
  forms(): readonly FormId[];
  onChange(): void;
}

/** 条件の選択肢。まとまりごとに分ける */
function conditionOptions(selected: TacticConditionId): HTMLElement[] {
  return TACTIC_CONDITION_GROUPS.map((group) =>
    h(
      'optgroup',
      { label: group },
      ...TACTIC_CONDITION_IDS.filter((id) => TACTIC_CONDITIONS[id]!.group === group).map((id) =>
        h('option', { value: id, selected: id === selected }, TACTIC_CONDITIONS[id]!.label),
      ),
    ),
  );
}

/** 型の手順を言葉にする */
function formSteps(id: FormId): string {
  const names = {
    skill: (s: string) => ACTIVE_SKILLS[s as ActiveSkillId]?.name ?? s,
    element: (e: keyof typeof ELEMENTS) => ELEMENTS[e].name,
    category: (c: keyof typeof SKILL_CATEGORIES) => SKILL_CATEGORIES[c],
    status: (st: keyof typeof STATUSES) => STATUSES[st].name,
  };
  return FORMS[id].steps.map((step) => stepText(step, names)).join(' → ');
}

/** 作戦の編集。tactics をその場で書き換える */
export function createTacticsEditor(tactics: Tactic[], options: TacticsEditorOptions): { el: HTMLElement; render(): void } {
  const root = h('div', { class: 'tactics' });

  const changed = () => {
    options.onChange();
    render();
  };

  const swap = (a: number, b: number) => {
    const tmp = tactics[a]!;
    tactics[a] = tactics[b]!;
    tactics[b] = tmp;
  };

  const render = () => {
    const skills = options.skills();
    root.replaceChildren(
      ...tactics.map((t, i) => {
        const missing = !skills.includes(t.skill);
        return h(
          'div',
          { class: `tactic${t.enabled ? '' : ' off'}${missing ? ' missing' : ''}` },
          h('span', { class: 'order' }, String(i + 1)),
          h(
            'div',
            { class: 'fields' },
            h(
              'select',
              {
                onchange: (e: Event) => {
                  t.condition = (e.target as HTMLSelectElement).value as TacticConditionId;
                  changed();
                },
              },
              ...conditionOptions(t.condition),
            ),
            h('span', { class: 'then' }, missing ? 'なら(このスキルはビルドに入っていない)' : 'なら'),
            h(
              'select',
              {
                onchange: (e: Event) => {
                  t.skill = (e.target as HTMLSelectElement).value as ActiveSkillId;
                  changed();
                },
              },
              ...[...new Set([...skills, t.skill])].map((id) => h('option', { value: id, selected: id === t.skill }, ACTIVE_SKILLS[id].name)),
            ),
            // 連携。出したら続けて出す次の一手(2つまで)
            ...Array.from({ length: Math.min(FOLLOW_UP.max, (t.then?.length ?? 0) + 1) }, (_, k) =>
              h(
                'label',
                { class: 'follow' },
                '→ 次に ',
                h(
                  'select',
                  {
                    onchange: (e: Event) => {
                      const v = (e.target as HTMLSelectElement).value as ActiveSkillId | '';
                      const then = [...(t.then ?? [])];
                      if (v) then[k] = v;
                      else then.splice(k);
                      t.then = then.length > 0 ? then : undefined;
                      changed();
                    },
                  },
                  h('option', { value: '' }, '(続けない)'),
                  ...skills.map((id) => h('option', { value: id, selected: t.then?.[k] === id }, ACTIVE_SKILLS[id].name)),
                ),
              ),
            ),
          ),
          h(
            'div',
            { class: 'ops' },
            h('button', { title: '上へ', disabled: i === 0, onclick: () => (swap(i, i - 1), changed()) }, '▲'),
            h('button', { title: '下へ', disabled: i === tactics.length - 1, onclick: () => (swap(i, i + 1), changed()) }, '▼'),
            h('button', { title: t.enabled ? '止める' : '使う', onclick: () => ((t.enabled = !t.enabled), changed()) }, t.enabled ? '●' : '○'),
            h('button', { title: '消す', onclick: () => (tactics.splice(i, 1), changed()) }, '✕'),
          ),
        );
      }),
      h(
        'div',
        { class: 'tactic-actions' },
        h(
          'button',
          {
            disabled: skills.length === 0,
            onclick: () => (tactics.push({ skill: skills[0]!, condition: 'always', enabled: true }), changed()),
          },
          '作戦を足す',
        ),
        h(
          'button',
          {
            onclick: () => {
              tactics.splice(0, tactics.length, ...DEFAULT_TACTICS.map((t) => ({ ...t })));
              changed();
            },
          },
          '元に戻す',
        ),
      ),
      h('small', {}, '上から順に見て、条件に合い、使えるものを1つ使う。届かなければ届くまで待つ。「次に」を選ぶと、出した後に続けてそれを出す(連携)'),
      // 型が開くまでは、型の一覧を出さない
      options.forms().length === 0 ? '' : h('h3', {}, '型'),
      options.forms().length === 0 ? '' : h('p', { class: 'note' }, '決まった順にスキルを出すと型が決まり、最後の一手が強くなり、昂りが大きく溜まる。連携で狙って組む'),
      ...(options.forms().length === 0 ? [] : FORM_IDS).map((id) => {
        const known = options.forms().includes(id);
        const f = FORMS[id];
        return h(
          'div',
          { class: `form-row${known ? '' : ' unknown'}` },
          h('b', { style: `color:#${f.color.toString(16).padStart(6, '0')}` }, f.name),
          h('small', {}, known ? `${formSteps(id)}(${f.window / 1000}秒以内に続ける・最後の一手 +${Math.round(f.bonus * 100)}%)` : '未修得。遠征で型の書が見つかる'),
        );
      }),
    );
  };

  render();
  return { el: root, render };
}
