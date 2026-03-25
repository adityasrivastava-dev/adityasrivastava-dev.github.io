// ── OBJECTS — temples (exact positions from city-data), trees, lamps, details ─
// Building positions are NEVER changed — they come directly from CITY_DATA.
// Trees, lamps, decorations are scaled 2.5x for bigger world feel.

export default class Objects {
  constructor(scene, events) {
    this.scene  = scene;
    this.events = events;

    this.buildingMeshes = [];
    this.buildingBoxes  = [];
    this.trees          = [];
    this._proximityId   = null;
  }

  // ── INIT (must be called before buildAll) ──────────────────────────────────
  _initToonGrad() {
    if (window._toonGrad) return;
    const gc = document.createElement('canvas');
    gc.width = 4; gc.height = 1;
    const gx = gc.getContext('2d');
    ['#110800','#664422','#ddaa66','#fff8ee'].forEach((c,i) => {
      gx.fillStyle=c; gx.fillRect(i,0,1,1);
    });
    const t = new THREE.CanvasTexture(gc);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    window._toonGrad = t;
  }

  _initMatcaps() {
    if (window._matcaps) return;
    const mk = (h,m,sh,sp) => {
      const S=128, c=document.createElement('canvas'); c.width=c.height=S;
      const ctx=c.getContext('2d');
      ctx.fillStyle='#000'; ctx.fillRect(0,0,S,S);
      ctx.save(); ctx.beginPath(); ctx.arc(S/2,S/2,S/2-1,0,Math.PI*2); ctx.clip();
      const g1=ctx.createLinearGradient(0,S,0,0);
      g1.addColorStop(0,sh); g1.addColorStop(0.4,m); g1.addColorStop(1,h);
      ctx.fillStyle=g1; ctx.fillRect(0,0,S,S);
      const g2=ctx.createRadialGradient(S*.3,S*.25,0,S*.45,S*.45,S*.5);
      g2.addColorStop(0,sp||'rgba(255,255,255,0.88)');
      g2.addColorStop(0.22,'rgba(255,255,255,0.22)'); g2.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g2; ctx.fillRect(0,0,S,S);
      ctx.restore();
      return new THREE.CanvasTexture(c);
    };
    window._matcaps = {
      warm:   mk('#ffeecc','#ddaa66','#774422'),
      cool:   mk('#ddeeff','#6699cc','#224466'),
      stone:  mk('#ffffff','#f5e0c0','#cc9966'),
      gold:   mk('#ffe566','#ddaa00','#553300'),
      tree:   mk('#77cc44','#336622','#0a1a04'),
      car:    mk('#ff9977','#dd2200','#440000','rgba(255,230,220,0.95)'),
      carDark:mk('#ee5533','#991100','#220000'),
      chrome: mk('#ffffee','#ccccaa','#444433'),
      glass:  mk('#99ccff','#3366aa','#001133'),
      tyre:   mk('#333222','#151210','#050404'),
      dark:   mk('#443322','#221108','#080402'),
      purple: mk('#ffddff','#dd99ff','#663388'),
    };
  }

