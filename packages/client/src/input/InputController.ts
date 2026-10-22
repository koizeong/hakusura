import { INPUT_ACTION_IDS, type Binding, type InputAction, type Keybinds } from './keybinds';

/**
 * キーとマウスを操作に読み替える。キーは KeyboardEvent.code で見るので配列に左右されない。
 * マウスは target(ゲーム画面)の上で押したときだけ拾い、パネルのクリックでは攻撃しない
 */
export class InputController {
  private keys = new Set<string>();
  private buttons = new Set<number>();
  private pressed = new Set<InputAction>();
  /** キー設定の待ち受け中は操作として扱わない */
  capturing = false;

  constructor(
    private binds: Keybinds,
    target: HTMLElement,
  ) {
    window.addEventListener('keydown', (e) => {
      if (this.capturing) return;
      if (this.isBoundKey(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.markPressed({ device: 'key', code: e.code });
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('mousedown', (e) => {
      if (this.capturing) return;
      this.buttons.add(e.button);
      this.markPressed({ device: 'mouse', button: e.button });
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });
  }

  setBinds(binds: Keybinds): void {
    this.binds = binds;
  }

  isDown(action: InputAction): boolean {
    const b = this.binds[action];
    return b.device === 'key' ? this.keys.has(b.code) : this.buttons.has(b.button);
  }

  /** 前回呼んでから押されたか。1フレームに1回呼ぶ */
  consumePressed(action: InputAction): boolean {
    const was = this.pressed.has(action);
    this.pressed.delete(action);
    return was;
  }

  endFrame(): void {
    this.pressed.clear();
  }

  private markPressed(binding: Binding): void {
    for (const action of INPUT_ACTION_IDS) {
      if (sameBinding(this.binds[action], binding)) this.pressed.add(action);
    }
  }

  private isBoundKey(code: string): boolean {
    return INPUT_ACTION_IDS.some((a) => sameBinding(this.binds[a], { device: 'key', code }));
  }
}

function sameBinding(a: Binding, b: Binding): boolean {
  if (a.device === 'key' && b.device === 'key') return a.code === b.code;
  if (a.device === 'mouse' && b.device === 'mouse') return a.button === b.button;
  return false;
}
