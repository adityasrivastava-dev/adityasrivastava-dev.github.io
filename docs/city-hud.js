"use strict";
const MODE = sessionStorage.getItem("vp") || "recruiter";
const chip = document.getElementById("mode-chip");
if (chip) {
  chip.textContent = MODE.toUpperCase();
  chip.className = MODE;
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
  mmCtx.fillStyle = "rgba(10,5,2,.8)";
  mmCtx.fillRect(0, 0, W, H);
  window.CITY_DATA.buildings.forEach((b) => {
    const mx = (b.pos[0] / 100 + 0.5) * W,
      mz = (b.pos[1] / 100 + 0.5) * H;
    mmCtx.fillStyle = (b.glowColor || "#888") + "cc";
    mmCtx.fillRect(mx - 3, mz - 3, 6, 6);
    // Building name dot glow
    mmCtx.fillStyle = (b.glowColor || "#888") + "44";
    mmCtx.beginPath();
    mmCtx.arc(mx, mz, 5, 0, Math.PI * 2);
    mmCtx.fill();
  });
  const cmx = (cx / 100 + 0.5) * W,
    cmz = (cz / 100 + 0.5) * H;
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

  // P4: check if all 12 temples now visited
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
  document.getElementById("jb-card").innerHTML =
    `<span class="jb-year" style="color:${col};text-shadow:0 0 40px ${col}44">${s.year}</span><div class="jb-ttl">${s.subtitle}</div><div class="jb-stl" style="color:${col}66">TRILASOFT SOLUTIONS · NOIDA, INDIA</div><div class="jb-bdy">${s.content}</div>`;
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
  jIdx = Math.max(0, Math.min(JD.length - 1, jIdx + d));
  renderJourney();
}
function openJourney() {
  document.getElementById("journey").classList.add("open");
  renderJourney();
}
function closeJourney() {
  document.getElementById("journey").classList.remove("open");
}
const WX_ICONS = {
  night: "🌙",
  day: "☀️",
  sunset: "🌅",
  fog: "🌫️",
  rain: "🌧️",
  snow: "❄️",
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
  document.getElementById("weather-label").textContent = WX_ICONS[w] || "☀️";
  const t = document.getElementById("weather-toast");
  t.textContent = (WX_ICONS[w] || "") + "  " + (WX_NAMES[w] || w.toUpperCase());
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}
let muted = false;
function doMute() {
  muted = !muted;
  if (typeof CityEngine !== "undefined")
    CityEngine.setMusicVolume(muted ? 0 : 1);
  document.getElementById("mute-btn").textContent = muted ? "🔇" : "🔊";
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
const oH = [];
document.getElementById("os").addEventListener("click", sendO);
document.getElementById("oi").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendO();
});
async function sendO() {
  const inp = document.getElementById("oi"),
    msgs = document.getElementById("om");
  const q = inp.value.trim();
  if (!q) return;
  inp.value = "";
  msgs.innerHTML += `<div class="om u">${q}</div>`;
  const th = document.createElement("div");
  th.className = "om t";
  th.textContent = "// processing · · ·";
  msgs.appendChild(th);
  msgs.scrollTop = msgs.scrollHeight;
  oH.push({ role: "user", content: q });
  const sys = `You are the Oracle of Aditya's Temple City — a sacred AI guide who speaks with wisdom and context about each temple and the system it represents.

THE CITY: Aditya Srivastava is a Backend Architect at Trilasoft Solutions Pvt Ltd, Noida, India. 4 years of backend engineering experience (2022–present).

EDUCATION: B.Sc. Math+Stats+CS from M.P.P.G. College, Gorakhpur (2015–2019) → M.Sc. Computer Science, University of Allahabad (2019–2021).

CAREER PATH: Trainee Engineer (Jan 2022) → Junior Software Engineer (Sep 2022) → Backend Architect (2024).

THE 12 TEMPLES AND THEIR SYSTEMS:
• Surya Dwara (Gopuram) = SSO Platform. Like the Sun Gate — one source of identity illuminates all 10+ internal apps. JWT RS256, WebAuthn PassKey, Single Logout. Zero breaches.
• Vishwakarma Shala (Gopuram) = API Testing Platform. Divine architect's workshop — built beyond Postman. Swagger auto-discovery, DAG flow chaining, DB console, PDF reports.
• Akasha Mandapa (Mandapa) = AWS Cloud Migration. The sky pavilion, infinite and unbound — 80+ Mule ESB apps migrated to AWS Lambda. Eliminated single point of failure.
• Setu Nagara (Shikhara) = Java 1.7/1.8 Bridge. Ram's bridge across the ocean — solved IBM MQ + MySQL 8 JDBC incompatibility via shell-script process boundary. Still running 3+ years.
• Brahma Kund (Mandapa) = MySQL Data Migrations. Primordial reservoir — MySQL 5→8→8.4 across 3 waves, shadow validation, zero data lost.
• Lakshmi Prasad (Shikhara) = LedgerFlow Financial System. Palace of wealth — idempotency keys + state machine makes duplicate invoices architecturally impossible.
• Pura Stambha (Stupa) = RedSky Legacy Monolith. The ancient pillar — Struts2/Spring3 B2B relocation platform, 4 years production, trace-first debugging philosophy.
• Maya Sabha (Stupa) = Greenfield Architecture. Maya's enchanted hall — Art Transport System + Operations App designed schema-first, both in active production.
• Jyotish Vedha (Shikhara) = Survey Integration. The observatory — automated survey-to-service-order pipeline, 100% manual re-entry eliminated.
• Vayu Rath (Shikhara) = MovePulse B2B Tracking. Wind chariot — real-time status with READ UNCOMMITTED, zero locks, zero impact on write performance.
• Saraswati Vihar (Gopuram) = University of Allahabad, M.Sc. CS (2019–2021). Goddess of knowledge.
• Gurukul Ashram (Gopuram) = M.P.P.G. College, B.Sc. Math+CS (2015–2019). Ancient teaching tradition.

PHILOSOPHY: "I build systems that work at 3am — not systems that work in demos."

Mode: ${MODE}. Answer 2-4 sentences. Speak with wisdom about both the temple mythology AND the engineering reality. Never fabricate technical details.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: sys,
        messages: oH,
      }),
    });
    const d = await r.json();
    const rep = d.content?.[0]?.text || "Oracle offline.";
    th.className = "om b";
    th.textContent = rep;
    oH.push({ role: "assistant", content: rep });
  } catch {
    th.className = "om b";
    th.textContent = "Oracle offline.";
  }
  msgs.scrollTop = msgs.scrollHeight;
}
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
let _mapInteractionsSetup = false;
const _origSetupMap = _setupMapInteractions;
// Wrap to be idempotent
function _setupMapInteractions() {
  if (_mapInteractionsSetup) return;
  _mapInteractionsSetup = true;
  _origSetupMap();
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
// World bounds: X -95..95, Z -88..65
const _WX1 = -95,
  _WX2 = 95,
  _WZ1 = -88,
  _WZ2 = 65;
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
    [45, -22, 0.06, "#00c8ff", 50], // Surya Dwara — cyan zone
    [-55, -22, 0.05, "#ffcc44", 48], // Brahma Kund — gold zone
    [0, -55, 0.05, "#4dd4ff", 44], // Jyotish — pale blue
    [-40, 35, 0.05, "#ff6b00", 42], // Lakshmi — orange
    [0, 55, 0.05, "#888888", 38], // Pura Stambha — grey legacy
    [-22, -62, 0.05, "#a78bfa", 42], // Education — violet
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
    updateGameHUD(0, w);
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