  buildAll(isNight) {
    this._initToonGrad();
    this._initMatcaps();
    this._isNight = isNight || false;
    this._buildAllTemples();
    this._buildTrees();
    this._buildLamps();
    this._buildGrass();
    this._buildRoadDecorations();
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────
  _pc(c) {
    return typeof c==='string'&&c.startsWith('#') ? parseInt(c.slice(1),16) : (typeof c==='number'?c:0x334455);
  }

  _ptLight(col,intensity,dist,pos) {
    const l=new THREE.PointLight(col,intensity,dist);
    if(pos) l.position.set(...pos);
    return l;
  }

  // ── TEMPLES — exact positions from CITY_DATA ───────────────────────────────
  _buildAllTemples() {
    (window.CITY_DATA?.buildings || []).forEach(b => this._buildTemple(b));
  }

  _buildTemple(b) {
    const g = new THREE.Group();
    // EXACT position from city-data — NOT scaled
    g.position.set(b.pos[0], 0, b.pos[1]);

    const w=b.size[0], d=b.size[1], h=b.height;
    const gc = this._pc(b.glowColor);
    const tg = window._toonGrad;
    const mc = window._matcaps || {};

    const stoneColors = {
      '#00c8ff':[0xddeeff,0xaaccee,0x5588aa],
      '#7dff4f':[0xeeffcc,0xbbdd88,0x667733],
      '#ffcc44':[0xfff0bb,0xeebb55,0xaa7700],
      '#ff6b00':[0xffddb8,0xee9944,0xaa4411],
      '#c084fc':[0xffeeff,0xddaaff,0x9944cc],
      '#4dd4ff':[0xddf4ff,0x99ddff,0x4488bb],
      '#ff9950':[0xffeedd,0xeeaa66,0xaa5522],
      '#a78bfa':[0xf0e8ff,0xcc99ff,0x7744bb],
      '#34d399':[0xddfff0,0x88eebb,0x227755],
    };
    const [sL,sM,sD] = stoneColors[b.glowColor]||[0xffeedd,0xddbb88,0x886633];

    const mL = new THREE.MeshToonMaterial({ color:sL, gradientMap:tg });
    const mM = new THREE.MeshToonMaterial({ color:sM, gradientMap:tg });
    const mD = new THREE.MeshToonMaterial({ color:sD, gradientMap:tg });
    const mG = new THREE.MeshToonMaterial({ color:0xffcc44, gradientMap:tg });

    // Foundation steps
    const steps = b.isHero ? 4 : 3;
    for (let s=0; s<steps; s++) {
      const sw=w+(steps-s)*1.8, sd=d+(steps-s)*1.8, sh=0.38;
      const slab=new THREE.Mesh(new THREE.BoxGeometry(sw,sh,sd),s%2===0?mM:mL);
      slab.position.y=s*sh+sh/2; g.add(slab);
    }
    const baseH = steps*0.38;
    const type  = b.templeType||'shikhara';

    if (type==='gopuram')   this._gopuram(g,w,d,h,baseH,mL,mM,mD,mG,gc,b);
    else if (type==='shikhara') this._shikhara(g,w,d,h,baseH,mL,mM,mD,mG,gc,b);
    else if (type==='mandapa')  this._mandapa(g,w,d,h,baseH,mL,mM,mD,mG,gc,b,mc,sL);
    else if (type==='stupa')    this._stupa(g,w,d,h,baseH,mL,mM,mD,mG,gc,b);

    // Torana gateway for hero/education
    if (b.isHero || b.isEducation) {
      const torH=h*0.5, torW=w*0.7;
      for (const x of [-torW/2,torW/2]) {
        const p=new THREE.Mesh(new THREE.BoxGeometry(0.45,torH,0.45),mM);
        p.position.set(x,torH/2,d/2+2); g.add(p);
      }
      const lt=new THREE.Mesh(new THREE.BoxGeometry(torW+0.45,0.5,0.45),mM);
      lt.position.set(0,torH,d/2+2); g.add(lt);
      const archDec=new THREE.Mesh(new THREE.BoxGeometry(torW*0.6,0.35,0.45),mG);
      archDec.position.set(0,torH+0.5,d/2+2); g.add(archDec);
    }

    // Glowing hero orb
    if (b.isHero) {
      const orb=new THREE.Mesh(new THREE.OctahedronGeometry(0.7,0),
        new THREE.MeshBasicMaterial({color:gc}));
      orb.position.y=h+3; orb.userData.isOrb=true; g.add(orb);
      for (const [r,i] of [[1.5,0],[2.5,1]]) {
        const ring=new THREE.Mesh(new THREE.TorusGeometry(r,0.08,4,16),
          new THREE.MeshBasicMaterial({color:gc,transparent:true,opacity:0.5-i*0.12}));
        ring.rotation.x=Math.PI/2; ring.position.y=h+3;
        ring.userData.heroRing=true; ring.userData.ri=i; g.add(ring);
      }
      g.add(this._ptLight(gc,this._isNight?4.5:1.8,35,[0,h+2.5,0]));
      g.add(this._ptLight(0xffcc88,this._isNight?2.0:0.8,14,[0,2,0]));
    } else {
      g.add(this._ptLight(gc,this._isNight?2.5:1.0,22,[0,h*0.7,0]));
    }

    // Blob shadow (scaled to building footprint)
    const shadowMat=new THREE.MeshBasicMaterial({
      color:new THREE.Color(0.03,0.02,0.04),transparent:true,opacity:0.6,depthWrite:false
    });
    const shad=new THREE.Mesh(new THREE.CircleGeometry(1,18),shadowMat);
    shad.rotation.x=-Math.PI/2; shad.scale.set(w*0.8,d*0.72,1); shad.position.y=0.025;
    g.add(shad);

    // Proximity glow ring
    const glowRing=new THREE.Mesh(new THREE.TorusGeometry(Math.max(w,d)*0.65,0.1,4,24),
      new THREE.MeshBasicMaterial({color:gc,transparent:true,opacity:0}));
    glowRing.rotation.x=Math.PI/2; glowRing.position.y=0.1;
    glowRing.userData.isProxRing=true; g.add(glowRing);

    // Collision box
    this.buildingBoxes.push({
      minX:b.pos[0]-w/2-2.5, maxX:b.pos[0]+w/2+2.5,
      minZ:b.pos[1]-d/2-2.5, maxZ:b.pos[1]+d/2+2.5,
    });

    g.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});
    this.scene.add(g);
    this.buildingMeshes.push({ group:g, building:b, bodyMat:mM });
  }

  _gopuram(g,w,d,h,baseH,mL,mM,mD,mG,gc,b) {
    const hallH=h*0.28;
    const hall=new THREE.Mesh(new THREE.BoxGeometry(w,hallH,d),mM);
    hall.position.y=baseH+hallH/2; g.add(hall);
    const arch=new THREE.Mesh(new THREE.BoxGeometry(w*0.35,hallH*0.75,d+0.5),mD);
    arch.position.y=baseH+hallH*0.38; g.add(arch);
    const tiers=b.isHero?8:6; let tierY=baseH+hallH, tw=w, td=d;
    const tierH=(h-hallH)/tiers;
    for (let t=0;t<tiers;t++) {
      tw*=0.88; td*=0.88;
      const tier=new THREE.Mesh(new THREE.BoxGeometry(tw,tierH,td),t%2===0?mM:mL);
      tier.position.y=tierY+tierH/2; g.add(tier);
      const c=new THREE.Mesh(new THREE.BoxGeometry(tw+0.3,0.18,td+0.3),mD);
      c.position.y=tierY+tierH; g.add(c);
      tierY+=tierH;
    }
    const vault=new THREE.Mesh(new THREE.CylinderGeometry(tw*0.3,tw*0.48,tw*0.7,8),mM);
    vault.position.y=tierY+tw*0.35; vault.rotation.z=Math.PI/2; g.add(vault);
    const kPot=new THREE.Mesh(new THREE.SphereGeometry(0.45,8,6),mG);
    kPot.position.y=tierY+tw*0.7+0.6; g.add(kPot);
    const kTop=new THREE.Mesh(new THREE.ConeGeometry(0.14,0.6,6),mG);
    kTop.position.y=tierY+tw*0.7+1.2; g.add(kTop);
  }

  _shikhara(g,w,d,h,baseH,mL,mM,mD,mG,gc,b) {
    const sH=h*0.32;
    const sanc=new THREE.Mesh(new THREE.BoxGeometry(w,sH,d),mM);
    sanc.position.y=baseH+sH/2; g.add(sanc);
    const aY=baseH+sH; let spW=w*0.9;
    const spTiers=b.isHero?10:7; const spH=(h-sH)/spTiers;
    for (let t=0;t<spTiers;t++) {
      spW*=0.85;
      const sp=new THREE.Mesh(new THREE.CylinderGeometry(spW*0.5,spW*0.55,spH,8),t%2===0?mM:mL);
      sp.position.y=aY+t*spH+spH/2; g.add(sp);
      if (t<spTiers-2) {
        const band=new THREE.Mesh(new THREE.TorusGeometry(spW*0.52,0.1,4,12),
          new THREE.MeshBasicMaterial({color:gc,transparent:true,opacity:0.55}));
        band.position.y=aY+t*spH+spH; band.rotation.x=Math.PI/2; g.add(band);
      }
    }
    const aml=new THREE.Mesh(new THREE.CylinderGeometry(spW*0.7,spW*0.7,0.35,12),mG);
    aml.position.y=aY+spTiers*spH+0.18; g.add(aml);
    const kPot=new THREE.Mesh(new THREE.SphereGeometry(0.4,8,6),mG);
    kPot.position.y=aY+spTiers*spH+0.65; g.add(kPot);
  }

  _mandapa(g,w,d,h,baseH,mL,mM,mD,mG,gc,b,mc,sL) {
    const roofH=h*0.45;
    const roof=new THREE.Mesh(new THREE.BoxGeometry(w+0.5,roofH,d+0.5),mM);
    roof.position.set(0,baseH+roofH/2,0); g.add(roof);
    const topH=h*0.28;
    const top=new THREE.Mesh(new THREE.BoxGeometry(w*0.72,topH,d*0.72),mL);
    top.position.y=baseH+roofH+topH/2; g.add(top);
    const crH=h*0.2;
    const cr=new THREE.Mesh(new THREE.CylinderGeometry(w*0.18,w*0.26,crH,8),mM);
    cr.position.y=baseH+roofH+topH+crH/2; g.add(cr);
    const kPot=new THREE.Mesh(new THREE.SphereGeometry(0.45,8,6),mG);
    kPot.position.y=baseH+roofH+topH+crH+0.4; g.add(kPot);
    const cols=b.isHero?4:3, colH=roofH*0.88;
    const colMat=new THREE.MeshMatcapMaterial({color:sL,matcap:mc.stone||mc.warm});
    for (const side of [-1,1])
      for (let i=0;i<cols;i++) {
        const cx=(i/(cols-1)-0.5)*(w-1);
        const col=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.34,colH,7),colMat);
        col.position.set(cx,baseH+colH/2,side*(d/2+0.1)); g.add(col);
      }
  }

  _stupa(g,w,d,h,baseH,mL,mM,mD,mG,gc,b) {
    const drumH=h*0.35;
    const drum=new THREE.Mesh(new THREE.BoxGeometry(w,drumH,d),mM);
    drum.position.set(0,baseH+drumH/2,0); g.add(drum);
    const band=new THREE.Mesh(new THREE.BoxGeometry(w+0.4,0.25,d+0.4),mG);
    band.position.y=baseH+drumH; g.add(band);
    const dR=Math.min(w,d)*0.52;
    const dome=new THREE.Mesh(new THREE.SphereGeometry(dR,12,8,0,Math.PI*2,0,Math.PI/2),mL);
    dome.position.y=baseH+drumH; g.add(dome);
    const hmY=baseH+drumH+dR*0.78;
    const hm=new THREE.Mesh(new THREE.BoxGeometry(dR*0.55,dR*0.35,dR*0.55),mM);
    hm.position.y=hmY; g.add(hm);
    let dY=hmY+dR*0.18, dR2=dR*0.22;
    for (let i=0;i<(b.isHero?6:4);i++) {
      const disc=new THREE.Mesh(new THREE.CylinderGeometry(dR2,dR2*1.1,0.22,10),mG);
      disc.position.y=dY; g.add(disc); dY+=0.28; dR2*=0.82;
    }
    const fin=new THREE.Mesh(new THREE.SphereGeometry(dR2*1.2,8,6),mG);
    fin.position.y=dY+0.18; g.add(fin);
  }

  // ── TREES — scaled 2.5x positions ─────────────────────────────────────────
  _buildTrees() {
    const tg = window._toonGrad;
    const S = 2.5; // world scale
    const leafColors = [0x336633,0x447744,0x558844,0x66aa33,0x228833,0x4a8833];

    // Dense tree placement around each temple + along roads (scaled positions)
    const positions = [
      // Around central island
      ...[7,7,-7,7,7,-7,-7,-7,11,0,-11,0,0,11,0,-11,14,5,-14,5,14,-5,-14,-5]
        .reduce((a,v,i)=>i%2===0?a.concat([[v,null]]):a.map((p,j)=>j===a.length-1?[p[0],v]:p),[])
        .filter(([x,z])=>x!==null&&z!==null)
        .map(([x,z])=>[x*S, z*S]),

      // Main boulevards (scaled)
      ...[ [50,12],[-50,12],[50,-12],[-50,-12],[87,12],[-87,12],[87,-12],[-87,-12],
           [125,12],[-125,12],[125,-12],[-125,-12],[165,12],[-165,12],[165,-12],[-165,-12],
           [50,-47],[-50,-47],[50,-23],[-50,-23],
           [50,155],[-50,155],[100,155],[-100,155],
           [20,-155],[-20,-155],[87,-155],[-87,-155],
      ],

      // Hero zone
      ...[[55,-35],[-55,-35],[110,-45],[-110,-45],[110,-22],[-110,-22]],

      // Temple surrounds — flat [x,z,x,z,...] pairs converted to [[x,z],...]
      ...(() => {
        const flat = [
          45,-35, 60,-22, 30,-22,      // surya-dwara
          28,50,  15,40,  40,40,       // vishwakarma
          65,-48, 50,-50, 70,-28,      // akasha-mandapa
          65,18,  45,18,  70,0,        // setu-nagara
          -65,-32,-45,-32,-70,-12,     // brahma-kund
          -50,45, -30,45, -55,25,      // lakshmi-prasad
          0,65,   15,60,  -15,60,      // pura-stambha
          -38,-48,-18,-48,-38,-28,     // maya-sabha
          0,-65,  15,-65, -15,-65,     // jyotish-vedha
          -65,18, -45,18, -70,0,       // vayu-rath
          -32,-72,-12,-72,-22,-82,     // saraswati-vihar
          32,-72,  12,-72,  22,-82,    // gurukul-ashram
        ];
        const pairs = [];
        for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i+1]]);
        return pairs;
      })(),
    ];

    positions.forEach(([x,z]) => {
      if (!x || !z) return;
      const h = 1.5 + Math.random()*1.5;
      const r = 1.2 + Math.random()*0.8;
      const isBlossom = Math.random() > 0.4;
      const lColor = leafColors[Math.floor(Math.random()*leafColors.length)];
      const lMat = new THREE.MeshToonMaterial({ color: lColor, gradientMap: tg });

      const tg2 = new THREE.Group(); tg2.position.set(x, 0, z);
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.3, h*1.3, 0.3),
        new THREE.MeshToonMaterial({ color: 0x6a4422, gradientMap: tg }));
      trunk.position.y = h*0.65; tg2.add(trunk);

      let leafMesh;
      if (isBlossom) {
        leafMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), lMat);
        leafMesh.position.y = h*1.3+r*0.7;
      } else {
        leafMesh = new THREE.Mesh(new THREE.ConeGeometry(r*0.8, r*2.2, 6), lMat);
        leafMesh.position.y = h*1.3+r*0.9;
      }
      leafMesh.userData.baseY = leafMesh.position.y;
      tg2.add(leafMesh);
      this.scene.add(tg2);
      this.trees.push({
        group:tg2, leaf:leafMesh, shakeT:0,
        baseX:x, baseZ:z, r:r+0.5,
        windPhase:Math.random()*Math.PI*2,
        windAmpX:0.02+Math.random()*0.015,
        windAmpZ:0.015+Math.random()*0.01,
        windFreq:0.4+Math.random()*0.2,
      });
    });
  }

  // ── LAMPS — along roads (scaled 2.5x) ─────────────────────────────────────
  _buildLamps() {
    const mc = window._matcaps || {};
    const poleMat = new THREE.MeshMatcapMaterial({ color:0x554477, matcap:mc.purple||mc.cool });
    const headMat = new THREE.MeshBasicMaterial({ color:0xffeeaa });

    const positions = [
      // Central island
      [27,0],[-27,0],[0,27],[0,-27],[20,20],[-20,20],[20,-20],[-20,-20],
      // Along main E-W boulevard z=0
      [90,5],[-90,5],[90,-5],[-90,-5],[150,5],[-150,5],[150,-5],[-150,-5],
      // Hero zone
      [10,-55],[-10,-55],[10,-38],[-10,-38],
      // South boulevard
      [60,108],[-60,108],[120,108],[-120,108],
      // Education
      [20,-158],[-20,-158],
    ];

    positions.forEach(([x,z]) => {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2,6,0.2), poleMat);
      pole.position.set(x, 3, z); this.scene.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,1), poleMat);
      arm.position.set(x, 6.2, z+0.5); this.scene.add(arm);
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,0.65,6), poleMat);
      housing.position.set(x, 6.3, z+1.0); this.scene.add(housing);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.35,0.38), headMat);
      glow.position.set(x, 6.3, z+1.0); this.scene.add(glow);
      const lampLt = this._ptLight(0xffeeaa, this._isNight?2.8:0, 16, [x,6.3,z+1.0]);
      lampLt.userData.isLampLight = true;
      this.scene.add(lampLt);
    });
  }

  // ── GRASS PATCHES ──────────────────────────────────────────────────────────
  _buildGrass() {
    const colors = [0x3a7733,0x4a8833,0x336622,0xccdd44,0x99cc33];
    // Grass along world edges (scaled)
    const positions = [
      [-212,0],[-212,50],[-212,-50],[-212,100],[-212,-100],
      [212,0],[212,50],[212,-50],[212,100],[212,-100],
      [0,-200],[50,-200],[-50,-200],[100,-200],[-100,-200],
      [0,155],[50,155],[-50,155],[100,155],[-100,155],
      // Between roads
      [55,-70],[-55,-70],[130,-70],[-130,-70],
      [55,20],[-55,20],[55,-10],[-55,-10],
      [125,20],[-125,20],[125,-10],[-125,-10],
    ];

    positions.forEach(([x,z]) => {
      const count = 6 + Math.floor(Math.random()*5);
      for (let i = 0; i < count; i++) {
        const gx=x+(Math.random()-0.5)*8, gz=z+(Math.random()-0.5)*8;
        const w=0.15+Math.random()*0.18, h=0.5+Math.random()*0.7;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(w,h,w*0.5),
          new THREE.MeshLambertMaterial({ color: colors[Math.floor(Math.random()*colors.length)] }));
        blade.position.set(gx, h/2, gz); blade.rotation.y=Math.random()*Math.PI;
        this.scene.add(blade);
      }
    });
  }

  // ── ROAD DECORATIONS — stones, markers near roads (1-3 units from road) ────
  _buildRoadDecorations() {
    const stoneMat = new THREE.MeshToonMaterial({ color:0xbbaa99, gradientMap:window._toonGrad });
    // Small stones along the sides of main roads
    const stoneSpots = [
      [25,0],[25,-35],[-25,0],[-25,-35],[25,60],[-25,60],
      [50,-95],[-50,-95],[0,-130],[50,-130],[-50,-130],
    ];
    stoneSpots.forEach(([x,z]) => {
      for (let i = 0; i < 3; i++) {
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3+Math.random()*0.2, 0), stoneMat);
        stone.position.set(x+(Math.random()-0.5)*4, 0.3, z+(Math.random()-0.5)*4);
        stone.rotation.y = Math.random()*Math.PI;
        this.scene.add(stone);
      }
    });
  }

  // ── PROXIMITY DETECTION ────────────────────────────────────────────────────
  checkProximity(carX, carZ) {
    const PROX = 32;
    let closest = null, closestDist = PROX;
    (window.CITY_DATA?.buildings || []).forEach(b => {
      // Use roadPos if available (closer to road = easier to approach)
      const rx = b.roadPos ? b.roadPos[0] : b.pos[0];
      const rz = b.roadPos ? b.roadPos[1] : b.pos[1];
      const d  = Math.hypot(carX-rx, carZ-rz);
      if (d < closestDist) { closestDist=d; closest=b; }
    });
    const newId = closest ? closest.id : null;
    if (newId !== this._proximityId) {
      this._proximityId = newId;
      this.events.emit('proximityChange', closest);
    }
    return closest;
  }

  // ── AMBIENT UPDATES ────────────────────────────────────────────────────────
  updateWindSway(now) {
    this.trees.forEach(tr => {
      if (tr.shakeT > 0) {
        const shake = Math.sin(now*22)*tr.shakeT*0.22;
        tr.leaf.rotation.x = shake; tr.leaf.rotation.z = shake*0.7;
        tr.shakeT = Math.max(0, tr.shakeT-0.025);
      } else {
        const ph = now*tr.windFreq+tr.windPhase;
        tr.leaf.rotation.x = Math.sin(ph)*tr.windAmpX;
        tr.leaf.rotation.z = Math.sin(ph*0.73+1)*tr.windAmpZ;
      }
    });
  }

  updateBuildingEntities(carX, carZ, now) {
    this.buildingMeshes.forEach(({ group, building }) => {
      const dist = Math.hypot(carX-building.pos[0], carZ-building.pos[1]);

      // Presence scale — temple grows slightly as you approach
      const presTarget = 1.0 + Math.max(0, 1-dist/65)*0.065;
      if (!group._presY) group._presY = 1.0;
      group._presY += (presTarget-group._presY)*0.04;
      const pulse = 1 + Math.sin(now*0.65*Math.PI*2)*0.003;
      group.scale.set(pulse, pulse*group._presY, pulse);

      // Proximity glow ring fades in when close
      group.children.forEach(c => {
        if (c.userData.isProxRing) {
          const targetOp = dist < 45 ? Math.max(0,(45-dist)/45)*0.45 : 0;
          c.material.opacity += (targetOp-c.material.opacity)*0.08;
        }
        if (c.userData.heroRing) c.rotation.z = now*(0.45+c.userData.ri*0.22);
        if (c.userData.isOrb)    c.rotation.y = now*0.9;
      });
    });
  }
}
