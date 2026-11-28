// Inline the pond artwork as data URLs so WebGL can read it even from file:// (where image pixels are cross-origin).
// The four 4K beds go into their own file, loaded only by file:// pages: a page served over http(s) (the Windows
// app's virtual host, the dev server, a website) loads the same lossless PNGs from assets/ instead.
// The embedded copy is JPEG q90 (still 4K): base64 of the lossless PNGs is ~60 MB in every offline download,
// while the JPEG version is ~10 MB and looks the same at wallpaper scale.
// Validate the authoritative 4K PNGs first; builds never regenerate or modify the beds.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=fileURLToPath(new URL('../',import.meta.url));
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
// Windows' indexer / antivirus can hold a just-written file for a moment (open fails with UNKNOWN);
// a short retry keeps the build from failing on that transient share violation.
async function writeStable(file,data){
  for(let attempt=0;;attempt++){
    try{await writeFile(file,data);return;}
    catch(error){if(attempt>=4)throw error;await new Promise(r=>setTimeout(r,150*(attempt+1)));}
  }
}
const run=(script,maxBuffer)=>promisify(execFile)(python,[`${root}scripts/${script}`],{env:{...process.env,PYTHONIOENCODING:'utf-8'},maxBuffer});
const {stdout}=await run('prepare-bed.py',4*1024*1024);
console.log(stdout.trim());
const {stdout:bedJson,stderr:bedLog}=await run('prepare-embed.py',64*1024*1024);
if(bedLog.trim())console.log(bedLog.trim());
const images=JSON.parse(bedJson);
await writeStable(`${root}assets/pond-bed.js`,`window.POND_IMAGES=${JSON.stringify(images)};\nwindow.POND_IMAGE=window.POND_IMAGES.spring;\n`);
const lotus=`data:image/png;base64,${(await readFile(`${root}assets/lotus-original.png`)).toString('base64')}`;
const driftImage=`data:image/png;base64,${(await readFile(`${root}assets/drifting-flora.png`)).toString('base64')}`;
const drifters=JSON.parse(await readFile(`${root}assets/drifting-flora.json`,'utf8'));
await writeStable(`${root}assets/pond-data.js`,`window.POND_LOTUS_IMAGE=${JSON.stringify(lotus)};\nwindow.POND_DRIFT_IMAGE=${JSON.stringify(driftImage)};\nwindow.POND_DRIFTERS=${JSON.stringify(drifters)};\n`);
const audio={};
for(const [name,file] of Object.entries({lapping:'pond-water',leaves:'leaves-wind',bird:'garden-bird'}))audio[name]=(await readFile(`${root}assets/audio/${file}.wav`)).toString('base64');
await writeStable(`${root}assets/audio-data.js`,`window.POND_AUDIO=${JSON.stringify(audio)};\n`);
console.log('已生成内嵌底图 assets/pond-bed.js（4K JPEG q90，仅 file:// 页面加载）与原版荷花、漂浮花叶素材 assets/pond-data.js');
console.log('已内嵌自然水声、树叶风声与鸟鸣，离线打开也可播放。');
