// ── CITY DATA v3 — TEMPLE CITY ────────────────────────────────────────────────
// Hindu mythology themed portfolio — 3× bigger world, 12 temples to explore
window.CITY_DATA = {
  playerStart: { x: 0, z: 50 },

  buildings: [
    // ═══════════ HERO ZONE ════════════════════════════════════════════════
    {
      id: "surya-dwara",
      name: "Surya Dwara",
      subtitle: "SSO · IDENTITY GATEWAY",
      pos: [72, -35],
      roadPos: [72, -18],
      size: [9, 9],
      height: 58,
      glowColor: "#00c8ff",
      templeType: "gopuram",
      isHero: true,
      icon: "🌞",
      tag: "SSO · JWT RS256 · PASSKEY · RBAC",
      status: "OPERATIONAL",
      year: "2024",
      metrics: [
        { v: "10+", l: "APPS UNIFIED" },
        { v: "10K+", l: "SESSIONS" },
        { v: "0", l: "BREACHES" },
      ],
      story:
        "Every internal application had its own login. Offboarding someone meant revoking access across 10+ systems — a process that took days.\n\n<em>Aditya built Surya Dwara — a centralized SSO gateway. Like the sun, one source illuminates all.</em> One login. One logout disconnects all. One platform governs every identity.",
      outcome:
        "Zero breaches since deployment. 10+ apps unified. Offboarding reduced from days to one action.",
      connects: [
        {
          to: "All 10+ internal apps",
          how: "RS256 JWT token validation per app",
        },
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
          "Spring Security's CSRF protection conflicted with cross-domain cookie sharing for SSO. Cross-application trust boundary management required custom domain-level redirect validation.",
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
          "Custom SSO with RS256 JWT. Apps hold public key only, never the signing key. SSO_SESSION cookie scoped to root domain; apps validate via /verify endpoint.",
        impl: "<code>JWT:</code> userId, sessionId, deviceHash, appId, roles[]\n<code>SLO:</code> logout fires async callbacks to all registered app logout endpoints\n<code>PassKey:</code> WebAuthn challenge-response, device-bound credentials\n<code>RBAC:</code> app-scoped roles — admin in App A, read-only in App B",
        lesson:
          "The SSO system is a trust broker, not an auth library. Asymmetric keys for verify-without-sign.",
      },
    },

    {
      id: "vishwakarma-shala",
      name: "Vishwakarma Shala",
      subtitle: "API TESTING PLATFORM",
      pos: [45, 56],
      roadPos: [45, 40],
      size: [9, 9],
      height: 22,
      glowColor: "#7dff4f",
      templeType: "gopuram",
      isHero: true,
      icon: "⚙",
      tag: "FLOW CHAINING · SWAGGER · COVERAGE",
      status: "ACTIVE",
      year: "2024",
      metrics: [
        { v: "DAG", l: "FLOW CHAINS" },
        { v: "ZERO", l: "MANUAL COPY" },
        { v: "FULL", l: "COVERAGE" },
      ],
      story:
        "Teams tested APIs by manually copying response values into the next request. Bugs were impossible to reproduce.\n\n<em>Vishwakarma — divine architect — built the tools of the gods. Aditya built this.</em> Swagger auto-discovery. API flow chaining via DAG. DB console. Coverage tracking. PDF/Excel reports.",
      outcome:
        "Testing hours cut to minutes. Every endpoint documented and tracked.",
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
          "Postman has no dependent API chain concept. If endpoint B needs a token from A, you copy manually. No coverage tracking. Three collections for Dev/QA/Prod always drift.",
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
        impl: "<code>Swagger ingestion:</code> parse OpenAPI 3.0, auto-generate stubs\n<code>DAG execution:</code> steps as nodes, JSONPath extractors → variable slots\n<code>DB Console:</code> JDBC pool per environment, post-step assertions\n<code>Coverage:</code> endpoint status: untested / has-test / passing",
        lesson:
          "When a step fails: fail-fast with full execution log showing which variable failed to resolve.",
      },
    },

    // ═══════════ EAST DISTRICT ═══════════════════════════════════════════
    {
      id: "akasha-mandapa",
      name: "Akasha Mandapa",
      subtitle: "AWS CLOUD MIGRATION",
      pos: [88, -61],
      roadPos: [88, -45],
      size: [10, 8],
      height: 16,
      glowColor: "#00c8ff",
      templeType: "mandapa",
      icon: "☁",
      tag: "80+ MULE → LAMBDA · SPOF ELIMINATED",
      status: "OPERATIONAL",
      year: "2023",
      metrics: [
        { v: "80+", l: "APPS MIGRATED" },
        { v: "ZERO", l: "SPOF" },
        { v: "AWS", l: "LAMBDA" },
      ],
      story:
        "80+ Mule ESB applications ran on a single host. One failure and everything stops.\n\n<em>Akasha — the sky element, infinite and unbound.</em> Aditya migrated all 80+ integrations to AWS Lambda and standalone Java services. Shell-based orchestration for client-specific scheduling.",
      outcome:
        "Zero single point of failure. All 80+ integrations running independently on AWS.",
      connects: [
        {
          to: "Brahma Kund",
          how: "All Lambda functions talk to migrated MySQL 8 instance",
        },
      ],
      tech: [
        "AWS Lambda",
        "Java 8",
        "Shell Scripting",
        "Mule ESB",
        "Maven",
        "Cron",
        "AWS RDS",
      ],
      engineerDetail: {
        problem:
          "Mule ESB was a shared runtime — one misconfigured app could bring down all 80+ integrations. No isolation. Client-specific scheduling was hardcoded.",
        rejected: [
          {
            w: "Container per Mule app",
            r: "Mule licensing per deployment. Cost prohibitive for 80+ apps.",
          },
          {
            w: "Keep Mule, add redundancy",
            r: "Horizontal scale of a single-threaded ESB is not real redundancy.",
          },
        ],
        decision:
          "Replace Mule with Lambda functions + standalone Java cron services. Shell script orchestration passes client config at runtime. Each service runs in total isolation.",
        impl: "<code>script.sh:</code> param injection → Java jar invocation → AWS trigger\n<code>Per-service:</code> own JAR, own schedule, own failure domain\n<code>Migration pattern:</code> Mule config → Java service → parallel run → cutover",
        lesson:
          "Isolation is the only reliable redundancy. A service that can fail independently can also recover independently.",
      },
    },

    {
      id: "setu-nagara",
      name: "Setu Nagara",
      subtitle: "JAVA 1.7/1.8 BRIDGE",
      pos: [88, 13],
      roadPos: [88, 28],
      size: [9, 8],
      height: 14,
      glowColor: "#7dff4f",
      templeType: "shikhara",
      icon: "🌉",
      tag: "BACKWARD COMPAT · IBM MQ · HYBRID ARCH",
      status: "OPERATIONAL",
      year: "2023",
      metrics: [
        { v: "1.7", l: "LEGACY JVM" },
        { v: "1.8", l: "BRIDGE JVM" },
        { v: "LIVE", l: "3+ YEARS" },
      ],
      story:
        "The legacy system ran Java 1.7 with IBM MQ. MySQL 8 JDBC was incompatible. Neither could change.\n\n<em>Setu — the great bridge. Ram built a bridge across the ocean. Aditya built one across JVMs.</em> A Java 1.8 microservice handles DB updates. Legacy MQ passes data through shell via args[].",
      outcome:
        "Legacy system still running Java 1.7. MySQL 8 fully accessible. Bridge in production 3+ years.",
      connects: [
        {
          to: "Akasha Mandapa",
          how: "Both handle the Java version constraint pattern",
        },
      ],
      tech: [
        "Java 1.7",
        "Java 1.8",
        "IBM MQ",
        "MySQL 8",
        "Shell Scripts",
        "Runtime.exec()",
      ],
      engineerDetail: {
        problem:
          "MySQL 8 JDBC driver requires Java 1.8 minimum. IBM MQ client only certified for Java 1.7. Legacy application cannot upgrade either dependency.",
        rejected: [
          {
            w: "Upgrade IBM MQ",
            r: "License re-purchase + recertification. Not approved.",
          },
          {
            w: "HTTP microservice bridge",
            r: "Network call from legacy context unreliable under load.",
          },
        ],
        decision:
          "Shell script as the message boundary. Legacy 1.7 process invokes script. Script invokes Java 1.8 JAR as subprocess via Runtime.exec(). Data passed as args. No network hop.",
        impl: "<code>MQ receives message</code> → Java 1.7 parses → invokes script.sh with args\n<code>script.sh</code> → invokes Java 1.8 jar with args[]\n<code>Java 1.8 jar</code> → MySQL 8 JDBC → DB update → exit 0",
        lesson:
          "Process boundaries are a compatibility layer. Shell is the universal glue between incompatible runtimes.",
      },
    },

    // ═══════════ WEST DISTRICT ════════════════════════════════════════════
    {
      id: "brahma-kund",
      name: "Brahma Kund",
      subtitle: "DATA MIGRATIONS",
      pos: [-88, -35],
      roadPos: [-88, -18],
      size: [10, 8],
      height: 36,
      glowColor: "#ffcc44",
      templeType: "mandapa",
      icon: "🏺",
      tag: "3 MIGRATIONS · SHADOW VALIDATION · 0 DATA LOST",
      status: "OPERATIONAL",
      year: "2023",
      metrics: [
        { v: "3", l: "MIGRATIONS" },
        { v: "ZERO", l: "DATA LOST" },
        { v: "8.4", l: "MySQL TARGET" },
      ],
      story:
        "MySQL 5 was being deprecated by AWS. Three migration waves across two years.\n\n<em>Brahma Kund — primordial reservoir. Water is data. The kund must never run dry.</em> Shadow validation: run queries against both old and new DB, compare results before cutover.",
      outcome:
        "MySQL 5 → 8 → 8.4 across three waves. Zero data loss. Zero critical downtime.",
      connects: [
        {
          to: "Akasha Mandapa",
          how: "All Lambda functions connect to migrated MySQL 8",
        },
      ],
      tech: [
        "MySQL 5",
        "MySQL 8",
        "MySQL 8.4",
        "JDBC",
        "Shadow Validation",
        "AWS RDS",
      ],
      engineerDetail: {
        problem:
          "AWS announced deprecation of MySQL 5. Three separate migration windows across two years. Each wave risked live data corruption.",
        rejected: [
          {
            w: "Direct cutover",
            r: "No validation window. One bad query crashes production.",
          },
          {
            w: "Dump and restore",
            r: "Incompatible column types not caught until runtime.",
          },
        ],
        decision:
          "Shadow validation: run every critical query against old and new schema simultaneously. Parallel-run window minimum 72 hours before cutover.",
        impl: "<code>Shadow proxy:</code> routes query to both old + new DB\n<code>Validator:</code> row-level diff, flags any mismatch\n<code>Compatibility pass:</code> EXPLAIN all queries on new version pre-migration\n<code>Cutover:</code> only after 72h zero-diff shadow window",
        lesson:
          "Migrations fail silently. The only defense is a parallel shadow run long enough to hit every code path.",
      },
    },

    {
      id: "lakshmi-prasad",
      name: "Lakshmi Prasad",
      subtitle: "FINANCIAL LEDGER SYSTEM",
      pos: [-64, 56],
      roadPos: [-64, 40],
      size: [9, 8],
      height: 22,
      glowColor: "#ff6b00",
      templeType: "shikhara",
      icon: "💰",
      tag: "IDEMPOTENCY · STATE MACHINE · NO 2PC",
      status: "OPERATIONAL",
      year: "2024",
      metrics: [
        { v: "ZERO", l: "DUPLICATES" },
        { v: "5", l: "STATES" },
        { v: "NO", l: "2PC" },
      ],
      story:
        "Financial operations that fail mid-way leave money in an unknown state.\n\n<em>Lakshmi Prasad — palace of wealth. Lakshmi demands exactness. Chaos has no place here.</em> Idempotency keys. A strict state machine. Every duplicate request gets the same answer — without executing twice.",
      outcome:
        "Duplicate-proof financial operations. State machine makes illegal transitions architecturally impossible.",
      connects: [
        {
          to: "Brahma Kund",
          how: "Financial records in migrated MySQL schema",
        },
      ],
      tech: [
        "Java 17",
        "Spring Boot",
        "MySQL 8",
        "Idempotency Keys",
        "State Machine",
        "UUID",
      ],
      engineerDetail: {
        problem:
          "Network retries on financial endpoints caused duplicate invoices. Distributed transactions (2PC) too complex for the team to maintain correctly under pressure.",
        rejected: [
          {
            w: "2PC / distributed transaction",
            r: "Coordinator failure leaves both systems locked. Complexity risk unacceptable.",
          },
          {
            w: "Unique constraint alone",
            r: "Race condition between check and insert on high concurrency.",
          },
        ],
        decision:
          "Idempotency keys + explicit state machine. Client generates UUID. Server checks idempotency_log. If exists: return cached result. If not: execute and store.",
        impl: "<code>Idempotency key:</code> UUID → server checks idempotency_log → cached result or execute+store\n<code>State machine:</code> DRAFT→PENDING→APPROVED→INVOICED→PAID\nInvalid transition: HTTP 409 + {currentState, validTransitions[]}\n<code>Same pattern Stripe uses.</code>",
        lesson:
          "Idempotency is simpler than transactions and more reliable under network failure.",
      },
    },

    // ═══════════ CENTRAL DISTRICT ════════════════════════════════════════
    {
      id: "pura-stambha",
      name: "Pura Stambha",
      subtitle: "LEGACY MONOLITH — REDSKY",
      pos: [0, 88],
      roadPos: [0, 72],
      size: [8, 8],
      height: 13,
      glowColor: "#ff6b00",
      templeType: "stupa",
      icon: "🗿",
      tag: "STRUTS2 · SPRING3 · 4 YEARS PRODUCTION",
      status: "OPERATIONAL",
      year: "2022",
      metrics: [
        { v: "4YR", l: "IN PROD" },
        { v: "B2B", l: "RELOCATION" },
        { v: "TRACE", l: "FIRST" },
      ],
      story:
        "RedSky — a massive B2B relocation platform. Struts2. Spring 3. Hibernate 5. This was Aditya's classroom.\n\n<em>Pura Stambha — the ancient pillar. It has stood for decades. It will stand longer.</em> Trace before you change. Every production bug taught more than a textbook.",
      outcome:
        "4 years in production. Zero critical outages. Every lesson learned here informs every system built since.",
      connects: [
        { to: "Brahma Kund", how: "All data in migrated MySQL schema" },
      ],
      tech: [
        "Struts2",
        "Spring 3",
        "Hibernate 5",
        "MySQL 5",
        "Tomcat",
        "Java 1.7",
        "IBM MQ",
      ],
      engineerDetail: {
        problem:
          "Debugging production issues in a 10-year-old Struts2 codebase with no observability. Business logic scattered across Action classes with no clear ownership.",
        rejected: [
          {
            w: "Full rewrite",
            r: "System too critical, team too small, timeline too short.",
          },
          {
            w: "Big refactor",
            r: "No test coverage to validate refactors. Too risky.",
          },
        ],
        decision:
          "Trace-first: add logging at every entry and exit point before changing anything. Build mental model of actual flow before touching code.",
        impl: "<code>Trace:</code> log method entry + exit + duration + params\n<code>Rule:</code> never change code you can't trace first\n<code>Bug fix pattern:</code> reproduce → trace → isolate → fix → verify trace",
        lesson:
          "You cannot fix what you cannot see. Observability is not optional even in legacy systems.",
      },
    },

    {
      id: "maya-sabha",
      name: "Maya Sabha",
      subtitle: "GREENFIELD ARCHITECTURE",
      pos: [-45, -61],
      roadPos: [-45, -45],
      size: [8, 8],
      height: 14,
      glowColor: "#c084fc",
      templeType: "stupa",
      icon: "🏗",
      tag: "ATS · OPS APP · SCHEMA-FIRST DESIGN",
      status: "ACTIVE",
      year: "2024",
      metrics: [
        { v: "2", l: "GREENFIELD" },
        { v: "FROM", l: "SCHEMA UP" },
        { v: "LIVE", l: "IN PROD" },
      ],
      story:
        "Two systems built from nothing: Art Transport System and Operations App.\n\n<em>Maya Sabha — the enchanted hall built by Maya, the divine architect. Built in 14 days. It looked like one thing and behaved like another.</em> Schema, API contracts, service layer — all designed before writing a line of business logic.",
      outcome:
        "Two production systems designed and delivered. Zero legacy constraints. Clean architecture from day one.",
      connects: [
        {
          to: "Surya Dwara",
          how: "Both systems integrated with SSO on day one",
        },
      ],
      tech: [
        "Java 17",
        "Spring Boot",
        "MySQL 8.4",
        "REST API",
        "Hibernate",
        "Maven",
        "Swagger",
      ],
      engineerDetail: {
        problem:
          "Greenfield systems are easy to do wrong: schema designed late, API contracts after implementation, no clear service boundaries.",
        rejected: [
          {
            w: "Code first, schema later",
            r: "Schema is the contract. Everything depends on it. It must come first.",
          },
          {
            w: "Single-layer app",
            r: "Controller-direct-to-DB is fast and always regretted.",
          },
        ],
        decision:
          "Schema-first. Design all entities before writing a line of code. Define API contract (Swagger YAML) before implementation. Service layer as the only business logic boundary.",
        impl: "<code>Phase 1:</code> ER diagram + schema review\n<code>Phase 2:</code> Swagger YAML contracts (no code yet)\n<code>Phase 3:</code> Service layer with interfaces\n<code>Phase 4:</code> Implementation behind interfaces",
        lesson:
          "Greenfield means you have exactly one chance to get the schema right. Always worth three extra days on the data model.",
      },
    },

    // ═══════════ SOUTH DISTRICT ═══════════════════════════════════════════
    {
      id: "jyotish-vedha",
      name: "Jyotish Vedha",
      subtitle: "SURVEY INTEGRATION SYSTEM",
      pos: [0, -88],
      roadPos: [0, -72],
      size: [8, 8],
      height: 16,
      glowColor: "#4dd4ff",
      templeType: "shikhara",
      icon: "📡",
      tag: "100% AUTOMATED · CONFIGURABLE MAPPING",
      status: "OPERATIONAL",
      year: "2022",
      metrics: [
        { v: "100%", l: "AUTOMATED" },
        { v: "ZERO", l: "MANUAL ENTRY" },
        { v: "LIVE", l: "INTEGRATION" },
      ],
      story:
        "Surveyors completed inspections on mobile. Results had to be manually re-entered into the core system.\n\n<em>Jyotish Vedha — the observatory where astronomers watch the stars. Every data point has its place.</em> End-to-end survey-to-service-order pipeline. Zero manual re-entry.",
      outcome:
        "Manual re-entry eliminated. Survey-to-service-order pipeline fully automated.",
      connects: [
        {
          to: "Pura Stambha",
          how: "Survey data maps into core RedSky service orders",
        },
      ],
      tech: [
        "Java",
        "Spring Boot",
        "MySQL 5",
        "REST API",
        "Mobile Integration",
        "Hibernate",
      ],
      engineerDetail: {
        problem:
          "Survey app and RedSky had no integration. Surveyors emailed PDFs. Manual data entry took 2-3 hours per survey. Errors were frequent.",
        rejected: [
          {
            w: "File-based transfer (CSV/Excel)",
            r: "Format errors, encoding issues, no validation.",
          },
          {
            w: "Third-party ETL",
            r: "Survey schema changes would break the ETL every sprint.",
          },
        ],
        decision:
          "Direct REST integration. Survey app POSTs structured payload on submission. Mapping layer is configurable per-client. Validation at intake, not post-entry.",
        impl: "<code>Survey submit:</code> POST /survey/complete → intake validator → mapper → service-order writer\n<code>Configurable mapping:</code> client-specific field mappings in config table\n<code>Shipment mapper:</code> survey items → RedSky shipment records + itemization",
        lesson:
          "Every manual data entry step is a bug waiting to happen. Automate the boundary, not just the process.",
      },
    },

    {
      id: "vayu-rath",
      name: "Vayu Rath",
      subtitle: "REAL-TIME B2B TRACKING",
      pos: [-88, 13],
      roadPos: [-88, 28],
      size: [8, 8],
      height: 15,
      glowColor: "#ff9950",
      templeType: "shikhara",
      icon: "⚡",
      tag: "READ UNCOMMITTED · ZERO LOCK · REAL-TIME",
      status: "OPERATIONAL",
      year: "2022",
      metrics: [
        { v: "REAL", l: "TIME" },
        { v: "B2B", l: "CLIENT FACING" },
        { v: "ZERO", l: "LOCKS" },
      ],
      story:
        "B2B clients needed real-time visibility into relocation jobs. Every status check was slowing down writes.\n\n<em>Vayu Rath — the wind-chariot of Vayu. Nothing faster. Nothing waits for nothing.</em> The controversial choice: READ UNCOMMITTED for status reads. Stale by milliseconds. Never locking.",
      outcome: "Real-time tracking with zero impact on write performance.",
      connects: [
        {
          to: "Pura Stambha",
          how: "Reads from core RedSky operational tables",
        },
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
          "Tracking reads shared the same MySQL instance as all operational writes. Table scans degrading write performance. No read replica available.",
        rejected: [
          { w: "Read replica", r: "Infrastructure change not in scope." },
          {
            w: "Redis cache",
            r: "Cache invalidation in high-write environment is complex.",
          },
        ],
        decision:
          "Zero-contention queries: index-covered reads, minimal columns, bounded pagination. READ UNCOMMITTED for status reads.",
        impl: "<code>EXPLAIN ANALYZE:</code> target 'Using index'. Never 'Using filesort'.\n<code>READ UNCOMMITTED</code> for status reads — stale by milliseconds acceptable, locks are not.\n<code>Column selection:</code> only status, timestamp, job_id — never SELECT *",
        lesson:
          "READ UNCOMMITTED is a tool, not a smell. Correct tradeoff for status fields where millisecond staleness is acceptable.",
      },
    },

    // ═══════════ EDUCATION DISTRICT ═══════════════════════════════════════
    {
      id: "saraswati-vihar",
      name: "Saraswati Vihar",
      subtitle: "M.SC. COMPUTER SCIENCE",
      pos: [35, -99],
      roadPos: [35, -83],
      size: [10, 9],
      height: 18,
      glowColor: "#a78bfa",
      templeType: "gopuram",
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
        "<em>Saraswati — goddess of knowledge, wisdom, and learning. This is where Aditya sat at her feet.</em>\n\nMaster of Science in Computer Science, University of Allahabad, Prayagraj · 2019–2021\n\nAlgorithms. Data structures. Distributed systems. Software engineering. Database design. Every architecture decision since traces back to these two years.",
      outcome:
        "M.Sc. Computer Science. The theoretical grounding behind every system designed since.",
      connects: [
        {
          to: "Trilasoft 2022",
          how: "M.Sc. led directly to backend architecture career",
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

    {
      id: "gurukul-ashram",
      name: "Gurukul Ashram",
      subtitle: "B.SC. MATH · STATS · CS",
      pos: [-35, -99],
      roadPos: [-35, -83],
      size: [10, 9],
      height: 16,
      glowColor: "#34d399",
      templeType: "gopuram",
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
        "<em>Gurukul — the ancient teaching tradition. Student lives with the teacher. Knowledge is total immersion.</em>\n\nB.Sc. in Mathematics, Statistics & Computer Science, M.P. P.G. College, Gorakhpur · 2015–2019\n\nMathematical rigor. Statistical thinking. The combination of math and computing shaped every data model since.",
      outcome:
        "B.Sc. Math + CS. Mathematical thinking that informs every data model and algorithmic choice.",
      connects: [
        {
          to: "Saraswati Vihar",
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

    // ═══════════ OPEN SOURCE PROJECTS ══════════════════════════════════════
    {
      id: "vaishya-griha",
      name: "Vaishya Griha",
      subtitle: "BIZSUITE · OFFLINE BUSINESS SUITE",
      pos: [131, -35],
      roadPos: [104, -35],
      size: [9, 9],
      height: 20,
      glowColor: "#4f9cf9",
      templeType: "gopuram",
      isHero: true,
      icon: "🏪",
      tag: "NEXT.JS 14 · TAURI · INDEXEDDB · GST",
      status: "ACTIVE",
      year: "2025",
      metrics: [
        { v: "ZERO", l: "BACKEND" },
        { v: "TAURI", l: "DESKTOP APP" },
        { v: "MULTI", l: "TENANT" },
      ],
      story:
        "Every shop in India runs on three notebooks. One for inventory, one for suppliers, one for clients. Three notebooks, three chances for error, three things to lose.\n\n<em>Vaishya Griha — the merchant's house. Built for the people who build commerce.</em> BizSuite runs entirely on-device — no server, no internet required. Full GST invoicing, POS, inventory, purchase orders, delivery challans. One app. Zero monthly cost.",
      outcome:
        "Offline-first business suite deployable on any Windows PC. Zero backend dependency. Full Indian retail workflow in one app.",
      connects: [
        { to: "Vishwakarma Shala", how: "Both built around the idea that teams deserve purpose-built tools, not repurposed generic software" },
      ],
      tech: ["Next.js 14", "TypeScript", "Tauri", "Dexie.js", "IndexedDB", "Zustand", "shadcn/ui", "Tailwind CSS"],
      engineerDetail: {
        problem:
          "Indian retail shops have unreliable internet but need a full ERP stack. Cloud tools (Tally, Zoho) require constant connectivity and charge per-user monthly fees that are prohibitive for small traders.",
        rejected: [
          { w: "Firebase Firestore", r: "Requires internet. Unacceptable for a shop where the router is down 30% of the time." },
          { w: "SQLite via Tauri native", r: "IndexedDB via Dexie.js is already battle-tested in browsers, transactional, and needs no native bridge for basic operations." },
        ],
        decision:
          "Offline-first via IndexedDB (Dexie.js). Next.js 14 static export for Tauri builds. Every table enforces tenantId — same binary, different data per client onboarded by the developer.",
        impl: "<code>DB layer:</code> Dexie.js strict tenantId on every table — zero cross-tenant leakage\n<code>Auth:</code> PIN-locked roles (Owner/Staff) — session-based, no server tokens\n<code>Build:</code> next build → static export → Tauri bundles as .exe installer\n<code>Locale:</code> next-intl for English/Hindi bilingual UI",
        lesson:
          "Offline-first forces correct data model design. You cannot rely on the server to resolve conflicts — the local model must be authoritative.",
      },
    },

    {
      id: "agni-vedha",
      name: "Agni Vedha",
      subtitle: "TESTFORGE · API TEST AUTOMATION",
      pos: [131, 13],
      roadPos: [104, 13],
      size: [8, 8],
      height: 16,
      glowColor: "#f97316",
      templeType: "shikhara",
      icon: "🔥",
      tag: "OPENAPI · 7 RULES · CI/CD · ZERO AI",
      status: "ACTIVE",
      year: "2025",
      metrics: [
        { v: "7", l: "TEST RULES" },
        { v: "ZERO", l: "AI — DETERMINISTIC" },
        { v: "CI", l: "READY" },
      ],
      story:
        "AI-generated tests are non-deterministic. You can't review them, can't reproduce them, can't trust them in CI.\n\n<em>Agni Vedha — proof by fire. The ancient way to verify truth with no room for ambiguity.</em> TestForge reads your OpenAPI spec and applies 7 deterministic rules — happy path, missing fields, invalid auth, CRUD chaining, schema validation, not-found, bad query params. Same spec, same tests, every run.",
      outcome:
        "Generate, run, and report on API test suites from any OpenAPI spec. Zero manual test writing. Full CI/CD integration.",
      connects: [
        { to: "Vishwakarma Shala", how: "Vishwakarma Shala solves the internal testing problem. TestForge is the open-source, framework-agnostic evolution of that same idea." },
      ],
      tech: ["TypeScript", "pnpm Workspaces", "Turbo", "OpenAPI 3.0", "axios", "Commander", "Inquirer", "Chalk"],
      engineerDetail: {
        problem:
          "AI-generated test suites produce different tests on every run — unverifiable in code review and unreliable in CI. Existing tools (Postman, RestAssured) require engineers to write test code, which most teams don't sustain.",
        rejected: [
          { w: "AI test generation", r: "Non-deterministic. Cannot be reviewed. CI breaks randomly. Not a substitute for a deterministic spec-driven suite." },
          { w: "Recorder-style tools", r: "Only capture flows you've already manually run. Can't generate edge cases from the spec alone." },
        ],
        decision:
          "7 deterministic rule-based generators on a universal EndpointModel. Same OpenAPI spec always produces same tests. Plugin-based so Spring, FastAPI, and Django analyzers all feed the same generator pipeline.",
        impl: "<code>Analyzer:</code> OpenAPI/Spring/FastAPI → universal EndpointModel\n<code>7 Rules:</code> happy-path, missing-required-field, invalid-auth, crud-chain, schema-validate, not-found, bad-query-param\n<code>Runner:</code> axios with concurrency, retries, stop-on-fail\n<code>Reporter:</code> interactive HTML dashboard + JUnit XML for CI",
        lesson:
          "Determinism is a feature, not a limitation. A test suite that produces the same results every time is worth 10× a suite that might find something new.",
      },
    },

    {
      id: "darpana-shala",
      name: "Darpana Shala",
      subtitle: "API STUDIO · IN-BROWSER TESTING",
      pos: [45, -77],
      roadPos: [45, -61],
      size: [8, 8],
      height: 14,
      glowColor: "#22d3ee",
      templeType: "mandapa",
      icon: "🪞",
      tag: "ANGULAR 19 · SPRING BOOT · ONE JAR",
      status: "ACTIVE",
      year: "2025",
      metrics: [
        { v: "ONE", l: "JAR DEPLOY" },
        { v: "MOCK", l: "SERVER BUILT-IN" },
        { v: "ZERO", l: "CORS ISSUES" },
      ],
      story:
        "Postman is owned by a company with a pricing page. API Studio is owned by no one.\n\n<em>Darpana Shala — the hall of mirrors. It shows your API exactly as it is, not as you hope it is.</em> Request builder, mock server with templating, load tester, GraphQL editor, WebSocket/SSE support, TLS inspector, fuzzer, DB console. All bundled into one deployable JAR.",
      outcome:
        "Full Postman-equivalent that deploys as a single JAR. Zero CORS, zero separate deploy, zero monthly cost.",
      connects: [
        { to: "Vishwakarma Shala", how: "Vishwakarma Shala is the internal Trilasoft tool. API Studio is the open-source personal version — more features, no constraints." },
      ],
      tech: ["Angular 19", "TypeScript 5.7", "Spring Boot 3.0", "Java 17", "Spring Security", "RxJS 7.8", "Flying Saucer", "OpenPDF"],
      engineerDetail: {
        problem:
          "Postman has become bloated and subscription-gated. Lightweight alternatives lack mock servers, load testing, or WebSocket support. Running a separate dev server adds CORS and auth complexity.",
        rejected: [
          { w: "React + separate backend", r: "Two processes, CORS headers, two deploys. Every developer needs both running simultaneously." },
          { w: "Electron wrapper", r: "Just to serve a web app locally — significant packaging overhead for no real benefit over a JAR." },
        ],
        decision:
          "Angular 19 standalone components with signals (no NgRx) + Spring Boot that serves the compiled Angular app as static assets in the same JAR. One process, one deploy, zero CORS.",
        impl: "<code>State:</code> Angular 19 signals — no external library, zero RxJS for component state\n<code>Build:</code> ng build → Angular dist → Spring Boot /static/ → single JAR\n<code>Mock server:</code> Handlebars-style dynamic template variables in response bodies\n<code>Auth:</code> stateless HTTP Basic — no session state needed",
        lesson:
          "Bundle your frontend into your backend JAR. One process eliminates an entire class of deployment and CORS problems permanently.",
      },
    },

    {
      id: "vidya-ashram",
      name: "Vidya Ashram",
      subtitle: "DEVLEARNER · INTERVIEW PREP AI",
      pos: [-131, -35],
      roadPos: [-104, -35],
      size: [9, 9],
      height: 20,
      glowColor: "#a3e635",
      templeType: "gopuram",
      icon: "🧠",
      tag: "SM-2 · AI INTERVIEWER · DOCKER RUNNER",
      status: "ACTIVE",
      year: "2025",
      metrics: [
        { v: "SM-2", l: "SPACED REPETITION" },
        { v: "3-TIER", l: "AI FALLBACK" },
        { v: "DOCKER", l: "CODE RUNNER" },
      ],
      story:
        "Most interview prep is passive. You read. You forget. You read again. Ebbinghaus proved this 140 years ago.\n\n<em>Vidya Ashram — the hermitage of knowledge. Where learning happens in silence, repeatedly, until it becomes reflex.</em> DevLearner uses SM-2 spaced repetition to schedule each concept to appear just as it's about to be forgotten. Combined with an AI interviewer, 70+ algorithm visualizations, and Docker-isolated code execution.",
      outcome:
        "Full interview prep platform with spaced repetition, AI mock interviews, and live code execution. Built for backend engineers targeting MAANG.",
      connects: [
        { to: "Surya Dwara", how: "DevLearner uses JWT RS256 auth — the same pattern designed and proven at Surya Dwara" },
      ],
      tech: ["Spring Boot 3.2", "Java 17", "MySQL 8.0", "React 19", "Vite", "Zustand", "Monaco Editor", "Docker", "Groq API", "SM-2"],
      engineerDetail: {
        problem:
          "Generic platforms (LeetCode, InterviewBit) optimize for quantity over retention. Engineers solve 200 problems, forget 180 of them, and fail the interview anyway. The learning algorithm matters more than the content.",
        rejected: [
          { w: "Redis/Kafka for execution queue", r: "Over-engineering for a side project. MySQL polling at 400ms is sufficient and eliminates an entire infrastructure dependency." },
          { w: "GPT-4 as primary AI", r: "Cost: GPT-4 at $15/1M tokens vs Groq (free tier) for 95% of prompts. 3-tier fallback handles the remaining 5%." },
        ],
        decision:
          "SM-2 algorithm for spaced repetition (each card tracks ease_factor and interval). Async MySQL queue for code execution. 3-tier AI fallback: Groq → Gemini → OpenAI. Each tier activates only on failure of the previous.",
        impl: "<code>SM-2:</code> ease_factor + interval per card, adjusted on each review (1=again → 5=easy)\n<code>Execution:</code> async MySQL queue → child JVM or Docker container → result callback\n<code>AI fallback:</code> try Groq → on error try Gemini → on error try OpenAI\n<code>Voice:</code> Web Speech API for voice-enabled mock interview mode",
        lesson:
          "The learning algorithm matters more than the content. SM-2 is 40 years old and still the best algorithm for long-term recall.",
      },
    },

    {
      id: "sutra-dhara",
      name: "Sutra Dhara",
      subtitle: "PORTFOLIO API · VISITOR ANALYTICS",
      pos: [0, 115],
      roadPos: [0, 96],
      size: [7, 7],
      height: 13,
      glowColor: "#f43f5e",
      templeType: "stupa",
      icon: "📡",
      tag: "SPRING BOOT · TELEGRAM · SESSION EVENTS",
      status: "OPERATIONAL",
      year: "2025",
      metrics: [
        { v: "4", l: "ENDPOINTS" },
        { v: "ZERO", l: "THIRD-PARTY SDK" },
        { v: "LIVE", l: "TELEGRAM ALERTS" },
      ],
      story:
        "A portfolio without analytics is a message in a bottle. You never know if anyone read it.\n\n<em>Sutra Dhara — the thread-holder. The sutra connects every bead. Aditya holds the thread of every visitor who walked this city.</em> Four endpoints: session ping, event log (which temple you entered, how long you stayed), duration update every 30s, and JS error capture. Every unique visitor sends a Telegram notification.",
      outcome:
        "Lightweight self-hosted analytics backend. No third-party SDK. Real-time Telegram notification on every unique portfolio visit.",
      connects: [
        { to: "Surya Dwara", how: "Portfolio API uses the same JWT + Spring Security pattern proven at Surya Dwara" },
      ],
      tech: ["Spring Boot 3.2", "Java 17", "MySQL", "Spring Security", "Spring Data JPA", "Hibernate", "Telegram Bot API"],
      engineerDetail: {
        problem:
          "Google Analytics tracks page views. It can't track 'player entered the Brahma Kund temple at 2:14am'. Custom game events for a portfolio require a custom backend — no existing analytics SDK speaks game state.",
        rejected: [
          { w: "Google Analytics", r: "No custom game events. Privacy-invasive. Adds a cookie consent banner to a portfolio. Not acceptable." },
          { w: "Self-hosted Plausible", r: "Still no game events. Running a full Docker stack for 4 simple endpoints is severe overkill." },
        ],
        decision:
          "4-endpoint Spring Boot API. Session on first ping, event logging per user action, rolling duration updates, JS error capture. Telegram bot sends a message on every unique session.",
        impl: "<code>POST /ping:</code> create session, return total visitor count\n<code>POST /event:</code> log {type, metadata} — types: district_entered, temple_visited, oracle_asked, contact_clicked\n<code>PATCH /session/:id/duration:</code> called every 30s while user is active\n<code>POST /error:</code> captures frontend JS exceptions with stack trace + browser info",
        lesson:
          "Analytics should answer questions you actually have, not questions analytics vendors invented. Build exactly what you need to know.",
      },
    },
  ],
};
