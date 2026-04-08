# Obsidian Intelligence — Public Rollout Plan

**Status:** Draft v1 (08.04.2026)
**Ziel:** Erstes oeffentliches Repo, das der Obsidian/Knowledge-Management Community echten Mehrwert bringt — und gleichzeitig die seit Februar 2026 in `Vault-Intelligence` (privates Tool) gewachsenen Features in einer sauberen, generischen Form wiederverwendbar macht.

---

## 0. TL;DR

- OI 1.0 (Feb 2026) ist **architektonisch sauberer** als VI heute (Adapter-Pattern, Tests, generische LLM-Config). VI ist vorne in **Features**, hinten in **Public-Tauglichkeit**.
- Strategie: **VI-Features in OI-Architektur portieren**, nicht umgekehrt.
- Zielversion: **OI 1.1.0** mit Embeddings, Hybrid-Search, LLM-Enrichment, 14 MCP-Tools, optionalem Doc-Ingest-Subpackage.
- Aufwand: konzentriert ~2 Tage Code + 1 Tag Polish/Doku/CI/Launch.
- Riskiester Punkt: **Free-Tier-Pfad** — wenn das Tool nur mit Cloud-API-Keys nutzbar ist, verliert es 80% der Community. Loesung: Ollama-First-Default + No-LLM-Fallback.

---

## 1. Was OI 1.0 heute hat (Stand: clean, Tests gruen)

| Bereich | Details |
|---|---|
| **Quellen** | Filesystem + CouchDB (LiveSync), via Adapter-Pattern (`lib/adapters/`) |
| **Indexing** | Inkrementell ueber `content_hash`, Watch-Mode fuer beide Quellen |
| **Graph** | Orphans, Hubs, Backlinks, Outlinks, Tag-Cloud, Related, Broken Links |
| **Engagement** | active/moderate/dormant/archived, konfigurierbare Schwellen, Revival-Kandidaten |
| **Catalysts** | Optional, generischer OpenAI-kompatibler Endpoint, sendet nur Struktur (keine Inhalte) |
| **Reports** | Self-contained HTML mit Chart.js, dunkles Theme, Health-Score |
| **Snapshots** | JSON-Export fuer externe Tooling-Integration |
| **MCP-Server** | 10 Tools, stdio, Claude Desktop ready |
| **Tests** | vitest, 122 passing, 8 Files (unit + integration), Fixture-Vault |
| **Config** | `.env`-basiert, generisch (LLM_API_URL, LLM_MODEL, LLM_API_KEY) |
| **Lizenz** | MIT, mit Attribution-Header in HTML-Report |

**Audit-Ergebnis:** Keine Secrets, keine internen Hostnamen, keine `thomasvault`/`obsidian-couchdb`-Strings im Code. `GuideThomas` taucht nur als Repo-URL im Report-Footer auf — legitim.

---

## 2. Was VI inzwischen kann, das OI fehlt

| VI-Feature | LoC | Wert fuer Community | Public-Aufwand |
|---|---:|---|---|
| **FTS5 Volltextsuche** mit BM25 | ~90 | Hoch — jeder will Vault durchsuchen | Niedrig (pure SQL) |
| **Vektor-Embeddings** (Gemini) | ~320 | Hoch — semantische Suche ist *die* Killer-Feature | Mittel (Provider-Adapter noetig) |
| **Hybrid Search (RRF)** | ~260 | Sehr hoch — kombiniert das Beste aus Keyword + Semantik | Niedrig (sobald 1+2 da sind) |
| **LLM Enrichment** (Kategorie, Summary, Entities, Sprache) | ~290 | Hoch — automatische Metadaten-Extraktion | Mittel (Prompt muss ML-mehrsprachig werden) |
| **Document Ingestion** (PDF/DOCX/TXT/HTML mit Chunking) | ~720 | Hoch fuer Power-User, Overkill fuer Casuals | Hoch (3 schwere Deps) → Subpackage |
| **Proactive Snapshots** (Briefing-Daten, "what to look at now") | ~210 | Mittel — interessant, aber nischig | Niedrig |
| **xAI Batch Workflow** | (extern) | Niedrig — provider-spezifisch, opaque | Niedrig (als Optional dokumentieren) |
| **4 neue MCP-Tools** | — | Hoch — spiegelt die neuen Features fuer KI-Assistenten | Niedrig |

