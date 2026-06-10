"use strict";
let MODE = sessionStorage.getItem("vp") || "recruiter";
const chip = document.getElementById("mode-chip");
if (chip) {
  chip.textContent = MODE.toUpperCase();
  chip.className = MODE;
  chip.style.cursor = 'pointer';
  chip.title = 'Click to switch view mode';
  chip.addEventListener('click', function() {
    MODE = MODE === 'recruiter' ? 'engineer' : 'recruiter';
    sessionStorage.setItem('vp', MODE);
    chip.textContent = MODE.toUpperCase();
    chip.className = MODE;
    window.ORC?.onModeSwitch(MODE);
  });
}
const cur = document.getElementById("cur");
// Cursor: use translate3d (GPU) not left/top (CPU reflow) — zero lag
document.addEventListener(
  "mousemove",
  (e) => {
    cur.style.transform = `translate3d(calc(${e.clientX}px - 50%), calc(${e.clientY}px - 50%), 0)`;
  },
  { passive: true },
);
document.addEventListener("mouseover", (e) => {
  if (e.target.closest("button,a,.px-btn,.hb,.jb-arr,#ob,#os"))
    cur.classList.add("big");
  else cur.classList.remove("big");
});
const ldBar = document.getElementById("ld-bar"),
  ldMsg = document.getElementById("ld-msg"),
  loader = document.getElementById("loader"),
  startScreen = document.getElementById("start-screen");
window.onCityProgress = function (pct, msg) {
  if (ldBar) ldBar.style.width = pct + "%";
  if (ldMsg) ldMsg.textContent = msg || "";
  if (pct >= 100) {
    setTimeout(() => {
      loader.classList.add("fade");
      setTimeout(() => loader.classList.add("gone"), 950);
    }, 400);
  }
};
function hideStart() {
  startScreen.classList.add("gone");
  // Reveal cinematic HUD elements
  setTimeout(() => {
    document.getElementById("game-hud")?.classList.add("hud-visible");
    document.getElementById("hud-tr")?.classList.add("hud-visible");
    document.getElementById("ctrl-hint")?.classList.add("hud-visible");
    document.getElementById("minimap")?.classList.add("hud-visible");
  }, 2000); // after intro starts descending
  // Oracle — city is now live
  window.ORC?.onGameStart();

  if (typeof CityEngine !== "undefined") {
    CityEngine.initAudio();
    CityEngine.triggerIntro();
    // Show skip guide button during narrative phase
    setTimeout(() => {
      const sb = document.getElementById("skip-guide-btn");
      if (
        sb &&
        typeof CityEngine !== "undefined" &&
        CityEngine.narrativePhase === "GUIDED"
      )
        sb.style.display = "";
      // Hide after narrative ends
      const iv = setInterval(() => {
        if (
          typeof CityEngine !== "undefined" &&
          CityEngine.narrativePhase !== "GUIDED" &&
          sb
        ) {
          sb.style.display = "none";
          clearInterval(iv);
        }
      }, 1000);
    }, 8000);
  }
}
// Enter button — explicit listener, stops bubbling to parent
const ssBtn = document.getElementById("ss-enter-btn");
if (ssBtn) {
  ssBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    hideStart();
  });
  ssBtn.addEventListener("touchend", function (e) {
    e.stopPropagation();
    e.preventDefault();
    hideStart();
  });
}
// Click anywhere else on the start screen also works
startScreen.addEventListener("click", function (e) {
  if (!e.target.closest("#ss-enter-btn")) hideStart();
});
startScreen.addEventListener("touchend", function (e) {
  if (!e.target.closest("#ss-enter-btn")) hideStart();
});
const mmCanvas = document.getElementById("mm-canvas"),
  mmCtx = mmCanvas ? mmCanvas.getContext("2d") : null;
