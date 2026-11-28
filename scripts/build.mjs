import {cp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await import('./embed.mjs');
// Replace only the web files; dist/ also holds the macOS app, its disk image and the Android APK.
const files=['index.html','style.css','core.js','art.js','gl.js','scene.js','audio.js','app.js','project.json','assets/pond-runtime.png','assets/pond-summer-runtime.png','assets/pond-autumn-runtime.png','assets/pond-winter-runtime.png','assets/pond-spring-thumb.jpg','assets/pond-summer-thumb.jpg','assets/pond-autumn-thumb.jpg','assets/pond-winter-thumb.jpg','assets/pond-data.js','assets/pond-bed.js','assets/lotus-original.png','assets/favicon.svg','assets/ARTWORK.md'];
for(const file of files)await rm(`${root}dist/${file}`,{force:true});
await mkdir(`${root}dist/assets`,{recursive:true});
for(const file of files)await cp(`${root}${file}`,`${root}dist/${file}`);
await cp(`${root}assets/audio-data.js`,`${root}dist/assets/audio-data.js`);
for(const file of ['drifting-flora.png','drifting-flora.json'])await cp(`${root}assets/${file}`,`${root}dist/assets/${file}`);
// The recordings are already embedded in audio-data.js; only the attribution ships alongside them.
await rm(`${root}dist/assets/audio`,{recursive:true,force:true});
await mkdir(`${root}dist/assets/audio`,{recursive:true});
await cp(`${root}assets/audio/SOURCES.md`,`${root}dist/assets/audio/SOURCES.md`);
console.log('静态项目已构建至 dist/；可直接打开 index.html 或导入 Wallpaper Engine。');
