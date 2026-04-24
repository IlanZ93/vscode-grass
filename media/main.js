(function () {
  'use strict';

  const vscode = acquireVsCodeApi();
  const container = document.getElementById('grass-root');
  vscode.postMessage({ type: 'ready' });

  let currentStage = null;
  let lastAliveStage = 'normal';
  let currentSeason = 'spring';
  let devMode = false;
  let isAnimating = false;

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

  // Draw a pixel-art sprite. pixels = [[col, row, '#color'], ...]
  function pixelSvg(pixels, cols, rows, P) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${cols * P} ${rows * P}`);
    svg.style.width  = `${cols * P}px`;
    svg.style.height = `${rows * P}px`;
    svg.style.imageRendering = 'pixelated';
    svg.style.display = 'block';
    for (const [c, r, color] of pixels) {
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', c * P);
      rect.setAttribute('y', r * P);
      rect.setAttribute('width',  P);
      rect.setAttribute('height', P);
      rect.setAttribute('fill', color);
      svg.appendChild(rect);
    }
    return svg;
  }

  // ===================== GRASS BLADES =====================
  // Each blade = thin vertical strip of pixels, leaning left/right.
  // Stage controls height and color.

  // Base colors per stage — seasons tint these
  const STAGE_CONFIG_BASE = {
    dead:   { h: [4,  6],  c: ['#9b8560','#b09a70','#7a6040','#c0aa80'] },
    sprout: { h: [3,  5],  c: ['#5abf3a','#4aad2e','#6acf48','#3d9a25'] },
    short:  { h: [6,  9],  c: ['#3dae28','#4ec032','#2e9a1e','#5ad040'] },
    normal: { h: [10, 14], c: ['#2e9c1a','#3ab024','#267a14','#48c030'] },
    tall:   { h: [16, 22], c: ['#267814','#1e660e','#2e8c1a','#1a6c10'] },
    jungle: { h: [22, 30], c: ['#1a6210','#14480a','#205818','#0e3a06'] },
  };

  // Season color palettes override (non-dead stages)
  const SEASON_COLORS = {
    spring: { // Bright fresh green, pink tints
      sprout: ['#6ad048','#58c038','#7adc54','#4aae28'],
      short:  ['#4ec832','#60d844','#3ab020','#6ae050'],
      normal: ['#38b820','#4acc30','#2c9c18','#58d840'],
      tall:   ['#30a018','#228810','#3ab020','#1e8010'],
      jungle: ['#209010','#187808','#28a018','#106008'],
    },
    summer: { // Deep vivid green, more saturated
      sprout: ['#5ad040','#48bc2e','#6ae04e','#38a020'],
      short:  ['#3cc020','#50d434','#2aac10','#60e040'],
      normal: ['#28a810','#38bc20','#1c9008','#48d028'],
      tall:   ['#209010','#147808','#289818','#0e6c04'],
      jungle: ['#147008','#0c5804','#1a8010','#084802'],
    },
    autumn: { // Yellower, brownish tints
      sprout: ['#8ab830','#9ac428','#78a428','#aad038'],
      short:  ['#7aaa20','#8cbc28','#689818','#9acc30'],
      normal: ['#6a9818','#7cac20','#588810','#8abe28'],
      tall:   ['#5a8810','#4a7808','#688c14','#3e6808'],
      jungle: ['#486c08','#385c04','#587810','#2c5004'],
    },
    winter: { // Desaturated, pale blue-grey tints, white highlights
      sprout: ['#a0b890','#b0c8a0','#8ea880','#c0d8b0'],
      short:  ['#8cb080','#9cc090','#7aa070','#acd098'],
      normal: ['#78a068','#88b078','#688e58','#98c088'],
      tall:   ['#688c58','#587c48','#789864','#486840'],
      jungle: ['#506840','#405830','#5c7848','#304828'],
    },
  };

  function getStageConfig(stage) {
    const base = STAGE_CONFIG_BASE[stage];
    if (stage === 'dead' || !SEASON_COLORS[currentSeason]) return base;
    const sc = SEASON_COLORS[currentSeason][stage];
    if (!sc) return base;
    // Winter: randomly inject white/pale highlight pixels
    const colors = currentSeason === 'winter' ? [...sc, '#dce8e0', '#e8f0ec'] : sc;
    return { h: base.h, c: colors };
  }

  function createPixelBlade(stage, colorStage) {
    const hCfg = getStageConfig(stage) || getStageConfig('normal');
    const cCfg = getStageConfig(colorStage || stage) || hCfg;
    const cfg  = { h: hCfg.h, c: cCfg.c };
    const h   = randInt(cfg.h[0], cfg.h[1]);
    const P   = 2;
    const W   = 3; // sprite width in pixels
    const pixels = [];

    // lean: -1=left  0=straight  1=right
    const lean   = randInt(-1, 1);
    const dark   = cfg.c[randInt(0, 1)];
    const light  = cfg.c[randInt(2, 3)];

    for (let row = 0; row < h; row++) {
      const progress = row / (h - 1); // 0=base 1=tip
      // column shift increases towards tip for leaning blades
      let col;
      if (lean === 0)       col = 1;
      else if (lean ===  1) col = Math.round(progress * 2);
      else                  col = Math.round((1 - progress) * 2);
      col = Math.min(Math.max(col, 0), W - 1);

      const color = progress < 0.5 ? dark : light;
      const svgRow = h - 1 - row; // flip: row 0 = bottom
      pixels.push([col, svgRow, color]);
      // double-width at base for thickness
      if (progress < 0.35 && col + 1 < W) pixels.push([col + 1, svgRow, dark]);
    }

    const svg = pixelSvg(pixels, W, h, P);
    svg.setAttribute('class', 'grass-blade');
    return svg;
  }

  // ===================== FLOWER =====================
  function createPixelFlower(petalColor) {
    const P = 2;
    const stem = '#2e7a18';
    const mid  = '#ffeb3b';
    const stemH = randInt(5, 9);
    const total = stemH + 3; // head takes 3 rows at top
    const pixels = [];
    for (let r = 3; r < total; r++) pixels.push([1, r, stem]);
    // 5-pixel cross head
    pixels.push([1, 0, petalColor]);
    pixels.push([0, 1, petalColor], [2, 1, petalColor]);
    pixels.push([1, 1, mid]);
    pixels.push([1, 2, petalColor]);
    const svg = pixelSvg(pixels, 3, total, P);
    svg.setAttribute('class', 'flower');
    return svg;
  }

  // ===================== GROUND =====================
  function createGround(widthPx) {
    const P   = 2;
    const cols = Math.ceil(widthPx / P);
    const rows = 4;
    const dirt = ['#5c3a1e','#4e3018','#6a4224','#3e2610','#523016'];
    const pixels = [];
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++)
        pixels.push([c, r, dirt[randInt(0, dirt.length - 1)]]);
    const svg = pixelSvg(pixels, cols, rows, P);
    svg.setAttribute('class', 'ground-strip');
    svg.style.position = 'absolute';
    svg.style.bottom   = '0';
    svg.style.left     = '0';
    return svg;
  }

  // Dead palette for recoloring existing blades
  const DEAD_COLORS = ['#9b8560','#b09a70','#7a6040','#c0aa80'];



  // ===================== GENERATE SCENE =====================
  function generateGrass(stage) {
    const isDead = stage === 'dead';
    if (!isDead) lastAliveStage = stage;
    const heightStage = isDead
      ? ((lastStateData?.lastAliveStage) || lastAliveStage || 'normal')
      : stage;
    const colorStage  = isDead ? 'dead' : stage;

    container.querySelectorAll('.grass-blade,.flower,.ground-strip').forEach(el => el.remove());
    container.className = `grass-container grass--${stage}`;

    const w = container.offsetWidth || 220;
    container.appendChild(createGround(w));

    // Dense fill: one blade every ~2px
    const count = Math.ceil(w / 2);

    for (let i = 0; i < count; i++) {
      const blade  = createPixelBlade(heightStage, colorStage);
      const bladeW = parseInt(blade.style.width) || 6;
      blade.style.position = 'absolute';
      blade.style.left     = `${rand(0, w - bladeW)}px`;
      blade.style.bottom   = `${8 + randInt(0, 2)}px`;
      blade.style.animationDuration = `${rand(2, 5)}s`;
      container.appendChild(blade);
    }

    if (!isDead && (stage === 'tall' || stage === 'jungle')) {
      const palettes = ['#ffffff','#ff69b4','#9370db','#ffcc44'];
      const n = stage === 'jungle' ? 10 : 6;
      for (let i = 0; i < n; i++) {
        const flower = createPixelFlower(palettes[randInt(0, palettes.length - 1)]);
        flower.style.position = 'absolute';
        flower.style.left     = `${rand(4, w - 10)}px`;
        flower.style.bottom   = `${8 + randInt(0, 2)}px`;
        container.appendChild(flower);
      }
    }
  }

  // ===================== TOUCH =====================
  function animateTouchAt(clientX) {
    const rect = container.getBoundingClientRect();
    const relX = clientX - rect.left;
    container.querySelectorAll('.grass-blade').forEach(blade => {
      const bx   = parseFloat(blade.style.left);
      const dist = Math.abs(bx - relX);
      if (dist < 45) {
        const dir = bx < relX ? -1 : 1;
        const deg = dir * Math.max(8, 35 - dist * 0.7);
        blade.style.transition = 'transform 0.08s ease-out';
        blade.style.transform  = `rotate(${deg}deg)`;
        setTimeout(() => {
          blade.style.transition = 'transform 0.6s ease-in-out';
          blade.style.transform  = '';
        }, 150);
      }
    });
  }

  container.addEventListener('click', e => {
    animateTouchAt(e.clientX);
    vscode.postMessage({ type: 'touch' });
  });
  container.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const r = container.getBoundingClientRect();
      animateTouchAt(r.left + r.width / 2);
      vscode.postMessage({ type: 'touch' });
    }
  });

  // ===================== WATERING CAN (pixel art) =====================
  // Inspired by classic pixel art: trapezoidal blue body, round handle arc,
  // thin spout going upper-right with small rose tip.
  // 20 cols x 16 rows, P=3
  function createWateringCan() {
    const P  = 3;
    const B  = '#4a9ec0'; // body blue
    const BD = '#2a6e90'; // body dark / shadow
    const BH = '#7acce0'; // highlight
    const H  = '#2a5878'; // handle
    const S  = '#3a8aaa'; // spout
    const SD = '#1a5870'; // spout dark
    const R  = '#2a7090'; // rose tip

    const pixels = [];

    // Body: rows 6-11 (6 rows, was 9), cols 2-11
    for (let r = 6; r <= 11; r++) {
      for (let c = 2; c <= 11; c++) {
        const shade = (c === 2 || r === 11) ? BD : B;
        pixels.push([c, r, shade]);
      }
    }
    // Highlight stripe top
    for (let c = 3; c <= 7; c++) pixels.push([c, 6, BH]);

    // Handle arc: thick (2px wide), cols 2-7, rows 1-5
    pixels.push(
      [3, 5, H], [2, 5, H],
      [2, 4, H], [2, 3, H],
      [3, 2, H], [4, 2, H],
      [5, 2, H], [6, 2, H],
      [6, 3, H], [6, 4, H],
      [7, 3, H], [7, 4, H], [7, 5, H],
      [3, 4, H], [3, 3, H],
    );

    // Spout: thick (2px), from col 12 row 9, going upper-right
    pixels.push(
      [12, 9, S], [12, 8, S], [13, 8, S],
      [13, 7, S], [14, 7, S], [14, 6, S],
      [15, 6, S], [15, 5, S], [16, 5, S],
      [16, 4, SD], [17, 4, SD], [17, 3, SD],
      [18, 3, SD], [18, 4, SD],
      [13, 9, S], [14, 8, S], [15, 7, S], [16, 6, SD],
    );
    // Rose (sprinkle head)
    pixels.push([17, 5, R], [18, 5, R], [18, 6, R], [19, 5, R], [17, 6, R]);

    const svg = pixelSvg(pixels, 20, 14, P);
    svg.setAttribute('class', 'watering-can');
    svg.style.position = 'absolute';
    svg.style.bottom   = '28px';
    return svg;
  }

  function createWaterDrop(x, y) {
    const P = 2;
    const C = '#6bb6ff';
    const pixels = [
      [1,0,C],
      [0,1,C],[1,1,'#aaddff'],[2,1,C],
      [0,2,C],[1,2,C],[2,2,C],
      [1,3,C],
    ];
    const svg = pixelSvg(pixels, 3, 4, P);
    svg.style.position    = 'fixed';
    svg.style.left        = `${x}px`;
    svg.style.top         = `${y}px`;
    svg.style.pointerEvents = 'none';
    document.body.appendChild(svg);
    svg.animate(
      [{ transform: 'translateY(0)', opacity: 1 },
       { transform: 'translateY(36px)', opacity: 0 }],
      { duration: 550 }
    ).onfinish = () => svg.remove();
  }

  function animateWatering(callback) {
    if (isAnimating) return;
    isAnimating = true;
    const can = createWateringCan();
    container.appendChild(can);
    const w = container.offsetWidth;
    const start = performance.now();
    const dur   = 2400;

    function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      const x = -60 + t * (w + 100);
      can.style.left = `${x}px`;
      can.style.transform = (t > 0.25 && t < 0.85) ? 'rotate(15deg)' : 'rotate(0deg)';
      if (t < 1) { requestAnimationFrame(tick); return; }
      can.remove();
      isAnimating = false;
      callback();
    }
    requestAnimationFrame(tick);

    const dropIv = setInterval(() => {
      if (!can.isConnected) { clearInterval(dropIv); return; }
      const r = can.getBoundingClientRect();
      if (r.width === 0) return;
      createWaterDrop(r.right - 6, r.bottom - 2);
    }, 85);
    setTimeout(() => clearInterval(dropIv), dur);
  }

  // ===================== LAWN MOWER (pixel art) =====================
  // Inspired by image: orange/tan body, 4 black wheels, wooden handle diagonal up-left.
  // 22 cols x 18 rows, P=3
  function createMower() {
    // Mower moves LEFT to RIGHT, so handle is on the LEFT (pushed from behind).
    // 22 cols x 17 rows, P=3. Handle at cols 0-4 upper-left, body cols 4-19, wheels cols 4-8 and 15-19.
    const P   = 3;
    const BOD = '#c8783a';
    const BDD = '#8a4e1e';
    const BDH = '#e8a060';
    const ENG = '#888888';
    const EGD = '#555555';
    const T   = '#1c1c1c';
    const TH  = '#444444';
    const WD  = '#7a4e1e';
    const WDL = '#a07040';
    const GRP = '#cc2020';

    const pixels = [];

    // Body chassis: cols 4-19, rows 9-12 (4 rows, was 6)
    for (let c = 4; c <= 19; c++)
      for (let r = 9; r <= 12; r++)
        pixels.push([c, r, (r === 12 || c === 19) ? BDD : BOD]);
    for (let c = 4; c <= 18; c++) pixels.push([c, 9, BDH]);

    // Engine/hood: cols 8-15, rows 6-8 (3 rows)
    for (let c = 8; c <= 15; c++)
      for (let r = 6; r <= 8; r++)
        pixels.push([c, r, r === 6 ? EGD : ENG]);

    // Left wheel: cols 4-7, rows 11-14 (4 rows, was 6)
    for (let c = 4; c <= 7; c++)
      for (let r = 11; r <= 14; r++)
        pixels.push([c, r, T]);
    pixels.push([5,11,TH],[6,11,TH],[5,14,TH],[6,14,TH]);
    pixels.push([4,12,TH],[4,13,TH],[7,12,TH],[7,13,TH]);

    // Right wheel: cols 15-18, rows 11-14 (4 rows, was 6)
    for (let c = 15; c <= 18; c++)
      for (let r = 11; r <= 14; r++)
        pixels.push([c, r, T]);
    pixels.push([16,11,TH],[17,11,TH],[16,14,TH],[17,14,TH]);
    pixels.push([15,12,TH],[15,13,TH],[18,12,TH],[18,13,TH]);

    // Handle: from col 4 row 9, going upper-LEFT, taller (reaches row 0)
    pixels.push(
      [4, 9, WD], [3, 9, WD],
      [3, 8, WD], [2, 7, WDL],
      [2, 6, WD], [1, 5, WDL],
      [1, 4, WD], [0, 3, WDL],
      [0, 2, WD], [0, 1, WD],
      [1, 0, GRP], [0, 0, GRP],
    );

    const svg = pixelSvg(pixels, 20, 15, P);
    svg.setAttribute('class', 'lawn-mower');
    svg.style.position = 'absolute';
    svg.style.bottom   = '8px';
    return svg;
  }

  function spawnGrassParticles(bladeLeft) {
    const P = 2;
    for (let i = 0; i < 3; i++) {
      const color = ['#4a8a3a','#5aaa4a','#3a7a2a'][i];
      const svg = pixelSvg([[0,0,color],[1,0,color]], 2, 1, P);
      svg.style.position = 'absolute';
      svg.style.left     = `${bladeLeft}px`;
      svg.style.bottom   = '20px';
      container.appendChild(svg);
      svg.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${(Math.random()-0.5)*40}px,-${20+Math.random()*30}px) rotate(${Math.random()*360}deg)`, opacity: 0 }
      ], { duration: 800 }).onfinish = () => svg.remove();
    }
  }

  function createGoat() {
    // Faces RIGHT: tail at left (col 0), head at right (cols 9-12)
    const P = 3;
    const W  = '#e8e0d0';
    const WD = '#b8b0a0';
    const BK = '#222222';
    const PK = '#e08080';
    const BR = '#8a6030';
    const pixels = [
      // Tail (left, raised)
      [0,1,W],[0,2,WD],[1,3,WD],
      // Body: cols 1-9, rows 1-4
      [1,1,W],[2,1,W],[3,1,W],[4,1,W],[5,1,W],[6,1,W],[7,1,W],[8,1,W],[9,1,WD],
      [1,2,W],[2,2,W],[3,2,W],[4,2,W],[5,2,W],[6,2,W],[7,2,W],[8,2,W],[9,2,WD],
      [1,3,WD],[2,3,W],[3,3,W],[4,3,W],[5,3,W],[6,3,W],[7,3,W],[8,3,WD],
      [2,4,WD],[3,4,W],[4,4,W],[5,4,W],[6,4,W],[7,4,WD],
      // Udder
      [3,5,PK],[4,5,PK],[5,5,PK],
      // Neck: short diagonal down-right
      [9,2,W],[10,3,W],[10,4,W],
      // Head: cols 10-12, rows 4-7 (museau même niveau que pattes)
      [10,4,W],[11,4,W],[12,4,WD],
      [10,5,W],[11,5,W],[12,5,WD],
      [10,6,W],[11,6,W],
      [10,7,PK],[11,7,PK],
      // Eye
      [11,5,BK],
      // Horn
      [11,2,BR],[12,2,BR],[11,3,BR],
      // Legs: all 4 same length, bottom row 7
      [2,5,WD],[3,5,WD],[6,5,WD],[7,5,WD],
      [2,6,W],[3,6,W],[6,6,W],[7,6,W],
      [2,7,WD],[3,7,WD],[6,7,WD],[7,7,WD],
    ];
    const svg = pixelSvg(pixels, 14, 8, 5);
    svg.setAttribute('class', 'lawn-mower');
    svg.style.position = 'absolute';
    svg.style.bottom = '8px';
    return svg;
  }

  function createUnicorn() {
    // Faces RIGHT, head down. Slim horse silhouette, straight horn, rainbow mane.
    const P  = 6;
    const W  = '#f4eeff'; // white-lavender body
    const S  = '#cebee8'; // shadow
    const HN = '#ffd700'; // gold horn
    const M1 = '#ff88c8'; // pink mane
    const M2 = '#aa88ff'; // purple mane
    const M3 = '#66ccff'; // blue mane
    const BK = '#1a1a1a'; // eye
    const PK = '#ffaacc'; // nose
    const HV = '#b898d8'; // hooves
    const pixels = [
      // Tail (rainbow, far left, rows 2-5)
      [0,2,M1],[0,3,M2],[0,4,M3],[0,5,M1],
      // Body (cols 1-9, rows 2-5)
      [1,2,W],[2,2,W],[3,2,W],[4,2,W],[5,2,W],[6,2,W],[7,2,W],[8,2,W],[9,2,S],
      [1,3,W],[2,3,W],[3,3,W],[4,3,W],[5,3,W],[6,3,W],[7,3,W],[8,3,W],[9,3,S],
      [1,4,S],[2,4,W],[3,4,W],[4,4,W],[5,4,W],[6,4,W],[7,4,W],[8,4,S],
      [2,5,S],[3,5,W],[4,5,W],[5,5,W],[6,5,W],[7,5,S],
      // Rainbow mane along top of body
      [2,2,M1],[3,2,M2],[4,2,M3],[5,2,M1],
      // Back legs
      [2,6,W],[3,6,W],[2,7,W],[3,7,W],[2,8,HV],[3,8,HV],
      // Front legs
      [6,6,W],[7,6,W],[6,7,W],[7,7,W],[6,8,HV],[7,8,HV],
      // Neck (cols 9-11, rows 1-4, going up-right then down)
      [9,1,W],[10,1,W],[11,1,W],
      [9,2,W],[10,2,W],[11,2,W],
      [10,3,W],[11,3,W],
      // Rainbow mane on neck
      [9,1,M2],[10,1,M3],[11,1,M1],
      // Horn (diagonal up-right from forehead)
      [13,3,HN],[14,2,HN],[15,1,HN],[16,0,HN],
      // Head (cols 11-14, rows 3-6, pointing down-right)
      [11,4,W],[12,4,W],[13,4,W],[14,4,S],
      [11,5,W],[12,5,W],[13,5,W],[14,5,S],
      [11,6,W],[12,6,W],[13,6,W],
      // Nose
      [11,7,PK],[12,7,PK],[13,7,PK],
      [11,7,BK],[13,7,BK],
      // Eye
      [12,5,BK],
      // Ear
      [14,4,PK],[15,4,PK],[15,5,PK],
    ];
    const svg = pixelSvg(pixels, 17, 9, 6);
    svg.setAttribute('class', 'lawn-mower');
    svg.style.position = 'absolute';
    svg.style.bottom = '8px';
    return svg;
  }

  function createCow() {
    // Faces RIGHT, head down eating grass
    const P  = 4;
    const W  = '#f0ece0'; // white
    const S  = '#c8c4b0'; // shadow/underside
    const BK = '#1a1a1a'; // black spots
    const PK = '#e88888'; // pink nose/udder
    const GR = '#888880'; // dark grey hooves
    const pixels = [
      // Tail (far left)
      [0,2,S],[0,3,S],
      // Body rows 1-5, cols 1-10
      [1,1,W],[2,1,W],[3,1,W],[4,1,W],[5,1,W],[6,1,W],[7,1,W],[8,1,W],[9,1,W],[10,1,S],
      [1,2,W],[2,2,BK],[3,2,BK],[4,2,W],[5,2,W],[6,2,BK],[7,2,BK],[8,2,W],[9,2,W],[10,2,S],
      [1,3,W],[2,3,BK],[3,3,W],[4,3,W],[5,3,W],[6,3,W],[7,3,BK],[8,3,W],[9,3,W],[10,3,S],
      [1,4,W],[2,4,W],[3,4,W],[4,4,BK],[5,4,W],[6,4,W],[7,4,W],[8,4,W],[9,4,S],
      [1,5,S],[2,5,W],[3,5,W],[4,5,W],[5,5,W],[6,5,W],[7,5,W],[8,5,S],
      // Udder
      [3,6,PK],[4,6,PK],[5,6,PK],[6,6,PK],
      // Front legs (right side of body)
      [7,6,W],[8,6,W],
      [7,7,W],[8,7,W],
      [7,8,GR],[8,8,GR],
      // Back legs (left side of body)
      [2,6,W],[3,6,W],
      [2,7,W],[3,7,W],
      [2,8,GR],[3,8,GR],
      // Neck going down-right
      [10,2,W],[11,2,W],
      [11,3,W],[12,3,W],
      [12,4,W],[13,4,W],
      // Head down, cols 11-15, rows 5-8
      [11,5,W],[12,5,W],[13,5,W],[14,5,W],[15,5,S],
      [11,6,W],[12,6,W],[13,6,W],[14,6,W],[15,6,S],
      [11,7,W],[12,7,W],[13,7,W],[14,7,W],
      // Nose/mouth
      [11,8,PK],[12,8,PK],[13,8,PK],[14,8,PK],
      [11,8,BK],[13,8,BK],
      // Eye
      [13,6,BK],
      // Horn
      [13,4,S],[14,4,S],
      // Ear
      [15,6,PK],[16,6,PK],[16,7,PK],
    ];
    const svg = pixelSvg(pixels, 17, 9, 5);
    svg.setAttribute('class', 'lawn-mower');
    svg.style.position = 'absolute';
    svg.style.bottom = '8px';
    return svg;
  }

  function animateMowing(callback) {
    if (isAnimating) return;
    isAnimating = true;
    // 1/10 chance: goat or cow instead of mower
    let mower;
    const roll = Math.random();
    const isAnimal = roll < 0.105;
    if (roll < 0.01) { mower = createUnicorn(); trackVisitor('unicorn'); }
    else if (roll < 0.08) { mower = createGoat(); trackVisitor('goat'); }
    else if (roll < 0.15) { mower = createCow(); trackVisitor('cow'); }
    else mower = createMower();
    container.appendChild(mower);
    const w = container.offsetWidth;
    const start = performance.now();
    const dur   = 3200;
    let   vib   = 0;

    function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      const x = -70 + t * (w + 130);
      vib = vib === 0 ? 1 : (vib === 1 ? -1 : 0);
      mower.style.left      = `${x}px`;
      mower.style.transform = isAnimal ? '' : `translateY(${vib}px)`;
      if (t < 1) { requestAnimationFrame(tick); return; }
      mower.remove();
      isAnimating = false;
      callback();
    }
    requestAnimationFrame(tick);

    const blades = Array.from(container.querySelectorAll('.grass-blade'));
    const mowerWidth = 36;
    blades.forEach(blade => {
      const bx = parseFloat(blade.style.left);
      // time when mower front reaches this blade
      const tHit = (bx + 70 - mowerWidth) / (w + 130);
      const delay = Math.max(0, tHit * dur);
      setTimeout(() => {
        if (!isAnimal) spawnGrassParticles(bx);
        blade.style.transition = 'height 0.15s ease-out';
        blade.style.height     = '8px';
      }, delay);
    });

    setTimeout(() => {
      container.querySelectorAll('.flower').forEach(f =>
        f.animate([{ opacity:1 },{ opacity:0 }], { duration: 200 }).onfinish = () => f.remove()
      );
    }, 300);
  }

  // ===================== BUTTERFLY =====================
  function createButterfly() {
    const P = 3;
    const O = '#ff7043', D = '#c04020', BK = '#111', Y = '#ffcc44';
    const pixels = [
      // Antennae
      [0,0,BK],[6,0,BK],
      [1,1,BK],[5,1,BK],
      // Left upper wing: wide at top, tapers down
      [0,2,O],[1,2,O],[2,2,O],
      [0,3,O],[1,3,Y],[2,3,O],
      [0,4,O],[1,4,O],[2,4,O],
      [1,5,D],[2,5,D],
      // Right upper wing
      [4,2,O],[5,2,O],[6,2,O],
      [4,3,O],[5,3,Y],[6,3,O],
      [4,4,O],[5,4,O],[6,4,O],
      [4,5,D],[5,5,D],
      // Left lower wing: small bump
      [1,6,D],[2,6,D],
      // Right lower wing
      [4,6,D],[5,6,D],
      // Body
      [3,2,BK],[3,3,BK],[3,4,BK],[3,5,BK],[3,6,BK],
    ];
    const svg = pixelSvg(pixels, 7, 7, P);
    svg.setAttribute('class', 'butterfly');
    svg.style.position = 'fixed';
    svg.animate(
      [{ transform:'scaleX(1)' },{ transform:'scaleX(0.3)' },{ transform:'scaleX(1)' }],
      { duration: 240, iterations: Infinity }
    );
    document.body.appendChild(svg);
    trackVisitor('butterfly');
    svg.animate([
      { left:'-5%',  top:`${rand(30,60)}%` },
      { left:'30%',  top:`${rand(15,45)}%`, offset: 0.3 },
      { left:'65%',  top:`${rand(40,65)}%`, offset: 0.65 },
      { left:'105%', top:`${rand(20,50)}%` }
    ], { duration: 6000, easing: 'ease-in-out' }).onfinish = () => svg.remove();
  }

  // dev: 15-30s, prod: 5-10min. Only on tall/jungle, 1/3 chance.
  function scheduleButterflyVisit() {
    const delay = devMode ? rand(15000, 30000) : rand(5*60000, 10*60000);
    setTimeout(() => {
      if ((currentStage === 'tall' || currentStage === 'jungle') && Math.random() < 0.20) createButterfly();
      scheduleButterflyVisit();
    }, delay);
  }
  // Started after first state message so devMode is known

  // Regenerate grass on container resize
  let resizeTimer = null;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (currentStage) generateGrass(currentStage); }, 150);
  }).observe(container);

  // ===================== SNAIL =====================
  function createSnail() {
    // Moves RIGHT: shell on LEFT, body+head extend RIGHT, antennae on RIGHT
    const P   = 3;
    const SH  = '#c8a040';
    const SD  = '#8a6020';
    const SHL = '#e8c060';
    const BD  = '#7a9a30';
    const BDD = '#4a6a10';
    const pixels = [
      // Shell: cols 0-5, rows 0-4
      [1,0,SD],[2,0,SH],[3,0,SH],[4,0,SD],
      [0,1,SD],[1,1,SH],[2,1,SHL],[3,1,SHL],[4,1,SH],[5,1,SD],
      [0,2,SH],[1,2,SHL],[2,2,SD],[3,2,SH],[4,2,SH],[5,2,SD],
      [0,3,SD],[1,3,SH],[2,3,SH],[3,3,SH],[4,3,SH],[5,3,SD],
      [1,4,SD],[2,4,SD],[3,4,SD],[4,4,SD],
      // Body: full width cols 0-9, rows 4-5
      [0,4,BD],[1,4,BD],[2,4,BDD],[3,4,BDD],[4,4,BDD],[5,4,BDD],[6,4,BD],[7,4,BD],[8,4,BD],[9,4,BD],
      [0,5,BDD],[1,5,BD],[2,5,BD],[3,5,BD],[4,5,BD],[5,5,BD],[6,5,BD],[7,5,BD],[8,5,BD],[9,5,BDD],
      // Head protrudes RIGHT past shell (cols 7-9, rows 3-4)
      [7,3,BD],[8,3,BD],[9,3,BD],
      // Antennae on RIGHT
      [8,1,BD],[9,0,BD],
      [9,1,BD],[10,0,BD],
    ];
    const svg = pixelSvg(pixels, 11, 6, P);
    svg.setAttribute('class', 'lawn-mower');
    svg.style.position = 'absolute';
    svg.style.bottom = '8px';
    container.appendChild(svg);
    const w = container.offsetWidth;
    trackVisitor('snail');
    const dur = devMode ? rand(6000, 10000) : rand(18000, 28000);
    svg.animate([
      { left: '-80px' },
      { left: `${w + 80}px` }
    ], { duration: dur, easing: 'linear' }).onfinish = () => svg.remove();
  }

  // dev: 20-40s, prod: 8-15min. Any stage except dead, 1/4 chance.
  function scheduleSnailVisit() {
    const delay = devMode ? rand(20000, 40000) : rand(8*60000, 15*60000);
    setTimeout(() => {
      if (currentStage !== 'dead' && Math.random() < 0.20) createSnail();
      scheduleSnailVisit();
    }, delay);
  }
  // Started after first state message so devMode is known

  // ===================== DEV PANEL =====================
  const devPanel = document.getElementById('dev-panel');
  document.getElementById('dev-butterfly')?.addEventListener('click', () => createButterfly());
  document.getElementById('dev-snail')?.addEventListener('click', () => createSnail());
  document.getElementById('dev-goat')?.addEventListener('click', () => {
    const g = createGoat();
    container.appendChild(g);
    const w = container.offsetWidth;
    g.animate([{ left: '-80px' }, { left: `${w + 80}px` }], { duration: 4000, easing: 'linear' }).onfinish = () => g.remove();
  });
  document.getElementById('dev-cow')?.addEventListener('click', () => {
    const c = createCow();
    container.appendChild(c);
    const w = container.offsetWidth;
    c.animate([{ left: '-100px' }, { left: `${w + 100}px` }], { duration: 4500, easing: 'linear' }).onfinish = () => c.remove();
  });
  document.getElementById('dev-unicorn')?.addEventListener('click', () => {
    const u = createUnicorn();
    container.appendChild(u);
    const w = container.offsetWidth;
    u.animate([{ left: '-100px' }, { left: `${w + 100}px` }], { duration: 4000, easing: 'linear' }).onfinish = () => u.remove();
  });
  document.getElementById('dev-reset-touch')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'devReset' });
  });
  document.getElementById('dev-kill')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'devKill' });
  });
  document.getElementById('dev-season')?.addEventListener('change', (e) => {
    const val = e.target.value;
    vscode.postMessage({ type: 'setSeasonOverride', month: val === '' ? null : parseInt(val) });
  });

  // ===================== ANALYTICS PANEL =====================
  let analyticsOpen = false;

  function trackVisitor(animal) {
    vscode.postMessage({ type: 'visitor', animal });
    if (lastStateData) {
      if (!lastStateData.visitorCounts) lastStateData.visitorCounts = {};
      lastStateData.visitorCounts[animal] = (lastStateData.visitorCounts[animal] ?? 0) + 1;
    }
    if (analyticsOpen) updateAnalytics();
  }
  const analyticsCb    = null; // replaced by btn-analytics
  const analyticsPanel = document.getElementById('analytics-panel');
  let   lastStateData  = null;
  let   lastUi         = null;

  const STAGE_NAMES_DEFAULT = {
    dead: 'DEAD', sprout: 'Sprout', short: 'Short',
    normal: 'Normal', tall: 'Tall', jungle: 'Jungle'
  };
  const STAGE_NEXT_DEFAULT = {
    dead: null, sprout: 'Short', short: 'Normal',
    normal: 'Tall', tall: 'Jungle', jungle: null
  };
  function stageNames() { return (lastUi && lastUi.stageNames) || STAGE_NAMES_DEFAULT; }
  function stageNext()  { return (lastUi && lastUi.stageNext)  || STAGE_NEXT_DEFAULT; }

  function uiFmt(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : '');
  }
  function fmtMs(ms) {
    const u = lastUi;
    if (ms <= 0) return u ? u.fmtNow : 'now';
    const s = Math.ceil(ms / 1000);
    if (s < 60)  return u ? uiFmt(u.fmtSeconds, {s})                        : `${s}s`;
    const m = Math.floor(s / 60), ss = s % 60;
    if (m < 60)  return u ? uiFmt(u.fmtMinutes, {m, ss})                    : `${m}m ${ss}s`;
    const h = Math.floor(m / 60), mm = m % 60;
    if (h < 24)  return u ? uiFmt(u.fmtHours,   {h, mm})                    : `${h}h ${mm}m`;
    const d = Math.floor(h / 24), hh = h % 24;
    return u ? uiFmt(u.fmtDays, {d, hh}) : `${d}d ${hh}h`;
  }

  function computeStage(d, now) {
    const sinceWatered = now - d.lastWatered;
    const sinceMowed = now - d.lastMowed;
    if (sinceWatered > d.deadThresholdMs) return 'dead';
    if (sinceMowed < d.thresholds.short)  return 'sprout';
    if (sinceMowed < d.thresholds.normal) return 'short';
    if (sinceMowed < d.thresholds.tall)   return 'normal';
    if (sinceMowed < d.thresholds.jungle) return 'tall';
    return 'jungle';
  }

  function updateAnalytics() {
    if (!analyticsPanel || !lastStateData) return;
    const d = lastStateData;
    const now = Date.now();

    const sinceMowed   = now - d.lastMowed;
    const sinceWatered = now - d.lastWatered;
    const deadMs       = d.deadThresholdMs - sinceWatered;

    const stage = computeStage(d, now);
    const sNext = stageNext();
    const sNames = stageNames();
    const STAGE_NEXT_EN = { dead: null, sprout: 'short', short: 'normal', normal: 'tall', tall: 'jungle', jungle: null };
    const nextStage = sNext[stage] || null;
    let nextMs = null;
    if (stage !== 'dead' && nextStage) {
      const stageKey = STAGE_NEXT_EN[stage];
      nextMs = stageKey ? d.thresholds[stageKey] - sinceMowed : null;
    }

    const waterPct = stage !== 'dead'
      ? Math.min(100, Math.round(sinceWatered / d.deadThresholdMs * 100))
      : 100;

    const SEASON_ICON = { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' };
    const SEP = '<span class="sep">·</span>';

    // Line 1: stage + next
    const line1 = [];
    const stageLabel = stage === 'dead'
      ? `${sNames['dead'] || 'DEAD'} (${sNames[d.lastAliveStage] || d.lastAliveStage || '?'})`
      : sNames[stage] || stage;
    line1.push(`<span class="stage-label">${SEASON_ICON[d.season] || ''} ${stageLabel}</span>`);
    if (nextMs !== null && nextMs > 0) {
      const nextLabel = lastUi ? uiFmt(lastUi.nextStageIn, {stage: nextStage, time: `<b>${fmtMs(nextMs)}</b>`}) : `${nextStage} in <b>${fmtMs(nextMs)}</b>`;
      line1.push(`<span class="timer-next">${nextLabel}</span>`);
    } else if (stage === 'jungle') {
      line1.push(`<span class="timer-next">${lastUi ? lastUi.jungleMsg : 'Insects might visit, or just mow it.'}</span>`);
    } else if (stage === 'dead') {
      line1.push(`<span class="timer-next">${lastUi ? lastUi.deadMsg : 'Pleaaase give this lawn some water'}</span>`);
    }

    // Line 2: drought + cooldown + totals
    const line2 = [];
    if (stage !== 'dead') {
      const dryStr = lastUi ? uiFmt(lastUi.dryPct, {pct: waterPct, time: `<b>${fmtMs(deadMs)}</b>`}) : `♨️ ${waterPct}% dry <b>${fmtMs(deadMs)}</b>`;
      line2.push(`<span class="timer-next">${dryStr}</span>`);
    }
    line2.push(`<span class="timer-next">🚜 ${d.mowCount ?? 0} 💧 ${d.waterCount ?? 0}</span>`);

    const VISITOR_ICONS = { butterfly: '🦋', snail: '🐌', goat: '🐐', cow: '🐄', unicorn: '🦄' };
    const vc = d.visitorCounts || {};
    const visitorParts = Object.entries(VISITOR_ICONS)
      .filter(([k]) => vc[k] > 0)
      .map(([k, icon]) => `${icon} ${vc[k]}`);

    const line3 = visitorParts.length > 0
      ? [`<span class="timer-next">${visitorParts.join('  ')}</span>`]
      : [];

    const html = [
      `<div>${line1.join(SEP)}</div>`,
      `<div>${line2.join(SEP)}</div>`,
      ...(line3.length ? [`<div>${line3.join('')}</div>`] : []),
    ].join('');

    analyticsPanel.innerHTML = html;
  }

  document.getElementById('btn-analytics')?.addEventListener('click', () => {
    analyticsOpen = !analyticsOpen;
    if (analyticsPanel) {
      analyticsPanel.style.display = analyticsOpen ? 'block' : 'none';
      if (analyticsOpen) updateAnalytics();
    }
  });

  setInterval(() => {
    if (analyticsOpen) updateAnalytics();
    if (lastStateData) {
      const liveStage = computeStage(lastStateData, Date.now());
      if (liveStage !== currentStage) {
        currentStage = liveStage;
        generateGrass(currentStage);
      }
    }
  }, 1000);

  // ===================== COOLDOWN TIMER =====================
  const cooldownEl = document.getElementById('water-cooldown');
  let cooldownEnd = 0;
  let cooldownTick = null;

  function startCooldownDisplay(ms) {
    cooldownEnd = Date.now() + ms;
    if (cooldownTick) clearInterval(cooldownTick);
    cooldownTick = setInterval(() => {
      const remaining = cooldownEnd - Date.now();
      if (remaining <= 0) {
        clearInterval(cooldownTick);
        cooldownTick = null;
        if (cooldownEl) cooldownEl.style.display = 'none';
        return;
      }
      const s = Math.ceil(remaining / 1000);
      const m = Math.floor(s / 60);
      const display = m > 0 ? `${m}m${String(s % 60).padStart(2,'0')}s` : `${s}s`;
      if (cooldownEl) {
        cooldownEl.textContent = lastUi ? uiFmt(lastUi.wateringCooldown, {display}) : `Watering: ${display}`;
        cooldownEl.style.display = 'block';
      }
    }, 500);
  }

  // ===================== MESSAGES =====================
  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
      case 'state': {
        const isFirstState = lastStateData === null;
        lastStateData = msg.data;
        if (msg.ui) {
          lastUi = msg.ui;
          const grassRoot = document.getElementById('grass-root');
          if (grassRoot && msg.ui.ariaLabel) grassRoot.setAttribute('aria-label', msg.ui.ariaLabel);
        }
        devMode = !!msg.data.devMode;
        if (isFirstState) {
          scheduleButterflyVisit();
          scheduleSnailVisit();
        }
        const newSeason = msg.data.season || 'spring';
        const seasonChanged = newSeason !== currentSeason;
        currentSeason = newSeason;
        if (devPanel) devPanel.style.display = devMode ? 'flex' : 'none';
        const newStage = computeStage(msg.data, Date.now());
        if (newStage !== currentStage || seasonChanged || isFirstState) {
          currentStage = newStage;
          generateGrass(currentStage);
        }
        if (analyticsOpen) updateAnalytics();
        if (msg.data.waterCooldownMs > 0) {
          startCooldownDisplay(msg.data.waterCooldownMs);
        } else if (!cooldownTick && cooldownEl) {
          cooldownEl.style.display = 'none';
        }
        break;
      }
      case 'water':
        animateWatering(() => vscode.postMessage({ type: 'waterDone' }));
        break;
      case 'mow':
        animateMowing(() => vscode.postMessage({ type: 'mowDone' }));
        break;
      case 'toggleAnalytics':
        analyticsOpen = !analyticsOpen;
        if (analyticsPanel) {
          analyticsPanel.style.display = analyticsOpen ? 'block' : 'none';
          if (analyticsOpen) updateAnalytics();
        }
        break;
    }
  });

}());
