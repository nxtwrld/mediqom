# Mediqom NIS2 Compliance Assessment

**Date:** 2026-06-04
**Framework:** NIS2 — Directive (EU) 2022/2555 (transposition deadline 17 Oct 2024)
**Scope:** Cybersecurity risk-management measures (Art. 21), governance (Art. 20), and
incident-reporting obligations (Art. 23), assessed against the Mediqom codebase and
operating practices.
**Companion documents:** [`SECURITY_REPORT.md`](SECURITY_REPORT.md) (HIPAA/AppSec audit),
[`CRYPTOGRAPHY.md`](CRYPTOGRAPHY.md), [`DATA_AND_PRIVACY.md`](DATA_AND_PRIVACY.md).

> **How to read this document.** NIS2 is roughly 70% organizational and 30% technical.
> Gaps that must be closed **outside the codebase** (legal / ops / management) are marked
> **🏛**. The prioritized backlog at the end covers only what is implementable in
> code/infrastructure. This is a self-assessment, not legal advice — entity
> classification and registration duties must be confirmed with counsel.

---

## 1. Scope & applicability

> ⚠️ **To be confirmed with legal counsel — flagged, not blocking the technical work.**

| Question | Working assumption |
|---|---|
| In scope? | **Treat as in-scope.** A medical-records SaaS that processes PHI is most plausibly an **essential or important entity** via the **Health** sector and/or **ICT service management (B2B)** (NIS2 Annex I), and is in the **supply chain of healthcare providers** regardless of its own size. |
| Size threshold | Medium+ applies: **≥50 staff OR ≥€10M turnover/balance sheet**. Some entity types are in scope below this; confirm classification. |
| Competent authority / CSIRT | Determined by the **member state of main establishment**. This drives the registration deadline and the CSIRT to notify under Art. 23. **Establish this contact before an incident occurs.** 🏛 |
| Registration | Essential/important entities must register with the national authority. Verify status and deadline. 🏛 |

**Action:** Obtain a written entity-classification determination (sector, essential vs.
important, member state, registration status) from counsel. Everything below assumes
in-scope.

---

## 2. Posture matrix

Mapped to **Article 21(2)(a)–(j)** minimum measures, plus **Art. 20** and **Art. 23**.
Status: ✅ strong · 🟡 partial · 🔴 gap · 🏛 primarily organizational.

| Ref | Measure | Status | Summary |
|---|---|---|---|
| **h** | Cryptography & encryption | ✅ | Best-in-class; only a formal *policy artifact* is missing. |
| **i** | Access control & asset management | 🟡 | Strong technical access control; missing policy, asset inventory, reviews, HR security. |
| **e** | Secure development & vulnerability handling | 🟡 | Good dependency hygiene + point-in-time audit; missing automated gates, CVD policy, SBOM. |
| **d** | Supply-chain security | 🟡 | PHI flows to third-party AI providers; supplier assurance (BAAs/DPAs) unverified. |
| **j** | MFA / strong authentication | 🔴 | Email magic-link OTP only; no second factor at login; no idle timeout. |
| **b** | Incident handling | 🔴 | Console-only logging; no monitoring/alerting/detection; no response runbook. |
| **c** | Business continuity / backup / DR | 🔴 | No documented DB backup/DR strategy, RTO/RPO, or restore drills. |
| **a** | Risk analysis & ISMS policies | 🔴 🏛 | No documented risk methodology or security-policy set. |
| **f** | Effectiveness assessment | 🔴 🏛 | No recurring internal-audit / metrics / review cadence. |
| **g** | Cyber hygiene & training | 🔴 🏛 | No documented training program or hygiene baseline. |
| **Art. 20** | Governance & accountability | 🔴 🏛 | No management approval/oversight; no named accountable owner; management-training duty unmet. |
| **Art. 23** | Incident reporting (24h/72h/1mo) | 🔴 🏛 | No procedure tying detection to CSIRT notification timelines. |

**Net:** Cryptography is the standout strength. The material **technical** gaps are
**MFA, incident detection/monitoring, and BC/DR**. The material **organizational** gaps
are governance, risk/ISMS policy, the incident-reporting procedure, supplier assurance,
and training.

---

## 3. Per-measure findings

### (h) Cryptography & encryption — ✅

**Implemented.** AES-256-GCM per-document encryption; hybrid **RSA-4096 + ML-KEM-768
(FIPS 203)** key wrapping (post-quantum, ANSSI/BSI hybrid mandate); PBKDF2 300k
iterations (versioned); HKDF key derivation; zero-knowledge architecture (server never
sees plaintext keys or documents). All client-side via Web Crypto API.
- Evidence: `CRYPTOGRAPHY.md`, `src/lib/encryption/` (`aes.ts`, `rsa.ts`, `kem.ts`,
  `hybrid.ts`, `keys.ts`, `passphrase.ts`).

