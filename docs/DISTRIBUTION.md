# Distribution & Discoverability

Notizen zu Kanälen, über die `obsidian-intelligence` auffindbar ist — mit ehrlicher
Einschätzung, welche Kanäle sich wirklich lohnen.

---

## Aktive Kanäle

### npm Registry

- **URL:** https://www.npmjs.com/package/obsidian-intelligence
- **Status:** Publiziert (v1.1.0)
- **Nutzen:** Primärer Installationsweg (`npx obsidian-intelligence`).
  Hauptkanal für Developer, die MCP-Setups konfigurieren.

### GitHub Repository

- **URL:** https://github.com/GuideThomas/obsidian-intelligence
- **Status:** Public, MIT-Lizenz, v1.1.0 getaggt + Release
- **Nutzen:** Source-of-Truth für Issues, Contributions, Stars-Signal.

### awesome-mcp-servers (PR offen)

- **PR:** https://github.com/punkpeye/awesome-mcp-servers/pull/4372
- **Kategorie:** Knowledge & Memory
- **Status:** Review-Bedingung — Glama-Listing mit Security/Quality-Scores erforderlich
- **Nutzen:** Reichweitenstarker Katalog, wird oft als "Starting Point" für
  MCP-Einsteiger verwendet.

### Glama MCP Directory

- **URL:** https://glama.ai/mcp/servers (Eintrag unter Author `GuideThomas`)
- **Manifest:** `glama.json` im Repo-Root (Maintainer-Verifikation)
- **Status:** Gelistet, Security/Quality Scan wartet auf Re-Crawl
- **Nutzen:** **Primär Gatekeeper für awesome-mcp-servers PR** (siehe unten).
  Sekundär: eigene Discovery-Reichweite.

---

## Glama — Kontext und Einschätzung

### Was Glama ist

Glama ist **keine neutrale Autorität**, sondern eine kommerzielle Plattform von
Frank Fiegel (punkpeye). Er ist gleichzeitig Maintainer von `awesome-mcp-servers`
und nutzt die Reviews dort, um Submissions in seinen eigenen Katalog zu kanalisieren.

Produktportfolio von Glama:

| Komponente | Zweck |
|------------|-------|
| MCP Directory | Öffentlicher Katalog (~21.000 Server) |
| Glama Chat | Web-Chat mit integriertem MCP-Support |
| MCP Inspector | Browser-Tool zum Testen fremder MCP-Server |
| Glama Gateway | Hosted MCP-Server-Relay |
| API-Gateway | LLM-Router (ähnlich OpenRouter / LiteLLM) |

### Warum wir mitmachen

- Pflicht-Gate für `awesome-mcp-servers`-Merge.
- Einmaliger Setup-Aufwand (`glama.json` einchecken), kein laufender Betrieb.
- Potenziell etwas Sichtbarkeit (kostenlos), kein kommerzielles Lock-In.

### Was wir NICHT von Glama nutzen

Passt nicht zum bestehenden Stack:

| Glama-Angebot | Warum nicht relevant |
|---------------|---------------------|
| API-Gateway | LiteLLM bereits produktiv (self-hosted, eigene Keys, Grafana-Observability) |
| Glama Chat | Claude Desktop + AnythingLLM decken alle Use-Cases ab |
| Gateway-Relay für MCP | SSH-Pipe + lokale MCP-Server sind direkter und privater |
| Hosted-MCP-Server | Widerspricht dem Self-Hosted-Prinzip des Projekts |

**Fazit:** Glama ist ein Listing-Kanal, kein Infrastruktur-Baustein.
Nach erfolgreichem `awesome-mcp-servers`-Merge kein aktiver Pflege-Aufwand mehr
notwendig — `glama.json` bleibt im Repo, der Rest läuft automatisch.

---

## Geplante / potenzielle Kanäle (nicht umgesetzt)

Realistische Reichweiten-Hebel, falls das Projekt mehr Sichtbarkeit bekommen soll.
Nach Aufwand-Nutzen sortiert:

### Hoch-ROI

- **r/ObsidianMD Post** — Zielgruppe passt perfekt (Obsidian-Nutzer, die AI
  integrieren wollen). Kosten: 1 Post. Potenziell hunderte Installationen.
- **LinkedIn-Post über persönliches Profil** — Thomas Winkler hat bestehende
  Reichweite im LED-/Tech-Umfeld. Angle: "Wie ich meinen Obsidian-Vault zur
  KI-Wissensbasis gemacht habe" (Problem-Lösungs-Framing).
- **Show HN auf Hacker News** — Hoher Hype-Faktor, aber lautes Signal nötig
  ("Show HN: Turn your Obsidian vault into an MCP server"). Riskant, weil
  HN ein harter Graph ist — aber bei Erfolg 1000+ Stars möglich.

### Mittel-ROI

- **Product Hunt** — Eher für Endnutzer-SaaS, aber MCP-Thema wächst dort.
- **Anthropic Blog / Community** — Falls Anthropic Community-Featured-MCP-Server
  listet, passt das Projekt thematisch.
- **Obsidian Community Forum** — Etwas kleiner als Reddit, aber engagierte User.

### Niedrig-ROI

- **dev.to / Medium Artikel** — Hoher Schreibaufwand, meist begrenzte
  Konversion zu Installationen.
- **Twitter/X Threads** — Reichweite ohne bestehende Audience schwierig.
- **YouTube Demo-Video** — Hoher Produktionsaufwand.

---

## Metriken die wir tracken sollten

Ohne externes Analytics, aber leicht abrufbar:

| Metrik | Quelle | Frequenz |
|--------|--------|----------|
| npm Downloads | https://npm-stat.com/charts.html?package=obsidian-intelligence | wöchentlich |
| GitHub Stars | `gh api repos/GuideThomas/obsidian-intelligence --jq .stargazers_count` | bei Bedarf |
| GitHub Clones/Traffic | GitHub Insights Tab (nur Owner) | monatlich |
| Glama Downloads | Server-Detailseite auf glama.ai | passiv |

Referenz-Punkt: am Tag des ersten Glama-Listings wurden **138 Downloads** angezeigt
(14.04.2026) — wahrscheinlich Glama-eigene Crawler-Requests, nicht echte User.

---

*Stand: 14. April 2026 — Glama-Listing + awesome-mcp-servers PR open*
