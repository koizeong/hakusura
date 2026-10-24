import type { Rule } from '../rules';

/**
 * 状態どうしの相互作用。誰の攻撃かに関係なく、常に効く。
 * on: 'damage' のラベルは発動元の名前に添えて「感電(濡れで倍)」のように出る
 */
export const INTERACTIONS: readonly Rule[] = [
  {
    label: '濡れで消火',
    on: 'buildup',
    when: [
      { type: 'statusIs', status: 'burn' },
      { type: 'targetHas', status: 'wet' },
    ],
    block: true,
  },
  {
    label: '濡れで倍',
    on: 'damage',
    when: [
      { type: 'hitHasTag', tag: 'shock' },
      { type: 'targetHas', status: 'wet' },
    ],
    add: 1,
  },
  {
    label: '油で倍',
    on: 'statusActivate',
    when: [
      { type: 'statusIs', status: 'burn' },
      { type: 'targetHas', status: 'oiled' },
    ],
    scale: { duration: 2, radius: 2 },
  },
  {
    label: '昏倒に追撃',
    on: 'damage',
    when: [{ type: 'targetHas', status: 'stun' }],
    add: 0.5,
  },
  // 凍った者を打で叩くと砕ける。大きく効き、凍結は解ける
  {
    label: '砕氷',
    on: 'damage',
    when: [
      { type: 'hitHasTag', tag: 'blunt' },
      { type: 'targetHas', status: 'frozen' },
    ],
    add: 1.5,
  },
  {
    label: '砕氷',
    on: 'hit',
    when: [
      { type: 'hitHasTag', tag: 'blunt' },
      { type: 'targetHas', status: 'frozen' },
    ],
    do: [{ type: 'clearStatus', status: 'frozen' }],
  },
  // 盲目の者の背後からの攻撃は、必ず急所に入る
  {
    label: '背後の一撃',
    on: 'damage',
    when: [{ type: 'targetHas', status: 'blind' }, { type: 'fromBehind' }, { type: 'hitHasTag', tag: 'attack' }],
    add: 1,
  },
  // 怯えて背を向けた者は、背後から斬られやすい
  {
    label: '怯えた背',
    on: 'damage',
    when: [{ type: 'targetHas', status: 'fear' }, { type: 'fromBehind' }, { type: 'hitHasTag', tag: 'attack' }],
    add: 0.5,
  },
  // 霧の中では、背後からの奇襲が効く
  {
    label: '霧からの奇襲',
    on: 'damage',
    when: [{ type: 'weather', weather: 'fog' }, { type: 'fromBehind' }, { type: 'hitHasTag', tag: 'attack' }],
    add: 0.3,
  },
  // 風がないと炎上は長く燃え、感電は遠くまで飛ばない
  {
    label: '無風で燻る',
    on: 'statusActivate',
    when: [
      { type: 'statusIs', status: 'burn' },
      { type: 'weather', weather: 'calm' },
    ],
    scale: { duration: 1.5 },
  },
  {
    label: '無風で届かない',
    on: 'statusActivate',
    when: [
      { type: 'statusIs', status: 'shock' },
      { type: 'weather', weather: 'calm' },
    ],
    scale: { radius: 0.6 },
  },
  // 火は氷を解かす
  {
    label: '火で解ける',
    on: 'hit',
    when: [
      { type: 'hitHasTag', tag: 'fire' },
      { type: 'targetHas', status: 'frozen' },
    ],
    do: [{ type: 'clearStatus', status: 'frozen' }],
  },
];
