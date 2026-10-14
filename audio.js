// Offline pond soundscape: embedded field recordings for water, leaves and birds,
// with Web Audio for seasonal insects, rain and interactions.
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  // Compatibility keys for existing saves and hosts; only pond water remains.
  const MUSIC = ['off'];
  const NATURE_DEFAULTS = Object.freeze({ water: true, waterType: 'lapping', waterVol: .2, weatherSound: true, weatherVol: .8, music: 'off', musicVol: 0, sfx: true, volume: .45, soundscapeVersion: 2 });
  function applyNaturePreset(settings, stored = {}) {
    if (stored.soundscapeVersion !== NATURE_DEFAULTS.soundscapeVersion) {
      settings.waterVol = NATURE_DEFAULTS.waterVol;
      settings.weatherVol = NATURE_DEFAULTS.weatherVol;
      settings.soundscapeVersion = NATURE_DEFAULTS.soundscapeVersion;
    }
    // Retired sounds cannot be restored by an old save or a second window.
    settings.waterType = 'lapping'; settings.music = 'off'; settings.musicVol = 0;
  }
  const SEASON_SOUNDS = {
    spring: { wind: .40, insects: .20, birds: [9, 18], frogs: [28, 50] },
    summer: { wind: .30, insects: .55, birds: [14, 26], frogs: [10, 22] },
    autumn: { wind: .68, insects: .12, birds: [20, 38], frogs: null },
    winter: { wind: .18, insects: 0, birds: null, frogs: null }
  };

  // ---------- Offline synthesis ----------
  const noise = n => { const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return d; };
  // One-pole filter run over the buffer twice, so the loop point continues the filter state and has no seam.
  function onePole(data, cutoff, sr, high = false) {
    const a = Math.exp(-TAU * cutoff / sr); let y = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < data.length; i++) { const x = data[i]; y = (1 - a) * x + a * y; if (pass) data[i] = high ? x - y : y; }
    return data;
  }
  const band = (d, lo, hi, sr) => onePole(onePole(d, hi, sr), lo, sr, true);
  function mixInto(L, R, src, gain, pan = 0, lfo) {
    const gl = Math.cos((pan + 1) * Math.PI / 4) * gain, gr = Math.sin((pan + 1) * Math.PI / 4) * gain;
    for (let i = 0; i < src.length; i++) { const k = lfo ? lfo(i) : 1; L[i] += src[i] * gl * k; R[i] += src[i] * gr * k; }
  }
  // A small air bubble closing at the surface: a sine whose pitch rises as it shrinks. Wraps around the loop.
  function bubble(L, R, sr, t0, f0, dur, amp, pan, rise) {
    const n = Math.floor(dur * sr * 3), start = Math.floor(t0 * sr), len = L.length, gl = Math.cos((pan + 1) * Math.PI / 4) * amp, gr = Math.sin((pan + 1) * Math.PI / 4) * amp;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = f0 * (1 + rise * Math.min(1, t / dur)); ph += TAU * f / sr;
      const v = Math.sin(ph) * Math.min(1, t / .0012) * Math.exp(-t / (dur * .35)), k = (start + i) % len;
      L[k] += v * gl; R[k] += v * gr;
    }
  }
  function normalize(L, R, peak) { let m = 1e-6; for (let i = 0; i < L.length; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i])); const k = peak / m; for (let i = 0; i < L.length; i++) { L[i] *= k; R[i] *= k; } }
  // Periodic modulation with whole cycles over the loop, so it matches at the seam.
  const loopLfo = (n, parts) => i => parts.reduce((v, [cycles, depth, ph]) => v + depth * Math.sin(TAU * cycles * i / n + ph), 1);

  const AMBIENT_SYNTH = {
    // Rain on the pond: a hiss, a low body of water noise and a crackle of drops; density sets light or heavy.
    rain(sr, density) {
      const n = sr * 10, L = new Float32Array(n), R = new Float32Array(n);
      for (const pan of [-.7, .7]) mixInto(L, R, band(noise(n), 900, 6500, sr), .06 + .14 * density, pan, loopLfo(n, [[3, .1, pan]]));
      const gap = .025 - .021 * density;
      for (let t = 0; t < 10; t += rand(gap * .2, gap)) {
        const f0 = 900 * Math.pow(2, rand(0, 2.2));
        bubble(L, R, sr, t, f0, rand(.003, .008), .09 * Math.pow(Math.random(), 1.6), rand(-.9, .9), rand(0, .3));
        if (Math.random() < .08) { const f1 = 500 * Math.pow(2, rand(0, 1.6)); bubble(L, R, sr, t, f1, 12 / f1 + .01, .14 * Math.random(), rand(-.8, .8), rand(.5, 1.2)); }
      }
      normalize(L, R, .45 + .3 * density); return [L, R];
    },
    night(sr) {
      const n = sr * 8, L = new Float32Array(n), R = new Float32Array(n);
      // Crickets: pulses of a pure tone grouped in chirps, each insect with its own pitch, rhythm and place.
      for (let c = 0; c < 4; c++) {
        const f = rand(3900, 5100), per = 8 / Math.round(8 / rand(.5, .95)), pulses = 3 + (c % 2), amp = rand(.05, .11), pan = rand(-.85, .85), off = rand(0, per);
        const gl = Math.cos((pan + 1) * Math.PI / 4) * amp, gr = Math.sin((pan + 1) * Math.PI / 4) * amp;
        for (let t0 = off; t0 < 8 + per; t0 += per) for (let p = 0; p < pulses; p++) {
          const s = Math.floor((t0 + p * .03) * sr), m = Math.floor(.016 * sr);
          for (let i = 0; i < m; i++) { const env = Math.sin(Math.PI * i / m) ** 2, v = Math.sin(TAU * f * (s + i) / sr) * env, k = (s + i) % n; L[k] += v * gl; R[k] += v * gr; }
        }
      }
      mixInto(L, R, band(noise(n), 5200, 9000, sr), .018, 0, loopLfo(n, [[48, .6, 0]]));
      normalize(L, R, .7); return [L, R];
    },
    // Still pond water lapping at the stones: slow swells with a soft plop at each.
    lapping(sr) {
      const n = sr * 12, L = new Float32Array(n), R = new Float32Array(n), laps = [];
      for (let t = rand(0, .5); t < 12; t += rand(1.5, 3)) laps.push([t, rand(.6, 1), rand(-.6, .6)]);
      for (const pan of [-.4, .4]) {
        const d = band(noise(n), 90, 700, sr);
        mixInto(L, R, d, .7, pan, i => { const t = i / sr; let e = .06; for (const [t0, a] of laps) { const u = ((t - t0) % 12 + 12) % 12; e += a * (u < .3 ? u / .3 : Math.exp(-(u - .3) / .7)); } return e; });
      }
      for (const [t0, a, pan] of laps) for (let k = 0; k < 3; k++) { const f0 = rand(260, 620); bubble(L, R, sr, t0 + .25 + k * rand(.05, .2), f0, 14 / f0 + .03, .18 * a * rand(.4, 1), pan, rand(.3, .8)); }
      normalize(L, R, .6); return [L, R];
    },
    // Used only while the embedded leaf recording is decoding, or as a fallback.
    leaves(sr) {
      const n = sr * 12, L = new Float32Array(n), R = new Float32Array(n);
      for (const pan of [-.6, .6]) mixInto(L, R, band(noise(n), 350, 4300, sr), .25, pan, loopLfo(n, [[2, .38, pan], [5, .18, 1]]));
      normalize(L, R, .35); return [L, R];
    },
    cicadas(sr) {
      const n = sr * 12, L = new Float32Array(n), R = new Float32Array(n);
      for (const pan of [-.7, .45]) mixInto(L, R, band(noise(n), 2800, 6500, sr), .12, pan, loopLfo(n, [[1, .5, pan], [3, .3, 1], [720, .24, 0]]));
      normalize(L, R, .3); return [L, R];
    }
  };
  const WATERS = ['lapping'];
  function weatherLayers({ season = 'spring', weather, night, rain }) {
    const profile = SEASON_SOUNDS[season] || SEASON_SOUNDS.spring;
    const layers = { leaves: profile.wind * (night ? .75 : 1) };
    if (weather === 'rain') return { leaves: profile.wind * .6, rainLight: .65 - .4 * rain, rainHeavy: .08 + .55 * rain };
    if (weather === 'snow') return { leaves: .14 };
    if (night && profile.insects) layers.night = profile.insects;
    if (!night && season === 'summer') layers.cicadas = .38;
    return layers;
  }

  const unit = v => Math.max(0, Math.min(1, Number(v)));
  class PondAudio {
    constructor() {
      this.active = false; this.context = null; this.layers = {}; this.buffers = {}; this.timer = 0; this.events = {};
      this.opts = { ...NATURE_DEFAULTS };
      this.scene = { season: 'spring', weather: 'sunny', night: false, rain: .5 };
      this.recordings = {}; this.recordingsReady = null;
    }
    configure(settings) {
      const vol = (v, d) => Number.isFinite(Number(v)) ? unit(v) : d;
      const previousScene = this.scene, previousWeatherSound = this.opts.weatherSound;
      this.opts = { water: settings.water !== false, waterType: 'lapping', waterVol: vol(settings.waterVol, NATURE_DEFAULTS.waterVol), weatherSound: settings.weatherSound !== false, weatherVol: vol(settings.weatherVol, NATURE_DEFAULTS.weatherVol), music: 'off', musicVol: 0, sfx: settings.sfx !== false, volume: vol(settings.volume, NATURE_DEFAULTS.volume) };
      this.scene = { season: Object.hasOwn(SEASON_SOUNDS, settings.season) ? settings.season : 'spring', weather: settings.weather, night: !!settings.night, rain: vol(settings.rainAmount, .5) };
      if (this.scene.season !== previousScene.season || this.scene.weather !== previousScene.weather || this.scene.night !== previousScene.night || this.opts.weatherSound !== previousWeatherSound) this.events = {};
      if (!this.context) return;
      const now = this.context.currentTime, o = this.opts;
      this.master.gain.setTargetAtTime(o.volume, now, .1);
      this.waterBus.gain.setTargetAtTime(o.water ? o.waterVol * .7 : 0, now, .3);
      this.weatherBus.gain.setTargetAtTime(o.weatherSound ? o.weatherVol * .85 : 0, now, .3);
      this.wildlifeBus.gain.setTargetAtTime(this.scene.weather === 'rain' || this.scene.weather === 'snow' || this.scene.season === 'winter' ? 0 : 1, now, .9);
      if (this.active) this.refresh();
    }
    setup() {
      const ctx = this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = ctx.createGain(); this.master.gain.value = this.opts.volume;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
      this.master.connect(comp).connect(ctx.destination);
      // A soft spatial tail for weather and small water interactions.
      const len = Math.floor(ctx.sampleRate * 3.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let y = 0; for (let i = 0; i < len; i++) { const t = i / len, a = .2 + .75 * t; y = (1 - a) * (Math.random() * 2 - 1) + a * y; d[i] = y * Math.pow(1 - t, 2.2) * (i < 200 ? i / 200 : 1); } }
      this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = .55; this.reverb.connect(wet).connect(this.master);
      const bus = (verb) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.master); if (verb) { const v = ctx.createGain(); v.gain.value = verb; g.connect(v).connect(this.reverb); } return g; };
      this.waterBus = bus(0); this.weatherBus = bus(.18); this.sfxBus = bus(.12); this.sfxBus.gain.value = .8;
      this.wildlifeBus = ctx.createGain(); this.wildlifeBus.connect(this.weatherBus);
      this.configure({ ...this.opts, ...this.scene, rainAmount: this.scene.rain });
    }
    prepareRecordings() {
      if (this.recordingsReady) return this.recordingsReady;
      this.recordingsReady = Promise.allSettled(Object.entries(root.POND_AUDIO || {}).map(async ([name, encoded]) => {
        const binary = atob(encoded), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        this.recordings[name] = await this.context.decodeAudioData(bytes.buffer);
      })).then(results => {
        if (results.some(r => r.status === 'rejected')) console.warn('Some pond field recordings could not be decoded; using the local fallback.');
        if (Object.keys(this.recordings).length) console.info(`[pond audio] field recordings ready: ${Object.keys(this.recordings).join(', ')}`);
        if (this.active) this.refresh();
      });
      return this.recordingsReady;
    }
    buffer(name, make) {
      if (!this.buffers[name]) { const [sr, chans] = make(), b = this.context.createBuffer(chans.length, chans[0].length, sr); chans.forEach((d, i) => b.copyToChannel(d, i)); this.buffers[name] = b; }
      return this.buffers[name];
    }
    loopBuffer(name) {
      if (this.recordings[name]) return this.recordings[name];
      const sr = name.startsWith('rain') ? 32000 : 22050;
      return this.buffer(name, () => [sr, name === 'rainLight' ? AMBIENT_SYNTH.rain(sr, .25) : name === 'rainHeavy' ? AMBIENT_SYNTH.rain(sr, 1) : AMBIENT_SYNTH[name](sr)]);
    }
    // Fade each loop toward its target level; loops that fall silent are stopped.
    refresh() {
      const ctx = this.context, now = ctx.currentTime, want = {};
      if (this.active) {
        if (this.opts.water) want.lapping = { level: this.scene.weather === 'rain' || this.scene.season === 'winter' ? .65 : 1, bus: this.waterBus };
        if (this.opts.weatherSound) for (const [k, v] of Object.entries(weatherLayers(this.scene))) want[k] = { level: v, bus: this.weatherBus };
      }
      for (const name of new Set([...Object.keys(this.layers), ...Object.keys(want)])) {
        let layer = this.layers[name];
        if (layer && want[name] && this.recordings[name] && layer.src.buffer !== this.recordings[name]) {
          clearTimeout(layer.stopTimer); layer.gain.gain.setTargetAtTime(0, now, .8); layer.src.stop(now + 4); layer = null;
        }
        if (!layer && want[name]) {
          const src = ctx.createBufferSource(), gain = ctx.createGain(); src.buffer = this.loopBuffer(name); src.loop = true; gain.gain.value = 0;
          src.connect(gain).connect(want[name].bus); src.start(now, Math.random() * src.buffer.duration); layer = this.layers[name] = { src, gain };
        }
        if (!layer) continue;
        clearTimeout(layer.stopTimer);
        const level = want[name] ? want[name].level : 0; layer.gain.gain.cancelScheduledValues(now); layer.gain.gain.setTargetAtTime(level, now, .8);
        if (!level) { const l = layer; layer.stopTimer = setTimeout(() => { if (this.layers[name] !== l) return; try { l.src.stop(); } catch {} delete this.layers[name]; }, 4000); }
      }
      clearInterval(this.timer); this.timer = 0;
      if (this.active) this.timer = setInterval(() => this.weatherEvents(), 250);
    }
    play(buf, when, gain, rate = 1, pan = 0, bus = this.wildlifeBus) {
      const ctx = this.context, src = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
      if (p) { p.pan.value = pan; src.connect(g).connect(p).connect(bus); } else src.connect(g).connect(bus);
      src.start(when); return src;
    }
    // Live sounds of the weather: raindrops falling into the pond, birds by day, frogs by night.
    // Thunder is not scheduled here: it follows the lightning the pond draws (see thunderAfter).
    weatherEvents() {
      const ctx = this.context; if (!ctx || ctx.state !== 'running' || !this.opts.weatherSound) return;
      const now = ctx.currentTime, { season, weather, night, rain } = this.scene, profile = SEASON_SOUNDS[season], e = this.events, due = (k, gap) => { if (!(e[k] > now - 1)) e[k] = now + gap(); return e[k] < now + .5; };
      if (weather === 'rain') {
        while (due('drop', () => rand(0, .3))) { this.raindrop(e.drop); e.drop += -Math.log(1 - Math.random()) / (2 + 14 * rain); }
      } else if (weather === 'snow' || season === 'winter') {
        return;
      } else if (night) {
        if (profile.frogs && due('frog', () => rand(3, 7))) { this.frog(e.frog); e.frog += rand(...profile.frogs); }
      } else {
        const factor = weather === 'cloudy' ? 1.4 : 1;
        if (profile.birds && due('bird', () => rand(2, 5))) { this.bird(e.bird); e.bird += rand(...profile.birds) * factor; }
      }
    }
    tone(t, f0, f1, dur, gain, pan, bus = this.weatherBus, type = 'sine', attack = .008) {
      const ctx = this.context, o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0003, t + dur);
      p.pan.value = pan; o.connect(g).connect(p).connect(bus); o.start(t); o.stop(t + dur + .02);
    }
    raindrop(t) { const f = rand(650, 1700); this.tone(t, f, f * rand(1.5, 2.3), rand(.035, .07), rand(.03, .09) * (.6 + .5 * this.scene.rain), rand(-.9, .9), this.weatherBus, 'sine', .002); }
    // Thunder rolling in `delay` seconds after a flash of lightning seen over the pond.
    thunderAfter(delay, strength = 1) {
      const ctx = this.context; if (!ctx || ctx.state !== 'running' || !this.active || !this.opts.weatherSound) return;
      this.thunder(ctx.currentTime + delay, strength);
    }
    thunder(t, strength = 1) {
      const ctx = this.context, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.buffer('rumble', () => { const sr = 11025, d = noise(sr * 7); let y = 0; for (let i = 0; i < d.length; i++) { y = y * .985 + d[i] * .15; d[i] = y; } return [sr, [d]]; });
      f.type = 'lowpass'; f.frequency.value = 160; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.55 * (.6 + .4 * strength), t + rand(.8, 2)); g.gain.exponentialRampToValueAtTime(.001, t + 6.5);
      src.connect(f).connect(g).connect(this.weatherBus); src.start(t); src.stop(t + 7);
    }
    // Songbirds: a run of rising chirps, a two-note whistle or a quick trill, somewhere in the trees.
    bird(t) {
      if (this.recordings.bird) { this.play(this.recordings.bird, t, rand(.36, .48), rand(.97, 1.03), rand(-.75, .75), this.wildlifeBus); return; }
      const kind = Math.floor(rand(0, 3)), pan = rand(-.85, .85), gain = rand(.07, .12);
      if (kind === 0) { const f = rand(3200, 4300); let s = t; for (let k = 3 + Math.floor(rand(0, 4)); k > 0; k--) { this.tone(s, f * rand(.92, 1.06), f * rand(1.2, 1.38), rand(.05, .08), gain, pan, this.wildlifeBus); s += rand(.09, .15); } }
      else if (kind === 1) { const f = rand(1700, 2300); this.tone(t, f, f * 1.12, .22, gain * 1.2, pan, this.wildlifeBus); this.tone(t + .29, f * 1.22, f * .95, .3, gain * 1.2, pan, this.wildlifeBus); }
      else { const f = rand(4300, 5300); for (let k = 0; k < 10; k++) this.tone(t + k * .045, f, f * .84, .035, gain * .8, pan, this.wildlifeBus); }
    }
    // A frog: a burst of buzzy pulses through a throat-like resonance, sometimes answered twice.
    frog(t) {
      const ctx = this.context, f = rand(170, 300), rate = rand(18, 28), pan = rand(-.85, .85), gain = rand(.045, .075);
      for (let rep = 0, s = t; rep < 1 + Math.floor(rand(0, 3)); rep++, s += rand(.5, .9)) {
        const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner(), pulses = 5 + Math.floor(rand(0, 6));
        o.type = 'sawtooth'; o.frequency.value = f; bp.type = 'bandpass'; bp.frequency.value = f * 3.2; bp.Q.value = 3; p.pan.value = pan; g.gain.value = 0;
        for (let k = 0; k < pulses; k++) { const a = s + k / rate; g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(gain, a + .006); g.gain.linearRampToValueAtTime(0, a + .75 / rate); }
        o.connect(bp).connect(g).connect(p).connect(this.wildlifeBus); o.start(s); o.stop(s + pulses / rate + .05);
      }
    }
    // Switch the sound to a known state rather than flipping it, so pages can follow one shared setting.
    async setActive(on) {
      const next = !!on;
      if (next && !this.active) this.events = {};
      if (next) { if (!this.context) this.setup(); }
      else if (!this.context) { this.active = false; return this.active; }
      this.active = next;
      if (this.active) await this.context.resume();
      if (this.active) this.prepareRecordings();
      this.refresh();
      if (!this.active) setTimeout(() => { if (!this.active) this.context.suspend(); }, 2500);
      return this.active;
    }
    async toggle() {
      return this.setActive(!this.active);
    }
    ok() { return this.context && this.context.state === 'running' && this.active && this.opts.sfx; }
    // Food scattering on the surface: a few small drops with a hiss of spray.
    plop() {
      if (!this.ok()) return;
      const ctx = this.context, now = ctx.currentTime;
      for (let k = 0; k < 4; k++) this.drop(now + k * rand(.015, .05), rand(700, 1300), rand(.12, .22), rand(-.4, .4));
      const n = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      n.buffer = this.buffer('spray', () => [22050, [band(noise(4410), 1800, 6000, 22050)]]); f.type = 'highpass'; f.frequency.value = 1500;
      g.gain.setValueAtTime(.05, now); g.gain.exponentialRampToValueAtTime(.001, now + .15); n.connect(f).connect(g).connect(this.sfxBus); n.start(now); n.stop(now + .2);
    }
    // A koi taking a pellet: a low, round pop.
    gulp() { if (this.ok()) this.drop(this.context.currentTime, rand(260, 380), .16, rand(-.3, .3), .5); }
    // A fingertip touching the water.
    tap() { if (this.ok()) this.drop(this.context.currentTime, rand(520, 700), .2, 0, 1.2); }
    drop(t, f, gain, pan, rise = .9) { this.tone(t, f, f * (1 + rise), Math.min(.12, 22 / f + .02) * 1.6, gain, pan, this.sfxBus, 'sine', .002); }
  }
  root.PondAudio = { PondAudio, MUSIC, WATERS, NATURE_DEFAULTS, applyNaturePreset, weatherLayers };
})(window);
