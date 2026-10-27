import { compareItem, recommendLoadout, type Build, type Item } from '@hakusura/core';

/**
 * 装備の見比べを、画面とは別の糸で早回しする。おすすめ選びとまとめて捨てるのは
 * 何十回も早回しするので、ここで回して画面を止めない
 */
export type LoadoutRequest =
  | { id: number; kind: 'recommend'; build: Build; stash: Item[] }
  | { id: number; kind: 'sweep'; build: Build; items: Item[] };

export type LoadoutReply =
  | { id: number; progress: number }
  | { id: number; done: true; build?: Build; worse?: string[] };

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
  const worse: string[] = [];
  req.items.forEach((item, i) => {
    if (compareItem(req.build, item)?.verdict === 'worse') worse.push(item.id);
    post({ id: req.id, progress: (i + 1) / req.items.length });
  });
  post({ id: req.id, done: true, worse });
};
