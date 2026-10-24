(function (root) {
  'use strict';
  const PALETTES = [
    { name: '红白', base: '#f5f0e2', spot: '#cc4a2c', fin: '#f3f0e6', kind: 'kohaku' },
    { name: '大正三色', base: '#f3eee1', spot: '#c8482c', second: '#1d2526', fin: '#f0ede3', kind: 'sanke' },
    { name: '黄金', base: '#d9a23a', spot: '#d49a2e', fin: '#e2b458', kind: 'ogon' },
    { name: '白写', base: '#efeee5', spot: '#1e2727', fin: '#ecebe3', kind: 'utsuri' },
    { name: '丹顶', base: '#f6f3ea', spot: '#cf3f2b', fin: '#f2f1e9', kind: 'tancho' },
    { name: '墨鲤', base: '#2a3130', spot: '#161c1d', fin: '#444c49', kind: 'karasu' },
    { name: '纯红', base: '#cb3025', spot: '#cb3025', fin: '#c9382c', kind: 'benigoi' }
  ];
  const SILVER_CARP = { name: '青鲢', base: '#184140', spot: '#184140', fin: '#a9c4bd', kind: 'silvercarp' };
  const fishPalette = f => f.species === 'silvercarp' ? SILVER_CARP : PALETTES[f.palette] || PALETTES[0];
  // Fish body in local units: nose at +34, tail tip at -58; sprites span x -60..36, y -14..14.
  const BODY = { nose: 34, tail: -58, length: 92, segments: 16, rigid: 5, left: -60, width: 96, half: 14 };
  const TAU = Math.PI * 2;
  function randomSeed(seed) { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; }; }
  function weatherFromCode(code) { if ([71,73,75,77,85,86].includes(code)) return 'snow'; if (code >= 51) return 'rain'; if (code >= 2) return 'cloudy'; return 'sunny'; }
  const seasonFromMonth = (month, southernHemisphere = false) => {
    // JS months are 0-based; southern-hemisphere seasons are shifted by half a year.
    const local = southernHemisphere ? (month + 6) % 12 : month;
    if (local >= 2 && local <= 4) return 'spring';
    if (local >= 5 && local <= 7) return 'summer';
    if (local >= 8 && local <= 10) return 'autumn';
    return 'winter';
  };
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  // Shoreline traced on the supplied 16:9 painting. Coordinates are normalized so the
  // same map follows both the centred cover crop and the renderer's portrait rotation.
  const mapPoint = ([x,y]) => [x/2048,y/1152];
  const POND_MAP = {
    width:2560,height:1440,
    water:[
      [0,567],[63,560],[148,513],[208,466],[241,407],[243,330],[226,289],[224,275],
      [283,321],[329,337],[405,348],[459,331],[509,294],[535,231],[569,205],
      [620,177],[686,181],[741,160],[794,166],[848,189],[898,192],[944,216],
      [988,221],[1022,244],[1021,290],[1046,323],[1094,341],[1159,350],
      [1234,337],[1282,294],[1311,240],[1334,198],[1365,150],[1375,80],[1350,0],
      [2048,0],[2048,655],[1975,661],[1900,662],[1820,695],[1770,721],
      [1705,730],[1644,724],[1590,733],[1555,767],[1523,810],[1452,842],
      [1375,865],[1309,900],[1280,967],[1300,1045],[1260,1088],[1200,1075],
      [1170,1070],[1135,1051],[1095,1053],[1070,1072],[1048,1110],[1040,1152],
      [490,1152],[481,1120],[470,1090],[453,1050],[427,1033],[411,1065],
      [370,1055],[322,1019],[314,982],[279,968],[273,938],[227,921],
      [203,895],[152,887],[115,861],[82,832],[67,804],[33,770],[0,749]
    ].map(mapPoint),
    // The small moss-covered stone near the bottom is above water; pebbles seen
    // through the water elsewhere are part of the pond bed and remain swimmable.
    rocks:[[[954,1037],[968,1007],[1000,998],[1035,1006],[1061,1030],
      [1066,1056],[1047,1078],[1009,1086],[974,1070]] .map(mapPoint)]
  };
  // Each seasonal painting has its own shoreline and emergent stones.
  const seasonalMap = (water, rocks) => ({width:2560,height:1440,water:water.map(mapPoint),rocks:rocks.map(p=>p.map(mapPoint))});
  const POND_MAPS = {
    spring:POND_MAP,
    summer:seasonalMap([
      [0,595],[64,574],[150,566],[207,533],[232,477],[234,419],[214,373],[216,336],
      [260,356],[347,371],[417,362],[467,336],[500,287],[509,241],[532,226],
      [583,213],[635,233],[685,224],[723,181],[770,180],[807,168],[850,174],
      [881,197],[934,213],[978,218],[1014,252],[1011,278],[1026,316],[1080,342],
      [1157,350],[1223,340],[1270,310],[1297,246],[1327,195],[1359,163],[1384,103],[1370,0],
      [2048,0],[2048,620],[1991,612],[1943,642],[1890,687],[1830,748],[1790,812],
      [1728,829],[1656,825],[1594,814],[1519,850],[1475,842],[1420,864],[1370,901],
      [1325,919],[1280,960],[1255,1005],[1250,1050],[1280,1110],[1210,1125],[1174,1152],
      [1160,1123],[1110,1104],[1060,1081],[1002,1075],[962,1094],[945,1152],
      [488,1152],[479,1110],[449,1090],[443,1060],[411,1050],[390,1020],
      [360,1004],[351,978],[330,945],[279,929],[238,899],[210,893],[183,867],
      [148,846],[100,821],[71,790],[38,765],[0,743]
    ],[[[1535,695],[1559,651],[1610,626],[1682,624],[1741,644],[1785,692],
      [1792,743],[1764,781],[1708,806],[1640,800],[1583,775],[1547,740]]]),
    autumn:seasonalMap([
      [0,530],[90,519],[178,486],[243,440],[265,390],[269,331],[240,287],
      [274,303],[340,315],[421,316],[470,291],[513,246],[540,197],[601,169],
      [665,166],[715,150],[757,154],[813,162],[844,182],[909,224],[948,223],
      [980,238],[1019,242],[1042,265],[1060,307],[1105,326],[1188,338],
      [1245,319],[1287,284],[1310,235],[1335,183],[1368,147],[1385,90],[1371,0],
      [2048,0],[2048,640],[1980,640],[1935,662],[1885,685],[1845,728],
      [1815,756],[1782,768],[1740,823],[1690,830],[1655,833],[1610,851],
      [1590,886],[1536,921],[1472,940],[1415,979],[1368,1010],[1340,1062],
      [1320,1110],[1300,1152],[1230,1152],[1203,1120],[1150,1100],[1095,1091],
      [1040,1106],[1010,1152],[493,1152],[478,1110],[453,1075],[421,1054],
      [398,1034],[370,1020],[350,985],[316,962],[280,945],[251,913],[200,906],
      [162,882],[113,858],[80,817],[41,784],[0,765]
    ],[[[1419,747],[1431,714],[1480,679],[1545,667],[1608,681],[1662,716],
      [1687,756],[1681,792],[1651,823],[1593,842],[1520,831],[1468,804],[1430,779]]]),
    winter:seasonalMap([
      [0,521],[68,510],[140,481],[210,439],[241,385],[245,325],[221,279],
      [268,305],[337,320],[415,326],[470,305],[507,265],[535,211],[574,185],
      [626,168],[680,172],[727,153],[786,160],[830,173],[885,202],[941,221],
      [980,221],[1020,244],[1026,284],[1050,316],[1104,339],[1176,346],
      [1238,329],[1284,292],[1310,237],[1331,195],[1362,148],[1375,84],[1355,0],
      [2048,0],[2048,588],[1990,595],[1944,622],[1908,647],[1890,689],
      [1845,723],[1815,765],[1771,801],[1740,848],[1675,868],[1604,881],
      [1510,867],[1448,896],[1380,919],[1322,946],[1272,984],[1260,1044],
      [1275,1090],[1230,1130],[1250,1152],[1220,1126],[1180,1096],[1134,1082],[1080,1078],
      [1022,1094],[994,1133],[982,1152],[488,1152],[478,1111],[450,1075],
      [420,1037],[376,1012],[355,972],[318,954],[291,926],[258,912],[230,877],
      [187,868],[159,847],[127,819],[88,788],[48,769],[0,758]
    ],[[[1424,656],[1472,616],[1552,596],[1632,624],[1680,680],
      [1664,744],[1592,780],[1496,776],[1428,736]],
      [[1632,740],[1688,720],[1752,744],[1780,800],[1760,856],
       [1688,880],[1632,852],[1608,796]]])
  };
  const SEASONS = {
    spring:{name:'春',title:'春暖花开',image:'assets/pond.jpg',thumbnail:'assets/pond-spring-thumb.jpg',weather:'sunny'},
    summer:{name:'夏',title:'绿荫盛夏',image:'assets/pond-summer.jpg',thumbnail:'assets/pond-summer-thumb.jpg',weather:'sunny'},
    autumn:{name:'秋',title:'枫染清池',image:'assets/pond-autumn.jpg',thumbnail:'assets/pond-autumn-thumb.jpg',weather:'sunny'},
    winter:{name:'冬',title:'白雪映池',image:'assets/pond-winter.jpg',thumbnail:'assets/pond-winter-thumb.jpg',weather:'snow'}
  };
  function polygonSample(points,x,y) {
    let inside=false,best=Infinity,qx=0,qy=0,ex=0,ey=0;
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const [ax,ay]=points[j],[bx,by]=points[i],dx=bx-ax,dy=by-ay;
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
      const t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1);
      const px=ax+t*dx,py=ay+t*dy,d=(x-px)**2+(y-py)**2;
      if(d<best){best=d;qx=px;qy=py;ex=dx;ey=dy;}
    }
    const d=Math.sqrt(best),sign=inside?1:-1;
    if(d>1e-7)return {distance:d*sign,nx:(x-qx)/d*sign,ny:(y-qy)/d*sign};
    // At the boundary itself, derive the inward normal using a nearby point.
    const len=Math.hypot(ex,ey)||1,nx=-ey/len,ny=ex/len;
    let side=false;
    const px=x+nx*.1,py=y+ny*.1;
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const [ax,ay]=points[j],[bx,by]=points[i];
      if((ay>py)!==(by>py)&&px<(bx-ax)*(py-ay)/(by-ay)+ax)side=!side;
    }
    return {distance:0,nx:nx*(side?1:-1),ny:ny*(side?1:-1)};
  }
  class PondHabitat {
    constructor(width,height,imageToScreen,map=POND_MAP) {
      this.width=width;this.height=height;
      const transform=points=>points.map(([u,v])=>imageToScreen(u*map.width,v*map.height));
      this.water=transform(map.water);this.rocks=map.rocks.map(transform);
    }
    sample(x,y) {
      let best=polygonSample(this.water,x,y);
      for(const rock of this.rocks){const p=polygonSample(rock,x,y);p.distance=-p.distance;p.nx=-p.nx;p.ny=-p.ny;if(p.distance<best.distance)best=p;}
      for(const p of [{distance:x,nx:1,ny:0},{distance:this.width-x,nx:-1,ny:0},
        {distance:y,nx:0,ny:1},{distance:this.height-y,nx:0,ny:-1}])if(p.distance<best.distance)best=p;
      return best;
    }
    contains(x,y,margin=0) { return Number.isFinite(x)&&Number.isFinite(y)&&this.sample(x,y).distance>=margin-1e-6; }
    feedingTarget(x,y,margin) {
      const target=this.project(x,y,margin);
      if(!target)return null;
      const d=Math.hypot(target[0]-x,target[1]-y),steps=Math.max(1,Math.ceil(d/4));
      let clear=true;
      for(let i=1;i<=steps;i++)if(!this.contains(x+(target[0]-x)*i/steps,y+(target[1]-y)*i/steps,4)){clear=false;break;}
      if(clear)return target;
      // In a narrow channel the nearest open water can lie across a stone.
      // Find a straight route through water so pellets can actually drift there.
      let best=null,waypoint=null,room=this.sample(x,y).distance+1,reach=Math.hypot(this.width,this.height);
      for(let i=0;i<64;i++){
        const a=i*TAU/64,dx=Math.cos(a),dy=Math.sin(a);
        for(let r=4;r<reach;r+=4){
          const px=x+dx*r,py=y+dy*r,p=this.sample(px,py);
          if(p.distance<4)break;
          if(p.distance>room){room=p.distance;waypoint=[px,py];}
          if(p.distance>=margin){best=[px,py];reach=r;break;}
        }
      }
      return best||waypoint;
    }
    project(x,y,margin=0) {
      const ox=x,oy=y;
      for(let i=0;i<40;i++){
        const p=this.sample(x,y);if(p.distance>=margin)return [x,y];
        const push=margin-p.distance+.5;x+=p.nx*push;y+=p.ny*push;
      }
      // Concave corners can have competing normals. Choose the nearest safe
      // point in the visible water instead of ever falling back onto dry land.
      let best=null,dist=Infinity;
      const step=Math.max(12,Math.min(this.width,this.height)/24);
      for(let py=margin;py<this.height-margin;py+=step)for(let px=margin;px<this.width-margin;px+=step){
        const d=(px-ox)**2+(py-oy)**2;
        if(d<dist&&this.contains(px,py,margin)){best=[px,py];dist=d;}
      }
      return best;
    }
  }
  // Each koi has a temperament, saved with it: how far it senses food, how quickly it reacts, how hard it
  // bolts when startled, and how much company it keeps. It is what makes one fish always get there first and
  // another hang back in the reeds.
  const TEMPERS = ['greedy', 'timid', 'loner', 'tame'];
  const TEMPER_TRAITS = {
    greedy: { appetite: .95, react: .18, scatter: .85, company: 0 },
    timid: { appetite: .66, react: .95, scatter: 1.45, company: .5 },
    loner: { appetite: .78, react: .55, scatter: 1.1, company: -.7 },
    tame: { appetite: .84, react: .32, scatter: .7, company: .8 }
  };
  // How old a koi is, and which stage of life that puts her in. Fish saved before `born` existed have no age.
  function koiAge(f) {
    if (!f || !Number.isFinite(f.born)) return null;
    const days = Math.max(0, (Date.now() - f.born) / 864e5);
    return { days: Math.ceil(days), stage: days < 7 ? 'young' : days < 90 ? 'adult' : 'old' };
  }
  function createFish(index, random = Math.random) {
    const names = ['锦时','小满','丹朱','听雨','白露','金盏','青禾','望舒','知秋','浮玉','映月','点绛','云游','春水','琥珀','松墨','桃夭','长安','涟漪','拾光','朝露','小暑','如意','团团'];
    const size = .62 + random() * .4;
    // baseSize is the fish as it was made; the body grows from there with everything it eats.
    return { id: `koi-${Date.now()}-${index}`, name: names[index % names.length], palette: index % PALETTES.length, temper: TEMPERS[index % TEMPERS.length], size, baseSize: size, born: Date.now(), seed: Math.floor(random()*100000), eaten: 0, x: .17 + random()*.66, y: .18+random()*.62, angle: random()*TAU, phase: random()*10, speed: .85+random()*.3, target: null };
  }
  // Resident shoal is separate from the saved koi collection and its 60-fish limit.
  function createSilverCarpShoal(random = Math.random) {
    return Array.from({ length: 4 }, (_, i) => ({
      ...createFish(i, random), id: `silvercarp-${i}`, species: 'silvercarp', name: `青鲢${i + 1}`,
      size: .88 + random() * .24, x: .36 + i * .075, y: .43 + random() * .12, angle: -.25, speed: 1.12
    }));
  }
  // Runtime-only swimming state; never persisted.
  function wake(f, random) {
    if (f.v !== undefined) return;
    f.v = 0; f.turn = 0; f.thrust = 0; f.amp = .25; f.beating = false; f.idle = 0;
    f.depth = f.species === 'silvercarp' ? .23 + random() * .2 : .25 + random() * .55; f.depthGoal = f.depth;
    f.goal = null; f.goalTime = 0; f.rest = 0; f.flee = 0; f.fleeAngle = 0;
    f.cruise = (.3 + random() * .22) * clamp(Number(f.speed) || 1, .5, 1.5);
    // Old koi keep to a gentler pace.
    const age = koiAge(f);
    if (age && age.stage === 'old') f.cruise *= .92;
    // The temperament tilts the usual range rather than replacing it: the pond keeps the same mix of slow and
    // eager fish it always had, and a koi just leans one way or the other.
    const traits = TEMPER_TRAITS[f.temper] || TEMPER_TRAITS.tame;
    f.react = clamp(.15 + random() * .9 + (traits.react - .5) * .35, .08, 1.25);
    f.appetite = clamp(.55 + random() * .45 + (traits.appetite - .8) * .3, .45, 1.05);
    f.scatter = traits.scatter; f.company = traits.company;
    f.spine = null; f.spineSeg = 0;
  }
  // Head-led chain: the front of the body is rigid, the rest follows the path the head swam.
  function updateSpine(f, s, w, h) {
    const rigid = f.species === 'silvercarp' ? 4 : BODY.rigid;
    const n = BODY.segments, seg = BODY.length / n * s, x = f.x * w, y = f.y * h, c = Math.cos(f.angle), si = Math.sin(f.angle);
    const nx = x + c * BODY.nose * s, ny = y + si * BODY.nose * s;
    let p = f.spine;
    if (!p || Math.abs(f.spineSeg - seg) > seg * .3 || Math.hypot(p[0] - nx, p[1] - ny) > seg * 3) {
      p = f.spine = new Float32Array((n + 1) * 2);
      for (let i = 0; i <= n; i++) { p[i*2] = nx - c * seg * i; p[i*2+1] = ny - si * seg * i; }
    }
    f.spineSeg = seg;
    for (let i = 0; i <= rigid; i++) { p[i*2] = nx - c * seg * i; p[i*2+1] = ny - si * seg * i; }
    let prev = f.angle;
    for (let i = rigid + 1; i <= n; i++) {
      const px = p[(i-1)*2], py = p[(i-1)*2+1], lim = f.species === 'silvercarp' ? .13 + .22 * i / n : .1 + .16 * i / n;
      const a = prev + clamp(wrap(Math.atan2(py - p[i*2+1], px - p[i*2]) - prev), -lim, lim);
      p[i*2] = px - Math.cos(a) * seg; p[i*2+1] = py - Math.sin(a) * seg; prev = a;
    }
  }
  // Spine points with the travelling tail-beat wave; out holds x, y, normalX, normalY per point.
  function fishPose(f, s, out = new Float32Array((BODY.segments + 1) * 4)) {
    const silver = f.species === 'silvercarp';
    const n = BODY.segments, p = f.spine, amp = (f.amp || 0) * (silver ? 4.8 : 6.4) * s;
    // The spine already follows the path the head swam (see updateSpine), so a turn bends the body on its
    // own; only the travelling tail-beat is added here.
    for (let i = 0; i <= n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n, i + 1);
      let tx = p[a*2] - p[b*2], ty = p[a*2+1] - p[b*2+1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const u = i / n, env = .05 + .95 * Math.pow(Math.max(0, (u - .2) / .8), 1.5), lat = amp * env * Math.sin(f.phase - u * (silver ? 6.4 : 5.4));
      out[i*4] = p[i*2] - ty * lat; out[i*4+1] = p[i*2+1] + tx * lat;
    }
    for (let i = 0; i <= n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n, i + 1);
      let tx = out[a*4] - out[b*4], ty = out[a*4+1] - out[b*4+1]; const l = Math.hypot(tx, ty) || 1;
      out[i*4+2] = -ty / l; out[i*4+3] = tx / l;
    }
    return out;
  }
  class PondSimulation {
    constructor(fish,width,height,random=Math.random,residents=[],residentsOn=true) { this.fish=fish; this.residents=residents; this.residentsOn=residentsOn; this.width=width; this.height=height; this.random=random; this.food=[]; this.totalEaten=0; this.scale=1; this.time=0; this.obstacles=[]; this.events=[]; this.habitat=null;
      // Who swims beside whom: a running tally of nearby pairs, used by the collection's profiles.
      this.bonds=new Map(); this.tick=0; }
    get allFish() { return this.residentsOn?this.fish.concat(this.residents):this.fish; }
    isWater(x,y,margin=0) { return this.habitat?this.habitat.contains(x,y,margin):x>=margin&&x<=this.width-margin&&y>=margin&&y<=this.height-margin; }
    fishMargin(f) { return (Math.abs(BODY.tail)+BODY.half+7)*f.size*this.scale+5; }
    feedingMargin() {
      // Leave room for at least one koi to line up its mouth and turn around a
      // pellet. Residents do not eat, so their size must not set this margin.
      let margin=Infinity;
      for(const f of this.fish){const s=f.size*this.scale; margin=Math.min(margin,this.fishMargin(f)+BODY.nose*s*.4+8);}
      return Number.isFinite(margin)?Math.max(4,margin):4;
    }
    confineFish(f) {
      if(!this.habitat)return;
      const L=BODY.length*f.size*this.scale;
      // A pellet right by the shore is worth leaning over the water line for; without that, a koi could
      // never quite reach food dropped near the bank — she pressed in, got pushed back, pressed in again,
      // and looked stuck. Away from food she keeps her usual clearance.
      const margin=this.fishMargin(f);
      if(this.isWater(f.x*this.width,f.y*this.height,margin))return;
      const p=this.habitat.project(f.x*this.width,f.y*this.height,margin);
      if(p){
        f.x=p[0]/this.width;f.y=p[1]/this.height;f.spine=null;f.goal=null;
        // A small way on rather than a dead stop: with the speed at zero the tailbeat rate collapsed to the
        // idle floor, and a koi pinned against the bank looked frozen instead of easing along it.
        f.v=Math.min(f.v,L*.2);
        const busy=this.food.some(q=>!q.eaten&&Math.hypot(q.x-f.x*this.width,q.y-f.y*this.height)<L*1.6);
        if(busy){
          // Give up on a pellet the water line forbids, instead of pressing at it forever.
          f.foodCooldown=.6;
        }else{
          // Nothing to eat here, so it is just a rock or a bank in the way: turn her back into open water,
          // otherwise she keeps nosing the same edge frame after frame — the spot that looked stuck.
          const s=this.habitat.sample(f.x*this.width,f.y*this.height);
          if(s&&Number.isFinite(s.nx)){
            f.goal={x:(f.x*this.width+s.nx*L*3)/this.width,y:(f.y*this.height+s.ny*L*3)/this.height};
            f.goalTime=2+this.random()*2;
          }
        }
      }
    }
    // Everything a koi eats goes into its body: it grows slowly toward a larger self and stops at the
    // biggest size the panel's slider allows.
    growFish(f, dt) {
      if (f.species === 'silvercarp') return;
      if (f.baseSize === undefined) f.baseSize = f.size;
      const gain = Math.min(.42, Math.log1p(Math.max(0, f.eaten)) * .055);
      const want = Math.min(1.5, f.baseSize * (1 + gain));
      if (want > f.size + .0005) f.size += (want - f.size) * Math.min(1, dt * .45);
    }
    // Thunder is on its way: the whole shoal sinks into deeper water and stays low.
    dive() {
      for (const f of this.allFish) {
        wake(f, this.random);
        f.depthGoal = .86 + this.random() * .12;
        f.v = Math.max(f.v, BODY.length * f.size * this.scale * .3);
        f.rest = 0;
      }
    }
    // Lotus leaves the shoal can shelter under while it rains (screen coordinates, from the scene).
    setShelters(points) { this.shelters = points && points.length ? points : null; }
    setHabitat(habitat) {
      this.habitat=habitat;
      for(const f of this.allFish){wake(f,this.random);this.confineFish(f);f.goal=null;f.spine=null;}
      this.food=this.food.filter(p=>this.isWater(p.x,p.y,4));
      for(const p of this.food)p.feedGoal=null;
    }
    feed(x,y,count=9) {
      if(this.food.length >= 180||!this.isWater(x,y,4)) return false;
      const before=this.food.length;
      for(let i=0;i<count && this.food.length<180;i++){
        const a=this.random()*TAU,r=Math.sqrt(this.random())*24;
        let px=clamp(x+Math.cos(a)*r,4,this.width-4),py=clamp(y+Math.sin(a)*r,4,this.height-4);
        if(!this.isWater(px,py,4)){px=x;py=y;}
        this.food.push({x:px,y:py,life:25,age:0,drift:this.random()*6,vx:Math.cos(a)*r*.8,vy:Math.sin(a)*r*.8,eaten:false});
      }
      return this.food.length>before;
    }
    // A tap without food startles nearby fish into a short dash away from it.
    scare(x,y,radius=170,strength=1) {
      for(const f of this.allFish){
        wake(f,this.random);
        const dx=f.x*this.width-x,dy=f.y*this.height-y,d=Math.hypot(dx,dy);
        if(d>=radius)continue;
        // A timid fish bolts further and for longer; a tame one barely bothers. A gentle push (a hand
        // dragged through the water) passes strength < 1 instead of a full fright.
        const sc=Math.min(1.5,strength*(f.scatter||1));
        f.flee=(.45+(1-d/radius)*.7)*sc;
        f.fleeAngle=Math.atan2(dy,dx)+(this.random()-.5)*.9;
        f.beating=true;
        f.v=Math.max(f.v,BODY.length*f.size*this.scale*.8*sc);
        f.depthGoal=Math.min(.95,f.depth+.35*sc);
      }
    }
    pickGoal(f) {
      const r=this.random,w=this.width,h=this.height,m=.15,span=Math.min(w,h);let best=null,score=-Infinity;
      // In the rain the shoal gathers under the lotus leaves instead of wandering off somewhere random.
      if(this.shelters&&r()<.55){const s=this.shelters[Math.floor(r()*this.shelters.length)];if(this.isWater(s.x,s.y,this.habitat?this.fishMargin(f):0)){f.goal={x:s.x/w,y:s.y/h};f.goalTime=6+r()*8;return;}}
      for(let i=0;i<(this.habitat?16:8);i++){const gx=m+r()*(1-2*m),gy=m+r()*(1-2*m),dx=(gx-f.x)*w,dy=(gy-f.y)*h,d=Math.hypot(dx,dy);if(!this.isWater(gx*w,gy*h,this.habitat?this.fishMargin(f):0)||this.obstacles.some(o=>Math.hypot(gx*w-o.x,gy*h-o.y)<o.r+40))continue;const sc=-Math.abs(wrap(Math.atan2(dy,dx)-f.angle))*1.2+Math.min(d,span*.6)/span*2+r()*.6;if(sc>score){score=sc;best={x:gx,y:gy};}}
      f.goal=best||{x:f.x,y:f.y};f.goalTime=7+r()*12;
    }
    step(dt,speedFactor=1) {
      dt=clamp(dt,0,.05);this.time+=dt;const w=this.width,h=this.height;
      const feedingMargin=this.feedingMargin();
      for(const p of this.food){
        p.life-=dt;p.age+=dt;const k=Math.exp(-dt*1.8);p.vx*=k;p.vy*=k;
        let vx=p.vx+Math.sin(this.time*.35+p.drift)*1.2,vy=p.vy+Math.cos(this.time*.29+p.drift*1.3)*1.2;
        // Pellets near a rock float gently toward a place where a koi can get
        // its mouth to them while its entire body remains in the water.
        if(this.habitat&&!this.isWater(p.x,p.y,feedingMargin)){
          if(p.feedGoal&&Math.hypot(p.feedGoal[0]-p.x,p.feedGoal[1]-p.y)<3)p.feedGoal=null;
          const target=p.feedGoal||(p.feedGoal=this.habitat.feedingTarget(p.x,p.y,feedingMargin));
          if(target){const dx=target[0]-p.x,dy=target[1]-p.y,d=Math.hypot(dx,dy)||1,speed=Math.min(45*this.scale,d*3);vx+=dx/d*speed;vy+=dy/d*speed;}
        }else p.feedGoal=null;
        const px=clamp(p.x+vx*dt,4,w-4),py=clamp(p.y+vy*dt,4,h-4);
        if(this.isWater(px,py,4)){p.x=px;p.y=py;}else{
          // Slide along a curved bank rather than freezing on its first corner.
          const safe=this.habitat?.project(px,py,4.5);
          if(safe&&Math.hypot(safe[0]-p.x,safe[1]-p.y)<=Math.max(2,Math.hypot(vx,vy)*dt*2)){p.x=safe[0];p.y=safe[1];}
          p.vx=p.vy=0;p.feedGoal=null;
        }
      }
      this.food=this.food.filter(p=>p.life>0&&!p.eaten&&this.isWater(p.x,p.y,4));
      const sdt=dt*clamp(speedFactor,.1,3);
      const neighbours=this.allFish;
      for(const f of neighbours){wake(f,this.random);this.growFish(f,dt);this.confineFish(f);}
      for(const f of neighbours)this.swim(f,sdt,neighbours);
      if(this.food.some(p=>p.eaten))this.food=this.food.filter(p=>!p.eaten);
      // Twice a second is plenty to learn who keeps company with whom.
      if(++this.tick%30===0)this.trackBonds();
    }
    // Counts pairs that are swimming close together at a similar depth; cheap enough at 24 fish.
    trackBonds() {
      const fish=this.allFish,w=this.width,h=this.height;
      for(let i=0;i<fish.length;i++){
        const a=fish[i];
        for(let j=i+1;j<fish.length;j++){
          const b=fish[j];
          if(!a.id||!b.id)continue;
          if(Math.abs((a.depth||.5)-(b.depth||.5))>.3)continue;
          const dx=(a.x-b.x)*w,dy=(a.y-b.y)*h;
          if(dx*dx+dy*dy>8100)continue; // within 90px
          const key=a.id<b.id?a.id+'|'+b.id:b.id+'|'+a.id;
          this.bonds.set(key,(this.bonds.get(key)||0)+1);
        }
      }
    }
    // The koi this one has spent the most time beside, if any pair stands out.
    bestFriend(f) {
      if(!f||!f.id)return null;
      let best=null,top=0;
      for(const [key,n] of this.bonds){
        if(n<=top)continue;
        const cut=key.indexOf('|'),a=key.slice(0,cut),b=key.slice(cut+1);
        if(a===f.id){best=b;top=n;}
        else if(b===f.id){best=a;top=n;}
      }
      if(!best||top<6)return null;
      return this.allFish.find(o=>o.id===best)||null;
    }
    swim(f,dt,neighbours=this.allFish) {
      const w=this.width,h=this.height,s=f.size*this.scale,L=BODY.length*s,random=this.random,silver=f.species==='silvercarp';
      let x=f.x*w,y=f.y*h;const cos=Math.cos(f.angle),sin=Math.sin(f.angle),mx=x+cos*BODY.nose*s,my=y+sin*BODY.nose*s;
      let food=null,fd=Infinity;const reach=Math.max(w,h)*f.appetite;
      for(const p of (f.species === 'silvercarp' ? [] : this.food)){if(p.eaten)continue;const d=Math.hypot(p.x-mx,p.y-my);if(d<fd&&d<reach&&p.age>f.react+d/650){fd=d;food=p;}}
      // Anything unreachable by the bank is dropped for a moment after she bumps into it.
      f.foodCooldown=Math.max(0,(f.foodCooldown||0)-dt);
      if(f.foodCooldown>0)food=null;
      let gx,gy,want,turnGain=silver?3.5:2,maxTurn=silver?2.4:1.3,sepW=2.4,boundW=3;
      f.flee=Math.max(0,f.flee-dt);
      // Startle: a fast C-turn away, then a dash.
      if(f.flee>0){gx=Math.cos(f.fleeAngle);gy=Math.sin(f.fleeAngle);want=2.6*L;turnGain=9;maxTurn=7;}
      else if(food){
        const dx=food.x-x,dy=food.y-y,d=Math.hypot(dx,dy)||1,err=Math.abs(wrap(Math.atan2(dy,dx)-f.angle));
        gx=dx/d;gy=dy/d;want=clamp(fd/L*1.3,.25,2.2)*L*Math.max(.12,Math.cos(Math.min(err,Math.PI/2))**2);
        // Food under the body can't be reached by pivoting; swim on to open a gap, then come back around.
        if(d<BODY.nose*s*1.15&&err>.6){gx=cos;gy=sin;want=.7*L;}
        // Enough separation that a crowd around one pellet does not fuse into a blob at the bank.
        turnGain=4.5;maxTurn=3.4;sepW=1.5;boundW=.8;f.depthGoal=.04;
        if(fd<Math.max(6,7*s)){food.eaten=true;f.eaten++;this.totalEaten++;this.dayEaten=(this.dayEaten||0)+1;f.lastMeal=Date.now();this.events.push({type:'eat',x:food.x,y:food.y,fish:f});}
      } else {
        f.goalTime-=dt;
        if(!f.goal||f.goalTime<=0||Math.hypot(f.goal.x*w-x,f.goal.y*h-y)<L*1.3)this.pickGoal(f);
        const a=Math.atan2(f.goal.y*h-y,f.goal.x*w-x)+Math.sin(this.time*.21+f.seed)*.45+Math.sin(this.time*.53+f.seed*1.7)*.2;
        gx=Math.cos(a);gy=Math.sin(a);
        f.rest=Math.max(0,f.rest-dt);if(f.rest<=0&&random()<dt*.02)f.rest=silver?.6+random()*1.2:2+random()*4;
        // Easing into and out of a rest, instead of the target speed jumping when the timer runs out.
        f.idle+=((f.rest>0?1:0)-f.idle)*Math.min(1,dt*1.4);
        want=f.cruise*L*(1-.88*f.idle);
        if(random()<dt*.015)f.depthGoal=silver?.18+random()*.4:.15+random()*.75;
      }
      // Neighbours: keep personal space, sidestep head-on meetings, loosely match heading.
      let sx=0,sy=0,ax=0,ay=0,cx=0,cy=0,companions=0;
      for(const o of neighbours){
        if(o===f)continue;const ox=o.x*w-x,oy=o.y*h-y,d=Math.hypot(ox,oy);if(d<1e-6)continue;
        const R=(L+BODY.length*o.size*this.scale)*.52,near=1-Math.min(1,Math.abs(o.depth-f.depth)*1.6);
        if(d<R){const k=(1-d/R)**2*near;sx-=ox/d*k;sy-=oy/d*k;}
        if((ox*cos+oy*sin)/d>.8&&d<L*1.6&&near>.3){const side=(oy*cos-ox*sin)>0?-1:1,k=.35*(1-d/(L*1.6));sx-=sin*side*k;sy+=cos*side*k;}
        if(!food&&d<L*2.5&&o.species===f.species){ax+=Math.cos(o.angle);ay+=Math.sin(o.angle);}
        // Fish that like company drift toward their neighbours; the shoal always does.
        if((f.species==='silvercarp'||f.company>0)&&o.species===f.species&&d<L*(f.species==='silvercarp'?5:3.6)){cx+=ox;cy+=oy;companions++;}
      }
      if(companions&&f.flee<=0){
        const d=Math.hypot(cx,cy),pull=f.species==='silvercarp'?.65:.22*(f.company||0);
        if(d>L&&pull>0){gx+=cx/d*pull;gy+=cy/d*pull;}
      }
      const al=Math.hypot(ax,ay);if(al>0){ax/=al;ay/=al;}
      // Look ahead and turn back before the pond edge or a lily-pad cluster.
      const mX=Math.min(w*.1+L*.3,w*.3),mY=Math.min(h*.1+L*.3,h*.3),lx=x+cos*L*1.2,ly=y+sin*L*1.2;let bx=0,by=0;
      if(lx<mX)bx=(mX-lx)/mX;else if(lx>w-mX)bx=(w-mX-lx)/mX;
      if(ly<mY)by=(mY-ly)/mY;else if(ly>h-mY)by=(h-mY-ly)/mY;
      for(const ob of this.obstacles)for(const [px,py,R] of [[lx,ly,ob.r+L*.4],[x,y,ob.r+L*.2]]){const dx=px-ob.x,dy=py-ob.y,d=Math.hypot(dx,dy)||1;if(d<R){const k=(1-d/R)*2.5;bx+=dx/d*k;by+=dy/d*k;}}
      if(this.habitat){
        const edge=this.habitat.sample(x,y),ahead=this.habitat.sample(x+cos*Math.max(L,f.v*.5),y+sin*Math.max(L,f.v*.5)),margin=this.fishMargin(f);
        const near=clamp((margin+L*.8-edge.distance)/(L*.8),0,1),risk=clamp((margin+L*.4-ahead.distance)/L,0,2);
        const approaching=food&&f.flee<=0,avoid=approaching?.18:1;
        bx+=(edge.nx*near*2+ahead.nx*risk*2)*avoid;by+=(edge.ny*near*2+ahead.ny*risk*2)*avoid;
        boundW=Math.max(boundW,approaching?.8:3);if(near>.5){turnGain=Math.max(turnGain,6);maxTurn=Math.max(maxTurn,4);want*=approaching?.8:.45;}
      }
      // A loner keeps a wider berth; a sociable fish tolerates a closer crowd.
      const sepMul=f.company<0?1.35:f.company>0?.8:1;
      const desired=Math.atan2(gy+sy*sepW*sepMul+ay*.15+by*boundW,gx+sx*sepW*sepMul+ax*.15+bx*boundW);
      f.turn+=(clamp(wrap(desired-f.angle)*turnGain,-maxTurn,maxTurn)-f.turn)*Math.min(1,dt*(f.flee>0?14:silver?7:4));
      f.angle=wrap(f.angle+f.turn*dt);
      // Thrust follows how much speed is still missing, so the tailbeat swells and fades with the effort
      // instead of snapping between "beating" and "gliding".
      const need=clamp((want-f.v)/(want*.55+1e-3),0,1);
      f.thrust+=(need-f.thrust)*Math.min(1,dt*(need>f.thrust?7:4));
      f.beating=f.thrust>.3;
      if(f.v<want)f.v+=(want*1.28-f.v)*(1-Math.exp(-dt*(silver?3.4:2.4)*Math.max(.06,f.thrust)));
      else f.v*=Math.exp(-dt*(f.v>want*1.6?1.6:.5));
      f.v*=Math.exp(-dt*Math.abs(f.turn)*(silver?.17:.25));
      const bl=f.v/L;
      // Strokes per second follow the distance covered, not just the effort: a koi ambling at a third of a
      // body length per second beats about once, and one sprinting beats three or four times. Tying the rate
      // to thrust alone made the tail churn while the body barely moved.
      f.phase=(f.phase+dt*TAU*(silver?1.22:1)*(.35+f.thrust*.5+bl*2.2+Math.abs(f.turn)*.45))%(TAU*1000);
      // The tail sweeps wider through a turn, and the amplitude settles a little quicker than before.
      f.amp+=((.14+.86*f.thrust*Math.min(1,.5+bl*.6)+Math.min(.4,Math.abs(f.turn)*.25))-f.amp)*Math.min(1,dt*4);
      x+=Math.cos(f.angle)*f.v*dt;y+=Math.sin(f.angle)*f.v*dt;
      if(this.habitat&&!this.isWater(x,y,this.fishMargin(f))){
        const oldX=f.x*w,oldY=f.y*h,edge=this.habitat.sample(oldX,oldY);
        x=oldX;y=oldY;f.v*=.45;
        f.angle=wrap(f.angle+clamp(wrap(Math.atan2(edge.ny,edge.nx)-f.angle),-dt*7,dt*7));f.goal=null;
      }
      f.x=this.habitat?x/w:clamp(x/w,.03,.97);f.y=this.habitat?y/h:clamp(y/h,.035,.965);
      f.depth+=(f.depthGoal-f.depth)*Math.min(1,dt*(food?1.2:.35));
      updateSpine(f,s,w,h);
      // A very tight turn can swing the following tail out farther than the head.
      // Keep the full posed strip (including fins and tail beat) in the water.
      if(this.habitat){
        const pose=fishPose(f,s),padding=BODY.half*s+5;
        for(let i=0;i<pose.length;i+=4)if(!this.isWater(pose[i],pose[i+1],padding)){
          f.spine=null;updateSpine(f,s,w,h);break;
        }
      }
    }
  }
  function sanitizeSave(data) {
    if(!data||!Array.isArray(data.fish)||!data.fish.length) return null;
    const fish=data.fish.slice(0,60).filter(f=>f&&typeof f.name==='string').map((f,i)=>{
      const defaults=createFish(i,randomSeed(i+8));
      return {...defaults,id:typeof f.id==='string'?f.id.slice(0,80):defaults.id,name:f.name.trim().slice(0,12)||defaults.name,palette:Number.isInteger(f.palette)?clamp(f.palette,0,PALETTES.length-1):0,temper:TEMPERS.includes(f.temper)?f.temper:defaults.temper,size:clamp(Number(f.size)||.8,.45,1.5),baseSize:clamp(Number(f.baseSize)||Number(f.size)||defaults.size,.45,1.5),born:Number.isFinite(f.born)?f.born:null,lastMeal:Number.isFinite(f.lastMeal)?f.lastMeal:null,friend:typeof f.friend==='string'?f.friend:null,seed:Number.isFinite(f.seed)?f.seed:defaults.seed,eaten:clamp(Math.floor(Number(f.eaten)||0),0,9999999),marks:Array.isArray(f.marks)?f.marks.slice(0,400).filter(m=>m&&Number.isFinite(m.x)&&Number.isFinite(m.y)&&Number.isFinite(m.r)&&/^#[0-9a-f]{6}$/i.test(m.color)).map(m=>({x:clamp(m.x,-32,32),y:clamp(m.y,-16,16),r:clamp(m.r,1,8),color:m.color})):[]};
    });
    return fish.length?{fish,settings:data.settings&&typeof data.settings==='object'?data.settings:{},daily:data.daily}:null;
  }
  // The size range a koi can be given: the "我的锦鲤" panel's slider spans it, and it is what a saved
  // fish is clamped to, so a fish made in the panel never comes back a different size.
  const KOI_SIZE = { min: .45, max: 1.5, initial: 1.5 };
  const api={PALETTES,SILVER_CARP,KOI_SIZE,TEMPERS,TEMPER_TRAITS,koiAge,fishPalette,createSilverCarpShoal,BODY,POND_MAP,POND_MAPS,SEASONS,PondHabitat,randomSeed,weatherFromCode,seasonFromMonth,clamp,wrap,createFish,updateSpine,fishPose,PondSimulation,sanitizeSave};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PondCore=api;
})(typeof window!=='undefined'?window:globalThis);
