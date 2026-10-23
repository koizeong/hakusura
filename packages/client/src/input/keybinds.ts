/** 入力で起こせる操作。キーはこの操作に割り当てる */
export const INPUT_ACTIONS = {
  up: '上へ',
  down: '下へ',
  left: '左へ',
  right: '右へ',
  active1: 'アクティブ1',
  active2: 'アクティブ2',
  active3: 'アクティブ3',
  active4: 'アクティブ4',
  active5: 'アクティブ5',
  active6: 'アクティブ6',
  dodge: '回避(手動)',
  guard: 'ガード(手動)',
  lockOn: 'ターゲット固定',
  trump: '切り札(自動)',
  breakdown: '内訳',
} as const;

export type InputAction = keyof typeof INPUT_ACTIONS;
export const INPUT_ACTION_IDS = Object.keys(INPUT_ACTIONS) as InputAction[];
export const ACTIVE_SLOT_ACTIONS = ['active1', 'active2', 'active3', 'active4', 'active5', 'active6'] as const;

export type Binding = { device: 'key'; code: string } | { device: 'mouse'; button: number };
export type Keybinds = Record<InputAction, Binding>;

export const DEFAULT_KEYBINDS: Keybinds = {
  up: { device: 'key', code: 'KeyW' },
  down: { device: 'key', code: 'KeyS' },
  left: { device: 'key', code: 'KeyA' },
  right: { device: 'key', code: 'KeyD' },
  active1: { device: 'mouse', button: 0 },
  active2: { device: 'mouse', button: 2 },
  active3: { device: 'key', code: 'KeyQ' },
  active4: { device: 'key', code: 'KeyE' },
  active5: { device: 'key', code: 'KeyR' },
  active6: { device: 'key', code: 'KeyF' },
  dodge: { device: 'key', code: 'Space' },
  guard: { device: 'key', code: 'ShiftLeft' },
  lockOn: { device: 'mouse', button: 1 },
  // 自動で戦うときは回避を使わないので、同じキーを切り札に回す
  trump: { device: 'key', code: 'Space' },
  breakdown: { device: 'key', code: 'Tab' },
};

const STORAGE_KEY = 'hakusura.keybinds';

export function loadKeybinds(): Keybinds {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Keybinds>;
    return { ...DEFAULT_KEYBINDS, ...saved };
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

export function saveKeybinds(binds: Keybinds): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(binds));
  } catch {
    // 保存できなくても、この場では効く
  }
}

const MOUSE_LABELS = ['左クリック', 'ホイールクリック', '右クリック'];

export function bindingLabel(b: Binding): string {
  if (b.device === 'mouse') return MOUSE_LABELS[b.button] ?? `マウス${b.button}`;
  if (b.code.startsWith('Key')) return b.code.slice(3);
  if (b.code.startsWith('Digit')) return b.code.slice(5);
  if (b.code === 'Space') return 'Space';
  if (b.code === 'ShiftLeft' || b.code === 'ShiftRight') return 'Shift';
  if (b.code === 'ControlLeft' || b.code === 'ControlRight') return 'Ctrl';
  return b.code;
}
