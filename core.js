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
  const fishPalette = f => PALETTES[f.palette] || PALETTES[0];
  // Fish body in local units: nose at +34, tail tip at -58; sprites span x -60..36, y -14..14.
  const BODY = { nose: 34, tail: -58, length: 92, segments: 16, rigid: 5, left: -60, width: 96, half: 14 };
  // Bank-slide trials, shared by every koi instead of rebuilt per frame.
  const SLIDE_FRACTIONS = [1, .5, .25];
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
  // Shorelines are traced against the 2048×1152 artwork guide, then stored as UVs.
  // Keep the guide size explicit: the runtime design space is 2560×1440, while the
  // authoritative 4K seasonal paintings are 3840×2160. Mixing those spaces is the easiest
  // way to make an apparently small boundary edit drift after a resize or rotation.
  const MAP_GUIDE = Object.freeze({ width: 2048, height: 1152 });
  const DESIGN_SPACE = Object.freeze({ width: 2560, height: 1440 });
  const mapPoint = ([x,y]) => [x / MAP_GUIDE.width, y / MAP_GUIDE.height];
  const POND_MAP = {
    width:DESIGN_SPACE.width,height:DESIGN_SPACE.height,
    water:[
      [0,478],[50,478],[100,475],[150,464],[192,445],[218,418],
      [231,389],[234,363],[228,335],[216,305],[224,275],
      [283,321],[329,337],[405,348],[459,331],[509,294],[535,231],[569,205],
      [620,177],[686,181],[741,160],[794,166],[848,189],[898,192],[944,216],
      [988,221],[1022,244],[1021,290],[1046,323],[1094,341],[1159,350],
      [1234,337],[1282,294],[1311,240],[1334,198],[1365,150],[1375,80],[1350,0],
      [2048,0],[2048,655],[1975,661],[1900,662],[1820,695],[1770,721],
      [1705,730],[1644,724],[1615,731],[1590,743],[1568,768],[1550,798],
      [1540,824],[1505,837],[1467,850],[1427,865],[1388,880],[1352,900],
      [1321,924],[1299,950],[1281,980],[1274,1008],[1279,1035],
      [1290,1054],[1270,1080],[1236,1070],
      [1200,1057],[1160,1049],[1120,1053],[1090,1070],[1068,1104],[1058,1152],
      [490,1152],[481,1120],[470,1090],[453,1050],[427,1033],[411,1065],
      [370,1055],[322,1019],[314,982],[279,968],[273,938],[227,921],
      [203,895],[152,887],[115,861],[82,832],[67,804],[33,770],[0,749]
    ].map(mapPoint),
    // The small moss-covered stone near the bottom is above water; pebbles seen
    // through the water elsewhere are part of the pond bed and remain swimmable.
    rocks:[[[955,1024],[965,1007],[985,998],[1004,999],[1026,1008],
      [1043,1026],[1058,1048],[1055,1067],[1037,1082],[1015,1087],
      [993,1079],[974,1066],[958,1046]] .map(mapPoint)]
  };
  // Each seasonal painting has its own shoreline and emergent stones. Trace
  // the water-contact contour (especially the protruding lower-right boulders),
  // not the leafy centre of the bank or the ellipse used for its weather effect.
  // These exact polygons also drive the renderer mask; never add rock ellipses
  // there, or swimming and the visible water surface acquire different banks.
  const seasonalMap = (water, rocks) => ({width:DESIGN_SPACE.width,height:DESIGN_SPACE.height,water:water.map(mapPoint),rocks:rocks.map(p=>p.map(mapPoint))});
  const POND_MAPS = {
    spring:POND_MAP,
    summer:seasonalMap([
      [0,498],[52,501],[104,498],[150,483],[186,460],[210,432],
      [222,402],[220,376],[211,350],[216,336],
      [260,356],[347,371],[417,362],[467,336],[500,287],[509,241],[532,226],
      [583,213],[635,233],[685,224],[723,181],[770,180],[807,168],[850,174],
      [881,197],[934,213],[978,218],[1014,252],[1011,278],[1026,316],[1080,342],
      [1157,350],[1223,340],[1270,310],[1297,246],[1327,195],[1359,163],[1384,103],[1370,0],
      [2048,0],[2048,620],[1991,612],[1943,642],[1890,687],[1830,748],[1790,812],
      [1728,829],[1670,825],[1618,817],[1580,820],[1534,813],[1485,812],
      [1440,822],[1400,838],[1365,860],[1335,884],[1310,912],[1290,943],
      [1277,973],[1270,1005],[1270,1041],[1274,1076],[1288,1110],
      [1234,1128],[1198,1152],
      [1170,1116],[1141,1091],[1110,1079],[1078,1073],[1048,1078],
      [1020,1092],[1000,1118],[985,1152],
      [488,1152],[479,1110],[449,1090],[443,1060],[411,1050],[390,1020],
      [360,1004],[351,978],[330,945],[279,929],[238,899],[210,893],[183,867],
      [148,846],[100,821],[71,790],[38,765],[0,743]
    ],[[[1550,684],[1570,654],[1605,630],[1644,624],[1680,627],
      [1717,640],[1750,662],[1770,692],[1783,728],[1778,760],
      [1758,783],[1728,801],[1695,808],[1658,803],[1623,789],
      [1590,768],[1567,740],[1552,709]]]),
    autumn:seasonalMap([
      [0,421],[52,427],[108,435],[158,432],[202,421],[237,403],
      [259,378],[271,349],[271,323],[256,300],[240,287],
      [274,303],[340,315],[421,316],[470,291],[513,246],[540,197],[601,169],
      [665,166],[715,150],[757,154],[813,162],[844,182],[909,224],[948,223],
      [980,238],[1019,242],[1042,265],[1060,307],[1105,326],[1188,338],
      [1245,319],[1287,284],[1310,235],[1335,183],[1368,147],[1385,90],[1371,0],
      [2048,0],[2048,640],[1980,640],[1935,662],[1885,685],[1845,728],
      [1815,756],[1782,768],[1740,823],[1690,830],[1655,833],[1610,851],
      [1590,886],[1552,914],[1516,921],[1479,919],[1440,910],[1404,911],
      [1368,925],[1335,942],[1302,963],[1270,982],[1237,1003],[1207,1025],
      [1184,1047],[1169,1070],[1146,1077],[1125,1073],[1095,1086],
      [1072,1107],[1052,1152],[493,1152],[478,1110],[453,1075],[421,1054],
      [398,1034],[370,1020],[350,985],[316,962],[280,945],[251,913],[200,906],
      [162,882],[113,858],[80,817],[41,784],[0,765]
    ],[[[1433,726],[1452,701],[1484,681],[1521,671],[1556,675],
      [1590,691],[1620,718],[1640,752],[1650,790],[1644,820],
      [1624,842],[1596,850],[1565,846],[1532,834],[1500,813],
      [1471,788],[1448,761],[1435,742]]]),
    winter:seasonalMap([
      [0,401],[52,409],[103,407],[148,395],[181,377],[207,353],
      [220,328],[220,303],[221,279],
      [268,305],[337,320],[415,326],[470,305],[507,265],[535,211],[574,185],
      [626,168],[680,172],[727,153],[786,160],[830,173],[885,202],[941,221],
      [980,221],[1020,244],[1026,284],[1050,316],[1104,339],[1176,346],
      [1238,329],[1284,292],[1310,237],[1331,195],[1362,148],[1375,84],[1355,0],
      [2048,0],[2048,588],[1990,595],[1944,622],[1908,647],[1890,689],
      [1845,723],[1815,765],[1771,801],[1740,848],[1675,868],[1604,881],
      [1548,872],[1510,874],[1470,868],[1432,856],[1394,846],[1356,841],
      [1322,848],[1290,862],[1265,882],[1245,908],[1230,937],[1225,969],
      [1230,999],[1245,1027],[1260,1051],[1270,1081],
      [1250,1107],[1228,1125],[1209,1090],[1187,1059],[1157,1030],
      [1127,1017],[1095,1023],[1067,1042],[1040,1071],[1018,1105],[1000,1152],
      [488,1152],[478,1111],[450,1075],
      [420,1037],[376,1012],[355,972],[318,954],[291,926],[258,912],[230,877],
      [187,868],[159,847],[127,819],[88,788],[48,769],[0,758]
    ],[[[1422,655],[1440,630],[1470,612],[1505,605],[1542,608],
      [1576,622],[1610,646],[1633,677],[1647,711],[1640,743],
      [1618,766],[1587,781],[1552,786],[1517,780],[1484,765],
      [1457,745],[1435,719],[1420,687]],
      [[1634,720],[1660,701],[1688,702],[1716,715],[1737,736],
       [1751,765],[1758,796],[1751,826],[1733,850],[1708,864],
       [1681,868],[1654,855],[1631,834],[1616,807],[1610,776],[1618,746]]])
  };
  const SEASONS = {
    spring:{name:'春',title:'春暖花开',image:'assets/pond-runtime.png',thumbnail:'assets/pond-spring-thumb.jpg',weather:'sunny'},
    summer:{name:'夏',title:'绿荫盛夏',image:'assets/pond-summer-runtime.png',thumbnail:'assets/pond-summer-thumb.jpg',weather:'sunny'},
    autumn:{name:'秋',title:'枫染清池',image:'assets/pond-autumn-runtime.png',thumbnail:'assets/pond-autumn-thumb.jpg',weather:'sunny'},
    winter:{name:'冬',title:'白雪映池',image:'assets/pond-winter-runtime.png',thumbnail:'assets/pond-winter-thumb.jpg',weather:'snow'}
  };
  function polygonSample(points,x,y,out) {
    let inside=false,best=Infinity,qx=0,qy=0,ex=0,ey=0;
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const [ax,ay]=points[j],[bx,by]=points[i],dx=bx-ax,dy=by-ay;
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
      const t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1);
      const px=ax+t*dx,py=ay+t*dy,d=(x-px)**2+(y-py)**2;
      if(d<best){best=d;qx=px;qy=py;ex=dx;ey=dy;}
    }
    const d=Math.sqrt(best),sign=inside?1:-1;
    if(d>1e-7){out.distance=d*sign;out.nx=(x-qx)/d*sign;out.ny=(y-qy)/d*sign;return out;}
    // At the boundary itself, derive the inward normal using a nearby point.
    const len=Math.hypot(ex,ey)||1,nx=-ey/len,ny=ex/len;
    let side=false;
    const px=x+nx*.1,py=y+ny*.1;
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const [ax,ay]=points[j],[bx,by]=points[i];
      if((ay>py)!==(by>py)&&px<(bx-ax)*(py-ay)/(by-ay)+ax)side=!side;
    }
    out.distance=0;out.nx=nx*(side?1:-1);out.ny=ny*(side?1:-1);return out;
  }
  class PondHabitat {
    constructor(width,height,imageToScreen,map=POND_MAP) {
      this.width=width;this.height=height;
      const transform=points=>points.map(([u,v])=>imageToScreen(u*map.width,v*map.height));
      this.water=transform(map.water);this.rocks=map.rocks.map(transform);
      this.rockSample={};this.containsSample={};this.projectSample={};
    }
    sample(x,y,out={}) {
      polygonSample(this.water,x,y,out);
      for(const rock of this.rocks){const p=polygonSample(rock,x,y,this.rockSample);p.distance=-p.distance;p.nx=-p.nx;p.ny=-p.ny;if(p.distance<out.distance){out.distance=p.distance;out.nx=p.nx;out.ny=p.ny;}}
      if(x<out.distance){out.distance=x;out.nx=1;out.ny=0;}
      if(this.width-x<out.distance){out.distance=this.width-x;out.nx=-1;out.ny=0;}
      if(y<out.distance){out.distance=y;out.nx=0;out.ny=1;}
      if(this.height-y<out.distance){out.distance=this.height-y;out.nx=0;out.ny=-1;}
      return out;
    }
    contains(x,y,margin=0) { return Number.isFinite(x)&&Number.isFinite(y)&&this.sample(x,y,this.containsSample).distance>=margin-1e-6; }
    feedingTarget(x,y,margin) {
      const target=this.project(x,y,margin);
      if(!target)return null;
      const d=Math.hypot(target[0]-x,target[1]-y),steps=Math.max(1,Math.ceil(d/4));
      let clear=true;
      for(let i=1;i<=steps;i++)if(!this.contains(x+(target[0]-x)*i/steps,y+(target[1]-y)*i/steps,4)){clear=false;break;}
      if(clear)return target;
      // In a narrow channel the nearest open water can lie across a stone.
      // Find a straight route through water so pellets can actually drift there.
      let best=null,waypoint=null,room=this.sample(x,y,this.projectSample).distance+1,reach=Math.hypot(this.width,this.height);
      for(let i=0;i<64;i++){
        const a=i*TAU/64,dx=Math.cos(a),dy=Math.sin(a);
        for(let r=4;r<reach;r+=4){
          const px=x+dx*r,py=y+dy*r,p=this.sample(px,py,this.projectSample);
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
        const p=this.sample(x,y,this.projectSample);if(p.distance>=margin)return [x,y];
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
    const size = Math.min(KOI_SIZE.max, .62 + random() * .4);
    // baseSize is the fish as it was made; the body grows from there with everything it eats.
    return { id: `koi-${Date.now()}-${index}`, name: names[index % names.length], palette: index % PALETTES.length, temper: TEMPERS[index % TEMPERS.length], size, baseSize: size, growthBase: 0, born: Date.now(), seed: Math.floor(random()*100000), eaten: 0, x: .17 + random()*.66, y: .18+random()*.62, angle: random()*TAU, phase: random()*10, speed: .85+random()*.3, target: null };
  }
  // Runtime-only swimming state; never persisted.
  function wake(f, random) {
    if (f.v !== undefined) return;
    f.v = 0; f.turn = 0; f.thrust = 0; f.amp = .25; f.beating = false; f.idle = 0;
    f.depth = .25 + random() * .55; f.depthGoal = f.depth;
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
    const rigid = BODY.rigid;
    const n = BODY.segments, seg = BODY.length / n * s, x = f.x * w, y = f.y * h, c = Math.cos(f.angle), si = Math.sin(f.angle);
    const nx = x + c * BODY.nose * s, ny = y + si * BODY.nose * s;
    let p = f.spine;
    // A quick turn moves the nose even when the centre barely travels. Only an actual
    // centre relocation (resize/teleport), not that nose sweep, should erase the curved trail.
    const relocated = Number.isFinite(f.spineX) && Math.hypot(x - f.spineX, y - f.spineY) > BODY.length * s * .75;
    if (!p || Math.abs(f.spineSeg - seg) > seg * .3 || relocated) {
      p = f.spine = new Float32Array((n + 1) * 2);
      for (let i = 0; i <= n; i++) { p[i*2] = nx - c * seg * i; p[i*2+1] = ny - si * seg * i; }
    }
    f.spineSeg = seg; f.spineX = x; f.spineY = y;
    for (let i = 0; i <= rigid; i++) { p[i*2] = nx - c * seg * i; p[i*2+1] = ny - si * seg * i; }
    let prev = f.angle;
    for (let i = rigid + 1; i <= n; i++) {
      const px = p[(i-1)*2], py = p[(i-1)*2+1], lim = .1 + .16 * i / n;
      const a = prev + clamp(wrap(Math.atan2(py - p[i*2+1], px - p[i*2]) - prev), -lim, lim);
      p[i*2] = px - Math.cos(a) * seg; p[i*2+1] = py - Math.sin(a) * seg; prev = a;
    }
  }
  // Spine points with the travelling tail-beat wave; out holds x, y, normalX, normalY per point.
  function fishPose(f, s, out = new Float32Array((BODY.segments + 1) * 4)) {
    const n = BODY.segments, p = f.spine, amp = (f.amp || 0) * 6.4 * s;
    // The spine already follows the path the head swam (see updateSpine), so a turn bends the body on its
    // own; only the travelling tail-beat is added here.
    for (let i = 0; i <= n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n, i + 1);
      let tx = p[a*2] - p[b*2], ty = p[a*2+1] - p[b*2+1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const u = i / n, env = .05 + .95 * Math.pow(Math.max(0, (u - .2) / .8), 1.5), lat = amp * env * Math.sin(f.phase - u * 5.4);
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
    constructor(fish,width,height,random=Math.random) { this.fish=fish; this.width=width; this.height=height; this.random=random; this.food=[]; this.totalEaten=0; this.scale=1; this.time=0; this.obstacles=[]; this.events=[]; this.habitat=null;
      // Who swims beside whom: a running tally of nearby pairs, used by the collection's profiles.
      this.bonds=new Map(); this.tick=0;
      this.foodDistances=new WeakMap();this.foodSample={};this.poseScratch=new Float32Array((BODY.segments+1)*4);
      // Reused edge samples for steering, so a swimming koi does not allocate two objects a frame.
      this.edgeSample={};this.edgeSampleB={}; }
    isWater(x,y,margin=0) { return this.habitat?this.habitat.contains(x,y,margin):x>=margin&&x<=this.width-margin&&y>=margin&&y<=this.height-margin; }
    foodIsWater(p,margin) {
      const habitat=this.habitat;
      if(!habitat)return this.isWater(p.x,p.y,margin);
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;
      let cached=this.foodDistances.get(p);
      if(!cached){cached={};this.foodDistances.set(p,cached);}
      // 食物在所有鱼的子步中保持不动；只复用当前坐标下的精确多边形距离。
      if(cached.x!==p.x||cached.y!==p.y||cached.habitat!==habitat||cached.width!==this.width||cached.height!==this.height||cached.habitatWidth!==habitat.width||cached.habitatHeight!==habitat.height){
        cached.distance=habitat.sample(p.x,p.y,this.foodSample).distance;
        cached.x=p.x;cached.y=p.y;cached.habitat=habitat;cached.width=this.width;cached.height=this.height;cached.habitatWidth=habitat.width;cached.habitatHeight=habitat.height;
      }
      return cached.distance>=margin-1e-6;
    }
    fishMargin(f) { return (Math.abs(BODY.tail)+BODY.half+7)*f.size*this.scale+5; }
    feedingMargin() {
      // Leave room for at least one koi to line up its mouth and turn around a pellet.
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
          const s=this.habitat.sample(f.x*this.width,f.y*this.height,this.edgeSample);
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
      if (f.baseSize === undefined) f.baseSize = f.size;
      // growthBase is the meal count at which the body was last restored, so resetting a koi's build
      // starts it growing again from that meal rather than instantly regrowing from its whole history.
      const gain = Math.min(.42, Math.log1p(Math.max(0, f.eaten - (f.growthBase || 0))) * .055);
      const want = Math.min(KOI_SIZE.max, f.baseSize * (1 + gain));
      if (want > f.size + .0005) f.size += (want - f.size) * Math.min(1, dt * .45);
    }
    // Thunder is on its way: every fish sinks into deeper water and stays low.
    dive() {
      for (const f of this.fish) {
        wake(f, this.random);
        f.depthGoal = .86 + this.random() * .12;
        f.v = Math.max(f.v, BODY.length * f.size * this.scale * .3);
        f.rest = 0;
      }
    }
    // Lotus leaves the fish can shelter under while it rains (screen coordinates, from the scene).
    setShelters(points) { this.shelters = points && points.length ? points : null; }
    setHabitat(habitat) {
      this.habitat=habitat;
      for(const f of this.fish){wake(f,this.random);this.confineFish(f);f.goal=null;f.spine=null;f.bankHold=0;f.bankSide=0;}
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
      for(const f of this.fish){
        wake(f,this.random);
        const dx=f.x*this.width-x,dy=f.y*this.height-y,d=Math.hypot(dx,dy);
        if(d>=radius)continue;
        // A timid fish bolts further and for longer; a tame one barely bothers. A gentle push (a hand
        // dragged through the water) passes strength < 1 instead of a full fright.
        const sc=Math.min(1.5,strength*(f.scatter||1));
        f.flee=(.45+(1-d/radius)*.7)*sc;
        f.fleeAngle=Math.atan2(dy,dx)+(this.random()-.5)*.9;
        f.beating=true;
        f.v=Math.max(f.v,BODY.length*f.size*this.scale*.6*sc);
        f.depthGoal=Math.min(.95,f.depth+.35*sc);
      }
    }
    pickGoal(f) {
      const r=this.random,w=this.width,h=this.height,m=.15,span=Math.min(w,h);let best=null,score=-Infinity;
      // In the rain the fish gather under the lotus leaves instead of wandering off somewhere random.
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
      const neighbours=this.fish;
      for(const f of neighbours){wake(f,this.random);this.growFish(f,dt);this.confineFish(f);}
      // Accelerated/low-FPS playback must still trace turns in small steps; food ageing
      // and growth above keep their real-time semantics rather than running once per substep.
      const steps=Math.max(1,Math.ceil(sdt/(1/30)));
      for(let i=0;i<steps;i++)for(const f of neighbours)this.swim(f,sdt/steps,neighbours);
      if(this.food.some(p=>p.eaten))this.food=this.food.filter(p=>!p.eaten);
      // Twice a second is plenty to learn who keeps company with whom.
      if(++this.tick%30===0)this.trackBonds();
    }
    // Counts pairs that are swimming close together at a similar depth; cheap enough at 24 fish.
    trackBonds() {
      const fish=this.fish,w=this.width,h=this.height,ids=new Set(fish.map(f=>f.id));
      for(const key of this.bonds.keys()){
        const cut=key.indexOf('|');
        if(!ids.has(key.slice(0,cut))||!ids.has(key.slice(cut+1)))this.bonds.delete(key);
      }
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
      return this.fish.find(o=>o.id===best)||null;
    }
    swim(f,dt,neighbours=this.fish) {
      const w=this.width,h=this.height,s=f.size*this.scale,L=BODY.length*s,random=this.random;
      let x=f.x*w,y=f.y*h;const cos=Math.cos(f.angle),sin=Math.sin(f.angle),mx=x+cos*BODY.nose*s,my=y+sin*BODY.nose*s;
      let food=null,fd=Infinity;const reach=Math.max(w,h)*f.appetite;
      // A pellet lying closer to the bank than her mouth can reach is not food yet: it is still drifting
      // out to open water. Lunging at it only pinned her against the shore frame after frame.
      const mouthRoom=this.fishMargin(f)-BODY.nose*s-Math.max(6,7*s);
      for(const p of this.food){if(p.eaten||(this.habitat&&!this.foodIsWater(p,mouthRoom)))continue;const d=Math.hypot(p.x-mx,p.y-my);if(d<fd&&d<reach&&p.age>f.react+d/650){fd=d;food=p;}}
      // Anything unreachable by the bank is dropped for a moment after she bumps into it.
      f.foodCooldown=Math.max(0,(f.foodCooldown||0)-dt);
      if(f.foodCooldown>0)food=null;
      let gx,gy,want,turnGain=2,maxTurn=1.3,sepW=2.4,boundW=3;
      f.flee=Math.max(0,f.flee-dt);
      // Startle: a quick C-turn away, then a dash. The turn stays snappy; only the sprint is capped, so the
      // pond reads calmer without the fish looking sluggish.
      if(f.flee>0){gx=Math.cos(f.fleeAngle);gy=Math.sin(f.fleeAngle);want=1.9*L;turnGain=9;maxTurn=7;}
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
        f.rest=Math.max(0,f.rest-dt);if(f.rest<=0&&random()<dt*.02)f.rest=2+random()*4;
        // Easing into and out of a rest, instead of the target speed jumping when the timer runs out.
        f.idle+=((f.rest>0?1:0)-f.idle)*Math.min(1,dt*1.4);
        want=f.cruise*L*(1-.88*f.idle);
        if(random()<dt*.015)f.depthGoal=.15+random()*.75;
      }
      // Neighbours: keep personal space, sidestep head-on meetings, loosely match heading.
      let sx=0,sy=0,ax=0,ay=0,cx=0,cy=0,companions=0;
      for(const o of neighbours){
        if(o===f)continue;const ox=o.x*w-x,oy=o.y*h-y,d=Math.hypot(ox,oy);if(d<1e-6)continue;
        const R=(L+BODY.length*o.size*this.scale)*.52,near=1-Math.min(1,Math.abs(o.depth-f.depth)*1.6);
        if(d<R){const k=(1-d/R)**2*near;sx-=ox/d*k;sy-=oy/d*k;}
        if((ox*cos+oy*sin)/d>.8&&d<L*1.6&&near>.3){const side=(oy*cos-ox*sin)>0?-1:1,k=.35*(1-d/(L*1.6));sx-=sin*side*k;sy+=cos*side*k;}
        if(!food&&d<L*2.5){ax+=Math.cos(o.angle);ay+=Math.sin(o.angle);}
        // Fish that like company drift toward their neighbours.
        if(f.company>0&&d<L*3.6){cx+=ox;cy+=oy;companions++;}
      }
      if(companions&&f.flee<=0){
        const d=Math.hypot(cx,cy),pull=.22*(f.company||0);
        if(d>L&&pull>0){gx+=cx/d*pull;gy+=cy/d*pull;}
      }
      const al=Math.hypot(ax,ay);if(al>0){ax/=al;ay/=al;}
      // Look ahead and turn back before the pond edge or a lily-pad cluster.
      const mX=Math.min(w*.1+L*.3,w*.3),mY=Math.min(h*.1+L*.3,h*.3),lx=x+cos*L*1.2,ly=y+sin*L*1.2;let bx=0,by=0;
      if(lx<mX)bx=(mX-lx)/mX;else if(lx>w-mX)bx=(w-mX-lx)/mX;
      if(ly<mY)by=(mY-ly)/mY;else if(ly>h-mY)by=(h-mY-ly)/mY;
      for(const ob of this.obstacles){
        // Two probe points (ahead and here); plain assignments keep the steering loop allocation-free.
        const r1=ob.r+L*.4,dx1=lx-ob.x,dy1=ly-ob.y,d1=Math.hypot(dx1,dy1)||1;
        if(d1<r1){const k=(1-d1/r1)*2.5;bx+=dx1/d1*k;by+=dy1/d1*k;}
        const r2=ob.r+L*.2,dx2=x-ob.x,dy2=y-ob.y,d2=Math.hypot(dx2,dy2)||1;
        if(d2<r2){const k=(1-d2/r2)*2.5;bx+=dx2/d2*k;by+=dy2/d2*k;}
      }
      let bank=null,bankUrgency=0,bankAngle=0;
      if(this.habitat){
        const edge=this.habitat.sample(x,y,this.edgeSample),ahead=this.habitat.sample(x+cos*Math.max(L,f.v*.5),y+sin*Math.max(L,f.v*.5),this.edgeSampleB),margin=this.fishMargin(f);
        const near=clamp((margin+L*.8-edge.distance)/(L*.8),0,1),risk=clamp((margin+L*.4-ahead.distance)/L,0,2);
        const approaching=food&&f.flee<=0,avoid=approaching?.18:1;
        bx+=(edge.nx*near*2+ahead.nx*risk*2)*avoid;by+=(edge.ny*near*2+ahead.ny*risk*2)*avoid;
        boundW=Math.max(boundW,approaching?.8:3);
        // The normal push alone points exactly backwards in a head-on encounter. Pick a
        // consistent tangent, then arc gently inward instead of oscillating on the bank.
        const outward=-(cos*edge.nx+sin*edge.ny),tight=clamp((margin+L*.45-edge.distance)/(L*.45),0,1);
        bankUrgency=tight*clamp((outward+.25)/.65,0,1);
        f.bankHold=Math.max(0,(f.bankHold||0)-dt);
        if(bankUrgency>.08){
          if(!f.bankHold){
            const tangent=cos*(-edge.ny)+sin*edge.nx,goalTangent=gx*(-edge.ny)+gy*edge.nx;
            f.bankSide=Math.abs(tangent)>.15?Math.sign(tangent):Math.abs(goalTangent)>.1?Math.sign(goalTangent):f.turn<0?-1:1;
          }
          f.bankHold=.65;
          const tx=-edge.ny*f.bankSide,ty=edge.nx*f.bankSide;
          bankAngle=Math.atan2(ty+edge.ny*.55,tx+edge.nx*.55);bank=edge;
          turnGain=Math.max(turnGain,7);maxTurn=Math.max(maxTurn,4.5);
          // Keep a swimming pace while turning, rather than letting boundary braking
          // collapse the tailbeat and leave the fish pivoting in place.
          want=Math.max(want*(1-bankUrgency*.25),L*.24);
        }else if(near>.5){turnGain=Math.max(turnGain,6);maxTurn=Math.max(maxTurn,4);want*=approaching?.8:.7;}
      }
      // A loner keeps a wider berth; a sociable fish tolerates a closer crowd.
      const sepMul=f.company<0?1.35:f.company>0?.8:1;
      let desired=Math.atan2(gy+sy*sepW*sepMul+ay*.15+by*boundW,gx+sx*sepW*sepMul+ax*.15+bx*boundW);
      if(bank)desired=wrap(desired+wrap(bankAngle-desired)*bankUrgency);
      const response=f.flee>0?14:4+bankUrgency*10;
      f.turn+=(clamp(wrap(desired-f.angle)*turnGain,-maxTurn,maxTurn)-f.turn)*(1-Math.exp(-dt*response));
      f.angle=wrap(f.angle+f.turn*dt);
      // Thrust follows how much speed is still missing, so the tailbeat swells and fades with the effort
      // instead of snapping between "beating" and "gliding".
      const need=clamp((want-f.v)/(want*.55+1e-3),0,1);
      f.thrust+=(need-f.thrust)*Math.min(1,dt*(need>f.thrust?7:4));
      f.beating=f.thrust>.3;
      if(f.v<want)f.v+=(want*1.28-f.v)*(1-Math.exp(-dt*2.4*Math.max(.06,f.thrust)));
      else f.v*=Math.exp(-dt*(f.v>want*1.6?1.6:.5));
      f.v*=Math.exp(-dt*Math.abs(f.turn)*.25);
      const bl=f.v/L;
      // Strokes per second follow the distance covered, not just the effort: a koi ambling at a third of a
      // body length per second beats about once, and one sprinting beats three or four times. Tying the rate
      // to thrust alone made the tail churn while the body barely moved.
      f.phase=(f.phase+dt*TAU*(.35+f.thrust*.5+bl*2.2+Math.abs(f.turn)*.45))%(TAU*1000);
      // The tail sweeps wider through a turn, and the amplitude settles a little quicker than before.
      f.amp+=((.14+.86*f.thrust*Math.min(1,.5+bl*.6)+Math.min(.4,Math.abs(f.turn)*.25))-f.amp)*Math.min(1,dt*4);
      x+=Math.cos(f.angle)*f.v*dt;y+=Math.sin(f.angle)*f.v*dt;
      if(this.habitat&&!this.isWater(x,y,this.fishMargin(f))){
        const oldX=f.x*w,oldY=f.y*h,edge=this.habitat.sample(oldX,oldY,this.edgeSample),margin=this.fishMargin(f);
        const dx=x-oldX,dy=y-oldY,into=Math.min(0,dx*edge.nx+dy*edge.ny);
        // Remove only the into-bank part, keeping the useful along-bank motion. Local
        // projection may follow a curved edge, but must never teleport through a rock.
        const slideX=oldX+dx-edge.nx*into,slideY=oldY+dy-edge.ny*into;
        x=oldX;y=oldY;
        for(const fraction of SLIDE_FRACTIONS){
          const px=oldX+(slideX-oldX)*fraction,py=oldY+(slideY-oldY)*fraction;
          const safe=this.isWater(px,py,margin)?[px,py]:this.habitat.project(px,py,margin+.05);
          if(safe&&Math.hypot(safe[0]-oldX,safe[1]-oldY)<=Math.hypot(dx,dy)*1.25+.1){
            const midX=(oldX+safe[0])*.5,midY=(oldY+safe[1])*.5;
            if(this.isWater(midX,midY,margin-.05)){x=safe[0];y=safe[1];break;}
          }
        }
        // Time-scaled drag, not a per-frame 55% penalty. Steering remains entirely
        // in f.turn so the spine and pectoral fins agree with the head's actual motion.
        f.v*=Math.exp(-dt*.8);f.goal=null;f.rest=0;
        // Blocked by the bank while chasing a pellet: let it go for a moment instead of pressing
        // into the edge again on the very next frame, which read as a stutter.
        if(food)f.foodCooldown=.5+this.random()*.4;
      }
      f.x=this.habitat?x/w:clamp(x/w,.03,.97);f.y=this.habitat?y/h:clamp(y/h,.035,.965);
      f.depth+=(f.depthGoal-f.depth)*Math.min(1,dt*(food?1.2:.35));
      updateSpine(f,s,w,h);
      // A very tight turn can swing the following tail out farther than the head.
      // Keep the full posed strip (including fins and tail beat) in the water.
      if(this.habitat){
        const pose=fishPose(f,s,this.poseScratch),padding=BODY.half*s+5;
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
      return {...defaults,id:typeof f.id==='string'?f.id.slice(0,80):defaults.id,name:f.name.trim().slice(0,12)||defaults.name,palette:Number.isInteger(f.palette)?clamp(f.palette,0,PALETTES.length-1):0,temper:TEMPERS.includes(f.temper)?f.temper:defaults.temper,size:clamp(Number(f.size)||.8,KOI_SIZE.min,KOI_SIZE.max),baseSize:clamp(Number(f.baseSize)||Number(f.size)||defaults.size,KOI_SIZE.min,KOI_SIZE.max),born:Number.isFinite(f.born)?f.born:null,lastMeal:Number.isFinite(f.lastMeal)?f.lastMeal:null,friend:typeof f.friend==='string'?f.friend:null,seed:Number.isFinite(f.seed)?f.seed:defaults.seed,eaten:clamp(Math.floor(Number(f.eaten)||0),0,9999999),growthBase:clamp(Math.floor(Number(f.growthBase)||0),0,9999999),marks:Array.isArray(f.marks)?f.marks.slice(0,400).filter(m=>m&&Number.isFinite(m.x)&&Number.isFinite(m.y)&&Number.isFinite(m.r)&&/^#[0-9a-f]{6}$/i.test(m.color)).map(m=>({x:clamp(m.x,-32,32),y:clamp(m.y,-16,16),r:clamp(m.r,1,8),color:m.color})):[]};
    });
    return fish.length?{fish,settings:data.settings&&typeof data.settings==='object'?data.settings:{},daily:data.daily}:null;
  }
  function validatePondMaps(maps=POND_MAPS) {
    for(const season of Object.keys(SEASONS)) {
      const map=maps[season];
      if(!map||map.width!==DESIGN_SPACE.width||map.height!==DESIGN_SPACE.height) throw Error(`invalid ${season} pond design space`);
      if(!Array.isArray(map.water)||map.water.length<8) throw Error(`invalid ${season} shoreline`);
      for(const polygon of [map.water,...map.rocks]) {
        if(!Array.isArray(polygon)||polygon.length<3) throw Error(`invalid ${season} boundary polygon`);
        for(const point of polygon) if(!Array.isArray(point)||point.length!==2||point.some(v=>!Number.isFinite(v)||v<0||v>1)) throw Error(`invalid ${season} boundary coordinate`);
      }
    }
    return true;
  }
  validatePondMaps();
  // The size range a koi can be given: the "我的锦鲤" panel's slider spans it, and it is what a saved
  // fish is clamped to, so a fish made in the panel never comes back a different size.
  // Sprite width is BODY.width = 96, so size 1 is 96px long at pond scale 1: the max is the 96px upper bound.
  const KOI_SIZE = { min: .45, max: 1, initial: 1 };
  const api={PALETTES,KOI_SIZE,TEMPERS,TEMPER_TRAITS,koiAge,fishPalette,BODY,POND_MAP,POND_MAPS,SEASONS,MAP_GUIDE,DESIGN_SPACE,validatePondMaps,PondHabitat,randomSeed,weatherFromCode,seasonFromMonth,clamp,wrap,createFish,updateSpine,fishPose,PondSimulation,sanitizeSave};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PondCore=api;
})(typeof window!=='undefined'?window:globalThis);
