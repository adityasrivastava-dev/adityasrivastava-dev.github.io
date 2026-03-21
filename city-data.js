// ── CITY DATA v2 ──────────────────────────────────────────────────────────────
// Layout redesign: buildings are beside roads, not on them
// Roads run through the center of districts
// Each building has a ROAD-SIDE checkpoint in front of it

window.CITY_DATA = {
  playerStart: { x: 0, z: 18 },

  // ── ROAD NETWORK ──────────────────────────────────────────────────────────
  // All roads defined as segments. Buildings sit BESIDE these roads.
  // Main loop road: outer ring + cross streets
  //
  //        [-40,0]───────[0,0]────────[40,0]    ← E-W Main Blvd (z=0)
  //           |             |              |
  //        [-40,-30]──[0,-30]────────[40,-30]   ← Education Ave (z=-30)
  //           |             |              |
  //        [-40,30]───[0,30]─────────[40,30]    ← South Blvd (z=30)

  // ── BUILDINGS (positioned BESIDE roads) ──────────────────────────────────
  buildings: [
    // ────── HERO ZONE (near center, buildings on LEFT/RIGHT of main cross) ──

    // Auth Tower: LEFT side of N-S road, facing road at x=-12
    {
      id: "auth-tower",
      name: "Auth Tower",
      subtitle: "SSO PLATFORM",
      pos: [-16, -8],
      roadPos: [-12, -8], // building pos, checkpoint on road edge
      facing: "right", // faces the road (east)
      size: [6, 6],
      height: 18,
      color: 0x0a1e3d,
      glowColor: "#00c8ff",
      roofColor: 0x0d2a55,
      windowColor: 0x66bbff,
      type: "skyscraper",
      isHero: true,
      icon: "🏛",
      tag: "SSO · JWT · PASSKEY · RBAC",
      status: "OPERATIONAL",
      year: "2024",
      metrics: [
        { v: "10+", l: "APPS" },
        { v: "10K+", l: "SESSIONS" },
        { v: "0", l: "BREACHES" },
      ],
      story:
        "Every internal application had its own login. When someone left the company, access had to be revoked manually across every system — a process that took days.\n\n<em>Aditya built a centralized SSO platform from scratch.</em> One login for every app. One logout disconnects all. Offboarding is a single action.",
      outcome:
        "Zero breaches since deployment. 10+ apps unified under one identity layer.",
      connects: [
        { to: "All internal apps", how: "Routes identity through this system" },
      ],
      tech: [
        "Java 17",
        "Spring Boot",
        "JWT RS256",
        "MySQL 8",
        "WebAuthn",
        "RBAC",
        "SLO",
      ],
      engineerDetail: {
        problem:
          "Spring Security's built-in CSRF protection directly conflicted with the cross-domain cookie sharing model required for SSO. Cross-application trust boundary management required custom domain-level redirect validation.",
        rejected: [
          {
            w: "Spring Security OAuth2",
            r: "Default CSRF intercepted cross-app redirect flows — more risk than writing custom.",
          },
          {
            w: "Shared JWT secret",
            r: "Every app holds the signing key. Rotation requires coordinated redeploy of all 10+ apps.",
          },
        ],
        decision:
          "Custom SSO with RS256 JWT. Apps hold public key only, never signing key. SSO_SESSION cookie scoped to root domain; apps validate via /verify endpoint. Device fingerprinting in user_session prevents cookie replay.",
        impl: "<code>JWT</code> RS256: userId, sessionId, deviceHash, appId, roles[]\n<code>SLO:</code> logout fires async callbacks to all registered app logout endpoints\n<code>PassKey:</code> WebAuthn challenge-response, device-bound credentials\n<code>RBAC:</code> app-scoped roles — admin in App A, read-only in App B",
        lesson:
          "The SSO system is a trust broker, not an auth library. Asymmetric keys for verify-without-sign.",
      },
    },

    // API Forge: RIGHT side of N-S road
    {
      id: "api-forge",
      name: "API Forge",
      subtitle: "DEV PRODUCTIVITY TOOL",
      pos: [16, -8],
      roadPos: [12, -8],
      facing: "left",
      size: [6, 6],
      height: 16,
      color: 0x0a2200,
      glowColor: "#7dff4f",
      roofColor: 0x0d3300,
      windowColor: 0x99ff66,
      type: "factory",
      isHero: true,
      icon: "⚙",
      tag: "FLOW CHAINING · SWAGGER · COVERAGE",
      status: "ACTIVE",
      year: "2024",
      metrics: [
        { v: "CHAIN", l: "FLOWS" },
        { v: "ZERO", l: "BOTTLENECK" },
        { v: "FULL", l: "COVERAGE" },
      ],
      story:
        "Teams tested APIs by manually copying response values into the next request, one at a time. Bugs were impossible to reproduce.\n\n<em>Aditya built an internal testing platform beyond Postman.</em> Swagger auto-discovery. API flow chaining. DB console. Coverage tracking. PDF reports.",
      outcome:
        "Testing hours cut to minutes. Every endpoint has documented coverage.",
      connects: [
        {
          to: "All backend services",
          how: "Tests every API across Dev/QA/Prod",
        },
      ],
      tech: [
        "Java",
        "Spring Boot",
        "OpenAPI 3.0",
        "JSONPath",
        "JDBC",
        "iText PDF",
        "Apache POI",
      ],
      engineerDetail: {
        problem:
          "Postman has no dependent API chain concept — if endpoint B needs a token from A, you copy manually. No coverage tracking. Three separate collections for Dev/QA/Prod that always drift.",
        rejected: [
          {
            w: "Extend Postman",
            r: "Runner is a black box. No DB validation, no flow chaining without forking.",
          },
          {
            w: "RestAssured + JUnit",
            r: "Requires engineers to write test code. QA team is not Java developers.",
          },
        ],
        decision:
          "Purpose-built tool. Swagger/OpenAPI as source of truth. Flow chaining uses a DAG: each step declares JSONPath extractors, injecting into subsequent steps.",
        impl: "<code>Swagger ingestion:</code> parse OpenAPI 3.0, auto-generate stubs\n<code>DAG execution:</code> steps as nodes, JSONPath extractors → variable slots\n<code>DB Console:</code> JDBC pool per environment, post-step assertions\n<code>Coverage:</code> endpoint status: untested/has-test/passing",
        lesson:
          "When a step fails: fail-fast with full execution log showing which variable failed to resolve. 10× faster debugging.",
      },
    },

    // Cloud District: RIGHT side of E-W road (north side)
    {
      id: "cloud-district",
      name: "Cloud District",
      subtitle: "AWS MIGRATION HQ",
      pos: [30, -6],
      roadPos: [30, -1],
      facing: "down",
      size: [7, 5],
      height: 14,
      color: 0x051530,
      glowColor: "#00c8ff",
      roofColor: 0x081f45,
      windowColor: 0x66aaff,
      type: "skyscraper",
      icon: "☁",
      tag: "MULE ESB → AWS LAMBDA · 80+ APPS",
      status: "OPERATIONAL",
      year: "2023",
      metrics: [
        { v: "80+", l: "MIGRATED" },
        { v: "1", l: "SPOF REMOVED" },
        { v: "ZERO", l: "DOWNTIME" },
      ],
      story:
        "80+ business processes ran through a single Mule ESB. One crash brought everything down simultaneously.\n\n<em>Aditya led the full migration.</em> Each process now runs independently. Designed the script.sh execution layer for scheduling and environment injection.",
      outcome:
        "Each of 80+ processes now fails independently. What was one catastrophic failure domain is now 80 isolated ones.",
      connects: [
        {
          to: "Data Vaults",
          how: "Ran in parallel — both modernized the platform foundation",
        },
      ],
      tech: [
        "AWS Lambda",
        "SQS",
        "Java",
        "Mule ESB",
        "Shell Scripting",
        "Cron",
      ],
      engineerDetail: {
        problem:
          "Mule ESB: centralized bus. 80+ flows share one JVM, one thread pool. GC pause or memory leak in any one flow brings all 80 down.",
        rejected: [
          {
            w: "Mule ESB HA cluster",
            r: "Doubles license cost. Still shared JVM — rogue flow exhausts thread pools.",
          },
          {
            w: "Single Spring Boot replacement",
            r: "Same SPOF problem, different technology.",
          },
        ],
        decision:
          "One deployment unit per integration. Lambda for event-triggered. JAR+cron for batch. script.sh handles all variability without embedding it in Java code.",
        impl: "<code>Lambda:</code> stateless, triggered by SQS/SNS, one responsibility each\n<code>script.sh:</code> sources env config → typed args to JAR → exit code → log → retry\n<code>Migration sequence:</code> Mule analysis → parity test → parallel run → disable",
        lesson:
          "script.sh decouples scheduling from execution logic, makes every job testable independently.",
      },
    },

    // The Bridge: RIGHT side road, lower
    {
      id: "the-bridge",
      name: "The Bridge",
      subtitle: "LEGACY INTEGRATION",
      pos: [30, 14],
      roadPos: [30, 9],
      facing: "down",
      size: [7, 4],
      height: 6,
      color: 0x1a1a00,
      glowColor: "#7dff4f",
      roofColor: 0x2a2a00,
      windowColor: 0xffff88,
      type: "bridge",
      icon: "🌉",
      tag: "JAVA 1.7 · IBM MQ · BACKWARD COMPAT",
      status: "OPERATIONAL",
      year: "2023",
      metrics: [
        { v: "0", l: "REWRITES" },
        { v: "SOLO", l: "DESIGNED" },
        { v: "LIVE", l: "RUNNING" },
      ],
      story:
        "IBM MQ ran on Java 1.7. The target database needed MySQL 8. MySQL 8's JDBC driver requires Java 1.8. MQ upgrade: blocked by license cost. Rewrite: months of risk.\n\n<em>Aditya designed a backward compatibility architecture. Solo. Neither side needed to change.</em>",
      outcome:
        "Integration live with zero changes to either legacy system. Still running.",
      connects: [
        {
          to: "Data Vaults",
          how: "Enabled MySQL 8 migration for legacy systems",
        },
      ],
      tech: [
        "Java 1.7",
        "Java 1.8",
        "IBM MQ",
        "MySQL 8",
        "Runtime.exec",
        "Shell Script",
      ],
      engineerDetail: {
        problem:
          "IBM MQ client jar compiled for Java 1.7 bytecode. MySQL 8 JDBC requires java.time (Java 1.8). ClassFormatError at runtime. Physical JVM classloader constraint.",
        rejected: [
          {
            w: "MySQL 5.x driver",
            r: "Breaks on caching_sha2_password (MySQL 8 default auth plugin).",
          },
          {
            w: "Downgrade to MySQL 5",
            r: "MySQL 5→8 migration already in progress platform-wide.",
          },
        ],
        decision:
          "Two JVM processes with different classpath isolation. Java 1.8 bridge handles MySQL. Java 1.7 invokes via Runtime.exec with typed key=value arguments. Stateless bridge.",
        impl: '<code>Bridge main():</code> typed args op=UPDATE id=123. Exit: 0=success, 1=runtime, 2=config\n<code>Legacy:</code> Runtime.exec("script.sh op=UPDATE id=123"). Reads stdout.',
        lesson:
          "Runtime.exec is usually a code smell; here it's the correct architectural primitive for classloader isolation.",
      },
    },

    // Data Vaults: LEFT side road
    {
      id: "data-vaults",
      name: "Data Vaults",
      subtitle: "MYSQL MIGRATION HQ",
      pos: [-30, -6],
      roadPos: [-30, -1],
      facing: "down",
      size: [7, 6],
      height: 10,
      color: 0x1a1000,
      glowColor: "#ffcc44",
      roofColor: 0x2a1a00,
      windowColor: 0xffdd88,
      type: "bunker",
      icon: "🏦",
      tag: "MYSQL 5→8→8.4 · 3 MIGRATIONS · ZERO LOSS",
      status: "OPERATIONAL",
      year: "2023",
      metrics: [
        { v: "3×", l: "MIGRATIONS" },
        { v: "0", l: "DATA LOST" },
        { v: "<10m", l: "CUTOVER" },
      ],
      story:
        "AWS deprecated MySQL 5. The entire platform — 80+ services, live enterprise clients — depended on it.\n\n<em>Led three sequential MySQL migrations over two years.</em> 5.x → 8.0 → 8.4. Zero data lost. Clients never knew.",
      outcome:
        "Platform on fully supported MySQL. Three cutovers, each under 10 minutes. Zero data lost.",
      connects: [
        { to: "The Bridge", how: "Bridge enabled MySQL 8 for legacy systems" },
      ],
      tech: [
        "MySQL 5.x",
        "MySQL 8.0",
        "MySQL 8.4",
        "Connector/J",
        "Hibernate",
        "Shadow DB",
      ],
      engineerDetail: {
        problem:
          "MySQL 8 STRICT mode was off by default in 5.x — years of queries silently truncating strings, inserting zero-dates, using non-deterministic GROUP BY. 80+ services affected.",
        rejected: [
          {
            w: "STRICT_TRANS_TABLES=off",
            r: 'Migration "succeeds" while keeping all latent bugs.',
          },
          {
            w: "Automated query rewriting",
            r: "Tools catch syntactic issues but not semantic ones.",
          },
        ],
        decision:
          "Shadow validation. Run MySQL 5 and 8 in parallel. Replay production writes. Compare. Fix discrepancies before cutover. Migrate services in batches.",
        impl: "<code>STRICT audit:</code> GROUP BY violations → ANY_VALUE(), zero-dates → NULL, truncation → widen columns\n<code>Auth plugin:</code> mysql_native_password → caching_sha2_password\n<code>Cutover:</code> snapshot → batch switchover → validation → rollback checkpoint",
        lesson:
          "Real work in a DB migration is surfacing assumptions. MySQL 5's lax mode encoded data corruption silently.",
      },
    },

    // LedgerFlow: LEFT side road, lower
    {
      id: "ledgerflow",
      name: "LedgerFlow",
      subtitle: "FINANCIAL DISTRICT",
      pos: [-30, 14],
      roadPos: [-30, 9],
      facing: "down",
      size: [5, 5],
      height: 12,
      color: 0x200800,
      glowColor: "#ff6b00",
      roofColor: 0x301000,
      windowColor: 0xffaa66,
      type: "skyscraper",
      icon: "💳",
      tag: "PO · INVOICING · IDEMPOTENCY",
      status: "ACTIVE",
      year: "2024",
      metrics: [
        { v: "IDEM", l: "POTENT" },
        { v: "NO 2PC", l: "BY DESIGN" },
        { v: "STATE", l: "MACHINE" },
      ],
      story:
        "Financial records cannot be wrong, duplicated, or lost — even when the same message arrives twice.\n\n<em>Designed LedgerFlow with idempotency keys and a strict state machine.</em> DRAFT → PENDING → APPROVED → INVOICED → PAID.",
      outcome:
        "Duplicate invoice creation is architecturally impossible. Real money, zero errors.",
      connects: [{ to: "Auth Tower", how: "Financial ops are role-protected" }],
      tech: [
        "Java 17",
        "Spring Boot",
        "MySQL 8",
        "State Machine",
        "Idempotency Keys",
      ],
      engineerDetail: {
        problem:
          "At-least-once message delivery means the same message can arrive twice. 2-phase commit was the obvious candidate.",
        rejected: [
          {
            w: "2-phase commit (2PC)",
            r: "Locks across a network round-trip. Coordinator failure = both services stuck.",
          },
          {
            w: "Saga with compensating transactions",
            r: "Reversing an invoice after it's been emailed is not a technical rollback.",
          },
        ],
        decision:
          "Clear ownership + idempotency keys + state machine. No distributed transactions if each entity has one owner and every op accepts an idempotency key.",
        impl: "<code>Idempotency key:</code> UUID → server checks idempotency_log → cached result or execute+store\n<code>State machine:</code> DRAFT→PENDING→APPROVED→INVOICED→PAID\nInvalid: HTTP 409 + {currentState, validTransitions[]}\n<code>Same pattern Stripe uses.</code>",
        lesson:
          "Distributed transaction and consistency are not synonyms. Design ownership boundaries correctly.",
      },
    },

    // Monolith: LEFT of N-S road, upper
    {
      id: "monolith",
      name: "Monolith Quarter",
      subtitle: "REDSKY · THE ORIGIN",
      pos: [-16, 8],
      roadPos: [-12, 8],
      facing: "right",
      size: [6, 6],
      height: 9,
      color: 0x120800,
      glowColor: "#ff6b00",
      roofColor: 0x1e1000,
      windowColor: 0xffcc88,
      type: "factory",
      icon: "🏭",
      tag: "STRUTS2 · SPRING 3 · THE FOUNDATION",
      status: "OPERATIONAL",
      year: "2022",
      metrics: [
        { v: "2022", l: "JOINED" },
        { v: "WEEKS", l: "TO PROD FIX" },
        { v: "LIVE", l: "ENTERPRISE" },
      ],
      story:
        "Placed on RedSky — a massive B2B relocation platform on Struts2/Spring3/Hibernate5. So tightly coupled most engineers needed months before touching production safely.\n\n<em>Delivered production fixes within weeks of joining.</em>",
      outcome:
        "Trusted on live enterprise code in weeks. Every system built afterward carries these lessons.",
      connects: [
        {
          to: "Everything",
          how: "Every system built afterward informed by discipline learned here",
        },
      ],
      tech: ["Struts 2", "Spring 3", "Hibernate 5", "MySQL 5.x", "Java 8"],
      engineerDetail: {
        problem:
          "Change locality is non-obvious. A change in Customer File has effects in Survey, Shipment, Service Order, Work Ticket through shared Hibernate entities and Spring bean chains.",
        rejected: [
          {
            w: "Read whole codebase first",
            r: "Not practical. Code doesn't explain why things are the way they are.",
          },
          {
            w: "Small changes to see what breaks",
            r: "Live enterprise clients. Breaking production is not an acceptable learning method.",
          },
        ],
        decision:
          "Trace-first methodology. Before touching any code: trace the complete data path end-to-end. Customer File → Hibernate entity → service bean → Struts2 action.",
        impl: "<code>Domain model:</code> Customer Info → Customer File → Survey → Shipment → Service Order → Work Ticket → Account Claiming\n<code>First fix:</code> traced DashboardAction → HQL → found GROUP BY silently wrong in MySQL 5",
        lesson:
          "Legacy systems are a change-locality problem. Trace before touching.",
      },
    },

    // Architecture Quarter: RIGHT of N-S road, upper
    {
      id: "arch-quarter",
      name: "Arch Quarter",
      subtitle: "ATS · OPS APP",
      pos: [16, 8],
      roadPos: [12, 8],
      facing: "left",
      size: [6, 5],
      height: 11,
      color: 0x100020,
      glowColor: "#c084fc",
      roofColor: 0x1a0035,
      windowColor: 0xddaaff,
      type: "modern",
      icon: "🏗",
      tag: "GREENFIELD · LEAD ARCHITECT",
      status: "OPERATIONAL",
      year: "2024",
      metrics: [
        { v: "2×", l: "SYSTEMS" },
        { v: "LEAD", l: "ARCHITECT" },
        { v: "PROD", l: "RUNNING" },
      ],
      story:
        "High-value art assets moving between cities with zero tracking. Field operations teams with no digital tools.\n\n<em>Led backend architecture for two greenfield systems from zero to production.</em>",
      outcome:
        "Both systems in production. Full asset audit trail. Field teams work offline and sync on reconnect.",
      connects: [
        { to: "LedgerFlow", how: "Field ops generate financial records" },
      ],
      tech: [
        "Java 17",
        "Spring Boot",
        "MySQL 8",
        "State Machine",
        "Offline Sync",
        "OpenAPI 3.0",
      ],
      engineerDetail: {
        problem:
          "ATS: naive if/else transition logic becomes O(N²). Ops App: last-write-wins reconciliation silently discards legitimate server-side updates.",
        rejected: [
          {
            w: "Conditional transition logic",
            r: "O(N²) conditionals. Untestable in isolation.",
          },
          {
            w: "Online-only",
            r: "Field operatives cannot pause work when signal drops.",
          },
        ],
        decision:
          "ATS: Transition validity matrix — 2D lookup validTransitions[from][to]=boolean. Ops App: optimistic local state with sequence numbers, server replays.",
        impl: "<code>Transition matrix:</code> PICKED_UP→[IN_TRANSIT], IN_TRANSIT→[DELIVERED,RETURNED]\n<code>Offline:</code> append-only operation log → sequence stamps → server reconciliation",
        lesson:
          "Transition matrix turns state machine from scattered conditional logic into an explicit, testable data structure.",
      },
    },

    // Survey Bridge: lower, beside south road
    {
      id: "survey-bridge",
      name: "Survey Bridge",
      subtitle: "DATA PIPELINE",
      pos: [16, 22],
      roadPos: [12, 22],
      facing: "left",
      size: [6, 4],
      height: 7,
      color: 0x001122,
      glowColor: "#4dd4ff",
      roofColor: 0x002244,
      windowColor: 0x88ccff,
      type: "bridge",
      icon: "🔗",
      tag: "PIPELINE · INTEGRATION · 100% AUTO",
      status: "OPERATIONAL",
      year: "2023",
      metrics: [
        { v: "100%", l: "AUTOMATED" },
        { v: "0", l: "MANUAL" },
        { v: "0", l: "ERROR" },
      ],
      story:
        "Survey data disconnected from the operations system. A team member manually copied data every single day.\n\n<em>Designed the full integration pipeline.</em> Zero human in the loop.",
      outcome:
        "Daily manual data entry eliminated. Data arrives the moment a survey is completed.",
      connects: [
        {
          to: "Monolith Quarter",
          how: "Survey results feed directly into Service Orders",
        },
      ],
      tech: [
        "Java",
        "Spring Boot",
        "MySQL",
        "Idempotent APIs",
        "Mapping Table",
        "Mobile State",
      ],
      engineerDetail: {
        problem:
          "Survey items and monolith items use different data models. Mobile surveyors work with unreliable signal — must handle partial completion and crash restart.",
        rejected: [
          {
            w: "Periodic batch sync",
            r: "Survey done at 3pm, Service Order at midnight. Delays cascade.",
          },
          {
            w: "Survey app writes to monolith DB",
            r: "Tight coupling. A monolith schema change breaks the survey app.",
          },
        ],
        decision:
          "Server-side pipeline. Survey service owns mapping logic via configurable DB table (no redeploy needed). Mobile state stored server-side per section.",
        impl: "<code>Mapping table:</code> survey_item_type → monolith_item_category in DB\n<code>Idempotent submission:</code> survey_id as key → re-submission returns 200",
        lesson:
          "Configurable mapping table turned a deployment event into a configuration event.",
      },
    },

    // MovePulse: lower, beside south road
    {
      id: "movepulse",
      name: "MovePulse",
      subtitle: "TRACKING STATION",
      pos: [-16, 22],
      roadPos: [-12, 22],
      facing: "right",
      size: [5, 5],
      height: 8,
      color: 0x1a0800,
      glowColor: "#ff9950",
      roofColor: 0x2a1000,
      windowColor: 0xffcc88,
      type: "antenna",
      icon: "📡",
      tag: "REAL-TIME · B2B · SQL PERF",
      status: "OPERATIONAL",
      year: "2022",
      metrics: [
        { v: "RT", l: "REAL-TIME" },
        { v: "OPT", l: "SQL PERF" },
        { v: "B2B", l: "CLIENTS" },
      ],
      story:
        "Enterprise clients had zero visibility into their relocations.\n\n<em>Built the backend query layer for real-time tracking</em> — optimized SQL reads from a shared operational database without degrading write performance.",
      outcome:
        "Clients see live status at any time. Account manager call volume dropped.",
      connects: [
        { to: "Monolith Quarter", how: "Reads from core operational database" },
      ],
      tech: [
        "MySQL 5",
        "EXPLAIN ANALYZE",
        "Index-Only Scans",
        "Hibernate",
        "Spring Data",
      ],
      engineerDetail: {
        problem:
          "Tracking reads share the same MySQL instance as all operational writes. Table scans degrade write performance. No read replica available.",
        rejected: [
          { w: "Read replica", r: "Infrastructure change not in scope." },
          {
            w: "Redis cache",
            r: "Cache invalidation in high-write environment is complex. Stale status unacceptable.",
          },
        ],
        decision:
          "Write zero-contention queries: index-covered reads, minimal columns, bounded pagination. Goal: tracking reads invisible to the write path.",
        impl: '<code>EXPLAIN ANALYZE:</code> target "Using index". Never "Using filesort".\n<code>READ UNCOMMITTED</code> for status reads — stale by milliseconds acceptable, locks are not.',
        lesson:
          "READ UNCOMMITTED is a tool, not a smell. Correct tradeoff for status fields.",
      },
    },

    // University of Allahabad: education district (south)
    {
      id: "univ-allahabad",
      name: "University Tower",
      subtitle: "M.SC. COMPUTER SCIENCE",
      pos: [-10, -38],
      roadPos: [-10, -33],
      facing: "down",
      size: [7, 7],
      height: 16,
      color: 0x100025,
      glowColor: "#a78bfa",
      roofColor: 0x18003a,
      windowColor: 0xccbbff,
      type: "university",
      isEducation: true,
      icon: "🎓",
      tag: "UNIVERSITY OF ALLAHABAD · 2019–2021",
      status: "COMPLETED",
      year: "2019–2021",
      metrics: [
        { v: "M.Sc.", l: "DEGREE" },
        { v: "CS", l: "MAJOR" },
        { v: "2021", l: "GRADUATED" },
      ],
      story:
        "<em>Master of Science in Computer Science</em>\nUniversity of Allahabad, Prayagraj, India · 2019–2021\n\nDeep study of algorithms, data structures, software engineering, database systems, and distributed computing. Built the academic foundation for every architecture decision.",
      outcome:
        "M.Sc. in Computer Science. The theoretical grounding that informs every architecture decision.",
      connects: [
        {
          to: "Trilasoft (2022)",
          how: "M.Sc. directly led to backend architecture career",
        },
      ],
      tech: [
        "Algorithms",
        "Data Structures",
        "DBMS",
        "Software Engineering",
        "Distributed Systems",
        "OOP",
      ],
      engineerDetail: null,
    },

    // M.P. P.G. College
    {
      id: "mpg-college",
      name: "M.P.P.G. College",
      subtitle: "B.SC. MATH · STATS · CS",
      pos: [10, -38],
      roadPos: [10, -33],
      facing: "down",
      size: [7, 6],
      height: 11,
      color: 0x002210,
      glowColor: "#34d399",
      roofColor: 0x003318,
      windowColor: 0xaaffcc,
      type: "university",
      isEducation: true,
      icon: "📚",
      tag: "M.P. P.G. COLLEGE · GORAKHPUR · 2015–2019",
      status: "COMPLETED",
      year: "2015–2019",
      metrics: [
        { v: "B.Sc.", l: "DEGREE" },
        { v: "MATH+CS", l: "MAJOR" },
        { v: "2019", l: "GRADUATED" },
      ],
      story:
        "<em>Bachelor of Science — Mathematics, Statistics & Computer Science</em>\nM.P. P.G. College, Gorakhpur, India · 2015–2019\n\nFoundational studies in pure mathematics, statistical analysis, and computer science. The combination of mathematical rigor and computing fundamentals shaped the analytical approach to system design.",
      outcome:
        "B.Sc. with Mathematics, Statistics & CS. Mathematical thinking that informs every data model.",
      connects: [
        {
          to: "University of Allahabad",
          how: "B.Sc. qualified for M.Sc. Computer Science",
        },
      ],
      tech: [
        "Mathematics",
        "Statistics",
        "Computer Science",
        "Programming Fundamentals",
        "Discrete Math",
      ],
      engineerDetail: null,
    },
  ],

  // ── JOURNEY SLIDES ────────────────────────────────────────────────────────
  // Used by the Journey Board — arrow-key navigation
  journey: [
    {
      year: "2015",
      title: "The Beginning",
      subtitle: "M.P. P.G. College, Gorakhpur",
      content:
        "Started Bachelor of Science in Mathematics, Statistics & Computer Science. First exposure to programming fundamentals, discrete math, and algorithms. The mathematical rigor here would shape every future architecture decision.",
      type: "education",
      color: "#34d399",
      icon: "📚",
    },
    {
      year: "2019",
      title: "Graduate Studies",
      subtitle: "University of Allahabad, Prayagraj",
      content:
        "Master of Science in Computer Science. Deep dive into distributed systems, database design, software engineering principles, and advanced algorithms. This is where theoretical foundations became practical thinking.",
      type: "education",
      color: "#a78bfa",
      icon: "🎓",
    },
    {
      year: "Jan 2022",
      title: "Trainee Engineer",
      subtitle: "Trilasoft Solutions Pvt. Ltd.",
      content:
        "Joined Trilasoft as a Trainee Engineer, placed directly on RedSky — a massive B2B relocation platform built on Struts2/Spring3/Hibernate5. Most engineers needed months before touching production. He was delivering fixes within weeks.",
      type: "career",
      color: "#ff6b00",
      icon: "🚀",
    },
    {
      year: "Sep 2022",
      title: "Junior Software Engineer",
      subtitle: "Promoted · Trilasoft Solutions",
      content:
        "Promoted to Junior Software Engineer after demonstrating production-ready work at pace. Started working on MovePulse (real-time tracking) and the Survey Bridge integration — first systems designed end-to-end.",
      type: "career",
      color: "#ff9950",
      icon: "⬆",
    },
    {
      year: "2023",
      title: "System Modernization",
      subtitle: "Led platform-wide upgrades",
      content:
        "Led three MySQL migrations (5.x → 8.0 → 8.4), zero data lost across all three. Simultaneously led the migration of 80+ Mule ESB applications to AWS Lambda and standalone Java services — eliminating the platform's single point of failure.",
      type: "milestone",
      color: "#ffcc44",
      icon: "⚡",
    },
    {
      year: "2023",
      title: "The Bridge",
      subtitle: "Solo architecture decision",
      content:
        "Designed the Java 1.7/1.8 backward compatibility architecture entirely solo. IBM MQ client incompatible with MySQL 8 JDBC — solved without touching either legacy system. The bridge is still running.",
      type: "milestone",
      color: "#7dff4f",
      icon: "🌉",
    },
    {
      year: "2024",
      title: "Backend Architect",
      subtitle: "Promoted · Lead Architect",
      content:
        "Promoted to Backend Architect. Led two greenfield systems (ATS + Operations App) from schema design to production. Both in active use. Designed LedgerFlow — financial system where duplicate records are architecturally impossible.",
      type: "career",
      color: "#c084fc",
      icon: "🏛",
    },
    {
      year: "2024",
      title: "Auth Tower",
      subtitle: "Platform identity layer",
      content:
        "Built the centralized SSO platform from scratch — JWT with RS256, PassKey authentication, Single Logout, per-application RBAC. 10+ applications unified. 10K+ sessions managed. Zero breaches.",
      type: "milestone",
      color: "#00c8ff",
      icon: "🔐",
    },
    {
      year: "2024",
      title: "API Forge",
      subtitle: "Developer productivity",
      content:
        "Built an internal API testing platform beyond Postman — Swagger auto-discovery, API flow chaining via DAG execution, DB console, environment comparison, PDF/Excel reports, coverage tracking. Changed how the entire team works.",
      type: "milestone",
      color: "#7dff4f",
      icon: "⚙",
    },
    {
      year: "4 Years",
      title: "Every System Still Running",
      subtitle: "Trilasoft Solutions · Ongoing",
      content:
        'Four years. Ten systems designed and built. Three database migrations. Eighty integrations modernized. Zero breaches. Zero critical downtime. Every system still running.\n\n"I build systems that work at 3am — not systems that work in demos."',
      type: "present",
      color: "#ffffff",
      icon: "∞",
    },
  ],
};
