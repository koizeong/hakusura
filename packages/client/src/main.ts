import Phaser from 'phaser';
import { TrainingGroundScene } from './scenes/TrainingGroundScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#141312',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  // 右クリックをアクティブ2に使うため、ブラウザのメニューを出さない
  disableContextMenu: true,
  scene: [TrainingGroundScene],
});