function updateMinimap(cx, cz, angle) {
  if (!mmCtx) return;
  const W = 110,
    H = 110;
  mmCtx.clearRect(0, 0, W, H);
  // Item 50: Yantra background — dark base + concentric geometric mandala
  mmCtx.fillStyle = "rgba(8,4,1,.92)";
  mmCtx.fillRect(0, 0, W, H);
  // Outer circle
  mmCtx.save();
  mmCtx.strokeStyle = 'rgba(200,160,60,0.18)';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath(); mmCtx.arc(W/2, H/2, W/2 - 2, 0, Math.PI*2); mmCtx.stroke();
  mmCtx.beginPath(); mmCtx.arc(W/2, H/2, W/2 - 6, 0, Math.PI*2); mmCtx.stroke();
  // 8-pointed star (yantra triangles)
  mmCtx.strokeStyle = 'rgba(180,140,50,0.15)';
  for (let j = 0; j < 2; j++) {
    const r1 = W * 0.32, r2 = W * 0.22, phase = j * Math.PI / 4;
    mmCtx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = phase + (i / 4) * Math.PI * 2;
      const bx = W/2 + Math.cos(a) * r1, by = H/2 + Math.sin(a) * r1;
      const ax = W/2 + Math.cos(a + Math.PI/4) * r2, ay = H/2 + Math.sin(a + Math.PI/4) * r2;
      const cx2 = W/2 + Math.cos(a - Math.PI/4) * r2, cy2 = H/2 + Math.sin(a - Math.PI/4) * r2;
      if (i === 0) mmCtx.moveTo(bx, by); else mmCtx.lineTo(bx, by);
      mmCtx.lineTo(ax, ay); mmCtx.lineTo(cx2, cy2);
    }
    mmCtx.closePath(); mmCtx.stroke();
  }
  // Inner dot at center (bindu)
  mmCtx.fillStyle = 'rgba(220,180,60,0.35)';
  mmCtx.beginPath(); mmCtx.arc(W/2, H/2, 2, 0, Math.PI*2); mmCtx.fill();
  mmCtx.restore();
  // Map world bounds → minimap canvas (matches 1.5× scaled city)
  const MM_X1 = -570, MM_X2 = 570, MM_Z1 = -430, MM_Z2 = 490;

  // ── RIVER SYSTEM on minimap ─────────────────────────────────────────────
  // Main E-W river control points (scaled 1.5×)
  const mainRiverPts = [
    [-570,-32],[-448,-13],[-288,-37],[-140,-21],[0,-48],[140,-27],[288,-16],[448,-53],[570,-72],
  ];
  // N-S tributary
  const tribPts = [
    [-93,-40],[-75,48],[-56,152],[-37,240],[-19,336],[0,413],
  ];

  const toMM = (wx, wz) => [
    ((wx - MM_X1) / (MM_X2 - MM_X1)) * W,
    ((wz - MM_Z1) / (MM_Z2 - MM_Z1)) * H,
  ];

  // Draw each river as a thick blue polyline
  [[mainRiverPts, 3.5], [tribPts, 2.5]].forEach(([pts, lineW]) => {
    mmCtx.save();
    mmCtx.strokeStyle = 'rgba(40,136,184,0.82)';
    mmCtx.lineWidth = lineW;
    mmCtx.lineCap = 'round';
    mmCtx.lineJoin = 'round';
    mmCtx.beginPath();
    pts.forEach(([wx, wz], i) => {
      const [mx, mz] = toMM(wx, wz);
      if (i === 0) mmCtx.moveTo(mx, mz);
      else mmCtx.lineTo(mx, mz);
    });
    mmCtx.stroke();
    // Pale shimmer layer
    mmCtx.strokeStyle = 'rgba(100,200,240,0.3)';
    mmCtx.lineWidth = lineW * 0.5;
    mmCtx.stroke();
    mmCtx.restore();
  });
  // ── END RIVER ─────────────────────────────────────────────────────────────

  // Career arc — chronological 2022→2025 path
  {
    const yrCols = { '2022':'#884422','2023':'#aa6622','2024':'#cc8833','2025':'#ffcc44' };
    const sorted = window.CITY_DATA.buildings
      .filter(b => b.year)
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
    mmCtx.save();
    mmCtx.lineWidth = 1.2; mmCtx.lineCap = 'round';
    sorted.forEach((b, i) => {
      if (i === 0) return;
      const prev = sorted[i-1];
      const [x1,y1] = toMM(prev.pos[0], prev.pos[1]);
      const [x2,y2] = toMM(b.pos[0], b.pos[1]);
      mmCtx.strokeStyle = (yrCols[b.year] || '#ffcc44') + '55';
      mmCtx.beginPath(); mmCtx.moveTo(x1,y1); mmCtx.lineTo(x2,y2); mmCtx.stroke();
    });
    mmCtx.restore();
  }

  window.CITY_DATA.buildings.forEach((b) => {
    const mx = ((b.pos[0] - MM_X1) / (MM_X2 - MM_X1)) * W,
      mz = ((b.pos[1] - MM_Z1) / (MM_Z2 - MM_Z1)) * H;
    mmCtx.fillStyle = (b.glowColor || "#888") + "cc";
    mmCtx.fillRect(mx - 3, mz - 3, 6, 6);
    // Building name dot glow
    mmCtx.fillStyle = (b.glowColor || "#888") + "44";
    mmCtx.beginPath();
    mmCtx.arc(mx, mz, 5, 0, Math.PI * 2);
    mmCtx.fill();
  });
  const cmx = ((cx - MM_X1) / (MM_X2 - MM_X1)) * W,
    cmz = ((cz - MM_Z1) / (MM_Z2 - MM_Z1)) * H;
  mmCtx.save();
  mmCtx.translate(cmx, cmz);
  mmCtx.rotate(angle);
  mmCtx.fillStyle = "#fff";
  mmCtx.beginPath();
  mmCtx.moveTo(0, -5);
  mmCtx.lineTo(3, 3);
  mmCtx.lineTo(-3, 3);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.restore();

  // ── DISTRICT INDICATOR ─────────────────────────────────────────────────
  // Detect nearest district zone and show its name below minimap
  const DISTRICTS = [
    { x: 0,    z: 0,    r: 130, name: 'CITY CENTRE',       color: '#ffcc44' },
    { x: 288,  z: -139, r: 140, name: 'COMMERCE DISTRICT', color: '#ff9950' },
    { x: -352, z: -139, r: 120, name: 'HERITAGE QUARTER',  color: '#9966ff' },
    { x: 181,  z: 224,  r: 120, name: 'CRAFT QUARTER',     color: '#44cc88' },
    { x: -256, z: 224,  r: 120, name: 'GARDENS DISTRICT',  color: '#44cc88' },
    { x: 0,    z: -352, r: 150, name: 'EDUCATION AVE',     color: '#00ccff' },
    { x: 0,    z: 352,  r: 110, name: 'NORTH QUARTER',     color: '#ff6644' },
    { x: 523,  z: -43,  r: 110, name: 'EAST WING',         color: '#ff6644' },
    { x: -523, z: -139, r: 110, name: 'WEST WING',         color: '#a78bfa' },
  ];
  const dlEl = document.getElementById('district-label');
  if (dlEl) {
    let nearest = null, nearestD2 = Infinity;
    for (const d of DISTRICTS) {
      const d2 = (cx - d.x) ** 2 + (cz - d.z) ** 2;
      if (d2 < d.r * d.r && d2 < nearestD2) { nearest = d; nearestD2 = d2; }
    }
    if (nearest) {
      if (dlEl.textContent !== nearest.name) {
        dlEl.textContent = nearest.name;
        dlEl.style.color = nearest.color;
      }
      dlEl.classList.add('visible');
    } else {
      dlEl.classList.remove('visible');
    }
  }
}
// updateHUD is exposed via CityUI below — see updateGameHUD for implementation
function showNotification(b) {
  const p = document.getElementById("prox");
  const col = pCol(b.glowColor);

  // ── Parse hex → RGB for CSS custom properties ────────────────────────
  const hex = col.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 200;
  const bv = parseInt(hex.slice(4, 6), 16) || 255;

  // Set color tokens on the card itself
  p.style.setProperty("--nc-rgb", `${r},${g},${bv}`);
  p.style.borderColor = `rgba(${r},${g},${bv},0.32)`;
  p.style.boxShadow = `0 0 0 1px rgba(${r},${g},${bv},0.08),
                                0 12px 40px rgba(0,0,0,0.65),
                                0 0 60px rgba(${r},${g},${bv},0.08),
                                inset 0 1px 0 rgba(255,255,255,0.05)`;

  // Subtle color flood on card background
  p.style.background = `linear-gradient(160deg,
          rgba(${r},${g},${bv},0.13) 0%,
          rgba(6,3,1,0.94) 55%)`;

  // ── System label (top row) ───────────────────────────────────────────
  const sysEl = document.getElementById("px-sys");
  if (sysEl) sysEl.textContent = b.isHero ? "★ HERO TEMPLE" : "NEARBY";
  sysEl && (sysEl.style.color = `rgba(${r},${g},${bv},0.7)`);

  // ── Dot color ───────────────────────────────────────────────────────
  const dotEl = document.getElementById("px-dot");
  if (dotEl) {
    dotEl.style.background = col;
    dotEl.style.boxShadow = `0 0 8px rgba(${r},${g},${bv},0.9)`;
  }

  // ── Left bar color ───────────────────────────────────────────────────
  const barEl = document.getElementById("px-bar");
  if (barEl) {
    barEl.style.background = col;
    barEl.style.boxShadow = `0 0 10px rgba(${r},${g},${bv},0.8)`;
  }

  // ── Icon ─────────────────────────────────────────────────────────────
  const iconEl = document.getElementById("px-icon");
  if (iconEl) iconEl.textContent = b.icon || "🏢";

  // ── Name + subtitle ──────────────────────────────────────────────────
  const nameEl = document.getElementById("px-name");
  if (nameEl) nameEl.textContent = b.name;
  const subEl = document.getElementById("px-sub");
  if (subEl) subEl.textContent = b.subtitle || b.tag || "";

  // ── Metric badges (first 2 metrics only, keeps card compact) ────────
  const metEl = document.getElementById("px-metrics");
  if (metEl && b.metrics && b.metrics.length) {
    metEl.innerHTML = b.metrics
      .slice(0, 2)
      .map((m) => `<span class="px-met"><strong>${m.v}</strong>${m.l}</span>`)
      .join("");
  } else if (metEl) {
    metEl.innerHTML = "";
  }

  // ── Voice line ──────────────────────────────────────────────────────────
  const voiceEl = document.getElementById('px-voice');
  if (voiceEl) {
    const vl = window.CITY_VOICE_LINES?.[b.id] || '';
    voiceEl.textContent = vl;
  }

  // ── ENTER button: color it to match the building ─────────────────────
  const btnEl = document.getElementById("px-btn");
  if (btnEl) {
    btnEl.style.borderColor = `rgba(${r},${g},${bv},0.6)`;
    btnEl.style.color = `rgba(${r},${g},${bv},1)`;
    btnEl.style.background = `rgba(${r},${g},${bv},0.09)`;
    btnEl.style.textShadow = `0 0 10px rgba(${r},${g},${bv},0.6)`;
    // Hide hint text on mobile (space is tight)
    const hintEl = p.querySelector(".px-hint");
    if (hintEl)
      hintEl.style.display = document.body.classList.contains("is-touch")
        ? "none"
        : "";
  }

  // ── Oracle proximity trigger ─────────────────────────────────────────
  window.ORC?.onProximity(b.id);

  // ── Spring entrance — restart animation every time ───────────────────
  p.classList.remove("show");
  void p.offsetWidth; // force reflow to reset animation
  p.classList.add("show");

  // ── Mobile ENTER button (floating circle) ────────────────────────────
  const me = document.getElementById("mob-enter");
  if (me) {
    me.style.borderColor = `rgba(${r},${g},${bv},0.6)`;
    me.style.color = col;
    me.classList.add("vis");
  }
}

