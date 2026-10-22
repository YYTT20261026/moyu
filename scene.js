// Everything alive in the pond besides the simulation: koi drawing, turtles, butterflies, petals, weather.
(function (root) {
  'use strict';
  const { PALETTES, fishPalette, BODY, POND_MAPS, PondHabitat, clamp, wrap, fishPose } = root.PondCore;
  const { halfWidth, girthOf } = root.PondArt;
  const TAU = Math.PI * 2;
  const rgb = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

  // Things above the water in the supplied painting (assets/pond.jpg, 2560×1440).
  // [x, y, rx, kind, ry, rotation]; l = lotus/pennywort leaf, f = flower or petal, b = lotus bud, r = rock breaking the surface.
  const FLOATERS = [
    [110,365,124,'r',122],[981,94,97,'r',91],[1259,106,106,'r',104],
    [1638,812,92,'r',63],[1008,1041,66,'r',54],
    [1128,225,34,'f',26],[1409,108,35,'f',39],[1783,577,31,'f',29],
    [1186,558,14,'f',11],[1734,378,14,'f',10],
    [1628,572,15,'f',10],[1719,585,14,'f',11],[888,924,13,'f',10]
  ].map(([x,y,rx,kind,ry=rx])=>[x*1.25,y*1.25,rx*1.25,kind,ry*1.25]);
  const seasonalFloaters = {
    spring:FLOATERS,
    summer:[[100,360,107,'r',122],[983,96,95,'r',105],[1261,107,92,'r',116],[1665,718,115,'r',75],[1056,1135,84,'r',60]],
    autumn:[[135,338,116,'r',101],[981,107,103,'r',103],[1263,110,94,'r',112],[1562,752,126,'r',74],[1123,1133,74,'r',43]],
    winter:[[98,318,102,'r',109],[981,105,96,'r',105],[1253,105,92,'r',114],[1596,712,138,'r',102],[1123,1135,93,'r',58]]
  };
  for(const season of ['summer','autumn','winter'])seasonalFloaters[season]=seasonalFloaters[season].map(([x,y,rx,kind,ry=rx])=>[x*1.25,y*1.25,rx*1.25,kind,ry*1.25]);
  // A small lotus patch in the lower-left water, following the plant's annual cycle.
  // Sprite, offset from the patch, size, rotation. All artwork is cached in the sprite atlas.
  const LOTUS_PLANTS = {
    spring: [['lotusLeaf',-52,10,.54,-.4],['lotusLeaf',0,28,.7,.35],['lotusLeaf',45,-9,.46,-.9],['lotusLeaf',-10,-25,.35,.8]],
    summer: [['lotusLeaf',-65,13,.9,-.4],['lotusLeaf',4,35,1,.35],['lotusLeaf',65,7,.88,-.8],['lotusLeaf',4,-29,.82,.8],['lotusLeaf',-41,-32,.65,-1],['lotusFlower',-13,18,.82,.12],['lotusBud',58,-4,.75,.3]],
    autumn: [['lotusYellowLeaf',-57,17,.9,-.4],['lotusYellowLeaf',13,33,.88,.35],['lotusDryLeaf',60,4,.7,-.8],['lotusPod',-15,-4,.86,-.14],['lotusPod',47,-19,.64,.25]],
    winter: [['lotusDryLeaf',-53,25,.7,-.4],['lotusDryLeaf',32,32,.54,.4],['lotusStem',-22,25,.95,-.1],['lotusStem',55,22,.73,.2],['lotusDryPod',-24,7,.74,-.22],['lotusDryPod',35,9,.62,.18]]
  };
  // Species already in the atlas: white/yellow/swallowtail butterflies, red/blue dragonflies.
  const SEASONAL_INSECTS = {
    spring: { butterflies: [0, 1], dragonflies: [0], fireflies: 0 },
    summer: { butterflies: [0, 1, 2], dragonflies: [0, 1], fireflies: 14 },
    autumn: { butterflies: [1], dragonflies: [0], fireflies: 0 },
    winter: { butterflies: [], dragonflies: [], fireflies: 0 }
  };
  function floaterDefinitions(season) {
    const drifters = root.POND_DRIFTERS?.[season] || [];
    return (seasonalFloaters[season] || FLOATERS).filter(f => f[3] !== 'f' || f[2] > 25 || !drifters.some(d => Math.hypot(d.ix-f[0],d.iy-f[1]) < Math.max(d.w,d.h)));
  }
  // Flowers, buds and petals have pointed tips, so their ellipses are grown a little to take the tips in.
  const grow = f => f[3] === 'f' || f[3] === 'b' ? 1.1 : f[3] === 'l' ? 1.02 : 1;
  // Mask in image space: red = above water (no refraction or caustics), green = casts a shadow on the bed,
  // blue = rests on the water and leaves a wet line (flowers on stalks do not).
  function floatMask(width, height, season='spring') {
    const map=POND_MAPS[season]||POND_MAPS.spring,defs=floaterDefinitions(season);
    const k = .5, c = document.createElement('canvas'); c.width = Math.round(width * k); c.height = Math.round(height * k);
    const ctx = c.getContext('2d');
    // The complete dry bank uses the same outline as swimming and feeding.
    // Preserve its original pixels instead of refracting water over the rocks.
    const path=points=>{ctx.beginPath();points.forEach(([u,v],i)=>i?ctx.lineTo(u*c.width,v*c.height):ctx.moveTo(u*c.width,v*c.height));ctx.closePath();};
    ctx.fillStyle='rgb(255,0,0)';ctx.fillRect(0,0,c.width,c.height);
    ctx.globalCompositeOperation='destination-out';path(map.water);ctx.fill();
    ctx.globalCompositeOperation='source-over';
    for(const rock of map.rocks){path(rock);ctx.fill();}
    for (const f of defs) {
      const [x, y, rx, kind, ry = rx, rot = 0] = f, g = grow(f), stalk = kind === 'b' || (kind === 'f' && rx > 25);
      ctx.fillStyle = kind === 'r' ? 'rgb(255,0,0)' : stalk ? 'rgb(255,255,0)' : 'rgb(255,255,255)';
      ctx.beginPath(); ctx.ellipse(x * k, y * k, rx * g * k, ry * g * k, rot, 0, TAU); ctx.fill();
    }
    return c;
  }

  // Weather looks; night multiplies on top. Arrays are RGB.
  // cloudCover: share of the pond under drifting cloud shadow (1 = overcast); cloudShade: how much a cloud's shadow dims.
  // Caustics, glints, fish highlights and crisp shadows belong to sunlit water only; the renderer takes them away under cloud.
  const LOOKS = {
    sunny: { sunK: 1, bright: 1.02, sat: 1, tint: [1.02, 1, .96], caustic: .26, causticTint: [1, .97, .84], glint: 1, glintColor: [1, .96, .84], sky: [.86, .93, .94], skyK: .025, cloudCover: 0, cloudShade: 0, wave: .6, refract: 14, ripple: 9, shade: .12, shadow: .8, vignette: .32, water: [.34, .47, .4], moon: 0, mist: 0 },
    cloudy: { sunK: .95, bright: .98, sat: .9, tint: [1, 1, 1.01], caustic: .22, causticTint: [1, .97, .88], glint: .8, glintColor: [1, .96, .86], sky: [.82, .87, .88], skyK: .05, cloudCover: .56, cloudShade: .46, wave: .7, refract: 14, ripple: 9, shade: .26, shadow: .78, vignette: .55, water: [.35, .46, .42], moon: 0, mist: 0 },
    rain: { sunK: .4, bright: .76, sat: .66, tint: [.93, .98, 1.04], caustic: .035, causticTint: [.9, .95, 1], glint: .12, glintColor: [.9, .95, 1], sky: [.68, .74, .78], skyK: .13, cloudCover: 1, cloudShade: .08, wave: 1, refract: 15, ripple: 10, shade: .3, shadow: .5, vignette: .65, water: [.3, .39, .38], moon: 0, mist: .1 },
    snow: { sunK: .55, bright: .94, sat: .66, tint: [.99, 1.02, 1.07], caustic: .06, causticTint: [.95, .98, 1], glint: .28, glintColor: [.95, .98, 1], sky: [.9, .93, .96], skyK: .11, cloudCover: .75, cloudShade: .2, wave: .42, refract: 13, ripple: 8, shade: .22, shadow: .5, vignette: .5, water: [.4, .48, .48], moon: 0, mist: .04 }
  };
  function lookFor(weather, night, rain = .5, snow = .5) {
    const l = JSON.parse(JSON.stringify(LOOKS[weather] || LOOKS.sunny));
    if (weather === 'rain') Object.assign(l, { bright: .86 - .16 * rain, sat: .74 - .12 * rain, wave: .72 + .55 * rain, skyK: .09 + .07 * rain, mist: .04 + .12 * rain });
    if (weather === 'snow') Object.assign(l, { bright: .9 + .08 * snow, sat: .72 - .18 * snow, cloudCover: .6 + .4 * snow, skyK: .08 + .09 * snow, caustic: .07 * (1 - snow * .6), wave: .5 - .12 * snow, mist: .02 + .06 * snow });
    if (night) Object.assign(l, { sunK: l.sunK * .45, bright: l.bright * .46, sat: l.sat * .72, tint: [.64, .8, 1.14], caustic: l.caustic * .25, glint: .55, glintColor: [.7, .82, 1], sky: [.22, .3, .44], skyK: l.skyK * 1.3 + .04, wave: l.wave * 1.1, shadow: l.shadow * .35, cloudShade: l.cloudShade * .5, moon: weather === 'sunny' || weather === 'snow' ? 1 : .35, water: [.2, .3, .36], mist: l.mist * .6 });
    return l;
  }
  // Age of the moon from a known new moon, so the reflection shows tonight's real phase.
  function moonPhase(date = new Date()) {
    const month = 29.530588853, age = (((date - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % month + month) % month, angle = age / month * TAU;
    return { age, angle, illum: (1 - Math.cos(angle)) / 2, name: ['新月', '蛾眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'][Math.round(age / month * 8) % 8] };
  }
  function lerpLook(a, b, t) { for (const k in b) { if (Array.isArray(b[k])) for (let i = 0; i < b[k].length; i++) a[k][i] += (b[k][i] - a[k][i]) * t; else a[k] += (b[k] - a[k]) * t; } }

  // How far the turtle's centre must stay from the water's edge: the shell is 22 wide and the front
  // flippers reach about 29 from the middle, so 25 (the old value) let a flipper poke out of the pond.
  const TURTLE_CLEARANCE = 34;
  class Turtle {
    constructor(variant, rnd) {
      Object.assign(this, { variant, rnd, x: .25 + rnd() * .5, y: .3 + rnd() * .45, angle: rnd() * TAU, v: 0, turn: 0, stroke: rnd() * TAU, depth: .5, depthGoal: .5, goal: null, goalTime: 0, rest: 2 + rnd() * 4, breath: 20 + rnd() * 30, surfaced: 0, look: 0, lookGoal: 0, neck: 1, size: 1.08 + rnd() * .14, bubble: 0 });
    }
    startle(x, y, w, h, radius, habitat) {
      const px = this.x * w, py = this.y * h;
      if (Math.hypot(px - x, py - y) > radius) return;
      let tx = px + (px - x) * 1.8 || px + 1;
      let ty = py + (py - y) * 1.8 || py + 1;
      const safe = habitat?.project(tx, ty, 42);
      if (safe) [tx, ty] = safe;
      this.goal = [clamp(tx / w, .1, .9), clamp(ty / h, .12, .88)];
      this.goalTime = 9 + this.rnd() * 5;
      this.depthGoal = .82; this.surfaced = 0; this.breath = 20 + this.rnd() * 15;
      this.rest = 1.6;
    }
    update(dt, w, h, scale, scene) {
      const r = this.rnd, s = scale * this.size, L = 60 * s;
      let x = this.x * w, y = this.y * h;
      this.breath -= dt;
      if (this.breath <= 0 && this.surfaced <= 0) {
        this.depthGoal = 0;
        if (this.depth < .05) { this.surfaced = 4 + r() * 4; this.breath = 40 + r() * 40; scene.drop(...this.headPos(w, h, scale), 6 * scale, .45); }
      }
      if (this.surfaced > 0) {
        this.surfaced -= dt; this.bubble -= dt;
        if (this.bubble <= 0) { this.bubble = .8 + r() * 1.4; scene.drop(...this.headPos(w, h, scale), 3.5 * scale, .12); }
        if (this.surfaced <= 0) { this.depthGoal = .4 + r() * .35; scene.drop(x, y, 12 * scale, .35); }
      }
      this.rest -= dt;
      if (this.rest < -8 - r() * 10) this.rest = 3 + r() * 6;
      const resting = this.rest > 0 || this.surfaced > 0;
      this.goalTime -= dt;
      if (!this.goal || this.goalTime <= 0 || Math.hypot(this.goal[0] * w - x, this.goal[1] * h - y) < L) { this.goal = [.18 + r() * .64, .2 + r() * .6]; this.goalTime = 15 + r() * 15; }
      let gx = this.goal[0] * w - x, gy = this.goal[1] * h - y;
      const m = Math.min(w, h) * .1, lx = x + Math.cos(this.angle) * L, ly = y + Math.sin(this.angle) * L;
      if (lx < m || lx > w - m) gx += (w / 2 - x) * 2; if (ly < m || ly > h - m) gy += (h / 2 - y) * 2;
      for (const o of scene.turtles) if (o !== this) { const dx = x - o.x * w, dy = y - o.y * h, d = Math.hypot(dx, dy); if (d < L * 1.3 && d > 0) { gx += dx / d * L * 3; gy += dy / d * L * 3; } }
      const want = Math.atan2(gy, gx) + Math.sin(scene.time * .13 + this.variant * 3) * .3;
      this.turn += (clamp(wrap(want - this.angle) * .8, -.45, .45) * (resting ? .15 : 1) - this.turn) * Math.min(1, dt * 2);
      this.angle = wrap(this.angle + this.turn * dt);
      // Power stroke on the down-sweep, gliding in between.
      const rate = resting ? .12 : .62;
      this.stroke += dt * TAU * rate;
      this.v += Math.max(0, Math.sin(this.stroke)) * (resting ? 0 : L * .5) * dt;
      this.v *= Math.exp(-dt * .9);
      x += Math.cos(this.angle) * this.v * dt; y += Math.sin(this.angle) * this.v * dt;
      const safe = scene?.sim?.habitat?.project(x, y, TURTLE_CLEARANCE * s);
      if (safe) [x, y] = safe;
      this.x = clamp(x / w, .05, .95); this.y = clamp(y / h, .06, .94);
      this.depth += (this.depthGoal - this.depth) * Math.min(1, dt * .45);
      if (r() < dt * .25) this.lookGoal = (r() - .5) * (resting ? 1.1 : .5);
      this.look += (this.lookGoal - this.look) * Math.min(1, dt * 1.5);
      this.neck += ((this.surfaced > 0 ? 1.25 : resting ? .75 : 1) - this.neck) * Math.min(1, dt * 1.5);
    }
    headPos(w, h, scale) { const s = scale * this.size, d = (20 + 10 * this.neck) * s; return [this.x * w + Math.cos(this.angle) * d, this.y * h + Math.sin(this.angle) * d]; }
    draw(R, w, h, scale, look) {
      const S = R.sprites, v = this.variant, s = scale * this.size * (1 + (.5 - this.depth) * .08), x = this.x * w, y = this.y * h, a = this.angle, c = Math.cos(a), si = Math.sin(a);
      const fogA = .03 + this.depth * .3, fog = [look.water[0], look.water[1], look.water[2], fogA];
      const at = (lx, ly) => [x + (lx * c - ly * si) * s, y + (lx * si + ly * c) * s];
      const off = (6 + (1 - this.depth) * 26) * scale, dx = look.shadowDir[0] * off, dy = look.shadowDir[1] * off, sh = [0, 0, 0, .7 - (1 - this.depth) * .18], blur = [(1 - this.depth) * 1.1, 0, 0, 0];
      const part = (name, lx, ly, ang, flip) => {
        const [px, py] = at(lx, ly);
        R.sprite('under', S[`turtle${v}_${name}`], px, py, a + ang, s, flip ? -s : s, undefined, fog);
        R.sprite('shadow', S[`turtle${v}_${name}`], px + dx, py + dy, a + ang, s, flip ? -s : s, sh, blur);
      };
      const swim = this.rest > 0 || this.surfaced > 0 ? .25 : 1, st = this.stroke;
      for (const side of [1, -1]) {
        const ph = side > 0 ? 0 : Math.PI;
        part('back', -13, side * 11, side * (2.3 + Math.sin(st + ph + Math.PI) * .38 * swim), side < 0);
        part('front', 11, side * 12.8, side * (.85 + (.5 - .5 * Math.cos(st + ph)) * .95 * swim), side < 0);
      }
      part('tail', -20.5, 0, Math.PI + Math.sin(st * .5) * .25, false);
      part('head', 16 + 3.5 * this.neck, 0, this.look, false);
      part('shell', 0, 0, 0, false);
    }
  }

  class Butterfly {
    constructor(species, rnd) {
      Object.assign(this, { species, rnd, x: -1, y: -1, vx: 0, vy: 0, heading: rnd() * TAU, alt: .8, flap: 0, phase: rnd() * TAU, state: 'fly', target: null, timer: 0, glide: 0, wander: rnd() * TAU, open: .5 });
    }
    pickTarget(w, h, spots) {
      const r = this.rnd;
      if (spots.length && r() < .45) { const s = spots[Math.floor(r() * spots.length)]; this.target = { x: s[0] + (r() - .5) * 8, y: s[1] + (r() - .5) * 8, land: true }; }
      else this.target = { x: w * (.12 + r() * .76), y: h * (.14 + r() * .72), land: false };
      this.timer = 6 + r() * 8;
    }
    update(dt, w, h, scale, spots, time) {
      const r = this.rnd;
      if (!this.target) this.pickTarget(w, h, spots);
      if (this.state === 'rest') {
        this.timer -= dt; this.alt += (0 - this.alt) * Math.min(1, dt * 3);
        // Resting wings open and close slowly, sometimes staying spread to bask.
        this.open += ((Math.sin(time * 1.3 + this.phase) > -.2 ? .05 : 1.2) - this.open) * Math.min(1, dt * 1.8);
        this.flap = this.open; this.heading += Math.sin(time * .7 + this.phase) * dt * .15;
        if (this.timer <= 0) { this.state = 'fly'; this.pickTarget(w, h, spots); this.vy -= 30; }
        return;
      }
      const t = this.target, dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy);
      this.timer -= dt;
      if (t.land && d < 10) { this.state = 'rest'; this.timer = 4 + r() * 8; this.vx = this.vy = 0; return; }
      if ((!t.land && d < 40) || this.timer <= 0) this.pickTarget(w, h, spots);
      this.wander += (r() - .5) * dt * 9;
      const sp = (t.land ? clamp(d / 70, .35, 1) : 1) * 95 * scale;
      const ax = dx / (d || 1) * sp + Math.cos(this.wander) * 45 * scale, ay = dy / (d || 1) * sp + Math.sin(this.wander) * 45 * scale;
      this.vx += (ax - this.vx) * Math.min(1, dt * 2.2); this.vy += (ay - this.vy) * Math.min(1, dt * 2.2);
      this.x += this.vx * dt; this.y += this.vy * dt;
      const want = Math.atan2(this.vy, this.vx);
      this.heading += clamp(wrap(want - this.heading), -dt * 6, dt * 6);
      // Quick flaps with the odd glide; a downstroke lifts the body a little.
      this.glide -= dt;
      if (this.glide <= 0 && r() < dt * .35) this.glide = .25 + r() * .45;
      if (this.glide > 0) this.flap += (.05 - this.flap) * Math.min(1, dt * 10);
      else { this.phase += dt * TAU * (this.species === 2 ? 6.5 : 9); const s = .5 + .5 * Math.sin(this.phase); this.flap = -.12 + 1.45 * Math.pow(s, .7); }
      const altGoal = t.land ? clamp(d / 120, .05, .8) : .75 + .12 * Math.sin(time * 1.1 + this.phase * .1);
      this.alt += (altGoal - this.alt) * Math.min(1, dt * 1.5);
      this.x = clamp(this.x, -20, w + 20); this.y = clamp(this.y, -20, h + 20);
    }
    draw(R, scale, look) {
      const S = R.sprites, s = scale * .55 * (.9 + this.alt * .35), a = this.heading + Math.PI / 2, wing = S[`bf${this.species}_wing`], body = S[`bf${this.species}_body`];
      const k = Math.cos(clamp(this.flap, -.3, 1.5)), shade = .82 + .18 * k, col = [shade, shade, shade, 1], bob = this.state === 'rest' ? 0 : Math.sin(this.phase) * 1.2;
      const off = (3 + this.alt * 70) * scale, dx = look.shadowDir[0] * off, dy = look.shadowDir[1] * off + bob, sa = [0, 0, 0, (.28 - this.alt * .12) * look.shadow * 2];
      for (const side of [1, -1]) {
        R.sprite('airShadow', wing, this.x + dx, this.y + dy, a, side * s * Math.max(.08, k), s, sa);
        R.sprite('air', wing, this.x, this.y + bob, a, side * s * Math.max(.06, k), s, col);
      }
      R.sprite('airShadow', body, this.x + dx, this.y + dy, a, s * .9, s * .9, sa);
      R.sprite('air', body, this.x, this.y + bob, a, s * .9, s * .9);
    }
  }

  // Dragonfly: quick straight darts between hovers, rests on buds, and now and then dips to the water (蜻蜓点水).
  class Dragonfly {
    constructor(species, rnd) { Object.assign(this, { species, rnd, x: -1, y: -1, vx: 0, vy: 0, heading: rnd() * TAU, alt: .7, state: 'hover', timer: 1, target: null, flap: 0, touched: false }); }
    choose(w, h, scale, perches) {
      const r = this.rnd, roll = r(), a = r() * TAU;
      if (roll < .22 && perches.length) { const p = perches[Math.floor(r() * perches.length)]; this.state = 'perch'; this.target = { x: p[0], y: p[1] }; this.timer = 4 + r() * 9; }
      else if (roll < .45) { const d = (50 + r() * 130) * scale; this.state = 'dip'; this.touched = false; this.target = { x: clamp(this.x + Math.cos(a) * d, w * .15, w * .85), y: clamp(this.y + Math.sin(a) * d, h * .15, h * .85) }; }
      else { const d = (120 + r() * 260) * scale; this.state = 'dart'; this.target = { x: clamp(this.x + Math.cos(a) * d, w * .08, w * .92), y: clamp(this.y + Math.sin(a) * d, h * .1, h * .9) }; }
    }
    update(dt, w, h, scale, scene, perches, time) {
      const r = this.rnd;
      if (this.x < 0) { this.x = w * (.2 + r() * .6); this.y = h * (.2 + r() * .6); }
      this.flap += dt;
      if (this.state === 'hover' || this.state === 'rest') {
        this.timer -= dt; this.vx *= Math.exp(-dt * 6); this.vy *= Math.exp(-dt * 6);
        if (this.state === 'hover') { this.x += this.vx * dt + Math.sin(time * 2.3 + this.species) * 5 * scale * dt; this.y += this.vy * dt + Math.cos(time * 3.1) * 4 * scale * dt; this.alt += (.6 - this.alt) * Math.min(1, dt * 2); }
        if (this.timer <= 0) this.choose(w, h, scale, perches);
        return;
      }
      const t = this.target, dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy), want = Math.min((this.state === 'dart' ? 320 : 170) * scale, d * 5);
      this.vx += ((dx / (d || 1)) * want - this.vx) * Math.min(1, dt * 8); this.vy += ((dy / (d || 1)) * want - this.vy) * Math.min(1, dt * 8);
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (d > 4) this.heading += clamp(wrap(Math.atan2(dy, dx) - this.heading), -dt * 14, dt * 14);
      if (this.state === 'dip') {
        this.alt += ((d < 25 * scale ? .02 : .45) - this.alt) * Math.min(1, dt * 5);
        if (d < 4 && !this.touched) { this.touched = true; scene.drop(this.x, this.y, 3.5 * scale, .5); this.state = 'hover'; this.timer = .4 + r() * .8; }
      } else if (this.state === 'perch') {
        this.alt += ((d < 30 * scale ? 0 : .5) - this.alt) * Math.min(1, dt * 3);
        if (d < 2) { this.state = 'rest'; this.vx = this.vy = 0; this.alt = 0; }
      } else { this.alt += (.7 - this.alt) * Math.min(1, dt * 2); if (d < 6) { this.state = 'hover'; this.timer = .5 + r() * 2.2; } }
    }
    draw(R, scale, look) {
      const S = R.sprites, s = scale * .7 * (.9 + this.alt * .3), wing = S[`df${this.species}_wing`], body = S[`df${this.species}_body`], c = Math.cos(this.heading), si = Math.sin(this.heading);
      const off = (3 + this.alt * 60) * scale, dx = look.shadowDir[0] * off, dy = look.shadowDir[1] * off, sa = [0, 0, 0, (.3 - this.alt * .12) * look.shadow * 2], resting = this.state === 'rest';
      // Four wings off the thorax; in flight they beat too fast to see, so draw two faint blurred positions.
      for (const [fwd, sweep] of [[1.2, -.16], [-.6, .2]]) for (const side of [1, -1]) {
        const x = this.x + c * fwd * s, y = this.y + si * fwd * s, ang = this.heading + side * (Math.PI / 2 + sweep);
        R.sprite('airShadow', wing, x + dx, y + dy, ang, s, side * s, sa);
        if (resting) R.sprite('air', wing, x, y, ang, s, side * s, [1, 1, 1, .95]);
        else for (const k of [-1, 1]) R.sprite('air', wing, x, y, ang + side * k * .18, s * (.8 + .2 * Math.sin(this.flap * 60 + k)), side * s, [1, 1, 1, .45]);
      }
      R.sprite('airShadow', body, this.x + dx, this.y + dy, this.heading + Math.PI / 2, s, s, sa);
      R.sprite('air', body, this.x, this.y, this.heading + Math.PI / 2, s, s);
    }
  }

  // Where crabs live, in painting px [x, y, rx, ry]: the rocks that break the surface and the mossy banks around them.
  const CRAB_HOMES = [[110,365,78,80],[981,94,65,58],[1259,106,66,68],
    [1638,812,62,40],[1009,1041,30,24],[1460,982,65,42]]
    .map(c=>c.map(v=>v*1.25));
  // A small crab: it scuttles sideways about its rock or bank, rests with claws raised, now and then waves one,
  // and bolts for the water and dives when something startles it, coming up again somewhere else a while later.
  class Crab {
    constructor(variant, rnd) {
      this.homes=CRAB_HOMES;
      Object.assign(this, { variant, rnd, home: 0, u: 0, v: 0, heading: rnd() * TAU, state: 'hidden', timer: 1 + rnd() * 6, walk: 0, speed: 0, target: null, side: 1, alpha: 0, wave: 0, waveT: 0, size: .85 + rnd() * .35, x: 0, y: 0 });
    }
    // Position on screen of a point (u, v in the unit disc) of home h.
    at(R, h, u, v) { const [x, y, rx, ry] = this.homes[h]; return R.imageToScreen(x + u * rx, y + v * ry); }
    emerge(R, homes, taken = []) {
      // Surface on a rock or bank no other crab is on, if there is one.
      const free = homes.filter(h => !taken.includes(h)), pool = free.length ? free : homes, r = this.rnd; this.home = pool[Math.floor(r() * pool.length)]; const a = r() * TAU, d = Math.sqrt(r()) * .7;
      this.u = Math.cos(a) * d; this.v = Math.sin(a) * d; this.state = 'idle'; this.timer = 1 + r() * 3; this.alpha = 0;
    }
    startle(x, y, radius, R) {
      if (this.state === 'hidden' || this.state === 'dive' || Math.hypot(this.x - x, this.y - y) > radius) return;
      // Run for the edge of its patch that faces away from the disturbance, then dive.
      const [rx,ry]=this.homes[this.home].slice(2),[ox,oy]=R.imageToScreen(0,0),
        [xx,xy]=R.imageToScreen(1,0),[yx,yy]=R.imageToScreen(0,1);
      const ax=xx-ox,ay=xy-oy,bx=yx-ox,by=yy-oy,det=ax*by-ay*bx,dx=this.x-x,dy=this.y-y;
      const a=Math.atan2((ax*dy-ay*dx)/det/ry,(by*dx-bx*dy)/det/rx);
      this.state = 'flee'; this.target = [Math.cos(a) * 1.05, Math.sin(a) * 1.05]; this.timer = 2;
    }
    update(dt, R, scale, homes, allowed, scene, taken) {
      const r = this.rnd;
      if (!allowed && !['hidden','dive','flee'].includes(this.state)) { const a=Math.atan2(this.v,this.u+.01);this.state = 'flee'; this.target = [Math.cos(a)*1.05,Math.sin(a)*1.05]; this.timer = 2; }
      if (this.state === 'hidden') { this.timer -= dt; if (this.timer <= 0 && allowed && homes.length) this.emerge(R, homes, taken); return; }
      if (this.state === 'dive') { this.alpha -= dt * 1.6; if (this.alpha <= 0) { this.state = 'hidden'; this.timer = 12 + r() * 25; } return; }
      this.alpha = Math.min(1, this.alpha + dt * 1.2);
      if (this.state === 'idle') {
        this.timer -= dt; this.speed *= Math.exp(-dt * 8);
        if (this.waveT <= 0 && r() < dt * .12) this.waveT = 1.2;
        if (this.timer <= 0) {
          if (r() < .1) { this.state = 'flee'; const a = r() * TAU; this.target = [Math.cos(a) * 1.05, Math.sin(a) * 1.05]; }
          else { const a = r() * TAU, d = Math.sqrt(r()) * .8; this.target = [Math.cos(a) * d, Math.sin(a) * d]; this.state = 'walk'; this.timer = 6; }
        }
      }
      if (this.state === 'walk' || this.state === 'flee') {
        const [x0, y0] = this.at(R, this.home, this.u, this.v), [x1, y1] = this.at(R, this.home, this.target[0], this.target[1]), dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
        // Crabs walk sideways: turn so the target lies off one flank, then scuttle.
        const dir = Math.atan2(dy, dx), want = [dir - Math.PI / 2, dir + Math.PI / 2].sort((a, b) => Math.abs(wrap(a - this.heading)) - Math.abs(wrap(b - this.heading)))[0];
        this.side = Math.sin(dir - want) > 0 ? 1 : -1;
        this.heading += clamp(wrap(want - this.heading), -dt * 2.4, dt * 2.4);
        const go = (this.state === 'flee' ? 80 : 24) * scale * this.size, aligned = Math.abs(wrap(want - this.heading)) < .6 ? 1 : .25;
        this.speed += (go * aligned - this.speed) * Math.min(1, dt * 6);
        const step = Math.min(d, this.speed * dt);
        // Interpolate in painting coordinates. Screen axes turn with the pond
        // on a phone; adding screen dx/dy to u/v made crabs drift off their rock.
        if (d > .5) { const t=step/d;this.u+=(this.target[0]-this.u)*t;this.v+=(this.target[1]-this.v)*t; }
        this.walk += this.speed * dt / (3.6 * scale);
        this.timer -= dt;
        if (d < 1.5 || this.timer <= 0) {
          if (this.state === 'flee') { this.state = 'dive'; const [x, y] = this.at(R, this.home, this.u, this.v); scene.drop(x, y, 4 * scale, .3); }
          else { this.state = 'idle'; this.timer = 2 + r() * 7; }
        }
      }
      if (this.waveT > 0) this.waveT -= dt;
      [this.x, this.y] = this.at(R, this.home, this.u, this.v);
    }
    draw(R, scale, look) {
      if (this.state === 'hidden' || this.alpha <= 0) return;
      const S = R.sprites, v = this.variant, s = scale * 1.05 * this.size, a = this.heading, c = Math.cos(a), si = Math.sin(a), A = this.alpha;
      const lit = [look.bright * look.tint[0] * A, look.bright * look.tint[1] * A, look.bright * look.tint[2] * A, A];
      const at = (lx, ly) => [this.x + (lx * c - ly * si) * s, this.y + (lx * si + ly * c) * s];
      const moving = this.speed > 2 * scale, sh = [0, 0, 0, .34 * A], od = 3.4 * scale;
      R.sprite('surface', S[`crab${v}_body`], this.x + look.shadowDir[0] * od, this.y + look.shadowDir[1] * od, a, s * 1.08, s * 1.08, sh);
      // Four walking legs a side; while scuttling they swing in two alternating sets.
      for (const side of [1, -1]) for (let i = 0; i < 4; i++) {
        const [px, py] = at(1.9 - i * 1.35, side * 3.6), swing = moving ? Math.sin(this.walk + (i % 2) * Math.PI + (side > 0 ? 0 : Math.PI / 2)) * .32 : Math.sin(scale + i) * .03;
        const ang = a + side * (Math.PI / 2 + (i - 1.3) * .36 + swing);
        R.sprite('surface', S[`crab${v}_leg`], px + look.shadowDir[0] * od * .6, py + look.shadowDir[1] * od * .6, ang, s, side * s, [0, 0, 0, .22 * A]);
        R.sprite('surface', S[`crab${v}_leg`], px, py, ang, s, side * s, lit);
      }
      // Claws held forward; one lifts and waves now and then.
      for (const side of [1, -1]) {
        const [px, py] = at(4.4, side * 2.5), raise = side > 0 && this.waveT > 0 ? Math.sin((1.2 - this.waveT) * 9) * .5 * Math.min(1, this.waveT * 3) : 0;
        R.sprite('surface', S[`crab${v}_claw`], px, py, a + side * (.55 + raise), s * (1 + Math.abs(raise) * .15), side * s, lit);
      }
      R.sprite('surface', S[`crab${v}_body`], this.x, this.y, a, s, s, lit);
    }
  }

  class PondScene {
    constructor(R, sim, rnd = Math.random) {
      this.R = R; this.sim = sim; this.rnd = rnd; this.time = 0; this.w = 1; this.h = 1; this.scale = 1;
      this.turtles = [0, 1].map(v => new Turtle(v, rnd));
      this.butterflies = [0, 1, 2].map(s => new Butterfly(s, rnd));
      this.dragonflies = [0, 1].map(s => new Dragonfly(s, rnd));
      this.crabs = [0, 1, 0].map(v => new Crab(v, rnd)); this.crabHomes = [];
      this.petals = []; this.flies = []; this.rain = []; this.snow = []; this.splashes = []; this.wakes = new Map();
      this.lotusPlants = []; this.plantRipples = []; this.waterRipples = [];
      this.setSeason('spring');
      // Lightning in a downpour; each flash asks the app for the thunder that follows it.
      this.bolts = []; this.nextBolt = 15; this.events = []; this.calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.wetCover = 0;
      this.look = lookFor('sunny', false); this.look.shadowDir = [.7, .72];
      this.pose = new Float32Array((BODY.segments + 1) * 4);
      this.spots = []; this.finTint = PALETTES.map(p => [...rgb(p.fin), .9]);
    }
    setSeason(season) {
      this.season=season in POND_MAPS?season:'spring';this.map=POND_MAPS[this.season];
      this.insects = SEASONAL_INSECTS[this.season];
      this.activeButterflies = this.butterflies.filter(b => this.insects.butterflies.includes(b.species));
      this.activeDragonflies = this.dragonflies.filter(d => this.insects.dragonflies.includes(d.species));
      // Perches and flowers change with the painting; restart flight instead of keeping stale targets.
      for (const b of this.butterflies) Object.assign(b, { target: null, state: 'fly', vx: 0, vy: 0, alt: .8, timer: 0, glide: 0 });
      for (const d of this.dragonflies) Object.assign(d, { target: null, state: 'hover', vx: 0, vy: 0, alt: .7, timer: 1, touched: false });
      this.flies.length = 0;
      const driftDefs = root.POND_DRIFTERS?.[this.season] || [];
      // Extracted blossoms are now independent sprites; stop redrawing their old image locations.
      this.floaterDefs=floaterDefinitions(this.season);
      this.lotusDefs=this.floaterDefs.filter(f=>f[3]==='f'&&f[2]>25);
      const rnd=this.rnd,rank=f=>({r:0,l:1,f:f[2]>25?4:2,b:3})[f[3]];
      this.drifters = driftDefs.map(d => ({ ...d, x: 0, y: 0, a: 0, vx: 0, vy: 0, flow: rnd() * TAU, aim: rnd() * TAU, turnIn: 5 + rnd() * 9, speed: 2.8 + rnd() * 2.8, spin: (rnd() - .5) * .12, phase: rnd() * TAU, visible: false }));
      this.floaters=this.floaterDefs.map(f=>({f,p:[rnd()*TAU,rnd()*TAU,rnd()*TAU,rnd()*TAU],sp:.8+rnd()*.4,seed:rnd(),ja:0,jv:0,ox:0,oy:0,vx:0,vy:0,dx:0,dy:0})).sort((a,b)=>rank(a.f)-rank(b.f)||b.f[2]-a.f[2]);
      this.crabHomeDefs=this.season==='spring'?CRAB_HOMES:this.floaterDefs.filter(f=>f[3]==='r').map(([x,y,rx,,ry])=>[x,y,rx*.6,ry*.6]);
      for(const c of this.crabs){c.homes=this.crabHomeDefs;c.home=0;c.state='hidden';c.alpha=0;c.timer=1+rnd()*5;}
      this.petals.length=0;this.splashes.length=0;this.rain.length=0;this.wakes.clear();this.waterRipples.length=0;
      this.snowCover=0;this.wetCover=0;
    }
    butterflyWeather(settings) { return this.activeButterflies.length > 0 && settings.butterflies && !settings.night && settings.weather === 'sunny'; }
    dragonflyWeather(settings) { return this.activeDragonflies.length > 0 && settings.butterflies && !settings.night && (settings.weather === 'sunny' || settings.weather === 'cloudy'); }
    fireflyWeather(settings) { return this.insects.fireflies > 0 && settings.butterflies && settings.night && (settings.weather === 'sunny' || settings.weather === 'cloudy'); }
    // Screen positions of the big lotus leaves a koi can shelter under when it rains.
    shelterPoints() {
      const out = [];
      for (const fl of this.floaters) {
        const f = fl.f;
        if (f[3] !== 'l' || f[2] < 22) continue;
        const [sx, sy] = this.R.imageToScreen(f[0], f[1]);
        out.push({ x: sx, y: sy });
      }
      return out;
    }
    // Something disturbed the water at (x, y): crabs close by bolt for it and dive.
    startle(x, y) {
      for (const c of this.crabs) c.startle(x, y, 130 * this.scale, this.R);
      for (const t of this.turtles) t.startle(x, y, this.w, this.h, 170 * this.scale, this.sim.habitat);
    }
    drop(x, y, r, s, rain = false) {
      // Large disturbances stay limited to two; small rain impacts need continuous waves.
      this.waterRipples = this.waterRipples.filter(p => p.until > this.time);
      if (s > .05 && (rain || this.waterRipples.length < 2)) {
        if (!rain) this.waterRipples.push({ until: this.time + 1.8 });
        // Canvas uses the small impact sprites below instead of making a second, large ring.
        if (!rain || this.R.ripples !== false) this.R.drop(x, y, r, s * .65);
      }
      for (const particles of [this.petals, this.drifters]) for (const p of particles) {
        if (p.visible === false) continue;
        const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
        if (d < r * 8 && d > 0) { p.vx += dx / d * s * 40; p.vy += dy / d * s * 40; }
      }
      // Feed, fish wakes and rain send a travelling impulse through the lotus patch.
      // Delay the response until the wave reaches it, then let the tethered plant settle.
      if (s <= .08) return;
      for (const p of this.lotusPlants) {
        const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy), reach = 280 * this.scale + r;
        if (d > reach || this.plantRipples.length >= 96) continue;
        this.plantRipples.push({ p, at: this.time + Math.max(0, d - p.r - r) / (200 * this.scale), k: s * Math.exp(-d / (140 * this.scale)), nx: d ? dx / d : 0, ny: d ? dy / d : 1 });
      }
    }
    splash(x, y, s, leaf) {
      if (this.splashes.length > 260) return;
      const rnd = this.rnd, k = this.scale * s;
      this.splashes.push({ x, y, s: k, age: 0, life: leaf ? .3 : .38, ring: true, leaf });
      for (let i = 2 + Math.floor(rnd() * (leaf ? 4 : 3)); i > 0; i--) { const a = rnd() * TAU, v = (28 + rnd() * 52) * k; this.splashes.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: k * (.6 + rnd() * .5), age: 0, life: .16 + rnd() * .16, ring: false }); }
    }
    resetRainDrop(d, initial = false) {
      const rnd = this.rnd, lean = .12 + (this.rainK || 0) * .06;
      const x = rnd() * this.w, y = rnd() * this.h;
      // Some streaks are in front of the pond; the ones reaching its surface end at a real water point.
      d.water = rnd() < .42 && this.sim.isWater(x, y, 22 * this.scale)
        && !this.lotusPlants.some(p => Math.hypot(p.x - x, p.y - y) < p.r);
      d.hitX = d.water ? x : rnd() * (this.w + 80) - 60;
      d.hitY = d.water ? y : this.h + 60;
      d.lean = lean;
      d.y = initial ? -60 + rnd() * (d.hitY + 60) : -60 - rnd() * 60;
      d.x = d.hitX - (d.hitY - d.y) * lean;
      return d;
    }
    rainImpact(d, rainK) {
      if (!this.sim.isWater(d.hitX, d.hitY, 22 * this.scale)) return;
      this.drop(d.hitX, d.hitY, (3 + d.z * 2) * this.scale, (.22 + d.z * .2) * (.7 + .5 * rainK), true);
      if (this.splashes.length < 260) this.splashes.push({ x: d.hitX, y: d.hitY, s: (1.7 + d.z) * this.scale, age: 0, life: .58 + d.z * .18, ring: true, rain: true });
    }
    // A raindrop landing on a leaf, flower or rock: splash where it struck, and knock the thing (lighter things jump more).
    hit(fl, rainK) {
      const rnd = this.rnd, [x, y, rx, kind, ry = rx, rot = 0] = fl.f, a = rnd() * TAU, r = Math.sqrt(rnd()) * .85, ex = Math.cos(a) * rx * r, ey = Math.sin(a) * ry * r;
      const [sx, sy] = this.R.imageToScreen(x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot));
      this.splash(sx + fl.dx, sy + fl.dy, kind === 'r' ? .8 : .65 + .25 * rainK, true);
      if (kind === 'r') return;
      const light = kind === 'b' ? 3 : kind === 'f' ? (rx > 25 ? 1.2 : 2) : clamp(22 / rx, .25, 1.6), side = (rnd() < .5 ? -1 : 1) * (.4 + r);
      fl.jv += side * .045 * light * 8; fl.vx -= Math.cos(a) * r * light * 9; fl.vy -= Math.sin(a) * r * light * 9;
    }
    layout(w, h) {
      this.w = w; this.h = h; this.scale = clamp(Math.min(w, h) / 800, .62, 1.12);
      this.rain.length = 0;
      this.splashes = this.splashes.filter(p => !p.rain);
      const R = this.R, inside = ([x, y]) => x > 20 && x < w - 20 && y > 20 && y < h - 20;
      this.spots = this.floaterDefs.filter(f => f[3] !== 'r' && f[2] > 25).map(([x, y]) => R.imageToScreen(x, y)).filter(inside);
      this.buds = this.floaterDefs.filter(f => f[3] === 'b').map(([x, y, rx, k, ry = rx, rot = 0]) => R.imageToScreen(x - Math.sin(rot) * ry * .7, y - Math.cos(rot) * ry * .7)).filter(inside);
      for (const d of this.dragonflies) { d.x = -1; d.state = 'hover'; d.timer = 1; }
      // Image-space habitat is transformed by the renderer, including portrait
      // rotation and cover cropping, so fish and food always match the painting.
      const [x0, y0] = R.imageToScreen(0, 0), [x1, y1] = R.imageToScreen(1, 0), k = Math.hypot(x1 - x0, y1 - y0);
      this.sim.obstacles = [];
      this.sim.setHabitat(new PondHabitat(w,h,(x,y)=>R.imageToScreen(x,y),this.map));
      const [x2, y2] = R.imageToScreen(0, 1);
      this.driftBasis = { x0, y0, ux: x1-x0, uy: y1-y0, vx: x2-x0, vy: y2-y0, k, angle: Math.atan2(y1-y0, x1-x0) };
      for (const p of this.drifters) {
        [p.x, p.y] = R.imageToScreen(p.ix, p.iy);
        p.s = k; p.r = Math.hypot(p.w, p.h) * k / 2 + 3 * this.scale;
        // Off-screen objects stay off-screen instead of accumulating along a phone's crop edges.
        p.visible = p.x > p.r && p.x < w-p.r && p.y > p.r && p.y < h-p.r;
        if (p.visible) {
          const safe = this.sim.habitat.project(p.x, p.y, p.r);
          p.visible = !!safe;
          if (safe) { [p.x, p.y] = safe; this.rememberDrifter(p); }
        }
      }
      for (const p of this.petals) {
        p.x *= this.prevW ? w/this.prevW : 1; p.y *= this.prevH ? h/this.prevH : 1;
        p.r = 12 * p.s * this.scale;
        const safe = this.sim.habitat.project(p.x, p.y, p.r);
        if (safe) [p.x, p.y] = safe; else p.age = p.life;
      }
      // Keep the patch in the visible lower-left corner even when the pond rotates on a phone.
      // Project the whole plant's footprint into water, away from rocks and the dry bank.
      this.plantRipples.length = 0;
      const [ix, iy] = R.imageToScreen(590, 930);
      this.lotusPlants=LOTUS_PLANTS[this.season].map(([sprite,dx,dy,size,angle],i)=>{
        const s=size*this.scale,leaf=sprite.includes('Leaf'),r=(leaf?48:sprite==='lotusStem'?82:72)*s,motionMargin=20*this.scale;
        const [x,y]=this.sim.habitat.project(ix+dx*this.scale,iy+dy*this.scale,r+motionMargin);
        return {sprite,x,y,s,angle,phase:i*2.17,r,leaf,motionMargin,rootOffset:sprite==='lotusFlower'?30*s:0,ox:0,oy:0,vx:0,vy:0,ja:0,jv:0,bend:0,bv:0};
      });
      for(const p of this.lotusPlants){
        if(p.sprite==='lotusFlower'||p.sprite==='lotusLeaf')this.spots.push([p.x,p.y]);
        if(p.sprite==='lotusBud')this.buds.push([p.x,p.y-15*p.s]);
      }
      // Leaves, flowers and rocks on screen, weighted by area, for raindrops to land on.
      this.targets = []; this.targetArea = 0;
      for (const fl of this.floaters) {
        const [x, y, rx, , ry = rx] = fl.f, [sx, sy] = R.imageToScreen(x, y), r = Math.max(rx, ry) * k;
        if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) continue;
        this.targetArea += Math.PI * rx * ry * k * k; this.targets.push([this.targetArea, fl]);
      }
      // Crabs only live on the rocks and banks that are on screen.
      this.crabHomes = this.crabHomeDefs.map((c, i) => [i, R.imageToScreen(c[0], c[1])]).filter(([, [x, y]]) => x > 30 && x < w - 30 && y > 30 && y < h - 30).map(([i]) => i);
      for (const c of this.crabs) if (!this.crabHomes.includes(c.home)) { c.state = 'hidden'; c.timer = 1 + this.rnd() * 5; }
      this.causticCell = clamp(Math.min(w, h) / 7, 70, 150);
      const [mx, my] = R.imageToScreen(1000, 255); this.moonAt = [clamp(mx, w * .2, w * .8), clamp(my, h * .15, h * .5)]; this.phaseAt = 0;
      for (const b of this.butterflies) { if (b.x < 0) { b.x = this.rnd() * w; b.y = this.rnd() * h; } else { b.x *= w / this.prevW; b.y *= h / this.prevH; } b.target = null; b.state = 'fly'; }
      this.prevW = w; this.prevH = h;
    }
    setLook(weather, night, dt, amounts = {}) {
      const target = lookFor(weather, night, amounts.rainAmount, amounts.snowAmount);
      if (dt === undefined) { const dir = this.look.shadowDir; this.look = target; this.look.shadowDir = dir; }
      else lerpLook(this.look, target, 1 - Math.exp(-dt * 1.1));
      // Clear skies remove the previous weather's clouds immediately; lighting still eases toward sunlight.
      if (target.cloudCover === 0) { this.look.cloudCover = 0; this.look.cloudShade = 0; }
      // Clouds sail right and a little down the screen at a pace that reads as moving without hurrying.
      const span = Math.max(this.w, this.h);
      Object.assign(this.look, { sun: [-.45, .45, .77], moonDisc: this.moonDisc || [0, 0, 1, 0], causticCell: this.causticCell || 80, cloudWind: [.021 * span, -.007 * span] });
    }
    update(dt, settings) {
      this.time += dt;
      this.updatePlants(dt);
      if (this.time - this.phaseAt > 60 || !this.moonDisc) { this.phaseAt = this.time; this.phase = moonPhase(); }
      this.moonDisc = [this.moonAt[0], this.h - this.moonAt[1], 26 * this.scale, this.phase.angle];
      const rainK = clamp(settings.rainAmount ?? .5, 0, 1), snowK = clamp(settings.snowAmount ?? .5, 0, 1);
      // Snow settles on leaves, flowers and rocks while it falls and melts away after.
      this.snowCover = settings.weather === 'snow' ? Math.min(snowK * .9, (this.snowCover || 0) + dt * (.004 + .02 * snowK)) : Math.max(0, (this.snowCover || 0) - dt * .012);
      this.look.snowCover = this.snowCover;
      // Rain soaks leaves and rocks quickly, then dries out slowly once it stops.
      this.wetCover = settings.weather === 'rain' ? Math.min(1, (this.wetCover || 0) + dt * (.04 + .1 * rainK)) : Math.max(0, (this.wetCover || 0) - dt * .02);
      this.look.wetCover = this.wetCover;
      const { w, h, scale, rnd } = this, weather = settings.weather;
      if (settings.turtles) for (const t of this.turtles) t.update(dt, w, h, scale, this);
      // Crabs come out in any weather but snow.
      const crabsOut = settings.crabs !== false && weather !== 'snow';
      for (const c of this.crabs) c.update(dt, this.R, scale, this.crabHomes, crabsOut, this, this.crabs.filter(o => o !== c && o.state !== 'hidden').map(o => o.home));
      if (this.butterflyWeather(settings)) for (const b of this.activeButterflies) b.update(dt, w, h, scale, this.spots, this.time);
      if (this.dragonflyWeather(settings)) for (const d of this.activeDragonflies) d.update(dt, w, h, scale, this, this.buds.length ? this.buds : this.spots, this.time);
      // Fireflies belong to dry summer nights, never winter or falling snow.
      const wantFlies = this.fireflyWeather(settings) ? this.insects.fireflies : 0;
      while (this.flies.length < wantFlies) this.flies.push({ x: rnd() * w, y: rnd() * h, a: rnd() * TAU, p: rnd() * TAU, s: .7 + rnd() * .6 });
      if (this.flies.length > wantFlies) this.flies.length = wantFlies;
      for (const f of this.flies) { f.a += (rnd() - .5) * dt * 2; f.x += Math.cos(f.a) * 14 * dt; f.y += Math.sin(f.a) * 14 * dt; f.p += dt; if (f.x < 0 || f.x > w || f.y < 0 || f.y > h) f.a += Math.PI; }
      // Detached flowers and leaves follow a slow changing current; ripples can nudge them.
      for (const p of this.drifters) if (p.visible) { this.driftParticle(p, dt, p.s); this.rememberDrifter(p); }
      if (this.petals.length < 2 && rnd() < dt * .015) {
        const lotus = this.lotusDefs.map(([x, y]) => this.R.imageToScreen(x, y)).filter(([x, y]) => x > -40 && x < w + 40 && y > -40 && y < h + 40), p0 = lotus.length ? lotus[Math.floor(rnd() * lotus.length)] : [rnd() * w, rnd() * h];
        const s=.8+rnd()*.5,r=12*s*scale,safe=this.sim.habitat.project(p0[0]+(rnd()-.5)*60,p0[1]+(rnd()-.5)*60,r);
        if(safe)this.petals.push({ x: safe[0], y: safe[1], a: rnd()*TAU, spin: (rnd()-.5)*.12, vx: 0, vy: 0, life: 60+rnd()*60, age: 0, s, r, flow: rnd()*TAU, aim: rnd()*TAU, turnIn: 5+rnd()*9, speed: 2.8+rnd()*2.8, phase: rnd()*TAU });
      }
      for (const p of this.petals) { p.age += dt; this.driftParticle(p, dt, scale); }
      this.petals = this.petals.filter(p => p.age < p.life);
      // Rain streaks and drops; snowflakes melting into the pond.
      const rainN = weather === 'rain' ? Math.round((30 + 190 * rainK) * Math.min(1, w * h / 1.2e6) + 20) : 0;
      this.rainK = rainK; this.look.rainK = weather === 'rain' ? rainK : 0;
      // Streaks at different distances: far ones short, faint and slow, near ones long, bright and fast.
      while (this.rain.length < rainN) { const z = Math.pow(rnd(), 1.8); this.rain.push(this.resetRainDrop({ z, l: .5 + z * .9 + rnd() * .2, v: 600 + z * 700 + rnd() * 200 }, true)); }
      if (this.rain.length > rainN) this.rain.length = rainN;
      for (const d of this.rain) {
        d.y += d.v * dt; d.x = d.hitX - (d.hitY - d.y) * d.lean;
        if (d.y >= d.hitY) {
          if (d.water) this.rainImpact(d, rainK);
          this.resetRainDrop(d);
        }
      }
      if (weather === 'rain') {
        // The same rain drums on the leaves, flowers and rocks: a splash crown where it lands, and a knock that sets it trembling.
        let m = dt * (14 + 90 * rainK) * this.targetArea / 1e6;
        while (m > 0) { if (rnd() < m && this.targets.length) { const pick = rnd() * this.targetArea; this.hit(this.targets.find(t => t[0] >= pick)[1], rainK); } m -= 1; }
      }
      for (const fl of this.floaters) {
        if (!fl.jv && !fl.ja && !fl.vx && !fl.vy && !fl.ox && !fl.oy) continue;
        const e = Math.min(dt, .05);
        fl.jv += (-60 * fl.ja - 6 * fl.jv) * e; fl.ja += fl.jv * e;
        fl.vx += (-45 * fl.ox - 5 * fl.vx) * e; fl.vy += (-45 * fl.oy - 5 * fl.vy) * e; fl.ox += fl.vx * e; fl.oy += fl.vy * e;
        if (Math.abs(fl.ja) + Math.abs(fl.jv) + Math.abs(fl.ox) + Math.abs(fl.oy) + Math.abs(fl.vx) + Math.abs(fl.vy) < 1e-3) fl.ja = fl.jv = fl.ox = fl.oy = fl.vx = fl.vy = 0;
      }
      for (const p of this.splashes) { p.age += dt; if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-dt * 7); p.vy *= Math.exp(-dt * 7); } }
      this.splashes = this.splashes.filter(p => p.age < p.life);
      // Now and then in a heavy downpour the sky flickers white, and thunder rolls in a moment later.
      // Rain heavier than the default setting rolls thunder; the default (.5) already qualifies, so a plain
      // "下雨" is enough to see it.
      if (weather === 'rain' && rainK > .45 && !this.calm) {
        this.nextBolt -= dt;
        if (this.nextBolt <= 0) {
          const k = .6 + rnd() * .4, t0 = this.time;
          this.bolts.push([t0, k], [t0 + .09 + rnd() * .06, k * .45]);
          if (rnd() < .6) this.bolts.push([t0 + .28 + rnd() * .25, k * .75]);
          this.events.push({ type: 'thunder', delay: 1 + rnd() * 2.5, strength: k });
          this.nextBolt = 22 + rnd() * 48;
        }
      } else this.nextBolt = Math.max(this.nextBolt, 8 + rnd() * 12);
      let flash = 0;
      for (const [t0, k] of this.bolts) { const t = this.time - t0; if (t >= 0) flash += k * Math.min(1, t / .025) * Math.exp(-t * 14); }
      this.bolts = this.bolts.filter(([t0]) => this.time - t0 < 1.2);
      this.look.flash = flash * .3;
      // Snow in depth: many small far flakes, fewer large soft near ones, all carried by the wind;
      // each settles on the water, shrinks as it melts and leaves a faint ring.
      const snowN = weather === 'snow' ? Math.round((50 + 330 * snowK) * Math.min(1.5, w * h / 1e6) + 20) : 0, wind = (6 + 16 * snowK) * scale;
      const flake = f => Object.assign(f, { x: rnd() * (w + 80) - 80, y: rnd() * h * .95, z: Math.pow(rnd(), 1.6), life: 2 + rnd() * 10, age: 0, melt: 0, p: rnd() * TAU });
      while (this.snow.length < snowN) this.snow.push(flake({}));
      if (this.snow.length > snowN) this.snow.length = snowN;
      for (const f of this.snow) {
        if (f.melt > 0) { f.melt -= dt; if (f.melt <= 0) flake(f); continue; }
        f.life -= dt; f.age += dt;
        f.y += (8 + f.z * 34) * (.8 + snowK * .4) * scale * dt;
        f.x += (wind * (.4 + f.z) + Math.sin(this.time * .7 + f.p) * (6 + f.z * 10) * scale) * dt;
        if (f.x > w + 30) f.x -= w + 60;
        if (f.life <= 0) { f.melt = .6; if (rnd() < .5) this.drop(f.x, f.y, (2 + f.z * 2) * scale, .04 + f.z * .05); }
      }
      // Koi cruising just under the surface leave faint wakes.
      for (const f of this.sim.allFish) {
        if (f.v === undefined) continue;
        const L = BODY.length * f.size * this.sim.scale, bl = f.v / L;
        if (f.depth < .22 && bl > .45) {
          const t = (this.wakes.get(f) || 0) - dt;
          if (t <= 0) { const s = f.size * this.sim.scale; this.drop(f.x * w + Math.cos(f.angle) * BODY.nose * s, f.y * h + Math.sin(f.angle) * BODY.nose * s, 3.2 * scale, .04 * (1 - f.depth / .22) * Math.min(2, bl)); this.wakes.set(f, .14); }
          else this.wakes.set(f, t);
        }
      }
    }
    rememberDrifter(p) {
      const { x0, y0, ux, uy, vx, vy } = this.driftBasis, det = ux*vy-uy*vx;
      p.ix = ((p.x-x0)*vy-(p.y-y0)*vx)/det;
      p.iy = (ux*(p.y-y0)-uy*(p.x-x0))/det;
    }
    driftParticle(p, dt, unit) {
      if (!dt) return;
      p.turnIn -= dt;
      if (p.turnIn <= 0) { p.aim = p.flow + (this.rnd()-.5)*2.4; p.turnIn = 6+this.rnd()*12; }
      p.flow += wrap(p.aim-p.flow)*(1-Math.exp(-dt*.18));
      const habitat = this.sim.habitat, room = habitat.sample(p.x,p.y), gust = .8+this.look.wave*.3;
      const speed = p.speed*unit*gust, breeze = this.time*.035;
      let vx = (Math.cos(p.flow)+Math.sin(breeze)*.35)*speed, vy = (Math.sin(p.flow)+Math.cos(breeze*.73)*.22)*speed;
      const near = clamp(1-(room.distance-p.r)/(24*unit),0,1);
      vx += room.nx*speed*near*2; vy += room.ny*speed*near*2;
      const smooth = 1-Math.exp(-dt*.55);
      p.vx += (vx-p.vx)*smooth; p.vy += (vy-p.vy)*smooth;
      const v = Math.hypot(p.vx,p.vy), max = Math.max(16,36*unit);
      if (v > max) { p.vx *= max/v; p.vy *= max/v; }
      const steps = Math.max(1,Math.ceil(Math.hypot(p.vx,p.vy)*dt/2));
      for (let i=0;i<steps;i++) {
        const x=p.x+p.vx*dt/steps,y=p.y+p.vy*dt/steps;
        if (habitat.contains(x,y,p.r)) { p.x=x; p.y=y; }
        else {
          const edge=habitat.sample(x,y),out=p.vx*edge.nx+p.vy*edge.ny;
          if(out<0){p.vx-=edge.nx*out*1.4;p.vy-=edge.ny*out*1.4;}
          p.aim=Math.atan2(edge.ny,edge.nx)+(this.rnd()-.5)*.8;p.turnIn=4+this.rnd()*6;
          break;
        }
      }
      p.a = wrap(p.a+(p.spin+Math.sin(this.time*.17+p.phase)*.025)*dt);
    }
    updatePlants(dt) {
      this.plantRipples = this.plantRipples.filter(hit => {
        if (hit.at > this.time) return true;
        const { p, k, nx, ny } = hit;
        p.vx += nx * k * 16; p.vy += ny * k * 13;
        p.jv += (nx - ny * .5) * k * .32; p.bv += k * 19;
        return false;
      });
      const e = Math.min(dt, .05);
      for (const p of this.lotusPlants) {
        p.vx += (-18 * p.ox - 3.8 * p.vx) * e; p.vy += (-18 * p.oy - 3.8 * p.vy) * e;
        p.ox = clamp(p.ox + p.vx * e, -4, 4); p.oy = clamp(p.oy + p.vy * e, -4, 4);
        p.jv += (-24 * p.ja - 3.8 * p.jv) * e; p.ja = clamp(p.ja + p.jv * e, -.08, .08);
        p.bv += (-28 * p.bend - 4.5 * p.bv) * e; p.bend = clamp(p.bend + p.bv * e, -4, 4);
      }
    }
    plantPose(p) {
      const t = this.time, unit = this.scale, calm = this.calm ? .3 : 1;
      const wind = (.75 + this.look.wave * .8 + (this.look.rainK || 0) * .45) * calm;
      const gust = Math.sin(t * .88 - p.x * .002 + p.phase * .12) + .32 * Math.sin(t * 1.71 + p.phase);
      const bob = Math.sin(t * 1.3 + p.phase) + .28 * Math.sin(t * 2.1 + p.phase * .7);
      return {
        x: p.x + ((p.leaf ? 2.8 : .7) * gust * wind + p.ox) * unit,
        y: p.y + p.rootOffset + ((p.leaf ? 1.6 : .5) * bob * calm + p.oy) * unit,
        angle: p.angle + (p.leaf ? .043 : .07) * gust * wind + p.ja,
        sy: p.s * (1 + (p.leaf ? .018 : .008) * bob * calm),
        bend: ((p.leaf ? 1.7 : 3.8) * gust * wind + p.bend) * unit
      };
    }
    bodyLight(f) {
      if (!f.light || f.light.seed !== f.seed || f.light.palette !== f.palette || f.light.species !== f.species) {
        const girth = girthOf(f.seed), widths = new Float32Array(BODY.segments + 1), kind = fishPalette(f).kind;
        for (let i = 0; i <= BODY.segments; i++) widths[i] = halfWidth(BODY.nose - i * BODY.length / BODY.segments, girth, kind) / BODY.half;
        f.light = { species: f.species, seed: f.seed, palette: f.palette, widths, metal: kind === 'ogon' ? 1 : 0, gloss: kind === 'ogon' ? .28 : kind === 'karasu' ? .14 : .32 };
      }
      return f.light;
    }
    koi(f, cell) {
      const R = this.R, look = this.look, s = f.size * this.sim.scale, pose = fishPose(f, s, this.pose), cx = f.x * this.w, cy = f.y * this.h;
      const k = 1 - f.depth * .09, fogA = .05 + f.depth * .34, fog = [look.water[0], look.water[1], look.water[2], fogA];
      // The shadow lies on the bed: a fish near the bottom casts a dark, sharp one right beside it;
      // one cruising at the surface casts it further off, larger in blur and a little paler.
      const off = (6 + (1 - f.depth) * 30) * this.scale, dx = look.shadowDir[0] * off, dy = look.shadowDir[1] * off, sh = [0, 0, 0, .72 - (1 - f.depth) * .18], blur = [(1 - f.depth) * 1.1, 0, 0, 0];
      // Pectoral fins spread when gliding or braking, fold back at speed, the inner one flares in a turn.
      const L = BODY.length * s, bl = f.v / L, pal = fishPalette(f), slender = pal.kind === 'silvercarp', finDef = R.sprites[pal.kind === 'utsuri' ? 'finMoto' : 'fin'];
      const tint = pal.kind === 'utsuri' ? [1, 1, 1, .92] : f.species === 'silvercarp' ? [...rgb(pal.fin), .85] : this.finTint[f.palette];
      const base = 1.05 - .6 * clamp(bl / 1.4, 0, 1) + (f.thrust < .3 ? Math.sin(this.time * 4.2 + f.seed) * .16 : 0);
      const fins = [[4, .95, 1], [8, .55, .58]];
      for (const [i, spreadK, size] of fins) {
        const px = pose[i * 4], py = pose[i * 4 + 1], nx = pose[i * 4 + 2], ny = pose[i * 4 + 3], heading = Math.atan2(-nx, ny), hw = halfWidth(BODY.nose - i * BODY.length / BODY.segments, girthOf(f.seed), pal.kind) * s * .8;
        for (const side of [1, -1]) {
          const spread = (base + clamp(side * f.turn * .35, -.3, .5)) * spreadK, ang = heading + side * (Math.PI - spread);
          const X = cx + (px + nx * hw * side - cx) * k, Y = cy + (py + ny * hw * side - cy) * k, fs = s * k * .85 * size;
          R.sprite('under', finDef, X, Y, ang, fs * (slender ? .88 : 1), side * fs * (slender ? .5 : 1), tint, fog);
          if (size === 1) R.sprite('shadow', finDef, X + dx, Y + dy, ang, fs * (slender ? .88 : 1), side * fs * (slender ? .5 : 1), [0, 0, 0, sh[3] * .6], blur);
        }
      }
      R.fish('shadow', cell, pose, s, cx, cy, k, sh, blur, dx, dy);
      R.fish('under', cell, pose, s, cx, cy, k, undefined, fog, 0, 0, this.bodyLight(f));
    }
    draw(settings) {
      const R = this.R, look = this.look, { w, h, scale } = this, sim = this.sim;
      // Underwater, deepest first.
      const items = sim.allFish.map((f, i) => ({ d: f.depth ?? .5, f, i }));
      if (settings.turtles) for (const t of this.turtles) items.push({ d: t.depth + .02, t });
      items.sort((a, b) => b.d - a.d);
      for (const it of items) { if (it.t) it.t.draw(R, w, h, scale, look); else if (it.f.spriteReady && it.f.spine) this.koi(it.f, it.i); }
      // Leaves bob, pennywort and buds sway on their stalks, flowers nod; wind and rain stir them a little more.
      const t = this.time, gust = .8 + look.wave * .45;
      for (const fl of this.floaters) {
        const { f, p, sp } = fl;
        const [x, y, rx, kind, ry = rx, rot = 0] = f;
        const gr = grow(f);
        if (kind === 'r') { R.floater(x, y, rx, ry, rot, 0, 0, 0, 0, 1, 0, 0, fl.seed); continue; }
        const big = kind === 'l' && rx > 30, petal = kind === 'f' && rx <= 25, turn = big ? .032 : kind === 'b' ? .13 : kind === 'f' && !petal ? .085 : .075, move = (big ? 1.6 : kind === 'b' ? 3.2 : 2.4) * scale * gust;
        const angle = (turn * Math.sin(t * .33 * sp + p[0]) + turn * .4 * Math.sin(t * .91 * sp + p[1])) * gust;
        fl.dx = move * Math.sin(t * .29 * sp + p[2]) + fl.ox * scale; fl.dy = move * Math.cos(t * .23 * sp + p[3]) + fl.oy * scale;
        R.floater(x, y, rx * gr, ry * gr, rot, angle + fl.ja, fl.dx, fl.dy, (big ? 1.8 : petal ? 3.5 : 2.6) * scale, big ? 1 : kind === 'l' ? .6 : .32, kind === 'l' ? 1 : .45, big ? 1 : 0, fl.seed);
      }
      // Paint the original detached flowers and leaves at their drifting positions, with pond lighting.
      for (const p of this.drifters) if (p.visible && R.sprites[p.sprite]) {
        const def=R.sprites[p.sprite],a=p.a+this.driftBasis.angle,off=2*this.scale;
        R.sprite('plantShadow',def,p.x+look.shadowDir[0]*off,p.y+look.shadowDir[1]*off,a,p.s,p.s,[0,0,0,.24]);
        R.sprite('plants',def,p.x,p.y,a,p.s,p.s);
      }
      // Seasonal lotus leaves float over fish; flowers and seed heads sway above them.
      for(const p of this.lotusPlants){
        const def=R.sprites[p.sprite],{x,y,angle,sy,bend}=this.plantPose(p),off=(p.leaf?2:6)*scale;
        R.plant('plantShadow',def,x+look.shadowDir[0]*off,y+look.shadowDir[1]*off,angle,p.s,sy,bend,p.leaf,scale,[0,0,0,p.leaf?.36:.22],[p.leaf?.35:.7,0,0,0]);
        R.plant('plants',def,x,y,angle,p.s,sy,bend,p.leaf,scale);
      }
      // Floating: petals and food.
      for (const p of this.petals) {
        const fade = Math.min(1, p.age / 3, (p.life - p.age) / 4), s = scale * p.s;
        R.sprite('shadow', R.sprites.petal, p.x + look.shadowDir[0] * 14 * scale, p.y + look.shadowDir[1] * 14 * scale, p.a, s, s, [0, 0, 0, .35 * fade]);
        R.sprite('surface', R.sprites.petal, p.x, p.y, p.a, s, s, [look.bright * look.tint[0], look.bright * look.tint[1], look.bright * look.tint[2], fade]);
      }
      const lit = [look.bright * look.tint[0], look.bright * look.tint[1], look.bright * look.tint[2]];
      for (const p of sim.food) {
        const fade = Math.min(1, p.life / 2), pop = 1 + Math.max(0, .25 - p.age) * 1.6, s = scale * .72 * pop * (1 + Math.sin(this.time * 2 + p.drift) * .04);
        R.sprite('shadow', R.sprites.dot, p.x + look.shadowDir[0] * 9 * scale, p.y + look.shadowDir[1] * 9 * scale, 0, s * .45, s * .45, [0, 0, 0, .5 * fade]);
        R.sprite('surface', R.sprites.pellet, p.x, p.y, p.drift, s, s, [...lit, fade]);
      }
      for (const c of this.crabs) c.draw(R, scale, look);
      // Air: butterflies or fireflies, rain, snow.
      if (this.butterflyWeather(settings)) for (const b of this.activeButterflies) b.draw(R, scale, look);
      if (this.dragonflyWeather(settings)) for (const d of this.activeDragonflies) d.draw(R, scale, look);
      if (this.fireflyWeather(settings)) for (const f of this.flies) { const glow = Math.pow(Math.max(0, Math.sin(f.p * 1.3 * f.s)), 3); R.sprite('glow', R.sprites.dot, f.x, f.y, 0, .9 * f.s, .9 * f.s, [.75 * glow, 1 * glow, .45 * glow, 1]); R.sprite('glow', R.sprites.dot, f.x, f.y, 0, .25, .25, [.9 * glow, 1 * glow, .7 * glow, 1]); }
      const rk = this.rainK || 0;
      for (const d of this.rain) { const a = (.07 + .2 * d.z) * (.75 + .5 * rk); R.sprite('air', R.sprites.streak, d.x, d.y, -Math.atan(d.lean), .7 + .7 * d.z, d.l * (.4 + .25 * rk) * scale, [.9 * a, .95 * a, a, a]); }
      // Splash crowns: a quick ring where each drop lands, and a few droplets flung out from it.
      for (const p of this.splashes) {
        const t = p.age / p.life;
        if (p.rain) {
          const r = p.s * (.2 + .8 * Math.sqrt(t)), a = Math.pow(1 - t, 1.3) * .6;
          R.sprite('surface', R.sprites.ring, p.x, p.y + .8 * scale, 0, r, r * .86, [.08, .16, .18, a * .3]);
          R.sprite('surface', R.sprites.ring, p.x, p.y, 0, r, r * .86, [.76, .88, .93, a]);
        }
        else if (p.ring) { const r = p.s * (.25 + .75 * Math.sqrt(t)), a = Math.pow(1 - t, 1.6) * (p.leaf ? .75 : .45); R.sprite('surface', R.sprites.ring, p.x, p.y, 0, r, r * .9, [lit[0] * a, lit[1] * a, lit[2] * a, a]); }
        else { const a = (1 - t) * .8, r = p.s * .16 * (1 - t * .4); R.sprite('air', R.sprites.dot, p.x, p.y, 0, r, r, [a, a, a, a]); }
      }
      for (const f of this.snow) {
        const m = f.melt > 0 ? f.melt / .6 : 1, s = (.28 + f.z * 1.25) * scale * (f.melt > 0 ? .4 + .6 * m : 1), a = Math.min(1, f.age * 2) * m * (.55 + .4 * f.z), near = f.z > .82;
        if (f.z > .4) R.sprite('airShadow', R.sprites.flake, f.x + (4 + 18 * f.z) * scale, f.y + (4 + 18 * f.z) * scale, 0, s, s, [0, 0, 0, .16 * a]);
        R.sprite('air', near ? R.sprites.dot : R.sprites.flake, f.x, f.y, 0, near ? s * 1.5 : s, near ? s * 1.5 : s, [1, 1, 1, near ? a * .7 : a]);
      }
    }
  }

  // 2D koi for the dialog preview and thumbnails: posed strip plus tinted fins.
  const tintedFins = new Map();
  function tintedFin(def, color, solid = false) {
    const key = def.canvas.width + color + solid;
    if (!tintedFins.has(key)) { const c = document.createElement('canvas'); c.width = def.canvas.width; c.height = def.canvas.height; const x = c.getContext('2d'); x.drawImage(def.canvas, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = solid ? 1 : .75; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); tintedFins.set(key, c); }
    return tintedFins.get(key);
  }
  function drawKoi2D(ctx, f, sprite, sprites, x, y, angle, s, amp = .4) {
    const n = BODY.segments, seg = BODY.length / n, spine = new Float32Array((n + 1) * 2), c = Math.cos(angle), si = Math.sin(angle);
    for (let i = 0; i <= n; i++) { spine[i * 2] = x + c * (BODY.nose - i * seg) * s; spine[i * 2 + 1] = y + si * (BODY.nose - i * seg) * s; }
    const pose = fishPose({ spine, amp, phase: f.phase || 0, species: f.species }, s), pal = fishPalette(f);
    const finDef = sprites[pal.kind === 'utsuri' ? 'finMoto' : 'fin'], fin = pal.kind === 'utsuri' ? finDef.canvas : tintedFin(finDef, pal.fin, pal.kind === 'benigoi' || pal.kind === 'silvercarp');
    for (const [i, spread, size] of [[8, .6, .58], [4, 1, 1]]) {
      const px = pose[i * 4], py = pose[i * 4 + 1], nx = pose[i * 4 + 2], ny = pose[i * 4 + 3], heading = Math.atan2(-nx, ny), hw = halfWidth(BODY.nose - i * seg, girthOf(f.seed), pal.kind) * s * .8;
      for (const side of [1, -1]) {
        ctx.save(); ctx.translate(px + nx * hw * side, py + ny * hw * side); ctx.rotate(heading + side * (Math.PI - spread)); ctx.scale(s * .85 * size / finDef.ppu * (pal.kind === 'silvercarp' ? .88 : 1), side * s * .85 * size / finDef.ppu * (pal.kind === 'silvercarp' ? .5 : 1));
        ctx.globalAlpha = .9; ctx.drawImage(fin, -finDef.px * fin.width, -finDef.py * fin.height); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    root.PondGL.drawStrip2D(ctx, sprite, pose, s, x, y, 1, true);
  }
  root.PondScene = { PondScene, drawKoi2D, lookFor, floatMask, moonPhase };
})(window);
