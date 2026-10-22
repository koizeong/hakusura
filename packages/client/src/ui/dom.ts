type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>;

/** 小さな DOM 組み立て。on〜 は addEventListener になる */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = String(value);
    else if (typeof value === 'boolean') {
      if (value) el.setAttribute(key, '');
      (el as unknown as Record<string, unknown>)[key] = value;
    } else el.setAttribute(key, String(value));
  }
  for (const child of children) if (child != null) el.append(child);
  return el;
}

export function percent(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function signedPercent(v: number): string {
  return `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
}

export function formatNumber(v: number): string {
  if (v >= 100) return Math.round(v).toLocaleString('ja-JP');
  if (v >= 10) return v.toFixed(0);
  return v.toFixed(1);
}
