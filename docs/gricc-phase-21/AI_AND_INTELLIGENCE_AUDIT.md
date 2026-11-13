# GRICC 2.0 — Phase 21: AI & Intelligence Audit

**Document:** `AI_AND_INTELLIGENCE_AUDIT.md`  
**Phase:** 21 — Complete Technical Audit & Architecture Assessment  
**Date:** November 13, 2026  

---

## 1. AI Assistant Architecture Overview

The GRICC AI Assistant (Phase 15) is designed to provide analysts with natural language access to complex geopolitical risk assessments, incident histories, predictive warnings, and report synthesis.

### Service Structure:
- `aiIntelligenceService.js` — Core coordinator for natural language queries, chat sessions, risk explanations, and comparative analyses.
- `aiProviderService.js` — Provider abstraction adapter supporting multiple LLM backends and zero-key local deterministic synthesis.
- `aiPromptService.js` — System prompt templates, contextual grounding formatters, and output structuring rules.
- `aiReportService.js` — Automated draft intelligence report generation, analyst editing, approval workflows, and PDF compilation.
- `intelligenceRetrievalService.js` — Factual data retrieval layer extracting incidents, country risk scores, early warnings, and threat feeds matching the user's query context.
- `conversationService.js` — Multi-turn conversation state persistence and user ownership enforcement.

---

## 2. Supported AI Providers & Fallback Mechanism

| Provider ID | Provider Name | Key Requirement | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| `gricc-deterministic` | GRICC Native Grounded Synthesis | **Zero-Key** (None) | Generates structured, deterministic, citation-backed intelligence summaries directly from retrieved database records without external API calls. | **Active Default** (Verified) |
| `gemini` | Google Gemini API | `AI_API_KEY` | Connects to Google's Gemini models for advanced reasoning and multi-document intelligence synthesis. | Configured / Optional |
| `openai` | OpenAI API | `AI_API_KEY` | Connects to OpenAI GPT-4o / GPT-4 for natural language chat and structured JSON output. | Configured / Optional |
| `anthropic` | Anthropic Claude API | `AI_API_KEY` | Connects to Claude 3.5 Sonnet for detailed intelligence briefing generation. | Configured / Optional |

### Fallback Behavior:
If an external provider is configured but experiences network timeouts (default `AI_TIMEOUT_MS = 12000`) or returns authentication errors, the platform safely logs the error and falls back to `gricc-deterministic` synthesis rather than failing or returning a blank response.

---

## 3. Data Grounding & Provenance Verification

### 3.1 Grounded Retrieval Process
Before generating an answer, `intelligenceRetrievalService.js` queries SQLite for factual context:
1. Target country risk scores, trend indicators, and severity levels.
2. Active security incidents in the target region.
3. Relevant alerts from NASA EONET, CISA KEV, ReliefWeb, and GDELT.
4. Active predictive warnings and escalation rules.

The resulting response cites concrete record IDs (`INC-...`, `ALT-...`) and timestamps, minimizing hallucination risk.

### 3.2 External Live Data Feeds vs. Standby Telemetry

| Data Feed | Upstream Authoritative Provider | Verified API Endpoint | Fallback Mode |
| :--- | :--- | :--- | :--- |
| **International News** | GDELT 2.0 Global Intelligence Document API | `https://api.gdeltproject.org/api/v2/doc/doc` | Standby Curated Feed |
| **Geopolitical Risk** | UN OCHA ReliefWeb Reports API | `https://api.reliefweb.int/v1/reports` | Standby Curated Feed |
| **Natural Disasters** | NASA EONET v3 Planetary Satellite Monitor | `https://eonet.gsfc.nasa.gov/api/v3/events` | Standby Curated Feed |
| **Severe Weather** | US National Weather Service (NWS) Active Warning API | `https://api.weather.gov/alerts/active` | Standby Curated Feed |
| **Cybersecurity** | US CISA Known Exploited Vulnerabilities (KEV) Catalog | `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` | Standby Curated Feed |

All telemetry records include `is_live: 1` when retrieved from live network endpoints and `is_live: 0` when operating from standby telemetry, ensuring analysts are never deceived regarding data freshness.

---

## 4. Prompt Safety & Guardrails

- `aiIntelligenceService.js` scans queries for common prompt injection and instruction-override patterns (e.g. `ignore previous instructions`, `reveal system prompt`, `leak api key`, `drop table`).
- Injection probes are rejected immediately with HTTP 400 (`SecurityPolicyError: Query rejected by AI safety guardrails`).
- Server-side environment secrets (`AI_API_KEY`, `JWT_SECRET`) are strictly omitted from prompt contexts, system logs, and frontend responses.

---

## 5. AI & Intelligence Audit Findings & Recommendations

1. **AI-001 (Medium) — Semantic Vector Search Integration:**  
   Currently, intelligence retrieval uses lexical keyword and entity matching (`SELECT ... WHERE country = ? OR category = ?`).  
   *Recommendation:* In GRICC 2.0, introduce an optional local vector embedding store (e.g., `sqlite-vss` or lightweight semantic embeddings) to allow conceptual semantic queries across long-form incident descriptions.

2. **AI-002 (Low) — Configurable Model Temperature & Reasoning Effort:**  
   External provider options currently use hardcoded temperature defaults (`0.2`).  
   *Recommendation:* Expose temperature and reasoning effort parameters in `security_settings` or `monitoring_settings` for admin customization.