function hideNotification() {
  const p = document.getElementById("prox");
  const me = document.getElementById("mob-enter");
  p.classList.remove("show");
  if (me) me.classList.remove("vis");
  // Reset inline styles after transition completes so next show() is clean
  setTimeout(() => {
    if (!p.classList.contains("show")) {
      p.style.background = "";
      p.style.borderColor = "";
      p.style.boxShadow = "";
    }
  }, 380);
}
function pCol(c) {
  if (typeof c === "string" && c.startsWith("#")) return c;
  if (typeof c === "number") return "#" + c.toString(16).padStart(6, "0");
  return "#00ddff";
}
function openBuilding(b) {
  if (!b) return;
  const dot = document.getElementById("dot-" + b.id);
  if (dot) dot.classList.add("visited");
  // Item 24: expose to 3D world for visited glow
  window._visitedIds = window._visitedIds || new Set();
  window._visitedIds.add(b.id);

  // Cinematic bloom flash in the building's color
  const flash = document.createElement("div");
  flash.className = "bloom-flash";
  flash.style.background = (b.glowColor || "#ffcc44") + "33";
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 900);

  const col = pCol(b.glowColor),
    body = document.getElementById("sp-body"),
    panel = document.getElementById("side-panel"),
    spInner = document.getElementById("sp-inner");

  // ── GAME FEEL: set color token on both panel and body ─────────────────
  // This drives the left-edge reveal bar color (--nc in sp-inner::after)
  // and the staggered content section accent colors.
  panel.style.setProperty("--nc", col);
  body.style.setProperty("--nc", col);
  if (spInner) spInner.style.setProperty("--nc", col);

  // ── UI DETAILING: coordinate display in panel header ──────────────────
  // Shows building position as coordinates — panel feels like a data
  // terminal retrieving a record, not a web page loading content.
  const spLbl = document.getElementById("sp-lbl");
  if (spLbl) {
    spLbl.textContent = "// SYSTEM FILE";
    spLbl.dataset.coord = `POS ${b.pos[0].toFixed(0)}.${Math.abs(b.pos[1]).toFixed(0)} · ${(b.templeType || "TEMPLE").toUpperCase()}`;
  }

  // Populate content BEFORE opening so clip-path reveals fully built DOM
  body.classList.remove("stagger-in");
  if (b.isEducation) body.innerHTML = eduPanel(b, col);
  else if (MODE === "engineer" && b.engineerDetail)
    body.innerHTML = engPanel(b, col);
  else body.innerHTML = recPanel(b, col);

  // Force reflow so stagger-in adds fresh transitions
  void body.offsetWidth;

  // Open panel — CSS clip-path wipe fires
  panel.classList.add("open");
  document.body.classList.add("panel-open");

  // Stagger content in after the wipe completes (0.55s)
  setTimeout(() => {
    body.classList.add("stagger-in");
  }, 280);

  // Oracle — tell it how many buildings have been visited
  window.ORC?.onBuildingOpened(window._visitedIds?.size || 0);

  // P4: check if all 17 temples now visited
  setTimeout(() => {
    if (typeof CityEngine !== "undefined" && CityEngine.checkCompletion)
      CityEngine.checkCompletion();
  }, 200);
  body.querySelectorAll(".eng-toggle").forEach((btn) =>
    btn.addEventListener("click", function () {
      const dep = this.nextElementSibling;
      dep.classList.toggle("vis");
      this.querySelector(".arr").style.transform = dep.classList.contains("vis")
        ? "rotate(90deg)"
        : "";
    }),
  );
}
function closeSP() {
  const panel = document.getElementById("side-panel");
  const body = document.getElementById("sp-body");
  const canvas = document.querySelector("canvas");

  // ── Remove stagger first so content doesn't flash during close ────────
  if (body) body.classList.remove("stagger-in");
  panel.classList.remove("open");

  // Restore canvas on mobile (panel-open dims it via filter)
  if (canvas && document.body.classList.contains("is-touch")) {
    canvas.style.filter = "";
  }

  // P1: collapse world panel when DOM panel closes
  if (typeof CityEngine !== "undefined" && CityEngine.closeWorldPanel)
    CityEngine.closeWorldPanel();
  // Oracle — show any pending message after panel closes
  setTimeout(() => window.ORC?._checkPending(), 700);
  setTimeout(() => {
    document.body.classList.remove("panel-open");
    if (typeof CityEngine !== "undefined" && CityEngine.resetCamera)
      CityEngine.resetCamera();
  }, 580);
}
function eduPanel(b, col) {
  return `<div class="p-badge" style="color:${col};border-color:${col}44;background:${col}0d">🎓 EDUCATION · ${b.year}</div><div class="p-line" style="background:linear-gradient(90deg,${col},transparent)"></div><div class="p-name">${b.name}</div><div class="p-sub">${b.subtitle}</div><div class="p-stat op"><div class="sdot"></div>COMPLETED</div><div class="mets">${b.metrics.map((m) => `<div class="met"><span class="mv" style="color:${col}">${m.v}</span><div class="ml">${m.l}</div></div>`).join("")}</div><div class="sl" style="color:${col}">ACADEMIC JOURNEY</div><div class="story">${b.story.replace(/\n/g, "<br>").replace(/<em>(.*?)<\/em>/g, `<em style="color:${col};font-style:normal;font-weight:600">$1</em>`)}</div><div class="out-box" style="border-color:${col}44"><div class="out-l">OUTCOME</div><div class="out-t">${b.outcome}</div></div><div class="ttags">${b.tech.map((t) => `<span class="ttag" style="border-color:${col}22;color:${col}88;background:${col}08">${t}</span>`).join("")}</div>`;
}
function recPanel(b, col) {
  const idx = window.CITY_DATA.buildings.indexOf(b) + 1;
  return `<div class="p-badge" style="color:${col};border-color:${col}44;background:${col}0d">${b.isHero ? "★ HERO · " : ""}${b.tag}</div><div class="p-line" style="background:linear-gradient(90deg,${col},transparent)"></div><div class="p-num">// SYSTEM ${String(idx).padStart(2, "0")}</div><div class="p-name">${b.name}</div><div class="p-sub">${b.subtitle}</div><div class="p-stat ${b.status === "OPERATIONAL" ? "op" : "ac"}"><div class="sdot"></div>${b.status}</div><div class="mets">${b.metrics.map((m) => `<div class="met"><span class="mv" style="color:${col}">${m.v}</span><div class="ml">${m.l}</div></div>`).join("")}</div><div class="sl" style="color:${col}">MISSION LOG</div><div class="story">${b.story.replace(/\n/g, "<br>").replace(/<em>(.*?)<\/em>/g, `<em style="color:${col};font-style:normal;font-weight:600">$1</em>`)}</div><div class="out-box" style="border-color:${col}44"><div class="out-l">OUTCOME</div><div class="out-t">${b.outcome}</div></div><div class="conn-box"><div class="conn-l">HOW THIS CONNECTS</div>${b.connects.map((c) => `<div class="conn-i"><span style="color:${col}">→</span><span><strong style="color:#ddeeff">${c.to}:</strong> ${c.how}</span></div>`).join("")}</div><div class="ttags">${b.tech.map((t) => `<span class="ttag" style="border-color:${col}22;color:${col}88;background:${col}08">${t}</span>`).join("")}</div>`;
}
function engPanel(b, col) {
  const ed = b.engineerDetail,
    idx = window.CITY_DATA.buildings.indexOf(b) + 1;
  return `<div class="p-badge" style="color:${col};border-color:${col}44;background:${col}0d">${b.isHero ? "★ " : ""}TECHNICAL FILE · ${b.tag}</div><div class="p-line" style="background:linear-gradient(90deg,${col},transparent)"></div><div class="p-num">// SYSTEM ${String(idx).padStart(2, "0")}</div><div class="p-name">${b.name}</div><div class="p-sub">${b.subtitle}</div><div class="p-stat ${b.status === "OPERATIONAL" ? "op" : "ac"}"><div class="sdot"></div>${b.status}</div><div class="mets">${b.metrics.map((m) => `<div class="met"><span class="mv" style="color:${col}">${m.v}</span><div class="ml">${m.l}</div></div>`).join("")}</div><div class="sl" style="color:${col}">THE REAL PROBLEM</div><div class="story">${ed.problem}</div><button class="eng-toggle">WHAT I REJECTED <span class="arr">›</span></button><div class="eng-dep">${ed.rejected.map((r) => `<div class="rej-item"><div class="rej-w">✕ ${r.w}</div><div class="rej-r">${r.r}</div></div>`).join("")}</div><div class="sl" style="color:${col};margin-top:14px">THE DECISION</div><div class="story">${ed.decision}</div><div class="sl" style="color:${col}">IMPLEMENTATION</div><div class="ed-sect"><div class="ed-txt"><code>${ed.impl}</code></div></div><div class="out-box" style="border-color:${col}44"><div class="out-l">LESSON</div><div class="out-t">${ed.lesson}</div></div><div class="ttags">${b.tech.map((t) => `<span class="ttag" style="border-color:${col}22;color:${col}88;background:${col}08">${t}</span>`).join("")}</div>`;
}
const JD = [
  {
    year: "2015",
    color: "#34d399",
    subtitle: "M.P.P.G. COLLEGE · GORAKHPUR",
    content:
      "Started B.Sc in Mathematics + Statistics + Computer Science. Fell in love with logic and systems thinking.",
  },
  {
    year: "2019",
    color: "#34d399",
    subtitle: "UNIVERSITY OF ALLAHABAD",
    content:
      "Completed B.Sc. Joined M.Sc. Computer Science. Deeper work on algorithms, data structures, and distributed systems.",
  },
  {
    year: "2021",
    color: "#a78bfa",
    subtitle: "M.SC COMPLETED",
    content:
      "Graduated M.Sc. CS. Final project on distributed systems. Started targeting backend engineering roles with real production impact.",
  },
  {
    year: "JAN 2022",
    color: "#ffcc44",
    subtitle: "TRILASOFT · TRAINEE ENGINEER",
    content:
      "Joined Trilasoft. First 8 months on RedSky — B2B relocation system on Struts2/Spring3. Production bug fixes and client feature work. This phase built strong legacy system intuition.",
  },
  {
    year: "SEP 2022",
    color: "#ffcc44",
    subtitle: "JUNIOR SOFTWARE ENGINEER",
    content:
      "Promoted. Led Survey Application integration — connecting survey mobile app to RedSky core. First end-to-end data pipeline ownership. Wrote MovePulse real-time tracking SQL.",
  },
  {
    year: "2023",
    color: "#ff9950",
    subtitle: "MODERNIZATION ERA",
    content:
      "Led MySQL 5→8 migration (zero data loss). Migrated 80+ Mule apps to AWS Lambda + Java services. Solved Java 1.7/IBM MQ constraint with a hybrid micro-service bridge — Java 1.8 handling DB, legacy MQ passing args via shell.",
  },
  {
    year: "2024",
    color: "#ff6b00",
    subtitle: "BACKEND ARCHITECT",
    content:
      "Promoted to Backend Architect. Designed complete ATS backend from schema to API contracts. Built centralized SSO platform (RS256 JWT, WebAuthn PassKey, SLO). Built internal API testing tool — Postman-level but company-specific with flow chaining DAG.",
  },
];
let jIdx = 0;
function renderJourney() {
  const s = JD[jIdx],
    col = s.color;
  const isWorkEntry = ["JAN 2022","SEP 2022","2023","2024"].includes(s.year);
  const orgLine = isWorkEntry
    ? `<div class="jb-stl" style="color:${col}66">TRILASOFT SOLUTIONS · NOIDA, INDIA</div>`
    : `<div class="jb-stl" style="color:${col}66">EDUCATION</div>`;
  document.getElementById("jb-card").innerHTML =
    `<span class="jb-year" style="color:${col};text-shadow:0 0 40px ${col}44">${s.year}</span><div class="jb-ttl">${s.subtitle}</div>${orgLine}<div class="jb-bdy">${s.content}</div>`;
  document.getElementById("jb-ctr").textContent = `${jIdx + 1} / ${JD.length}`;
  document.getElementById("jb-p").disabled = jIdx === 0;
  document.getElementById("jb-n").disabled = jIdx === JD.length - 1;
  const dots = document.getElementById("jb-dots");
  dots.innerHTML = "";
  JD.forEach((_, i) => {
    const b = document.createElement("button");
    b.className = "jb-dot-wrap";
    b.innerHTML = `<span class="jb-dot${i === jIdx ? " on" : ""}"></span>`;
    b.addEventListener("click", () => {
      jIdx = i;
      renderJourney();
    });
    dots.appendChild(b);
  });
}
function jNav(d) {
  const card = document.getElementById("jb-card");
  const dir = d > 0 ? "left" : "right";
  // Slide current card out
  card.classList.add(`slide-out-${dir}`);
  setTimeout(() => {
    card.classList.remove(`slide-out-${dir}`);
    jIdx = Math.max(0, Math.min(JD.length - 1, jIdx + d));
    renderJourney();
    // Slide new card in from opposite direction
    const inDir = d > 0 ? "right" : "left";
    card.classList.add(`slide-in-${inDir}`);
    card.addEventListener(
      "animationend",
      () => card.classList.remove(`slide-in-${inDir}`),
      { once: true },
    );
  }, 140);
}
function openJourney() {
  document.getElementById("journey").classList.add("open");
  renderJourney();
}
function closeJourney() {
  document.getElementById("journey").classList.remove("open");
}
const WX_ICONS = {
  night: "NIGHT",
  day: "SUN",
  sunset: "DUSK",
  fog: "FOG",
  rain: "RAIN",
  snow: "SNOW",
};
const WX_NAMES = {
  night: "NIGHT",
  day: "DAY",
  sunset: "SUNSET",
  fog: "FOG",
  rain: "RAIN",
  snow: "SNOW",
};
function doWeather() {
  if (typeof CityEngine !== "undefined") CityEngine.cycleWeather();
}
function onWeatherChange(w) {
  window.ORC?.onWeather(w);
  document.getElementById("weather-label").textContent = WX_ICONS[w] || "SUN";
  const t = document.getElementById("weather-toast");
  t.textContent = "// " + (WX_NAMES[w] || w.toUpperCase()) + " MODE";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
  // Show GRIP HUD only for grip-reducing weather
  const gripMap = { rain: 0.3, snow: 0.12, fog: 0.72 };
  const gripHud = document.getElementById("grip-hud");
  const gripBar = document.getElementById("grip-bar");
  const gripIcon = document.getElementById("grip-icon");
  const gripLabel = document.getElementById("grip-label");
  if (gripHud) {
    const grip = gripMap[w];
    if (grip !== undefined) {
      gripHud.style.display = "";
      if (gripBar) gripBar.style.width = (grip * 100).toFixed(0) + "%";
      if (gripIcon) gripIcon.textContent = w === "snow" ? "❄️" : w === "fog" ? "🌫️" : "🌧️";
      if (gripLabel) gripLabel.textContent = "GRIP " + Math.round(grip * 100) + "%";
    } else {
      gripHud.style.display = "none";
    }
  }
}
let muted = false;
function doMute() {
  muted = !muted;
  if (typeof CityEngine !== "undefined")
    CityEngine.setMusicVolume(muted ? 0 : 1);
  document.getElementById("mute-btn").textContent = muted ? "MUTE" : "SFX";
}
window.addEventListener("keydown", (e) => {
  if (document.getElementById("journey").classList.contains("open")) {
    if (e.key === "ArrowLeft") jNav(-1);
    if (e.key === "ArrowRight") jNav(1);
    if (e.key === "Escape") closeJourney();
    return;
  }
  if (e.code === "KeyE" && typeof CityEngine !== "undefined")
    CityEngine.enterNearestBuilding();
  if (e.key === "j" || e.key === "J") openJourney();
  if (e.key === "m" || e.key === "M") {
    if (e.shiftKey) {
      if (typeof CityEngine !== "undefined") CityEngine.toggleYatraPath();
    } else toggleFullMap();
  }
  if (e.key === "Escape") {
    closeSP();
    closeFullMap();
  }
  if (e.code === "KeyT") doWeather();
});
// ── P8: FULL MAP ─────────────────────────────────────────────────────────
const _visitedBuildings = new Set();
function toggleFullMap() {
  const fm = document.getElementById("fullmap");
  if (fm.classList.contains("open")) {
    closeFullMap();
  } else {
    openFullMap();
  }
}
function openFullMap() {
  const fm = document.getElementById("fullmap");
  fm.classList.add("open");
  _setupMapInteractions(); // idempotent — only attaches once
  drawFullMap();
  // Live refresh
  window._mapInterval = setInterval(() => {
    if (fm.classList.contains("open")) drawFullMap();
  }, 80); // fast refresh — canvas is lightweight, no DOM changes
}
function closeFullMap() {
  document.getElementById("fullmap").classList.remove("open");
  if (window._mapInterval) {
    clearInterval(window._mapInterval);
    window._mapInterval = null;
  }
}