**Verlorene Architektur in VI (die OI behaelt!):**
- Adapter-Pattern fuer Quellen — VI hat CouchDB hardcoded
- Vitest-Suite — VI hat keine Tests
- Generische LLM-Config — VI ist auf LiteLLM-Endpoint verdrahtet
- HTML-Report — VI hat das nie portiert

**Kernerkenntnis:** Das Diff ist asymmetrisch. OI braucht Features, VI hat Architektur-Drift. Dieser Plan baut OI **nach vorne**, ohne die guten Eigenschaften zu verlieren.

---

## 3. Was eine gute Public-Community-Success braucht

Best Practices fuer GitHub-Open-Source (Recherche aus mehreren Quellen, distilliert):

### 3.1 Erste Eindrucks-Kriterien (5-Sekunden-Test auf der Repo-Page)

| Element | Status | Was fehlt? |
|---|---|---|
| **One-line value proposition** im Repo-Header | OK (README L1) | — |
| **Animated demo / GIF / Screenshot** above-the-fold | **Fehlt** | Terminal-Demo + HTML-Report-Screenshot |
| **Quickstart** in <30 Sekunden lesbar | OK | Nach Feature-Erweiterung pruefen |
| **Badges** (npm version, CI status, license, downloads) | **Fehlen** | shields.io |
| **"Why this exists"-Abschnitt** | OK (persoenliche Story in README) | Behalten — ist authentisch |
| **Keywords im package.json** fuer npm-Discoverability | Minimal | Erweitern: vault, knowledge-management, mcp-server, semantic-search, rag, embeddings |

### 3.2 Install-Friction (entscheidet ob jemand es ausprobiert)

| Faktor | Aktuell | Ziel |
|---|---|---|
| `npm install -g` funktioniert | Vermutlich ja | Verifizieren auf Win/Mac/Linux |
| Funktioniert ohne API-Key | Ja (Filesystem + Graph) | Muss so bleiben |
| Funktioniert ohne LLM | Ja | Muss so bleiben |
| Erste Ergebnisse in <60 Sekunden | OK | Muss so bleiben |
| Funktioniert auf einem Beispiel-Vault | Test-Fixture vorhanden | Als Demo-Vault dokumentieren |

### 3.3 Trust-Signale fuer Skeptiker

| Signal | Status | To-Do |
|---|---|---|
| **Privacy-Statement** ("we don't read your content") | OK (in README "What it doesn't do") | Hervorheben + erweitern fuer Embeddings |
| **CI-Badge** | Fehlt | GitHub Actions |
| **Test-Coverage** | 122 Tests, kein Badge | codecov.io optional |
| **CHANGELOG** | Vorhanden | Pflegen |
| **Lizenz** | MIT, klar | OK |
| **Maintainer-Erreichbarkeit** | Issues only | CONTRIBUTING.md + Issue-Templates |
| **No-Telemetry-Zusicherung** | Implizit | Explizit dokumentieren |

### 3.4 Contribution-Friction (entscheidet ob das Repo lebendig wird)

| Element | Status |
|---|---|
| `CONTRIBUTING.md` | **Fehlt** |
| Issue-Templates (Bug, Feature, Question) | **Fehlt** |
| PR-Template | **Fehlt** |
| `CODE_OF_CONDUCT.md` | **Fehlt** (Contributor Covenant 2.1) |
| Good-First-Issue-Labels | **Fehlt** (post-launch) |
| Docs-Ordner mit Architektur-Skizze | **Fehlt** |

### 3.5 Wachstums-Hebel (post-launch)

