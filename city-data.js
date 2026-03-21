// ── CITY DATA v3 — TEMPLE CITY ────────────────────────────────────────────────
// Hindu mythology themed portfolio — 3× bigger world, 12 temples to explore
window.CITY_DATA = {
  playerStart: { x: 0, z: 40 },

  buildings: [
    // ═══════════ HERO ZONE ════════════════════════════════════════════════
    {
      id: "surya-dwara",
      name: "Surya Dwara",
      subtitle: "SSO · IDENTITY GATEWAY",
      pos: [45, -22],
      roadPos: [45, -12],
      size: [9, 9],
      height: 18,
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
      pos: [28, 35],
      roadPos: [28, 25],
      size: [9, 9],
      height: 17,
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
      pos: [55, -38],
      roadPos: [45, -38],
      size: [10, 8],
      height: 13,
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
      pos: [55, 8],
      roadPos: [45, 8],
      size: [9, 8],
      height: 12,
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
      pos: [-55, -22],
      roadPos: [-45, -22],
      size: [10, 8],
      height: 13,
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
      pos: [-40, 35],
      roadPos: [-40, 25],
      size: [9, 8],
      height: 14,
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
      pos: [0, 55],
      roadPos: [0, 45],
      size: [8, 8],
      height: 11,
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
      pos: [-28, -38],
      roadPos: [-28, -28],
      size: [8, 8],
      height: 12,
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
      pos: [0, -55],
      roadPos: [0, -45],
      size: [8, 8],
      height: 13,
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
      pos: [-55, 8],
      roadPos: [-45, 8],
      size: [8, 8],
      height: 12,
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
      pos: [-22, -62],
      roadPos: [-22, -52],
      size: [10, 9],
      height: 14,
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
      pos: [22, -62],
      roadPos: [22, -52],
      size: [10, 9],
      height: 12,
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
  ],
};
