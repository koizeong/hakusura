/**
 * 仮の効果音。素材が揃うまで、Web Audio で合成して鳴らす。
 * ブラウザは最初の操作までは音を出せないので、最初のタップかキーで鳴らせるようにする。
 * 鳴らすかどうかは端末に覚える
 */
const STORAGE_KEY = 'hakusura.sound.v1';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = readEnabled();
const lastAt = new Map<string, number>();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // 覚えられなくても鳴らし分けはできる
  }
  if (master) master.gain.value = on ? 0.18 : 0;
}

/** 最初の操作で音を出せるようにする */
export function unlockAudio(): void {
  const start = () => {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.18 : 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('pointerdown', start, { passive: true });
  window.addEventListener('keydown', start);
}

/** 同じ音が続けて鳴りすぎないように間引く */
function throttle(key: string, ms: number): boolean {
  const now = performance.now();
  if (now - (lastAt.get(key) ?? -Infinity) < ms) return false;
  lastAt.set(key, now);
  return true;
}

function ready(): AudioContext | null {
  return ctx && master && enabled && ctx.state === 'running' ? ctx : null;
}

/** 音を1つ。周波数を from から to へ滑らせ、dur 秒で消える */
function tone(type: OscillatorType, from: number, to: number, dur: number, volume: number, delay = 0): void {
  const c = ready();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** ざらついた音(砕ける・こぼれる)。dur 秒のノイズを低く絞って鳴らす */
function noise(dur: number, volume: number, cutoff: number): void {
  const c = ready();
  if (!c || !master) return;
  const t = c.currentTime;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const gain = c.createGain();
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

/** 印を得た。溜まるほど高く鳴る(level は 0〜1) */
export function sfxMarkGain(level: number): void {
  if (!throttle('gain', 55)) return;
  const f = 520 + level * 900;
  tone('triangle', f, f * 1.02, 0.09, 0.25);
}

/** 印が別の印に変わった。2つの音を続けて */
export function sfxMarkFlow(): void {
  if (!throttle('flow', 70)) return;
  tone('sine', 700, 1100, 0.12, 0.2);
}

/** 印の技に足りた。澄んだ和音 */
export function sfxMarkReady(): void {
  if (!throttle('ready', 300)) return;
  tone('sine', 880, 880, 0.5, 0.25);
  tone('sine', 1320, 1320, 0.5, 0.18, 0.05);
}

/** 印を使った。重さ(0〜1)で低く長く */
export function sfxMarkSpend(weight: number): void {
  if (!throttle('spend', 60)) return;
  tone('sawtooth', 300 - weight * 180, 120 - weight * 60, 0.15 + weight * 0.25, 0.2 + weight * 0.2);
}

/** 重い印の技が当たった。地を揺らす音 */
export function sfxRelease(weight: number): void {
  if (!throttle('release', 120)) return;
  tone('sine', 140, 40, 0.5 + weight * 0.6, 0.6);
  noise(0.25 + weight * 0.35, 0.5, 900 + weight * 1500);
}

/** 直撃で印がこぼれた */
export function sfxMarkLost(): void {
  if (!throttle('lost', 120)) return;
  tone('square', 400, 160, 0.18, 0.12);
  noise(0.12, 0.25, 2400);
}

/** 装備が目覚めた。低い響きから澄んだ音へ */
export function sfxAwaken(): void {
  if (!throttle('awaken', 400)) return;
  tone('sine', 220, 440, 0.6, 0.4);
  tone('sine', 660, 990, 0.8, 0.25, 0.15);
}