**Gap:** No formal **cryptography policy** artifact (a governance document stating
minimum algorithms/key sizes, approved libraries, key-rotation cadence, and review
triggers). `CRYPTOGRAPHY.md` documents the *implementation* but is not a *policy*.
**Recommendation:** Promote the standards in `CRYPTOGRAPHY.md` into a short
crypto-policy section with rotation cadence and an annual review trigger. 🏛-light.

### (i) Access control & asset management — 🟡

**Implemented.** Supabase **Row Level Security** on all sensitive tables; per-document
key-based ownership; explicit ownership checks on document mutations (DELETE hardened in
`SECURITY_REPORT.md` H-3); HIPAA **audit log** with zero-knowledge content, 6-year
retention, RLS-immutable.
- Evidence: `src/lib/audit/index.server.ts`, `audit_logs` migration, RLS policy
  migrations under `supabase/migrations/`, `src/hooks.server.ts` (`safeGetSession`).

**Gaps:**
- No documented **access-control policy** (least privilege, joiner/mover/leaver). 🏛
- No **data-asset inventory / classification** (which data is PHI, sensitivity, retention).
- No **admin-role separation / privileged access management** — `service_role` is the
  only elevated principal; no admin user tier or break-glass procedure.
- No **periodic access reviews**. 🏛
- No **HR / personnel security** (background checks, NDAs, onboarding/offboarding). 🏛

### (e) Secure development & vulnerability handling — 🟡

**Implemented.** Point-in-time security audit (`SECURITY_REPORT.md`, 27/31 findings
remediated); npm `overrides` for transitive fixes; `lamejs` pinned to a commit hash;
test CI (`.github/workflows/test.yml`).

**Gaps:**
- No **Dependabot/Renovate** — dependency updates are manual.
- No **`npm audit` gate** in CI; no **SAST**; no **secret scanning** (e.g. gitleaks).
- **No coordinated vulnerability disclosure (CVD) policy / `security.txt`** — NIS2
  expects a documented disclosure channel.
- No **SBOM** generation.
- Residual transitive CVEs noted in `SECURITY_REPORT.md` appendix: `undici`,
  `@modelcontextprotocol/sdk` (devDep), `devalue`, `yaml`.

### (d) Supply-chain security — 🟡

**Implemented.** Pinned GitHub dependency; npm overrides; documented dependency
remediation.

**Gaps:**
- **PHI is transmitted to third-party AI providers** (OpenAI / Google / Anthropic) for
  import analysis and chat (`SECURITY_REPORT.md` "PHI & Third-Party Data Sharing").
  **BAAs/DPAs with these providers, plus Supabase and Vercel, are unverified.** 🏛
- No **supplier risk register** / due-diligence process. 🏛
- No SBOM (also under (e)).
**Recommendation:** Execute and file DPAs/BAAs with every PHI processor; record data
residency; maintain a supplier register with review dates.

### (j) MFA / strong authentication — 🔴

**Current.** Email **magic-link OTP** only (`AUTH.md`, `src/lib/supabase.ts`,
`src/routes/auth/*`). Optional password supported but not enforced. The passkey-PRF code
(`src/lib/encryption/passkey-prf.ts`) is for **recovery-key derivation**, not login.

**Gaps:** No true **MFA/second factor at login** — NIS2 Art. 21(2)(j) explicitly names
MFA. No **idle session timeout**; no server-side session revocation endpoint.
**Recommendation:** Enable **Supabase MFA (TOTP)** with enrollment + challenge UI, with
step-up for sensitive operations; add idle timeout.

### (b) Incident handling — 🔴

**Current.** Console-only error logging (`src/hooks.server.ts` handleError, ~lines
242-256). Centralized namespaced logger (`src/lib/logging/logger.ts`) outputs to console;
logs are **not shipped** anywhere.

**Gaps:** No **error monitoring / alerting** (Sentry/Datadog/etc.); no **detection** of
security-relevant events (auth failures, access denials); no **health/uptime endpoint**;
**no incident-response runbook**. This directly blocks Art. 23's reporting clock — you
cannot report within 24h what you cannot detect.
**Recommendation:** Wire error monitoring into `handleError` + client; add a health
endpoint; write an incident-response runbook.

### (c) Business continuity / backup / DR — 🔴

**Current.** User-initiated **client-side encrypted export** (`src/lib/export/backup.ts`);
`import_jobs` TTL (1h completed / 24h failed). Supabase provides managed backups/PITR but
this is **not documented or verified**.

**Gaps:** No documented DB **backup/PITR strategy**, **RTO/RPO**, **DR/crisis-management
plan**, or **restore drills**.
**Recommendation:** Verify/enable Supabase PITR; document RTO/RPO; schedule restore
drills; write a business-continuity plan.

### (a) Risk analysis & ISMS policies — 🔴 🏛

No documented risk-assessment methodology or information-security policy set.
**Recommendation:** Adopt an ISMS baseline (ISO 27001 / ENISA guidance), perform an
all-hazards risk assessment, and maintain a living risk register.

### (f) Effectiveness assessment — 🔴 🏛

