import { compareItem, recommendLoadout, type Build, type Item } from '@hakusura/core';

/**
 * 装備の見比べを、画面とは別の糸で早回しする。おすすめ選びとまとめて捨てるのは
 * 何十回も早回しするので、ここで回して画面を止めない
 */
export type LoadoutRequest =
  | { id: number; kind: 'recommend'; build: Build; stash: Item[] }
  | { id: number; kind: 'sweep'; build: Build; items: Item[] }
  | { id: number; kind: 'score'; build: Build; items: Item[] };

export type LoadoutReply =
  | { id: number; progress: number }
  | { id: number; done: true; build?: Build; worse?: string[]; scores?: Record<string, number> };

const post = (m: LoadoutReply) => (self as unknown as { postMessage(m: LoadoutReply): void }).postMessage(m);

self.onmessage = (e: MessageEvent<LoadoutRequest>) => {
  const req = e.data;
  if (req.kind === 'recommend') {
    const it = recommendLoadout(req.build, req.stash);
    let last = 0;
    for (;;) {
      const r = it.next();
      if (r.done) return post({ id: req.id, done: true, build: r.value });
      if (r.value - last >= 0.02) post({ id: req.id, progress: (last = r.value) });
    }
  }
  // まとめて捨てる(弱くなる物を選ぶ)か、強くなる順に並べる(点の倍率を返す)
  const worse: string[] = [];
  const scores: Record<string, number> = {};
  req.items.forEach((item, i) => {
    const c = compareItem(req.build, item);
    if (c?.verdict === 'worse') worse.push(item.id);
    scores[item.id] = c?.score ?? 1;
    post({ id: req.id, progress: (i + 1) / req.items.length });
  });
  post({ id: req.id, done: true, worse, scores });
};
