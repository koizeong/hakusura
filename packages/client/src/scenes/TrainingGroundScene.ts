import Phaser from 'phaser';
import { MAX_TRIGGER_DEPTH } from '@hakusura/core';

const FONT = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

/** 試し斬り場。いまは土台の確認用に文言だけを置く */
export class TrainingGroundScene extends Phaser.Scene {
  constructor() {
    super('TrainingGround');
  }

  create(): void {
    const title = this.add
      .text(0, 0, '試し斬り場', { fontFamily: FONT, fontSize: '32px', color: '#b8aa98' })
      .setOrigin(0.5);
    const note = this.add
      .text(0, 0, `まだ何もない。灰だけが積もっている。\n(連鎖の上限 ${MAX_TRIGGER_DEPTH} 段)`, {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#6e655b',
        align: 'center',
      })
      .setOrigin(0.5);

    const layout = (width: number, height: number) => {
      title.setPosition(width / 2, height / 2 - 24);
      note.setPosition(width / 2, height / 2 + 28);
    };
    layout(this.scale.width, this.scale.height);
    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => layout(size.width, size.height));
  }
}