One point-in-time audit exists; no recurring internal-audit / KPI / management-review
cadence. **Recommendation:** Define an annual internal-audit + quarterly metrics review.

### (g) Cyber hygiene & training — 🔴 🏛

No documented training program or hygiene baseline (patching, password/MFA hygiene,
phishing awareness). **Recommendation:** Establish a recurring security-awareness program
covering all staff and management.

---

## 4. Governance (Art. 20) & incident reporting (Art. 23)

### Art. 20 — Management governance & accountability — 🔴 🏛
NIS2 makes **management bodies accountable** for approving and overseeing the risk-management
measures, and requires them to **undergo training**; non-compliance can carry personal
liability. **No documented management approval, oversight, or named accountable owner
exists.**
**Recommendation:** Assign a named accountable owner (e.g. CISO/CTO); have management
formally approve the measures and this assessment; record management security training.

### Art. 23 — Incident reporting — 🔴 🏛 (depends on (b))
Significant incidents require: **early warning within 24h**, **incident notification
within 72h**, and a **final report within 1 month**, to the national CSIRT/competent
authority. **No procedure, templates, or CSIRT contact exist**, and detection (row b) is
not yet in place.
**Recommendation:** Establish the CSIRT contact; write a reporting procedure with the
24h/72h/1-month templates; pair it with the incident-response runbook and monitoring.

---

## 5. Third-party PHI / supply-chain data flow

Unencrypted PHI is transmitted to external AI providers during document analysis and chat.

**BAA/DPA checklist** (🏛 — verify each is executed and filed):
- [ ] OpenAI — DPA / zero-retention terms
- [ ] Google (Gemini / Speech) — DPA
- [ ] Anthropic — DPA
- [ ] Supabase — DPA (data processor for DB/auth/storage)
- [ ] Vercel — DPA (hosting/compute)
- [ ] Data-residency and sub-processor list documented in the privacy policy

Consider on-premise/dedicated AI for the most sensitive data (already noted as a long-term
item in `SECURITY_REPORT.md`).

---

## 6. Remediation backlog (technical)

Sequenced by NIS2 risk + effort (S/M/L). **P0** items close named gaps and unblock Art. 23.

| Pri | Item | Measure | Effort | Where |
|---|---|---|---|---|
| P0 | Error monitoring + alerting (Sentry or equiv.) in `handleError` + client | b | M | `src/hooks.server.ts`, root layout |
| P0 | Incident-response runbook (detection→triage→24h/72h/1mo templates) | b / Art.23 | S | `docs/INCIDENT_RESPONSE.md` (new) |
| P0 | MFA at login — Supabase TOTP enrollment + challenge; step-up for sensitive ops | j | M–L | `src/routes/auth/*`, `src/lib/auth/*`, `src/lib/supabase.ts` |
| P0 | CVD policy + `security.txt` | e | S | `static/.well-known/security.txt`, `docs/` |
| P1 | CI security gates — `npm audit`/`audit-ci` + gitleaks + Dependabot/Renovate | e / d | S–M | `.github/workflows/`, `.github/dependabot.yml` |
| P1 | Documented backup/DR — verify Supabase PITR; define RTO/RPO; restore drill | c | S–M | `docs/BUSINESS_CONTINUITY.md` (new) + Supabase config |
| P1 | Idle session timeout + server-side session revocation | i / j | S | `src/hooks.server.ts`, auth layer |
| P1 | Finish HSTS + CSP headers (deferred in `SECURITY_REPORT.md` H-1; test Capacitor WebView) | i | M | `src/hooks.server.ts` |
| P2 | Health-check endpoint for uptime monitoring | b | S | `src/routes/v1/health/+server.ts` (new) |
| P2 | SBOM generation in CI (CycloneDX) | d / e | S | `.github/workflows/` |
| P2 | Resolve residual transitive CVEs (`undici`, `devalue`, `yaml`, MCP sdk devDep) | e | S–M | `package.json` overrides |
| P2 | Data-asset inventory + centralized retention policy doc | i | M | `docs/DATA_ASSETS.md` (new) |

### Organizational items (🏛 — owners outside engineering)
- ISMS & risk-assessment policy set (a); recurring effectiveness review/internal audit (f);
  security-training program (g); management governance & accountability sign-off (Art. 20);
  national-CSIRT registration & contact (Art. 23); execute BAAs/DPAs with all PHI
  processors (d); crypto-policy + access-control policy artifacts (h, i).

---

## 7. Summary

Mediqom enters NIS2 from a **strong cryptographic and application-security baseline** —
the hard, irreversible parts (E2E encryption, post-quantum key wrapping, RLS, audit
logging) are done well. The remaining work is mostly the **operational and organizational
scaffolding** NIS2 emphasizes: detect-and-report capability (monitoring + incident
process), MFA, business continuity, supplier assurance, and management governance.
None of the technical gaps are deep; the largest lift is establishing the governance,
risk-management, and incident-reporting *processes* around the existing strong tech.