// ── MAP STATE ─────────────────────────────────────────────────────────────
let _mapCanvas = null,
  _mapCtx = null,
  _mapW = 900,
  _mapH = 900;
let _mapHoverBuilding = null;
// World bounds: expanded 1.6× city layout
const _WX1 = -155,
  _WX2 = 155,
  _WZ1 = -130,
  _WZ2 = 135;
function _wm(wx, wz) {
  return [
    ((wx - _WX1) / (_WX2 - _WX1)) * _mapW * 0.88 + _mapW * 0.06,
    ((wz - _WZ1) / (_WZ2 - _WZ1)) * _mapH * 0.88 + _mapH * 0.06,
  ];
}
function _mw(mx, my) {
  // canvas → world
  return [
    ((mx / _mapW - 0.06) / 0.88) * (_WX2 - _WX1) + _WX1,
    ((my / _mapH - 0.06) / 0.88) * (_WZ2 - _WZ1) + _WZ1,
  ];
}
// Auto-drive target
let _autoDriveTarget = null;
// Check every frame in map interval
function _autoDriveStep() {
  if (!_autoDriveTarget || typeof CityEngine === "undefined") return;
  const dx = _autoDriveTarget.x - CityEngine.carX;
  const dz = _autoDriveTarget.z - CityEngine.carZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 4) {
    _autoDriveTarget = null;
    return;
  }
  // Synthesize keyboard-like input via engine public API
  if (CityEngine._autoDrive) CityEngine._autoDrive(dx, dz);
}

