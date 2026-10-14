const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(recordings = {}) {
  const timers = new Map(); let id = 0;
  class Param {
    constructor() { this.value = 0; this.targets = []; }
    setTargetAtTime(value, time, duration) { this.targets.push({ value, time, duration }); }
    cancelScheduledValues() {}
  }
  class Node {
    constructor() { this.gain = new Param(); this.playbackRate = new Param(); this.connections = []; this.stops = []; }
    connect(node) { this.connections.push(node); return node; }
    start(...args) { this.started = args; }
    stop(...args) { this.stops.push(args); }
  }
  class Context {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = new Node(); this.sources = []; this.decodes = 0; }
    createGain() { return new Node(); }
    createDynamicsCompressor() { const n = new Node(); n.threshold = {}; n.ratio = {}; return n; }
    createConvolver() { return new Node(); }
    createBuffer(channels, length, sr) { return { duration: length / sr, getChannelData: () => new Float32Array(length), copyToChannel() {} }; }
    createBufferSource() { const n = new Node(); this.sources.push(n); return n; }
    async decodeAudioData(bytes) { this.decodes++; return { duration: 10, bytes: bytes.byteLength }; }
    async resume() { this.state = 'running'; }
    suspend() { this.state = 'suspended'; }
  }
  const context = { window: { AudioContext: Context, POND_AUDIO: recordings }, console: { info() {}, warn() {} }, atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: id => timers.delete(id), setInterval: () => ++id, clearInterval() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../audio.js'), 'utf8'), context);
  const api = context.window.PondAudio, audio = new api.PondAudio();
  return { api, audio, timers };
}

test('旧存档只迁移一次水声与四季音量，保留总音量、开关和后续自定义', () => {
  const { api } = load();
  const settings = { season: 'summer', soundOn: false, water: false, weatherSound: true, sfx: false, waterType: 'stream', music: 'guqin', volume: .7, waterVol: .5, weatherVol: .4, soundscapeVersion: 1 };
  api.applyNaturePreset(settings, settings);
  assert.equal(settings.waterType, 'lapping'); assert.equal(settings.music, 'off'); assert.equal(settings.musicVol, 0);
  assert.equal(settings.waterVol, .2); assert.equal(settings.weatherVol, .8); assert.equal(settings.soundscapeVersion, 2);
  assert.equal(settings.volume, .7); assert.equal(settings.season, 'summer'); assert.equal(settings.soundOn, false);
  assert.equal(settings.water, false); assert.equal(settings.weatherSound, true); assert.equal(settings.sfx, false);
  settings.waterVol = .35; settings.weatherVol = .6; settings.volume = .25;
  api.applyNaturePreset(settings, settings);
  assert.equal(settings.waterVol, .35); assert.equal(settings.weatherVol, .6); assert.equal(settings.volume, .25);
});

test('旧水声和音乐设置不能恢复已移除的声音，混音突出四季环境音', async () => {
  const { audio, api } = load(); audio.setup();
  audio.loopBuffer = () => ({ duration: 12 });
  audio.configure({ ...api.NATURE_DEFAULTS, waterType: 'cascade', music: 'guqin', musicVol: 1, season: 'spring', weather: 'sunny' });
  await audio.setActive(true);
  assert.equal(audio.opts.waterType, 'lapping'); assert.equal(audio.opts.music, 'off'); assert.equal(audio.opts.musicVol, 0);
  assert.deepEqual(Object.keys(audio.layers).sort(), ['lapping','leaves']);
  assert.ok(audio.weatherBus.gain.targets.at(-1).value > audio.waterBus.gain.targets.at(-1).value * 4);
  assert.equal(audio.master.gain.targets.at(-1).value, .45);
});

test('换季清除上一季的等待时间，鸟鸣很快出现，调音量不重置间隔', () => {
  const { audio, api } = load(); audio.setup();
  audio.context.currentTime = 10;
  const heard = []; audio.bird = t => heard.push(t);
  audio.events = { bird: 100, frog: 100 };
  audio.configure({ ...api.NATURE_DEFAULTS, season: 'autumn', weather: 'sunny' });
  assert.equal(Object.keys(audio.events).length, 0);
  audio.weatherEvents();
  const first = audio.events.bird;
  assert.ok(first >= 12 && first <= 15);
  audio.configure({ ...api.NATURE_DEFAULTS, season: 'autumn', weather: 'sunny', weatherVol: .6 });
  assert.equal(audio.events.bird, first);
  audio.context.currentTime = first;
  audio.weatherEvents();
  assert.deepEqual(heard, [first]);
  assert.ok(audio.events.bird - first >= 20 && audio.events.bird - first <= 38);
});

test('夏夜切换后数秒内响起蛙声，随后持续按较短随机间隔出现', () => {
  const { audio, api } = load(); audio.setup(); audio.context.currentTime = 10;
  const heard = []; audio.frog = t => heard.push(t);
  audio.configure({ ...api.NATURE_DEFAULTS, season: 'summer', weather: 'sunny', night: true });
  audio.weatherEvents(); const first = audio.events.frog;
  assert.ok(first >= 13 && first <= 17);
  audio.context.currentTime = first; audio.weatherEvents();
  assert.deepEqual(heard, [first]);
  assert.ok(audio.events.frog - first >= 10 && audio.events.frog - first <= 22);
});