- Cross-Posting in: r/ObsidianMD, r/PKMS, Obsidian Discord (#share-and-showcase), Hacker News, Lobsters
- Blog-Post auf `blog.thomaswinkler.art` — verlinkt auf Repo, erklaert "warum"
- LinkedIn-Post (passt zum LED+KI-Profil)
- Listing in `awesome-obsidian` und `awesome-mcp-servers`
- Demo-Video (5 min screencast — index, status, semantic search, MCP in Claude Desktop)

---

## 4. Zielarchitektur OI 1.1.0

### 4.1 Adapter-Erweiterung

```
lib/
├── adapters/
│   ├── sources/                  ← bisheriger lib/adapters/
│   │   ├── filesystem.js
│   │   ├── couchdb.js
│   │   ├── fs-watcher.js
│   │   └── couchdb-watcher.js
│   │   └── index.js              (createSource, createWatcher)
│   ├── llm/                      ← NEU
│   │   ├── base.js               (interface: chat({messages, opts}))
│   │   ├── openai.js             (default für *.openai.com sowie LLM_API_URL)
│   │   ├── ollama.js             (Free-Default falls localhost:11434 erreichbar)
│   │   ├── none.js               (no-op, gibt klare Fehlermeldung)
│   │   └── index.js              (createLLM(config) — Auto-Detect)
│   └── embeddings/               ← NEU
│       ├── base.js               (interface: embed(texts, taskType))
│       ├── openai.js             (text-embedding-3-small, 1536-dim)
│       ├── gemini.js             (gemini-embedding-001, 768-dim, free tier)
│       ├── ollama.js             (nomic-embed-text, 768-dim, lokal)
│       ├── none.js
│       └── index.js              (createEmbedder(config))
├── catalyst.js                   (refactored: nutzt llm-Adapter)
├── enrichment.js                 (NEU, portiert)
├── embeddings.js                 (NEU, portiert, ohne Gemini-Hardcoding)
├── search.js                     (NEU, portiert: FTS5 + Hybrid)
├── proactive.js                  (NEU, portiert)
├── database.js                   (erweitert: notes_fts, enrichments, embeddings)
├── parser.js                     (unveraendert)
├── graph.js                      (unveraendert)
├── engagement.js                 (unveraendert)
├── snapshot.js                   (erweitert: enrichment + embedding stats)
├── report.js                     (erweitert: neue Sektionen)
├── config.js                     (erweitert: llm.provider, embeddings.provider)
└── watch.js                      (unveraendert)
```

### 4.2 Provider-Konfiguration (Design)

```ini
# .env

# === Quellen ===
VAULT_PATH=/path/to/vault
# VAULT_SOURCE=couchdb           # Optional, fuer LiveSync-User

# === LLM (Catalysts + Enrichment) ===
# Drei Modi:
#   1. AUTO  - Default. Probiert Ollama (localhost:11434), faellt zurueck auf "none"
#   2. OpenAI-kompatibel - LLM_API_URL setzen (OpenAI, Mistral, LiteLLM, Together, Groq, ...)
#   3. NONE - Catalysts/Enrichment deaktiviert

# LLM_PROVIDER=auto              # auto | openai | ollama | none
# LLM_API_URL=https://api.openai.com/v1
# LLM_MODEL=gpt-4o-mini
# LLM_API_KEY=

# === Embeddings (Semantic Search) ===
# Drei Modi:
#   1. AUTO  - Default. Probiert Ollama nomic-embed-text, sonst "none"
#   2. Cloud - Gemini (free tier!) oder OpenAI
#   3. NONE  - Semantische Suche deaktiviert

# EMBEDDINGS_PROVIDER=auto       # auto | gemini | openai | ollama | none
# EMBEDDINGS_MODEL=              # Optional Override
# GEMINI_API_KEY=                # Falls EMBEDDINGS_PROVIDER=gemini
# Alternativ: nutzt LLM_API_KEY wenn provider=openai
```

### 4.3 LLM-Adapter Interface

```javascript
// lib/adapters/llm/base.js
class LLMAdapter {
  constructor(config) { this.config = config; }
  async chat({ messages, temperature, max_tokens, returnMeta }) {
    throw new Error('chat() must be implemented');
  }
  async test() { /* ping */ }
  get name() { return 'base'; }
}
module.exports = { LLMAdapter };
```

Vorteile:
- Bestehender `llmRequest()` in `catalyst.js` wird zum Wrapper um den Adapter
- Tests koennen einen Mock-Adapter nutzen
- Neue Provider (Anthropic Direct, Groq, Together) sind 50 Zeilen Code

### 4.4 Embeddings-Adapter Interface

```javascript
// lib/adapters/embeddings/base.js
class EmbeddingsAdapter {
  constructor(config) { this.config = config; }
  async embed(texts, taskType = 'document') {
    // returns Array<Float32Array>
    throw new Error('embed() must be implemented');
  }
  get model() { return 'unknown'; }
  get dimensions() { return 0; }
}
```

Wichtig: **Dimensions sind Provider-spezifisch** (1536 OpenAI, 768 Gemini/Nomic). Die SQLite-Spalte speichert das mit, und beim Mischen verschiedener Provider gibt es einen klaren Fehler statt Mathematik-Murks.

---

## 5. Implementierungs-Phasen

Jede Phase hat:
- Konkrete Aufgaben
- Akzeptanzkriterien (testbar)
- Ungefaehrer Aufwand
- Abhaengigkeiten

### Phase 0 — Fundament & Audit (vor allem anderen)

**Aufgaben:**
- [ ] Diesen Plan reviewen + abnehmen
- [ ] GitHub-Repo `GuideThomas/obsidian-intelligence` vom Arbeitsrechner anlegen (`gh repo create --public`)
- [ ] npm-Name `obsidian-intelligence` ist frei (geprueft 08.04.2026)
- [ ] Branch-Strategie: `main` = Release, Feature-Branches optional (Memory: "keine Worktrees, immer im Hauptverzeichnis")

**Akzeptanz:** Repo existiert public auf GitHub, leeres `main` mit aktuellem OI 1.0.

**Aufwand:** 15 min (manuell, einmalig).

---

### Phase 1 — Provider-Adapter-Pattern

**Ziel:** Saubere Abstraktion fuer LLM und Embeddings, ohne neue Features. Refactoring-Phase.

**Aufgaben:**
- [ ] `lib/adapters/sources/` umbenennen (bisheriger `adapters/`-Inhalt verschoben)
- [ ] `lib/adapters/llm/{base, openai, ollama, none, index}.js` erstellen
- [ ] `lib/catalyst.js` refactoren — `llmRequest()` nutzt jetzt Adapter
- [ ] `config.js` um `llm.provider` (auto/openai/ollama/none) erweitern
- [ ] Auto-Detection: pingt `localhost:11434` → Ollama, sonst `none` (mit Hinweis im `test`-Command)
- [ ] **Tests:** Mock-LLM-Adapter, Test fuer Provider-Auswahl, Test fuer existierenden Catalyst-Workflow (regression)
- [ ] `lib/adapters/embeddings/{base, openai, gemini, ollama, none, index}.js` erstellen (noch nicht verwendet — wird in Phase 2 angeschlossen)

**Akzeptanz:**
- Bestehende 122 Tests laufen weiter
- `vault-intelligence test` zeigt erkannten LLM-Provider
- Neuer Test: "given LLM_PROVIDER=ollama and ollama unreachable, falls back to none with warning"
- Keine Funktionsregression

**Aufwand:** ~3-4 Stunden

---

### Phase 2 — FTS5 Volltextsuche

**Ziel:** Schneller Keyword-Search auf Notes, ohne externe Deps.

**Aufgaben:**
- [ ] `database.js`: `notes_fts` virtuelle Tabelle in Schema einfuegen
- [ ] `database.js`: `upsertFts`, `deleteFts`, `rebuildFts`, `getFtsCount`
- [ ] `indexParsedNote()` schreibt in `notes_fts` mit
- [ ] **WICHTIG:** Migration fuer existierende DBs — `vault-intelligence index --rebuild-fts`
- [ ] `lib/search.js` portieren (nur den `searchContent` + CLI-Teil, ohne Hybrid)
- [ ] CLI: `vault-intelligence search "query" [--folder X] [--tag Y] [--limit N]`
- [ ] MCP-Tool `search_content`
- [ ] **Tests:** Search auf Fixture-Vault (BM25-Ranking, Phrase-Matching, AND/OR/NOT, Folder-Filter, Tag-Filter)

**Akzeptanz:**
- `search` findet Treffer mit Snippets
- FTS-Tabelle ueberlebt Re-Index
- 5+ neue Tests gruen

**Aufwand:** ~2-3 Stunden

---

### Phase 3 — Embeddings & Semantic Search

**Ziel:** Semantische Suche, mit echter Provider-Auswahl.

**Aufgaben:**
- [ ] `database.js`: `embeddings` Tabelle, `upsertEmbedding`, `getEmbedding`, `getAllEmbeddings`, `getUnembeddedNotes`, `getEmbeddingStats`
- [ ] `lib/embeddings.js` portieren — aber:
  - Statt `geminiEmbedRequest()` nutzt es `createEmbedder(config).embed(...)`
  - Modell + Dimensionen kommen aus dem Adapter
- [ ] `lib/adapters/embeddings/openai.js` — POST `https://api.openai.com/v1/embeddings`
- [ ] `lib/adapters/embeddings/gemini.js` — wie VI heute
- [ ] `lib/adapters/embeddings/ollama.js` — POST `http://localhost:11434/api/embeddings`
- [ ] CLI: `vault-intelligence embed run|stats|similar|search`
- [ ] MCP-Tools `find_similar`, `semantic_search`
- [ ] **Tests:** Mock-Embedder, Cosine-Similarity-Test, "fresh vs stale via content_hash" Test

**Akzeptanz:**
- `embed run` mit Mock-Provider laeuft auf Fixture-Vault
- `embed similar <id>` liefert sortierte Liste
- `embed search "query"` liefert sortierte Liste
- Ohne Provider: klare Fehlermeldung "Set EMBEDDINGS_PROVIDER=ollama|gemini|openai"

**Aufwand:** ~4-5 Stunden

---

### Phase 4 — Hybrid Search (RRF)

**Ziel:** Killer-Feature, kombiniert Phase 2 + 3.

**Aufgaben:**
- [ ] `lib/search.js` um `hybridSearch()` erweitern (aus VI)
- [ ] CLI: `vault-intelligence search --hybrid "query"`
- [ ] MCP-Tool `hybrid_search`
- [ ] Graceful degradation: wenn keine Embeddings da, faellt zurueck auf reines FTS mit Hinweis
- [ ] **Tests:** RRF-Score-Berechnung, "found_in" tagging, Fallback-Verhalten

**Akzeptanz:**
- Hybrid-Search liefert Ergebnisse mit `[K+S]/[K]/[S]`-Markierung und RRF-Score
- Test verifiziert RRF-Formel (k=60)

**Aufwand:** ~2 Stunden

---

### Phase 5 — LLM Enrichment

**Ziel:** Automatische Kategorisierung + Summary + Entities + Sprache.

**Aufgaben:**
- [ ] `database.js`: `enrichments` Tabelle
- [ ] `lib/enrichment.js` portieren — aber:
  - Prompt **muss englisch sein** (nicht deutsch wie in VI), mit Hinweis "respond in input language"
  - Kategorien beibehalten (10 generisch nuetzliche)
  - LLM-Aufruf via Adapter
- [ ] CLI: `vault-intelligence enrich run|stats`
- [ ] xAI Batch-Workflow **weglassen** (provider-spezifisch, dokumentiere als "advanced")
- [ ] MCP: enrichment fliesst in `find_related` und `hybrid_search` mit ein (Filter-Param)
- [ ] **Tests:** JSON-Parser-Test (mit Mocks fuer wohl- und schlecht-formatierte LLM-Responses)

**Akzeptanz:**
- `enrich run` mit Mock-LLM laeuft auf Fixture-Vault
- Datenbank haelt Kategorie + Summary
- Tests fuer JSON-Parser mit kaputten LLM-Outputs

**Aufwand:** ~3 Stunden

---

### Phase 6 — Proactive Snapshot Erweiterung & MCP-Tools

**Ziel:** Snapshot um neue Daten erweitern, MCP-Server vervollstaendigen.

**Aufgaben:**
- [ ] `lib/snapshot.js`: Enrichment-Stats + Embedding-Stats anhaengen
- [ ] `lib/proactive.js` portieren (CLI `proactive latest|today|summary`) — **optional**, evaluieren ob das fuer Public sinnvoll ist (haengt an externen "Briefings"-Files)
  - **Empfehlung:** Eingedampfte Version: `proactive` zeigt aktivste Notes + Revival-Kandidaten + offene Catalysts. Briefings-Verzeichnis weglassen.
- [ ] MCP-Server auf 13 Tools erweitern (10 alt + `search_content`, `find_similar`, `semantic_search`, `hybrid_search`)
- [ ] MCP-Server: Update auf v1.1.0
- [ ] MCP-Server: Tool-Descriptions auf Englisch + praezise (wirkt auf KI-Assistenten besser)

**Akzeptanz:**
- 13 MCP-Tools registriert + funktionsfaehig
- Snapshot enthaelt neue Sektionen (mit `null` falls Features ungenutzt)

**Aufwand:** ~2 Stunden

---

### Phase 7 — Document Ingestion (Optional Subpackage)

**Ziel:** Doc-Ingest fuer Power-User, **ohne** Core aufzublaehen.

**Variante: Workspaces im selben Repo**

```
obsidian-intelligence/         (root, npm package "obsidian-intelligence")
├── package.json               (Workspace-Root)
├── packages/
│   └── docs/
│       ├── package.json       ("obsidian-intelligence-docs")
│       ├── lib/
│       │   ├── ingest.js      (PDF/DOCX/TXT/HTML → chunks)
│       │   ├── chunker.js
│       │   └── extractors/
│       │       ├── pdf.js     (pdfjs-dist)
│       │       ├── docx.js    (mammoth)
│       │       └── html.js
│       └── README.md
```

`obsidian-intelligence-docs` ist ein **separates npm-Paket** im selben Repo. Nutzer mit Doc-Bedarf installieren beides:

```bash
npm install -g obsidian-intelligence obsidian-intelligence-docs
```

**Aufgaben:**
- [ ] Repo-Struktur auf npm-Workspaces umbauen (`packages/core/`, `packages/docs/`)
- [ ] `documents.js` aus VI portieren, in `packages/docs/lib/ingest.js`
- [ ] Core-DB-Schema erweitert um `documents`, `document_chunks`, `chunks_fts`, `chunk_embeddings` — Tabellen werden conditional erstellt
- [ ] CLI im docs-Subpackage: `obsidian-intelligence-docs ingest <path>`
- [ ] Hook in Hybrid-Search: wenn Tabelle vorhanden, durchsuche auch Chunks
- [ ] **Tests:** PDF-Sample im Fixture-Ordner (~50 KB), DOCX-Sample
- [ ] README im Subpackage mit klarer "additional install"-Anleitung

**Akzeptanz:**
- Core-Install funktioniert ohne pdfjs/mammoth
- Mit Subpackage: `obsidian-intelligence-docs ingest sample.pdf` erzeugt Chunks
- Hybrid-Search findet Chunk-Treffer (Optional, wenn Embeddings da)

**Aufwand:** ~5-6 Stunden (am laengsten weil Workspaces-Umbau Risiko hat)

**Risiko:** Workspaces-Umbau bricht moeglicherweise existierende Test-Setups. Alternativ: separates Repo `obsidian-intelligence-docs`. **Entscheidung erforderlich** (siehe Section 8).

---

### Phase 8 — Polish, Docs, CI

**Aufgaben:**
- [ ] **README-Refresh:**
  - Neuer Hero-Bereich mit Demo-GIF (Terminal-Aufnahme via `vhs` oder `terminalizer`)
  - Screenshot des HTML-Reports
  - Badges: npm version, CI status, license, Node version
  - Neue Sections: Semantic Search, Hybrid Search, Enrichment, Privacy
  - Quickstart-Beispiele fuer 3 Setups: Filesystem-only (kein LLM), Filesystem + Ollama, Filesystem + Cloud (OpenAI/Gemini)
  - "What it does NOT do" Section verstaerken
- [ ] **CHANGELOG.md** Eintrag 1.1.0 mit klarer Migration (`--rebuild-fts`-Hinweis)
- [ ] **CONTRIBUTING.md:** Setup, Test-Lauf, Branch-Strategie, Code-Style, PR-Guidelines
- [ ] **CODE_OF_CONDUCT.md:** Contributor Covenant 2.1
- [ ] **`.github/workflows/ci.yml`:** Lint + Test auf Node 18/20/22 auf Ubuntu/macOS/Windows
- [ ] **`.github/ISSUE_TEMPLATE/`:** bug-report.yml, feature-request.yml, question.yml
- [ ] **`.github/PULL_REQUEST_TEMPLATE.md`**
- [ ] **`docs/ARCHITECTURE.md`:** Diagramm der Adapter, DB-Schema, Datenfluss
- [ ] **`docs/PRIVACY.md`:** Was wird wohin gesendet? Wo bleibt was lokal?
- [ ] **`docs/MCP_SETUP.md`:** Schritt-fuer-Schritt fuer Claude Desktop, ChatGPT Desktop, Cursor
- [ ] **`docs/PROVIDERS.md`:** Vergleichs-Matrix der LLM/Embedding-Provider mit Kosten
- [ ] **`example-vault/`:** Kleiner aber nicht-trivialer Demo-Vault (10-20 Notes, Tags, Links, ein Orphan, ein Hub) — separates Verzeichnis
- [ ] **package.json:** version 1.1.0, keywords erweitert, files-Whitelist, .npmignore
- [ ] **Pruefen:** `npm pack --dry-run` zeigt keine Test-Files, keine `.env*`, keine internen Pfade

**Akzeptanz:**
- CI laeuft gruen auf 3 OS x 3 Node-Versionen
- README zeigt Demo-GIF
- `npm pack --dry-run` < 500 KB ohne Fixtures/Tests

**Aufwand:** ~4-6 Stunden

---

### Phase 9 — Pre-Launch QA

**Aufgaben:**
- [ ] **Fresh-Install-Test** auf 3 Plattformen: macOS, Linux, Windows (WSL)
- [ ] **Realer-Vault-Test** mit Beta-Tester (1-2 Personen aus dem Discord, vorher angesprochen)
- [ ] **Semgrep / npm audit / dependency review**
- [ ] **Lighthouse auf den HTML-Report** (Performance, Accessibility)
- [ ] **Lizenz-Check der Dependencies** (alles MIT/Apache/BSD-kompatibel?)
- [ ] **GDPR-Check:** Wir speichern nichts ueber den User, kein Telemetry. In Privacy-Doc dokumentieren.
- [ ] **Vergleich mit existierenden Tools** in der README ergaenzen (wo stehen wir vs. Obsidian Smart Connections, Quartz, Foam?)

**Akzeptanz:**
- 0 npm audit critical/high
- 1-2 externe Beta-User haben es einmal durchgespielt und Feedback gegeben
- Rauchprobe: Index, Search, Semantic, MCP in Claude Desktop — alles gruen

**Aufwand:** ~3-4 Stunden + Wartezeit auf Beta-Feedback

---

### Phase 10 — Launch

**Aufgaben:**
- [ ] `npm publish --access public` (vorher `npm login` checken)
- [ ] GitHub Release v1.1.0 mit Release-Notes
- [ ] Repo-Description + Topics auf GitHub setzen
- [ ] Listing-PRs (post-launch, Tag spaeter):
  - `awesome-obsidian` README PR
  - `awesome-mcp-servers` PR
- [ ] Cross-Posts (uebers Wochenende verteilt):
  - r/ObsidianMD ("I built this for myself, sharing it")
  - Obsidian Discord #share-and-showcase
  - Hacker News (Show HN)
  - LinkedIn-Post (passt zum Profil)
  - Blog-Post auf `blog.thomaswinkler.art` mit Story
- [ ] Monitoring:
  - GitHub-Issues + npm-downloads beobachten
  - Erste Antworten innerhalb 24h (Vertrauen aufbauen)

**Akzeptanz:** Repo ist public, npm-Paket installierbar, mindestens 1 externer Star.

---

## 6. Akzeptanz-Kriterien fuer 1.1.0 (Definition of Done)

| # | Kriterium |
|---|---|
| 1 | Alle 122 bestehenden Tests laufen weiter |
| 2 | Mindestens **40 neue Tests** (Adapter, Search, Embeddings, Enrichment, Hybrid) |
| 3 | CI gruen auf Node 18/20/22 x ubuntu/macos/windows |
| 4 | `npm pack --dry-run` enthaelt keine Test-Fixtures, keine `.env*`, keine internen Pfade, < 500 KB |
| 5 | Funktioniert ohne API-Key (Filesystem + Graph + FTS5 + Engagement + Report) |
| 6 | Funktioniert mit Ollama lokal (Catalysts + Embeddings + Hybrid) |
| 7 | Funktioniert mit Cloud-API (OpenAI/Gemini) |
| 8 | MCP-Server hat 13+ Tools, alle dokumentiert |
| 9 | README hat Demo-GIF + Screenshots + Quickstart fuer 3 Setups |
| 10 | CONTRIBUTING + Issue-Templates + CI + LICENSE + CODE_OF_CONDUCT vorhanden |
| 11 | `docs/PRIVACY.md` erklaert glasklar was wohin geht |
| 12 | Migration von 1.0 zu 1.1: ein Befehl (`vault-intelligence index --rebuild-fts`) |
| 13 | Keine Hardcoded Pfade, keine `thomasvault`-Strings, keine internen Hostnamen |

---

## 7. Risiken & Entscheidungen

| # | Risiko / Entscheidung | Empfehlung |
|---|---|---|
| **R1** | Workspaces-Umbau bricht Setup | **Plan B:** `obsidian-intelligence-docs` als separates Repo. Beibehalten = einfacher fuer Maintainer, schwerer fuer User. |
| **R2** | Ollama nicht installiert → User verstehen "auto" nicht | Klare CLI-Ausgabe in `test`-Command + Provider-Matrix in README |
| **R3** | DB-Migration von 1.0 zu 1.1 schmerzhaft | Auto-Detect bei Start, sage dem User "your DB is from v1.0, run `index --rebuild-fts` once" |
| **R4** | Embeddings-Dimensionen mischen | DB speichert `model + dimensions`. Beim Lesen: nur Vektoren mit gleicher Dimension vergleichen. Sonst klarer Fehler. |
| **R5** | Cosine-Similarity in JS skaliert nicht ueber 50K Notes | Dokumentiere als Limit. Spaeter: optionaler `sqlite-vec`-Pfad. |
| **R6** | Konkurrenz: Obsidian Smart Connections macht Embeddings im Plugin | Differenzieren: wir sind **CLI + MCP + Headless**, nicht Plugin. Andere Zielgruppe. README muss das klar sagen. |
| **R7** | LinkedIn/Reddit-Promotion nervt Community | Niemals "buy my thing". Story-First: "I built this for myself because X" |
| **R8** | ~~Repo-Erstellung Heimrechner-Vorbehalt~~ | **Erledigt:** Arbeitsrechner ist OK (Memory aktualisiert 08.04.2026) |
| **R9** | npm-Name "obsidian-intelligence" schon vergeben? | **Erledigt:** Frei (geprueft 08.04.2026) |
| **R10** | Lizenz-Konflikte bei optionalen Deps (mammoth GPL?) | mammoth ist Apache-2.0, pdfjs-dist ist Apache-2.0 — alles gut |

### Entscheidungen (alle getroffen 08.04.2026)

| # | Frage | Entscheidung |
|---|---|---|
| **D1** | Workspaces oder separates Doc-Repo? | **npm-Workspaces** — ein Repo, packages/core + packages/docs |
| **D2** | `proactive` portieren? | **Eingedampft** — aktivste Notes + Revival + Catalysts, ohne Briefings-Verzeichnis |
| **D3** | xAI-Batch public dokumentieren? | **Nein** — bleibt VI-only |
| **D4** | Sprache der Public-Texte? | **Englisch only** — README, CHANGELOG, CLI-Output, Prompts, Docs |
| **D5** | Author-Field | **`Thomas Winkler <mail@thomaswinkler.art>`** |
| **D6** | npm-Name | **`obsidian-intelligence`** (geprueft 08.04.2026, frei) |

---

## 8. Aufwand-Zusammenfassung

| Phase | Stunden |
|---|---:|
| 0 — Fundament | 0,25 |
| 1 — Adapter-Pattern | 4 |
| 2 — FTS5 | 3 |
| 3 — Embeddings | 5 |
| 4 — Hybrid Search | 2 |
| 5 — Enrichment | 3 |
| 6 — Snapshot+MCP | 2 |
| 7 — Doc-Subpackage | 6 |
| 8 — Polish/Docs/CI | 6 |
| 9 — Pre-Launch QA | 4 |
| 10 — Launch | 1 |
| **Summe** | **~36 h** |

Verteilt: 2 konzentrierte Code-Tage + 1 Polish-Tag + Beta-Wartezeit.

**Kritischer Pfad:** Phase 1 → 2 → 3 → 4 → 6 → 8 → 10. Phase 5, 7 koennen parallel oder spaeter.

**Minimum Viable Public Release** (falls Zeit knapp):
- Phasen 0, 1, 2, 4, 6, 8 (ohne 3, 5, 7) = ~17 h
- Bietet: FTS-Search + Adapter-Pattern + neue MCP-Tools + Polish
- Nachteil: Kein Killer-Feature "semantic search" → wirkt wie "yet another knowledge graph tool"
- **Nicht empfohlen.** Embeddings sind das, was die Aufmerksamkeit kriegt.

---

## 9. Was es nach dem Launch noch braucht (Post-1.1)

Nicht im Scope, aber im Hinterkopf behalten:

- **1.2:** sqlite-vec Integration fuer Vault > 50K Notes
- **1.2:** Obsidian-Plugin-Wrapper (separates Repo) das die CLI als Subprocess ruft und Ergebnisse in der Sidebar anzeigt
- **1.3:** Web-UI (statisch + lokaler API-Server), zeigt Reports interaktiv
- **2.0:** Multi-Vault-Support
- **Community-Pflege:** Wochenrhythmus fuer Issues, Monthly Release, Backlog auf GitHub Projects

---

## 10. Naechste Schritte

1. **Diesen Plan reviewen** und zu Punkten 7/D1-D6 entscheiden
2. **`npm view obsidian-intelligence` pruefen** (Name frei?)
3. **Heimrechner:** Repo erstellen (oder warten bis dorthin gewechselt wird)
4. **Branch** `feature/1.1.0-port` anlegen — oder im Hauptverzeichnis arbeiten (Memory-Praeferenz)
5. **Phase 1 starten** — Adapter-Refactoring auf Heimrechner

---

*Plan erstellt am 08.04.2026, Stand OI 1.0.0 + VI Snapshot heute.*
*Aktualisierung dieses Dokuments bei jeder Phasen-Abnahme empfohlen.*