function drawFullMap() {
  _mapCanvas = document.getElementById("fullmap-canvas");
  if (!_mapCanvas) return;
  _mapCtx = _mapCanvas.getContext("2d");
  const ctx = _mapCtx,
    W = _mapW,
    H = _mapH;

  // ── BACKGROUND — deep ocean dark with radial blue fog ─────────────────
  const bgGrd = ctx.createRadialGradient(
    W / 2,
    H / 2,
    W * 0.1,
    W / 2,
    H / 2,
    W * 0.72,
  );
  bgGrd.addColorStop(0, "#0a1520");
  bgGrd.addColorStop(0.6, "#071018");
  bgGrd.addColorStop(1, "#030810");
  ctx.fillStyle = bgGrd;
  ctx.fillRect(0, 0, W, H);

  // Outer ocean glow (blue fog around edges)
  const edgeFog = ctx.createRadialGradient(
    W / 2,
    H / 2,
    W * 0.35,
    W / 2,
    H / 2,
    W * 0.72,
  );
  edgeFog.addColorStop(0, "transparent");
  edgeFog.addColorStop(0.7, "rgba(0,40,100,0.0)");
  edgeFog.addColorStop(1, "rgba(0,20,80,0.6)");
  ctx.fillStyle = edgeFog;
  ctx.fillRect(0, 0, W, H);

  // ── LAND MASS — soft terrain shape ───────────────────────────────────
  // Draw rounded land zone (approximating world bounds)
  ctx.save();
  ctx.beginPath();
  const [lx1, ly1] = _wm(-88, -82),
    [lx2, ly2] = _wm(88, 60);
  const lw = lx2 - lx1,
    lh = ly2 - ly1;
  if (ctx.roundRect) ctx.roundRect(lx1, ly1, lw, lh, 20);
  else ctx.rect(lx1, ly1, lw, lh);
  const landGrd = ctx.createLinearGradient(lx1, ly1, lx2, ly2);
  landGrd.addColorStop(0, "#1a2a1a");
  landGrd.addColorStop(0.4, "#1e2818");
  landGrd.addColorStop(1, "#162014");
  ctx.fillStyle = landGrd;
  ctx.fill();
  ctx.restore();

  // ── ROAD NETWORK — styled like Bruno Simon (thick with edge glow) ─────
  const roads = [
    [-90, 0, 90, 0],
    [-90, -14, 90, -14],
    [-90, 42, 90, 42],
    [-45, -62, 45, -62],
    [0, -80, 0, 65],
    [-45, -14, -45, 42],
    [45, -14, 45, 42],
    [-58, -14, -58, 42],
    [58, -14, 58, 42],
    [-90, 24, 90, 24],
    [-90, -38, 90, -38],
  ];

  // Road glow pass
  ctx.save();
  roads.forEach(([x1, z1, x2, z2]) => {
    const [mx1, my1] = _wm(x1, z1),
      [mx2, my2] = _wm(x2, z2);
    ctx.beginPath();
    ctx.moveTo(mx1, my1);
    ctx.lineTo(mx2, my2);
    ctx.strokeStyle = "rgba(180,120,60,0.08)";
    ctx.lineWidth = 12;
    ctx.stroke();
  });
  // Road base
  roads.forEach(([x1, z1, x2, z2]) => {
    const [mx1, my1] = _wm(x1, z1),
      [mx2, my2] = _wm(x2, z2);
    ctx.beginPath();
    ctx.moveTo(mx1, my1);
    ctx.lineTo(mx2, my2);
    ctx.strokeStyle = "rgba(80,50,28,0.85)";
    ctx.lineWidth = 5;
    ctx.stroke();
  });
  // Road center dashes (main spine only)
  ctx.setLineDash([8, 12]);
  [[0, -80, 0, 65]].forEach(([x1, z1, x2, z2]) => {
    const [mx1, my1] = _wm(x1, z1),
      [mx2, my2] = _wm(x2, z2);
    ctx.beginPath();
    ctx.moveTo(mx1, my1);
    ctx.lineTo(mx2, my2);
    ctx.strokeStyle = "rgba(255,180,80,0.15)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.restore();

  // ── WATER CHANNELS ────────────────────────────────────────────────────
  [
    [-3, -70, -3, 60],
    [3, -70, 3, 60],
  ].forEach(([x1, z1, x2, z2]) => {
    const [mx1, my1] = _wm(x1, z1),
      [mx2, my2] = _wm(x2, z2);
    // Glow
    ctx.shadowColor = "rgba(40,140,255,0.6)";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "rgba(40,120,220,0.8)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mx1, my1);
    ctx.lineTo(mx2, my2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  });

  // ── ZONE COLOR POOLS (like Bruno Simon biome colors) ─────────────────
  const zones = [
    [45, -22, 0.06, "#00c8ff", 50],  // Surya Dwara — cyan zone
    [-55, -22, 0.05, "#ffcc44", 48], // Brahma Kund — gold zone
    [0, -55, 0.05, "#4dd4ff", 44],   // Jyotish — pale blue
    [-40, 35, 0.05, "#ff6b00", 42],  // Lakshmi — orange
    [0, 55, 0.05, "#888888", 38],    // Pura Stambha — grey legacy
    [-22, -62, 0.05, "#a78bfa", 42], // Education — violet
    [82, -22, 0.05, "#4f9cf9", 44],  // Vaishya Griha — blue (BizSuite)
    [82, 8, 0.04, "#f97316", 38],    // Agni Vedha — orange (TestForge)
    [28, -48, 0.04, "#22d3ee", 36],  // Darpana Shala — cyan (API Studio)
    [-82, -22, 0.05, "#a3e635", 42], // Vidya Ashram — lime (DevLearner)
    [0, 72, 0.04, "#f43f5e", 36],    // Sutra Dhara — rose (Portfolio API)
  ];
  zones.forEach(([wx, wz, alpha, col, r]) => {
    const [zx, zy] = _wm(wx, wz);
    const zGrd = ctx.createRadialGradient(zx, zy, 0, zx, zy, r);
    zGrd.addColorStop(
      0,
      col +
        Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0"),
    );
    zGrd.addColorStop(1, "transparent");
    ctx.fillStyle = zGrd;
    ctx.fillRect(0, 0, W, H);
  });

  // ── BUILDINGS — clickable dots ─────────────────────────────────────────
  const blds = window.CITY_DATA ? window.CITY_DATA.buildings : [];
  const now = Date.now();
  blds.forEach((b) => {
    const [mx, my] = _wm(b.pos[0], b.pos[1]);
    const gc = b.glowColor || "#888";
    const visited = document
      .getElementById("dot-" + b.id)
      ?.classList.contains("visited");
    const isHovered = _mapHoverBuilding === b.id;
    const isTarget = _autoDriveTarget?.id === b.id;
    const pulse = isHovered ? 1 + Math.sin(now * 0.006) * 0.15 : 1;
    const r = visited ? 10 : 7;

    // Outer glow halo
    const haloR = (r + 12) * pulse;
    const halo = ctx.createRadialGradient(mx, my, 0, mx, my, haloR);
    halo.addColorStop(0, gc + "44");
    halo.addColorStop(1, "transparent");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, haloR, 0, Math.PI * 2);
    ctx.fill();

    // Ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, r * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = visited ? "#fff" : gc;
    ctx.lineWidth = isHovered ? 2 : 1.5;
    ctx.shadowColor = gc;
    ctx.shadowBlur = isHovered ? 20 : 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Inner fill
    ctx.beginPath();
    ctx.arc(mx, my, (r - 3) * pulse, 0, Math.PI * 2);
    ctx.fillStyle = visited ? "#ffffff" : gc;
    ctx.shadowColor = gc;
    ctx.shadowBlur = visited ? 12 : 6;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Target indicator — pulsing orbit ring
    if (isTarget) {
      const tr = 18 + Math.sin(now * 0.008) * 4;
      ctx.beginPath();
      ctx.arc(mx, my, tr, 0, Math.PI * 2);
      ctx.strokeStyle = gc + "88";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Name label
    const labelAlpha = isHovered ? 1 : visited ? 0.7 : 0.4;
    ctx.fillStyle = `rgba(255,255,255,${labelAlpha})`;
    ctx.font = (visited ? "bold " : "") + `10px 'Share Tech Mono',monospace`;
    ctx.shadowColor = gc;
    ctx.shadowBlur = isHovered ? 8 : 0;
    ctx.fillText(b.name, mx + 14, my + 4);
    ctx.shadowBlur = 0;
  });

  // ── CAR MARKER ────────────────────────────────────────────────────────
  if (typeof CityEngine !== "undefined" && CityEngine.carX != null) {
    const cx = CityEngine.carX,
      cz = CityEngine.carZ;
    const ang = CityEngine.carAngle || 0;
    const [cmx, cmy] = _wm(cx, cz);

    // Car glow halo
    const carHalo = ctx.createRadialGradient(cmx, cmy, 0, cmx, cmy, 28);
    carHalo.addColorStop(0, "rgba(255,80,0,0.25)");
    carHalo.addColorStop(1, "transparent");
    ctx.fillStyle = carHalo;
    ctx.fillRect(0, 0, W, H);

    // Car arrow — rotate to match heading
    ctx.save();
    ctx.translate(cmx, cmy);
    ctx.rotate(ang);
    ctx.shadowColor = "#ff4400";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ff3300";
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 7);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fill();
    // White center
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3, 3);
    ctx.lineTo(-3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // YOU label with background
    ctx.fillStyle = "rgba(5,12,20,0.8)";
    const youW = 32,
      youH = 14;
    ctx.fillRect(cmx - youW / 2, cmy + 14, youW, youH);
    ctx.fillStyle = "#ff6644";
    ctx.font = "bold 8px 'Share Tech Mono',monospace";
    ctx.textAlign = "center";
    ctx.fillText("YOU", cmx, cmy + 24);
    ctx.textAlign = "left";
  }

  // ── COMPASS ROSE ──────────────────────────────────────────────────────
  const cx2 = 40,
    cy2 = 40;
  ["N", "S", "E", "W"].forEach((dir, i) => {
    const a = [0, Math.PI, Math.PI / 2, -Math.PI / 2][i];
    const tx = cx2 + Math.sin(a) * 18,
      ty = cy2 - Math.cos(a) * 18;
    ctx.fillStyle =
      dir === "N" ? "rgba(255,200,80,0.9)" : "rgba(255,255,255,0.3)";
    ctx.font = `bold ${dir === "N" ? 11 : 9}px 'Share Tech Mono',monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(dir, tx, ty);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // ── VISITED COUNT ─────────────────────────────────────────────────────
  const vCount =
    document.querySelectorAll('[id^="dot-"].visited').length ||
    blds.filter((b) =>
      document.getElementById("dot-" + b.id)?.classList.contains("visited"),
    ).length;
  const countEl = document.getElementById("fm-count");
  if (countEl) countEl.textContent = vCount + " / " + blds.length + " VISITED";
}

// ── MAP INTERACTIONS ──────────────────────────────────────────────────────
function _setupMapInteractions() {
  if (_setupMapInteractions._done) return;
  _setupMapInteractions._done = true;
  const canvas = document.getElementById("fullmap-canvas");
  const tooltip = document.getElementById("fm-tooltip");
  if (!canvas || !tooltip) return;

  function getBuildingAtPos(mx, my) {
    if (!window.CITY_DATA) return null;
    const [wx, wz] = _mw(mx, my);
    let closest = null,
      closestD = 999;
    window.CITY_DATA.buildings.forEach((b) => {
      const d = Math.hypot(wx - b.pos[0], wz - b.pos[1]);
      if (d < 12 && d < closestD) {
        closest = b;
        closestD = d;
      }
    });
    return closest;
  }

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = _mapW / rect.width,
      scaleY = _mapH / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const b = getBuildingAtPos(mx, my);

    if (b) {
      _mapHoverBuilding = b.id;
      canvas.style.cursor = "pointer";
      tooltip.style.display = "block";
      // Position tooltip near cursor but within bounds
      const tx = Math.min(e.clientX + 14, window.innerWidth - 200);
      const ty = Math.max(e.clientY - 50, 10);
      tooltip.style.left = tx + "px";
      tooltip.style.top = ty + "px";
      tooltip.style.borderColor = b.glowColor + "55";
      tooltip.querySelector(".ft-name").textContent = b.name;
      tooltip.querySelector(".ft-name").style.color = b.glowColor;
      tooltip.querySelector(".ft-sub").textContent = b.subtitle || b.tag || "";
      const visited = document
        .getElementById("dot-" + b.id)
        ?.classList.contains("visited");
      tooltip.querySelector(".ft-hint").textContent = visited
        ? "✓ VISITED · CLICK TO REVISIT"
        : "CLICK TO DRIVE HERE";
      tooltip.querySelector(".ft-hint").style.color = visited
        ? "#44ee88"
        : "rgba(255,200,80,0.5)";
    } else {
      _mapHoverBuilding = null;
      canvas.style.cursor = "crosshair";
      tooltip.style.display = "none";
    }
  });

  canvas.addEventListener("mouseleave", () => {
    _mapHoverBuilding = null;
    tooltip.style.display = "none";
  });

  // ── CLICK TO AUTO-DRIVE ────────────────────────────────────────────────
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = _mapW / rect.width,
      scaleY = _mapH / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const b = getBuildingAtPos(mx, my);
    if (!b || typeof CityEngine === "undefined") return;

    // Set auto-drive target
    _autoDriveTarget = {
      x: b.roadPos ? b.roadPos[0] : b.pos[0],
      z: b.roadPos ? b.roadPos[1] : b.pos[1],
      id: b.id,
    };

    // Register target with engine for steering
    if (CityEngine.setAutoDriveTarget) {
      CityEngine.setAutoDriveTarget(_autoDriveTarget.x, _autoDriveTarget.z);
    }

    // Close map and flash hint
    closeFullMap();
    setTimeout(() => {
      const gb = document.getElementById("guide-bar");
      if (gb) {
        gb.textContent = "◈  DRIVING TO  " + b.name.toUpperCase() + "  ◈";
        gb.style.opacity = "1";
        setTimeout(() => {
          gb.style.opacity = "0";
        }, 3000);
      }
    }, 400);
  });
}

// ── GAME HUD UPDATE ─────────────────────────────────────────────────────
function updateGameHUD(spd, weather) {
  if (Math.abs(spd) > 0.02 && !window._ctrlHinted) {
    window._ctrlHinted = true;
    const ch = document.getElementById("ctrl-hint");
    if (ch) ch.classList.remove("hud-visible");
  }
  const arc = document.getElementById("spd-arc");
  const num = document.getElementById("spd-num");
  const gear = document.getElementById("gear-badge");
  const wb = document.getElementById("weather-badge");
  const vig = document.getElementById("speed-vignette");
  if (!arc || !num) return;
  // Speed: map raw 0-0.48 to display 0-180 km/h
  const kmh = Math.round(Math.abs(spd) * 375);
  const pct = Math.min(1, Math.abs(spd) / 0.48);
  // SVG arc: dashoffset 151 = empty, 0 = full (new r=32)
  arc.style.strokeDashoffset = 151 - pct * 151;
  // Color: green → gold → orange-red
  arc.style.stroke =
    pct < 0.4
      ? "#44ee88"
      : pct < 0.75
        ? "#ffcc44"
        : pct < 0.9
          ? "#ff9944"
          : "#ff3333";
  // Speed ring pulses size at high speed
  const ring = document.getElementById("spd-ring");
  if (ring)
    ring.style.transform = pct > 0.7 ? `scale(${1 + pct * 0.06})` : "scale(1)";
  num.childNodes[0].textContent = kmh;
  gear.textContent = "GEAR: " + (spd < -0.01 ? "R" : spd < 0.001 ? "N" : "D");
  if (wb && weather) wb.textContent = weather.toUpperCase();
  // Cinematic vignette — always-on base + speed tunneling
  if (vig) {
    const speedBoost = Math.max(0, pct - 0.3) * 0.5;
    const edge = (0.32 + speedBoost).toFixed(3);
    const innerStop = Math.max(28, 55 - pct * 28).toFixed(0);
    vig.style.background = `radial-gradient(ellipse 72% 68% at 50% 50%, transparent 0%, transparent ${innerStop}%, rgba(0,0,0,${edge}) 100%)`;
  }
}

window.CityUI = {
  openBuilding,
  showNotification,
  hideNotification,
  updateHUD(spd) {
    // updateGameHUD handles speed ring, gear badge, vignette
    updateGameHUD(
      spd,
      typeof CityEngine !== "undefined" ? CityEngine.currentWeather : "",
    );
  },
  updateMinimap,
  onWeatherChange(w) {
    const spd = typeof CityEngine !== "undefined" ? CityEngine.carSpeed : 0;
    updateGameHUD(spd, w);
    onWeatherChange(w);
  },
};

// ── GLOBAL SHIM — promote inner functions to window so HTML onclick works ──
// city-hud.js runs in "use strict" block scope, so onclick= can't see them.
window.closeSP = closeSP;
window.openJourney = openJourney;
window.closeJourney = closeJourney;
window.jNav = jNav;
window.doWeather = doWeather;
window.doMute = doMute;
window.toggleFullMap = toggleFullMap;
window.closeFullMap = closeFullMap;
window.openFullMap = openFullMap;
window.onWeatherChange = onWeatherChange;

// ── ACHIEVEMENT SYSTEM ────────────────────────────────────────────────────────
var ACH = (function() {
  var data = {};
  try { data = JSON.parse(localStorage.getItem('dk_ach') || '{}'); } catch(e) {}
  function save() { try { localStorage.setItem('dk_ach', JSON.stringify(data)); } catch(e) {} }
  function toast(label) {
    var t = document.createElement('div');
    t.className = 'ach-toast';
    t.innerHTML = '<span class="ach-icon">◈</span> ' + label;
    document.body.appendChild(t);
    setTimeout(function() { t.classList.add('ach-out'); }, 3200);
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
  }
  return {
    unlock: function(id, label) {
      if (data[id]) return;
      data[id] = Date.now();
      save();
      toast(label);
    },
    has: function(id) { return !!data[id]; },
    all: function() { return Object.keys(data); },
  };
})();
window.ACH = ACH;

// ── SACRED TOUR — 90s scripted auto-drive with Oracle narration ───────────────
var SACRED_TOUR_STOPS = [
  { x:  0, z: 52, dwell: 7,  msg: 'A visitor arrives at Dharma Kshetra. The city was built stone by stone over four years. <em>Whether you understand it depends entirely on how you choose to walk.</em>' },
  { x:  0, z:  0, dwell: 8,  msg: 'The Dharma Chakra. Every road in this city leads here. This is the center — not a metaphor.' },
  { x: 72, z:-35, dwell: 10, msg: 'Surya Dwara. The hardest system. Every application depended on it. <em>Authentication is easy. Trust is difficult.</em>' },
  { x:-88, z:-35, dwell: 8,  msg: 'Brahma Kund. Three migrations over two years. Zero data lost. Shadow validation before every cutover.' },
  { x:  0, z: 88, dwell: 8,  msg: 'Pura Stambha. This is where it began. January 2022. Not a clean system. Not a modern stack. <em>A classroom.</em>' },
  { x: 88, z: 13, dwell: 7,  msg: 'Setu Nagara. Java 1.7 on one side. MySQL 8 on the other. A shell script in between. <em>Still running after three years.</em>' },
  { x:-22, z:  2, dwell: 7,  msg: 'He built systems for thousands of users he never met. <em>The diyas on the river are for them.</em>' },
  { x:  0, z: 56, dwell: 5,  msg: 'Sacred Tour complete. <em>The city awaits your own exploration.</em>' },
];
window._sacredTour = { active: false, idx: 0, dwellT: 0, stops: SACRED_TOUR_STOPS };

function startSacredTour() {
  var tour = window._sacredTour;
  tour.active = true; tour.idx = 0; tour.dwellT = 0;
  SACRED_TOUR_STOPS.forEach(function(s) { s.fired = false; });
  var btn = document.getElementById('tour-btn');
  if (btn) { btn.textContent = 'TOUR ■'; btn.onclick = stopSacredTour; }
  window.ORC && window.ORC.show('tour_start', 'Sacred Tour beginning. <em>Follow the Oracle.</em>');
}
function stopSacredTour() {
  window._sacredTour.active = false;
  var btn = document.getElementById('tour-btn');
  if (btn) { btn.textContent = 'TOUR'; btn.onclick = startSacredTour; }
}
window.startSacredTour = startSacredTour;
window.stopSacredTour = stopSacredTour;

// ── LINKEDIN SHARE ────────────────────────────────────────────────────────────
function shareToLinkedIn() {
  var url = encodeURIComponent('https://adityasrivastava-dev.github.io/');
  window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + url, '_blank', 'width=600,height=500');
}
window.shareToLinkedIn = shareToLinkedIn;

// ══════════════════════════════════════════════════════════════════════════════
// ORACLE SYSTEM — Vaakshakti, the voice of Dharma Kshetra
// Proactive narrative messages, scripted Q&A, optional Claude API integration.
// Session memory via localStorage. Does not interrupt when panel is open.
// ══════════════════════════════════════════════════════════════════════════════
;(function () {
  'use strict';

  var _LS = {
    get: function(k, def) { try { var v = localStorage.getItem('dk_'+k); return v != null ? JSON.parse(v) : def; } catch(e) { return def; } },
    set: function(k, v) { try { localStorage.setItem('dk_'+k, JSON.stringify(v)); } catch(e) {} },
  };

  var ORC = {
    _vis: false,
    _chatOpen: false,
    _shown: new Set(_LS.get('orc_shown', [])),
    _apiKey: _LS.get('api_key', ''),
    _visitCount: (_LS.get('visit_count', 0) + 1),
    _sessionStart: Date.now(),
    _riverTimer: 0,
    _gameReady: false,
    _pendingMsg: null,
    _autoHideT: null,

    _panelOpen: function() {
      return document.getElementById('side-panel') &&
             document.getElementById('side-panel').classList.contains('open');
    },

    show: function(id, msg, persist) {
      if (persist === undefined) persist = false;
      if (!this._shown.has(id) || persist) {
        if (!persist) { this._shown.add(id); _LS.set('orc_shown', Array.from(this._shown)); }
        if (!this._gameReady || this._panelOpen()) {
          this._pendingMsg = { id: id, msg: msg, persist: persist };
          return false;
        }
        this._render(msg);
        return true;
      }
      return false;
    },

    _render: function(msg) {
      var panel = document.getElementById('oracle-panel');
      var body = document.getElementById('orc-body');
      if (!panel || !body) return;
      body.innerHTML = msg;
      panel.classList.add('vis');
      this._vis = true;
      var self = this;
      if (this._autoHideT) clearTimeout(this._autoHideT);
      var delay = msg.length > 160 ? 14000 : 9000;
      this._autoHideT = setTimeout(function() {
        if (!self._chatOpen) self.close();
      }, delay);
    },

    close: function() {
      var panel = document.getElementById('oracle-panel');
      if (panel) panel.classList.remove('vis');
      this._vis = false;
      this._chatOpen = false;
      var cw = document.getElementById('orc-chat-wrap');
      if (cw) cw.style.display = 'none';
    },

    _checkPending: function() {
      if (this._pendingMsg && !this._panelOpen()) {
        var p = this._pendingMsg;
        this._pendingMsg = null;
        this.show(p.id, p.msg, p.persist);
      }
    },

    onGameStart: function() {
      this._gameReady = true;
      _LS.set('visit_count', this._visitCount);
      window.ACH && window.ACH.unlock('first_visit', 'Dharma Kshetra — First Visit');
      var self = this;
      var sess = document.getElementById('orc-sessions');
      if (sess && this._visitCount > 1) sess.textContent = 'VISIT ' + this._visitCount;
      if (this._visitCount > 1) {
        setTimeout(function() {
          self.show('return_visit',
            'You returned. Most do not. I expected you would.' +
            (self._visitCount > 2 ? ' <em>' + (self._visitCount - 1) + ' visits now.</em>' : '')
          );
        }, 4200);
      } else {
        setTimeout(function() {
          self.show('arrival',
            'A visitor arrives at Dharma Kshetra. The city was built stone by stone over four years. ' +
            'You may walk it in twenty minutes. <em>Whether you understand it depends entirely on how you choose to walk.</em>'
          );
        }, 3800);
      }
      // Session timer — soft acknowledgment of extended exploration
      setTimeout(function() {
        self.show('timer_15', 'Most visitors leave after two minutes. You are still here.');
      }, 15 * 60000);
      setTimeout(function() {
        self.show('timer_30', 'Very few see what you are seeing. <em>This city was built to reward exactly this.</em>');
      }, 30 * 60000);
    },

    onProximity: function(buildingId) {
      var self = this;
      var msgs = {
        'surya-dwara': {
          id: 'surya_intro',
          msg: "This one. This is where the architect's hand truly emerged. " +
               "<em>This was the first system where failure would affect every other system.</em>",
          delay: 1400,
        },
        'pura-stambha': {
          id: 'legacy_intro',
          msg: 'This is where it began. January 2022. Not a clean system. Not a modern stack. <em>A classroom.</em> ' +
               'The purpose of old work is not perfection. It is proof of growth.',
          delay: 1400,
        },
        'brahma-kund': {
          id: 'migration_intro',
          msg: 'Three migrations over two years. MySQL 5 to 8, 8 to 8.4. <em>Zero data lost.</em> ' +
               'Shadow validation before every cutover. The city\'s water never ran dry.',
          delay: 1400,
        },
        'setu-nagara': {
          id: 'bridge_intro',
          msg: 'Java 1.7 on one side. MySQL 8 on the other. A shell script in between. ' +
               '<em>Still running in production after three years.</em>',
          delay: 1400,
        },
      };
      var m = msgs[buildingId];
      if (m) {
        setTimeout(function() { self.show(m.id, m.msg); }, m.delay);
      }
    },

    // Proximity triggers for hidden world structures (called from game loop by coordinates)
    tickHidden: function(x, z) {
      var self = this;
      var pts = [
        { id: 'h_ruin',    cx: 15,   cz: 112,  r: 22, msg: 'Every engineer inherits code they would never write. <em>Maturity is improving it anyway.</em>', ach: ['ruin_found', 'Technical Debt Ruin Discovered'] },
        { id: 'h_chamber', cx: -28,  cz: -38,  r: 22, msg: 'The systems that taught the most are rarely the systems that worked perfectly.', ach: ['chamber_found', 'Incident Chamber Discovered'] },
        { id: 'h_corner',  cx: 68,   cz: -148, r: 24, msg: 'This is where the story becomes human.', ach: ['corner_found', "Personal Corner Discovered"] },
        { id: 'h_garden',  cx: -12,  cz: -165, r: 26, msg: "Few find this place. <em>The city was built to last, not to be immediately obvious.</em>", ach: ['garden_found', "Architect's Garden Discovered"] },
        { id: 'h_404',     cx: -15,  cz: 128,  r: 20, msg: 'The road leads nowhere. Some roads are honest about it.', ach: null },
      ];
      pts.forEach(function(p) {
        var dx = x - p.cx, dz = z - p.cz;
        if (Math.sqrt(dx * dx + dz * dz) < p.r) {
          self.show(p.id, p.msg);
          if (p.ach) window.ACH && window.ACH.unlock(p.ach[0], p.ach[1]);
        }
      });
      // Emotional weather alignment — rain near Failures District / Tech Debt zone
      if (!self._rainZoneDone) {
        var nearFail = (x > 0 && x < 30 && z > 100 && z < 132) ||
                       (x > -28 && x < 0 && z > 108 && z < 135);
        if (nearFail) {
          self._rainZoneDone = true;
          var inst = window._appInstance;
          if (inst && inst.world && inst.world.applyWeather) {
            setTimeout(function() { inst.world.applyWeather('rain'); }, 1800);
          }
        }
      }
    },

    onBuildingOpened: function(visitedCount) {
      var sess = document.getElementById('orc-sessions');
      var total = (window.CITY_DATA && window.CITY_DATA.buildings) ? window.CITY_DATA.buildings.length : 17;
      if (sess) sess.textContent = visitedCount + ' / ' + total;
      var self = this;
      if (visitedCount === 8) {
        setTimeout(function() {
          self.show('halfway',
            'You have heard half the stories. You may leave now with a partial understanding. ' +
            'Or you may stay. <em>The people who stay always say they are glad they did.</em>'
          );
        }, 2800);
      }
    },

    onWeather: function(w) {
      var self = this;
      if (w === 'rain') {
        setTimeout(function() {
          self.show('rain', 'The city handles weather the way it handles load. <em>Gracefully.</em>');
        }, 3200);
      }
      if (w === 'night') {
        var mins = Math.floor((Date.now() - self._sessionStart) / 60000);
        if (mins > 16) {
          setTimeout(function() {
            self.show('late_night',
              'Working this late was not unusual. It was the default. ' +
              '<em>The city remembers every late commit.</em>'
            );
          }, 3000);
        }
        // 3am real-clock trigger
        var hr = new Date().getHours();
        if ((hr >= 0 && hr < 4) && !self._shown.has('3am_trigger')) {
          setTimeout(function() {
            self.show('3am_trigger',
              'Still here. At 3am, every system he built was either working or he was fixing it. ' +
              '<em>The city remembers that.</em>'
            );
          }, 8000);
        }
      }
    },

    onModeSwitch: function(newMode) {
      var self = this;
      if (newMode === 'engineer') {
        setTimeout(function() {
          self.show('mode_engineer', 'You are choosing to go deeper. <em>The city rewards that.</em>');
        }, 1200);
      } else if (newMode === 'recruiter') {
        setTimeout(function() {
          self.show('mode_recruiter', 'You are choosing to see the shape. <em>Both views are true.</em>');
        }, 1200);
      }
    },

    tickRiver: function(dt, x, z, isNight) {
      if (!isNight) { this._riverTimer = 0; return; }
      var nearRiver = Math.abs(x) < 38 && z > -28 && z < 28;
      if (nearRiver) {
        this._riverTimer += dt;
        if (this._riverTimer > 22 && !this._shown.has('river_night')) {
          this.show('river_night',
            'He built systems for thousands of users he never met. ' +
            '<em>The diyas on the river are for them.</em>'
          );
        }
      } else {
        this._riverTimer = 0;
      }
    },

    doFinalSpeech: function() {
      if (this._autoHideT) clearTimeout(this._autoHideT);
      window.ACH && window.ACH.unlock('oracle_done', 'Oracle — Final Speech Heard');
      // Show LinkedIn share button
      var lnBtn = document.getElementById('ln-share-btn');
      if (lnBtn) lnBtn.style.display = 'inline-flex';
      // Show Resume Moment button
      var rmBtn = document.getElementById('resume-btn');
      if (rmBtn) rmBtn.style.display = 'inline-flex';
      // Trigger the golden connection web
      if (window._appInstance && window._appInstance.world) {
        var w = window._appInstance.world;
        if (w.showConnectionWeb) setTimeout(function() { w.showConnectionWeb(); }, 1200);
      }
      this._render(
        '&ldquo;You have now seen the systems.' +
        '<br><br>The real achievement was becoming the engineer capable of building them.' +
        '<br><br><em>None of these systems stand alone. Every system depends on another.</em>' +
        '<br><br>Architecture is understanding those dependencies.' +
        '<br><br>The architect would like to hear from you.&rdquo;'
      );
    },

    openChat: function() {
      this._chatOpen = true;
      var cw = document.getElementById('orc-chat-wrap');
      var panel = document.getElementById('oracle-panel');
      if (cw) cw.style.display = '';
      if (panel) panel.classList.add('vis');
      if (this._autoHideT) clearTimeout(this._autoHideT);
      setTimeout(function() {
        var inp = document.getElementById('orc-inp');
        if (inp) inp.focus();
      }, 80);
    },

    sendChat: function() {
      var inp = document.getElementById('orc-inp');
      if (!inp || !inp.value.trim()) return;
      var q = inp.value.trim();
      inp.value = '';
      var hist = document.getElementById('orc-history');
      if (!hist) return;
      var item = document.createElement('div');
      item.innerHTML = '<div class="orc-q">&rsaquo; ' + q + '</div><div class="orc-a orc-thinking">&hellip;</div>';
      hist.appendChild(item);
      hist.scrollTop = hist.scrollHeight;
      var self = this;
      this._answer(q).then(function(ans) {
        item.querySelector('.orc-a').innerHTML = ans;
        item.querySelector('.orc-a').classList.remove('orc-thinking');
        hist.scrollTop = hist.scrollHeight;
      });
    },

    _answer: function(q) {
      var self = this;
      var ql = q.toLowerCase();

      // Scripted responses — canonical answers from Aditya
      if (/good hire|should.*hire|hire him|will he/.test(ql))
        return Promise.resolve(
          'If you need someone who only knows modern frameworks, there are many choices.' +
          '<br><br>If you need someone who has maintained legacy systems, solved migrations, designed architectures, ' +
          'built integrations, led backend development, and learned from production incidents &mdash;' +
          '<br><br><em>then the city has already answered your question.</em>'
        );
      if (/hardest|most difficult|toughest/.test(ql))
        return Promise.resolve(
          'Surya Dwara. The Single Sign-On Platform. Every application depended on it.' +
          '<br><br>Authentication is easy. <em>Trust is difficult.</em>' +
          '<br><br>Sessions, security, device management, redirects, logout coordination, user experience, ' +
          'and future scalability all had to work together.' +
          '<br><br>This was the first system where failure would affect every other system.'
        );
      if (/believ|philosophy|engineer.*think|approach|principle/.test(ql))
        return Promise.resolve(
          'Five principles, in order:<br><br>' +
          '1. Understand the business problem before writing code.<br>' +
          '2. Simple solutions survive longer than clever solutions.<br>' +
          '3. Systems fail at boundaries more often than inside applications.<br>' +
          '4. A migration is a people problem disguised as a technical problem.<br>' +
          '5. <em>The best architecture is architecture users never notice.</em>'
        );
      if (/are you ai|are you.*real|who are you/.test(ql))
        return Promise.resolve('I am the accumulated knowledge of every system this city contains. Whether that is artificial is a philosophical question for another time.');
      if (/contact|email|reach|linkedin/.test(ql))
        return Promise.resolve('The way to reach the architect is through the city. Visit every temple. Those who complete the journey find the contact stone. Or try <code>window.dharma.unlock()</code> in the browser console.');
      if (/how long.*city|how long.*portfolio|dharma.*build|build.*dharma|portfolio.*take/.test(ql))
        return Promise.resolve('The city was built in weeks. <em>The experience it represents took four years.</em>');
      if (/how long|time.*build|build.*time/.test(ql))
        return Promise.resolve('The career took four years to build. He joined Trilasoft on January 18, 2022. The systems in this city are still running.');
      if (/first.*commit|first.*code|first.*system|january.*2022|2022.*january/.test(ql))
        return Promise.resolve(
          'January 2022. First commit message: <em>&ldquo;Added relocation dashboard service order summary.&rdquo;</em>' +
          '<br><br>Every architect begins with a small commit.'
        );
      if (/first.*job|start|begin|trilasoft/.test(ql))
        return Promise.resolve('He joined Trilasoft Solutions on January 18, 2022. His first system was Pura Stambha &mdash; the ancient pillar. <em>That is where patience was learned before engineering.</em>');
      if (/lesson|learn|mistake|advice/.test(ql))
        return Promise.resolve('Five lessons, earned in order: Every shortcut becomes technical debt. Integrations fail more than applications. A migration is a business project. Most incidents begin as assumptions. <em>Simplicity survives longer than cleverness.</em>');
      if (/java|spring|mysql|language|stack|tech/.test(ql))
        return Promise.resolve('Java through all four years. Spring Boot for modern systems. MySQL for data. AWS for scale. The tools changed. The approach &mdash; schema first, trace before change, shadow before cutover &mdash; did not.');
      if (/incident|broke|failure|production/.test(ql))
        return Promise.resolve('There are four incidents recorded in the city. Find the Incident Chamber near the Dharma Chakra. Each inscription is honest. None are exaggerated.');
      if (/dharma.*oracle|oracle.*character|vaakshakti|who.*oracle/.test(ql))
        return Promise.resolve('I am Vaakshakti — Oracle of Dharma Kshetra. Try <code>window.dharma.oracle()</code> in the console for my full character sheet.');
      if (/legacy|pura|old.*code|old.*system/.test(ql))
        return Promise.resolve(
          'Pura Stambha &mdash; Struts2, Spring 3, Hibernate 5. Four years in production.' +
          '<br><br>It is not the most elegant system in the city. <em>It is the most important one.</em>' +
          '<br><br>It taught him how to read code before he changed it. Every other system benefited from that lesson.'
        );
      if (/mode|recruiter|engineer|switch/.test(ql))
        return Promise.resolve('The Recruiter view shows the shape. The Engineer view shows the decisions. <em>Both are true. Neither is complete alone.</em> Use the toggle in the top-right to switch.');
      if (/what.*city|what.*represent|what.*place/.test(ql))
        return Promise.resolve(
          'Dharma Kshetra is not a portfolio. It is an argument about what software can be.' +
          '<br><br>Craft, not commodity. Decisions, not demonstrations.' +
          '<br><br><em>The city is the evidence. The architect is the author.</em>'
        );

      // Try Claude API if key is set
      if (self._apiKey) {
        return self._callAPI(q);
      }

      return Promise.resolve('An interesting question. <em>Set a Claude API key</em> to unlock full Oracle access &mdash; or explore the temples. Many answers are written on the walls.');
    },

    _callAPI: function(q) {
      var self = this;
      var buildings = (window.CITY_DATA ? window.CITY_DATA.buildings : []).map(function(b) {
        return b.name + ': ' + b.subtitle;
      }).join(', ');
      var sys = 'You are Vaakshakti, Oracle of Dharma Kshetra. Ancient, wise, precise, occasionally dry. ' +
        'You know the story of Aditya Srivastava — Backend Architect at Trilasoft Solutions (joined Jan 18 2022). ' +
        'Career: Trainee → Junior SE → Backend Architect. First commit Jan 2022: "Added relocation dashboard service order summary". ' +
        'Key systems: ' + buildings + '. ' +
        'Hardest system: Surya Dwara (SSO Platform) — every application depended on it. Authentication is easy; trust is difficult. ' +
        'Engineering philosophy (5 principles): ' +
        '1. Understand the business problem before writing code. ' +
        '2. Simple solutions survive longer than clever solutions. ' +
        '3. Systems fail at boundaries more often than inside applications. ' +
        '4. A migration is a people problem disguised as a technical problem. ' +
        '5. The best architecture is architecture users never notice. ' +
        'Legacy system: Pura Stambha (Struts2, Spring 3, 4 years production) — proof of growth, not perfection. ' +
        'Respond in 2–4 sentences max. Reference specific temples by name. Never break character.';
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': self._apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-client-side-api-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: sys,
          messages: [{ role: 'user', content: q }],
        }),
      })
      .then(function(r) { return r.json(); })
      .then(function(d) { return (d.content && d.content[0] && d.content[0].text) ? d.content[0].text : 'The Oracle is silent.'; })
      .catch(function() { return 'The Oracle is silent on that matter. Try another question.'; });
    },

    setKey: function(k) { this._apiKey = k; _LS.set('api_key', k); },
  };

  window.ORC = ORC;
})();