test('四季晴雨昼夜分别使用草木、淡蝉、虫鸣和雨声，冬季与雨雪不出现虫鸣', () => {
  const { api } = load(), layers = (season, weather, night) => api.weatherLayers({ season, weather, night, rain: .5 });
  for (const season of ['spring','summer','autumn','winter']) for (const weather of ['sunny','cloudy','rain','snow']) for (const night of [false,true]) {
    const mix = layers(season, weather, night);
    assert.ok(Object.values(mix).every(v => Number.isFinite(v) && v >= 0 && v <= 1));
    if (season === 'winter' || ['rain','snow'].includes(weather)) { assert.equal(mix.night, undefined); assert.equal(mix.cicadas, undefined); }
  }
  assert.ok(layers('summer','sunny',false).cicadas > 0);
  assert.ok(layers('summer','sunny',true).night > layers('spring','sunny',true).night);
  assert.ok(layers('spring','sunny',true).night > layers('autumn','sunny',true).night);
  assert.ok(layers('autumn','sunny',false).leaves > layers('winter','sunny',false).leaves * 3);
});

test('夏夜偶闻蛙声；秋冬、雪天不鸣蛙鸟，雨天仅有落水事件', () => {
  const { audio } = load(); const heard = [];
  audio.context = { currentTime: 10, state: 'running' }; audio.opts.weatherSound = true;
  for (const name of ['bird','frog','crow','dove','cuckoo','raindrop']) audio[name] = () => heard.push(name);
  for (const [season,weather,night,expected] of [['summer','sunny',true,'frog'],['spring','sunny',false,'bird'],['autumn','sunny',true,null],['winter','sunny',false,null],['winter','cloudy',true,null],['summer','snow',true,null],['summer','rain',true,'raindrop']]) {
    heard.length = 0; audio.scene = { season, weather, night, rain: .5 }; audio.events = { bird: 10.1, frog: 10.1, drop: 10.1 };
    audio.weatherEvents();
    if (expected) assert.ok(heard.length && heard.every(x => x === expected)); else assert.equal(heard.length, 0);
  }
});

test('换季淡出旧环境音，快速切回复用声源，关闭环境音后停止对应循环', async () => {
  const { audio, api, timers } = load(); audio.setup();
  const buffers = new Map(); audio.loopBuffer = name => { if (!buffers.has(name)) buffers.set(name, { duration: 12 }); return buffers.get(name); };
  audio.configure({ ...api.NATURE_DEFAULTS, season: 'summer', weather: 'sunny', night: true }); await audio.setActive(true);
  const cricket = audio.layers.night, count = audio.context.sources.length;
  audio.configure({ ...api.NATURE_DEFAULTS, season: 'winter', weather: 'sunny', night: true });
  assert.equal(cricket.gain.gain.targets.at(-1).value, 0);
  assert.equal(audio.wildlifeBus.gain.targets.at(-1).value, 0);
  audio.configure({ ...api.NATURE_DEFAULTS, season: 'summer', weather: 'sunny', night: true });
  assert.equal(audio.layers.night, cricket); assert.equal(audio.context.sources.length, count);
  audio.configure({ ...api.NATURE_DEFAULTS, water: false, weatherSound: false, season: 'summer', weather: 'sunny' });
  for (const fn of [...timers.values()]) fn();
  assert.equal(Object.keys(audio.layers).length, 0);
  assert.ok(audio.context.sources.every(s => s.stops.length));
});

test('自然录音仅解码一次，加载后交叉淡入，后续换季继续复用解码结果', async () => {
  const { audio } = load({ lapping: 'UklGRg==', leaves: 'UklGRg==', bird: 'UklGRg==' }); audio.setup();
  audio.loopBuffer = name => audio.recordings[name] || { duration: 12 };
  audio.active = true; audio.refresh(); const old = audio.layers.lapping;
  await audio.prepareRecordings(); await audio.prepareRecordings();
  assert.equal(audio.context.decodes, 3);
  assert.equal(old.gain.gain.targets.at(-1).value, 0); assert.ok(old.src.stops.length);
  assert.equal(audio.layers.lapping.src.buffer, audio.recordings.lapping);
  const source = audio.layers.lapping.src; audio.configure({ season: 'autumn', weather: 'cloudy' });
  assert.equal(audio.layers.lapping.src, source); assert.equal(audio.context.decodes, 3);
});

test('自然录音内嵌为兼容的 PCM WAV，构建包含录音与署名，无需联网或 file 跨域加载', () => {
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(require.resolve('../assets/audio-data.js'), 'utf8'), context);
  const files = { lapping: 'pond-water', leaves: 'leaves-wind', bird: 'garden-bird' };
  for (const [name, file] of Object.entries(files)) {
    const data = Buffer.from(context.window.POND_AUDIO[name], 'base64');
    assert.equal(data.toString('ascii', 0, 4), 'RIFF'); assert.equal(data.toString('ascii', 8, 12), 'WAVE');
    assert.equal(data.readUInt16LE(20), 1); assert.equal(data.readUInt16LE(34), 16); assert.equal(data.readUInt32LE(24), 22050);
    assert.deepEqual(data, fs.readFileSync(require.resolve(`../assets/audio/${file}.wav`)));
    assert.deepEqual(data, fs.readFileSync(require.resolve(`../dist/assets/audio/${file}.wav`)));
  }
  assert.deepEqual(fs.readFileSync(require.resolve('../assets/audio/SOURCES.md')), fs.readFileSync(require.resolve('../dist/assets/audio/SOURCES.md')));
});
