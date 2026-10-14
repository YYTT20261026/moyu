// Inline the pond bed as a data URL so WebGL can read it even from file:// (where image pixels are cross-origin).
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const images={};
for(const season of ['spring','summer','autumn','winter']){
  const file=season==='spring'?'pond.jpg':`pond-${season}.jpg`;
  images[season]=`data:image/jpeg;base64,${(await readFile(`${root}assets/${file}`)).toString('base64')}`;
}
const lotus=`data:image/png;base64,${(await readFile(`${root}assets/lotus-original.png`)).toString('base64')}`;
const driftImage=`data:image/png;base64,${(await readFile(`${root}assets/drifting-flora.png`)).toString('base64')}`;
const drifters=JSON.parse(await readFile(`${root}assets/drifting-flora.json`,'utf8'));
await writeFile(`${root}assets/pond-data.js`,`window.POND_IMAGES=${JSON.stringify(images)};\nwindow.POND_IMAGE=window.POND_IMAGES.spring;\nwindow.POND_LOTUS_IMAGE=${JSON.stringify(lotus)};\nwindow.POND_DRIFT_IMAGE=${JSON.stringify(driftImage)};\nwindow.POND_DRIFTERS=${JSON.stringify(drifters)};\n`);
const audio={};
for(const [name,file] of Object.entries({lapping:'pond-water',leaves:'leaves-wind',bird:'garden-bird'}))audio[name]=(await readFile(`${root}assets/audio/${file}.wav`)).toString('base64');
await writeFile(`${root}assets/audio-data.js`,`window.POND_AUDIO=${JSON.stringify(audio)};\n`);
console.log('已生成四季内嵌底图与原版荷花素材 assets/pond-data.js');
console.log('已内嵌自然水声、树叶风声与鸟鸣，离线打开也可播放。');
