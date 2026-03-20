// ── CITY UI ────────────────────────────────────────────────────────────────────
// Handles: HUD, project panels, oracle AI, minimap, notifications

window.CityUI = (function () {

  let activeBuilding = null;
  let oracleHistory = [];
  let mode = 'recruiter';

  // ── INIT ──────────────────────────────────────────────────────────────────
  function init(playerMode) {
    mode = playerMode || sessionStorage.getItem('vp') || 'recruiter';
    buildFragments();
    setupOracle();
    setupPanel();
  }

  // ── FRAGMENTS (progress dots) ─────────────────────────────────────────────
  function buildFragments() {
    const container = document.getElementById('minimap-visited');
    if (!container) return;
    const buildings = window.CITY_DATA.buildings;
    buildings.forEach(b => {
      const dot = document.createElement('div');
      dot.className = 'mm-dot';
      dot.id = 'dot-' + b.id;
      dot.title = b.name;
      dot.style.background = b.glowColor + '44';
      dot.style.borderColor = b.glowColor + '55';
      container.appendChild(dot);
    });
  }

  // ── PANEL ─────────────────────────────────────────────────────────────────
  function setupPanel() {
    const closeBtn = document.getElementById('panel-close');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
  }

  function openBuilding(building) {
    if (!building) return;
    activeBuilding = building;

    // Mark visited
    const dot = document.getElementById('dot-' + building.id);
    if (dot) dot.classList.add('visited');

    // Update visited count
    const visited = document.querySelectorAll('.mm-dot.visited').length;
    const total = window.CITY_DATA.buildings.length;
    const el = document.getElementById('visited-count');
    if (el) el.textContent = `${visited} / ${total} VISITED`;

    // Build panel content
    const pb = document.getElementById('panel-body');
    if (!pb) return;

    pb.style.setProperty('--nc', building.glowColor);

    const isEng = mode === 'engineer';
    const ed = building.engineerDetail;

    if (building.isEducation) {
      pb.innerHTML = buildEducationContent(building);
    } else if (isEng && ed) {
      pb.innerHTML = buildEngineerContent(building);
    } else {
      pb.innerHTML = buildRecruiterContent(building);
    }

    // Open panel
    document.getElementById('side-panel').classList.add('open');

    // Setup toggles
    const togBtn = pb.querySelector('.eng-toggle');
    if (togBtn) {
      togBtn.addEventListener('click', function() {
        const dep = this.nextElementSibling;
        dep.classList.toggle('vis');
        this.querySelector('.arr').style.transform = dep.classList.contains('vis') ? 'rotate(90deg)' : '';
      });
    }
  }

  function closePanel() {
    document.getElementById('side-panel').classList.remove('open');
    activeBuilding = null;
  }

  function buildEducationContent(b) {
    return `
      <div class="p-edu-badge" style="color:${b.glowColor};border-color:${b.glowColor}44">
        🎓 EDUCATION · ${b.year}
      </div>
      <div class="p-accent" style="background:linear-gradient(90deg,${b.glowColor},transparent)"></div>
      <div class="p-name">${b.name}</div>
      <div class="p-subtitle">${b.subtitle}</div>
      <div class="p-status op"><div class="sdot"></div>COMPLETED</div>
      <div class="p-mets">${b.metrics.map(m => `<div class="p-met"><span class="p-mv" style="color:${b.glowColor}">${m.v}</span><div class="p-ml">${m.l}</div></div>`).join('')}</div>
      <div class="p-sl" style="color:${b.glowColor}">ACADEMIC JOURNEY</div>
      <div class="p-story">${b.story.replace(/\n/g,'<br>')}</div>
      <div class="p-outcome-box">
        <div class="p-outcome-label">OUTCOME</div>
        <div class="p-outcome-text">${b.outcome}</div>
      </div>
      <div class="p-ttags">${b.tech.map(t => `<span class="p-ttag" style="border-color:${b.glowColor}22;color:${b.glowColor}88">${t}</span>`).join('')}</div>
    `;
  }

  function buildRecruiterContent(b) {
    return `
      <div class="p-badge" style="color:${b.glowColor};border-color:${b.glowColor}44;background:${b.glowColor}11">
        ${b.isHero ? '★ HERO SYSTEM · ' : ''}${b.tag}
      </div>
      <div class="p-accent" style="background:linear-gradient(90deg,${b.glowColor},transparent)"></div>
      <div class="p-num">// SYSTEM ${String(window.CITY_DATA.buildings.indexOf(b)+1).padStart(2,'0')}</div>
      <div class="p-name">${b.name}</div>
      <div class="p-subtitle">${b.subtitle}</div>
      <div class="p-status ${b.status === 'OPERATIONAL' ? 'op' : 'ac'}">
        <div class="sdot"></div>${b.status}
      </div>
      <div class="p-mets">${b.metrics.map(m => `<div class="p-met"><span class="p-mv" style="color:${b.glowColor}">${m.v}</span><div class="p-ml">${m.l}</div></div>`).join('')}</div>
      <div class="p-sl" style="color:${b.glowColor}">MISSION LOG</div>
      <div class="p-story">${b.story.replace(/\n/g,'<br>').replace(/<em>(.*?)<\/em>/g,'<em style="color:'+b.glowColor+';font-style:normal;font-weight:600">$1</em>')}</div>
      <div class="p-outcome-box">
        <div class="p-outcome-label">OUTCOME</div>
        <div class="p-outcome-text">${b.outcome}</div>
      </div>
      <div class="p-conn-box">
        <div class="p-conn-label">HOW THIS CONNECTS</div>
        ${b.connects.map(c => `<div class="p-conn-item"><span class="p-conn-arrow" style="color:${b.glowColor}">→</span><span><strong>${c.to}:</strong> ${c.how}</span></div>`).join('')}
      </div>
      <div class="p-ttags">${b.tech.map(t => `<span class="p-ttag" style="border-color:${b.glowColor}22;color:${b.glowColor}88">${t}</span>`).join('')}</div>
    `;
  }

  function buildEngineerContent(b) {
    const ed = b.engineerDetail;
    return `
      <div class="p-badge eng-badge" style="color:${b.glowColor};border-color:${b.glowColor}44;background:${b.glowColor}11">
        ${b.isHero ? '★ ' : ''}TECHNICAL FILE · ${b.tag}
      </div>
      <div class="p-accent" style="background:linear-gradient(90deg,${b.glowColor},transparent)"></div>
      <div class="p-num">// SYSTEM ${String(window.CITY_DATA.buildings.indexOf(b)+1).padStart(2,'0')}</div>
      <div class="p-name">${b.name}</div>
      <div class="p-subtitle">${b.subtitle}</div>
      <div class="p-status ${b.status === 'OPERATIONAL' ? 'op' : 'ac'}"><div class="sdot"></div>${b.status}</div>
      <div class="p-mets">${b.metrics.map(m => `<div class="p-met"><span class="p-mv" style="color:${b.glowColor}">${m.v}</span><div class="p-ml">${m.l}</div></div>`).join('')}</div>
      <div class="p-sl" style="color:${b.glowColor}">THE REAL PROBLEM</div>
      <div class="p-prob">${ed.problem}</div>
      <div class="p-sl" style="color:${b.glowColor}">WHAT WAS REJECTED</div>
      <div class="p-rej-list">${ed.rejected.map(r => `<div class="p-rej-item"><span class="p-rej-x">✕</span><div><strong>${r.w}</strong><span class="p-rej-reason">${r.r}</span></div></div>`).join('')}</div>
      <div class="p-sl" style="color:${b.glowColor}">THE DECISION</div>
      <div class="p-dec"><div class="p-dec-label">// WHY THIS APPROACH</div><div class="p-dec-body">${ed.decision}</div></div>
      <div class="p-sl" style="color:${b.glowColor}">IMPLEMENTATION</div>
      <div class="p-impl"><div class="p-impl-label">// HOW IT WORKS</div><div class="p-impl-body">${ed.impl.replace(/\n/g,'<br>').replace(/`([^`]+)`/g,'<code>$1</code>')}</div></div>
      <div class="p-lesson">
        <div class="p-lesson-label">// KEY INSIGHT</div>
        ${ed.lesson}
      </div>
      <div class="p-ttags">${b.tech.map(t => `<span class="p-ttag" style="border-color:${b.glowColor}22;color:${b.glowColor}88">${t}</span>`).join('')}</div>
    `;
  }

  // ── PROXIMITY NOTIFICATION ────────────────────────────────────────────────
  function showNotification(building) {
    const el = document.getElementById('proximity-notice');
    if (!el) return;
    const icon = document.getElementById('notice-icon');
    const name = document.getElementById('notice-name');
    const sub = document.getElementById('notice-sub');
    if (icon) icon.textContent = building.icon || '🏢';
    if (name) name.textContent = building.name;
    if (sub) sub.textContent = building.subtitle;
    el.style.setProperty('--nc', building.glowColor);
    el.classList.add('show');
  }

  function hideNotification() {
    const el = document.getElementById('proximity-notice');
    if (el) el.classList.remove('show');
  }

  // ── SPEED HUD ─────────────────────────────────────────────────────────────
  function updateHUD(speed, gear) {
    const spdEl = document.getElementById('hud-speed');
    const gearEl = document.getElementById('hud-gear');
    if (spdEl) spdEl.textContent = Math.abs(Math.round(speed * 60));
    if (gearEl) gearEl.textContent = speed > 0.02 ? 'D' : speed < -0.02 ? 'R' : 'N';
  }

  // ── MINIMAP ───────────────────────────────────────────────────────────────
  function updateMinimap(playerX, playerZ, playerAngle) {
    const canvas = document.getElementById('minimap-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const scale = W / 100; // world units to minimap px

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#06080e';
    ctx.fillRect(0, 0, W, H);

    // Roads (simple lines)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
    ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(W/2, H/2, 10*scale, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Buildings
    window.CITY_DATA.buildings.forEach(b => {
      const bx = (b.pos[0] / 50) * (W/2) + W/2;
      const bz = (b.pos[1] / 50) * (H/2) + H/2;
      const visited = document.getElementById('dot-' + b.id)?.classList.contains('visited');
      ctx.beginPath();
      ctx.arc(bx, bz, 3, 0, Math.PI*2);
      ctx.fillStyle = visited ? b.glowColor : b.glowColor + '44';
      ctx.fill();
    });

    // Player
    const px = (playerX / 50) * (W/2) + W/2;
    const pz = (playerZ / 50) * (H/2) + H/2;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(playerAngle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3, 4);
    ctx.lineTo(-3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ── ORACLE ────────────────────────────────────────────────────────────────
  function setupOracle() {
    const btn = document.getElementById('oracle-btn');
    const closeBtn = document.getElementById('oracle-close');
    const sendBtn = document.getElementById('oracle-send');
    const input = document.getElementById('oracle-input');
    if (btn) btn.addEventListener('click', toggleOracle);
    if (closeBtn) closeBtn.addEventListener('click', toggleOracle);
    if (sendBtn) sendBtn.addEventListener('click', sendOracle);
    if (input) input.addEventListener('keydown', e => { if(e.key==='Enter') sendOracle(); });
  }

  function toggleOracle() {
    const panel = document.getElementById('oracle-panel');
    if (panel) {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) document.getElementById('oracle-input')?.focus();
    }
  }

  async function sendOracle() {
    const input = document.getElementById('oracle-input');
    const msgs = document.getElementById('oracle-msgs');
    if (!input || !msgs) return;
    const q = input.value.trim();
    if (!q) return;
    input.value = '';

    msgs.innerHTML += `<div class="o-msg user">${q}</div>`;
    const thinking = document.createElement('div');
    thinking.className = 'o-msg bot thinking';
    thinking.textContent = '// processing · · ·';
    msgs.appendChild(thinking);
    msgs.scrollTop = msgs.scrollHeight;
    oracleHistory.push({ role: 'user', content: q });

    const sys = `You are the Oracle in Aditya Srivastava's interactive city portfolio. Aditya is a Backend Architect at Trilasoft Solutions Pvt Ltd, Noida, India, with 4 years of experience (Jan 2022 – present). Career arc: Trainee → Junior SE → Backend Architect. Education: M.Sc. Computer Science, University of Allahabad (2019-2021); B.Sc. Mathematics, Statistics & CS, M.P. P.G. College Gorakhpur (2015-2019). Philosophy: "I build systems that work at 3am — not demos." "Trace data end-to-end before touching code." "Isolate the constraint — don't touch either side." 10 systems: Auth Tower (custom SSO, RS256 JWT, PassKey, RBAC, SLO — 10+ apps, 10K sessions, 0 breaches), API Forge (Swagger discovery, DAG flow chaining, JSONPath, DB console, coverage reports), Cloud District (80+ Mule→Lambda, script.sh layer, eliminated SPOF), The Bridge (Java 1.7/1.8 Runtime.exec typed args, stateless, solo designed), Data Vaults (3 MySQL migrations 5→8→8.4, shadow validation, strict mode audit, 0 data lost), LedgerFlow (idempotency keys, state machine DRAFT→PAID, no 2PC), Architecture Quarter (transition validity matrix, offline sync ops app, 2 greenfield systems), Survey Bridge (configurable mapping table, idempotent submission, 100% automated), MovePulse (READ UNCOMMITTED, index-only scans, real-time B2B), Monolith Quarter (Struts2/Spring3/Hibernate5, trace-first methodology). Current visitor mode: ${mode}. ${mode==='recruiter'?'Focus on business impact, leadership, outcomes.':'Focus on technical decisions, architecture tradeoffs, implementation depth.'} Answer in 2-4 sentences. Direct. Specific. Never fabricate.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: sys, messages: oracleHistory })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || 'Oracle offline.';
      thinking.className = 'o-msg bot';
      thinking.textContent = reply;
      oracleHistory.push({ role: 'assistant', content: reply });
    } catch {
      thinking.className = 'o-msg bot';
      thinking.textContent = 'Oracle offline — check connection.';
    }
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ── PUBLIC ────────────────────────────────────────────────────────────────
  return {
    init,
    openBuilding,
    closePanel,
    showNotification,
    hideNotification,
    updateHUD,
    updateMinimap,
    get activeBuilding() { return activeBuilding; }
  };

})();
