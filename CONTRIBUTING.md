# Contributing to Obsidian Intelligence

Thanks for considering a contribution! This is a small project and I'd like to keep the friction low for everyone involved — yours and mine.

## Quick links

- **Bug reports** → [open an issue](https://github.com/GuideThomas/obsidian-intelligence/issues/new?template=bug-report.yml) with the bug-report template
- **Feature requests** → [open an issue](https://github.com/GuideThomas/obsidian-intelligence/issues/new?template=feature-request.yml) with the feature-request template
- **Questions** → [open an issue](https://github.com/GuideThomas/obsidian-intelligence/issues/new?template=question.yml) with the question template, or use [Discussions](https://github.com/GuideThomas/obsidian-intelligence/discussions) once enabled
- **Pull requests** → see below

## Development setup

```bash
git clone https://github.com/GuideThomas/obsidian-intelligence.git
cd obsidian-intelligence
npm install
npm test                 # 255+ tests should pass
```

You'll need Node.js >= 18.

To run the CLI against your own vault during development:

```bash
node vault-intelligence.js index --vault ~/Documents/MyVault
node vault-intelligence.js status
```

## Project structure

```
obsidian-intelligence/
├── vault-intelligence.js      CLI entry point
├── mcp-server.mjs             MCP server (stdio)
├── lib/
│   ├── adapters/
│   │   ├── filesystem.js      Source: filesystem
│   │   ├── couchdb.js         Source: CouchDB (Obsidian LiveSync)
│   │   ├── llm/               LLM provider adapters
│   │   └── embeddings/        Embeddings provider adapters
│   ├── database.js            SQLite schema + CRUD
│   ├── parser.js              Markdown parser
│   ├── graph.js               Graph queries
│   ├── engagement.js          Engagement classification
│   ├── search.js              FTS5 + hybrid search
│   ├── embeddings.js          Vector embeddings + semantic search
│   ├── enrichment.js          LLM metadata extraction
│   ├── catalyst.js            AI-generated reflection questions
│   ├── snapshot.js            JSON snapshot
│   ├── proactive.js           Compact "what to look at" view
│   ├── report.js              HTML report generator
│   └── watch.js               Filesystem / CouchDB watcher
├── test/                      Vitest tests (unit + integration)
└── packages/
    └── docs-ingest/           Optional document ingestion subpackage
```

## Pull request guidelines

I welcome PRs but please open an issue first for non-trivial changes — saves us both time if your idea doesn't fit the project's direction.

**Before opening a PR:**

1. **Tests pass:** `npm test`
2. **New behavior has tests:** if you add a feature, add tests for it. If you fix a bug, add a regression test.
3. **No new dependencies in the core package** without discussion. Doc-ingest can pull in optional deps via peerDependencies.
4. **Backwards compatibility:** the SQLite schema is migrated forward, never broken. New tables/columns are fine; renaming or dropping needs a discussion.
5. **Privacy first:** any feature that sends note content over the network must surface this clearly in the CLI and in `docs/PRIVACY.md`.
6. **Match the existing style:** plain JavaScript, CommonJS in `lib/`, ES modules only in `mcp-server.mjs`. No TypeScript. No bundlers. Two-space indent, no semicolons-policy enforcement.

**Commit messages:** conventional-ish, e.g. `feat(search): add hybrid RRF`, `fix(parser): handle wiki-links inside code blocks`, `docs(readme): add OpenWebUI example`. Not strict.

## Test layout

- `test/unit/*` — pure unit tests, no I/O beyond mocked fetch
- `test/integration/*` — uses an in-memory or temp-dir SQLite database
- `packages/docs-ingest/test/*` — subpackage tests

Tests use Vitest. Snapshot tests are not used; explicit assertions only.

## Architecture principles

A few opinions baked into the codebase:

1. **MCP-first.** Every new feature should ask: how does this expose itself to an AI client? If it can be a tool, it usually should be.
2. **Local-by-default.** Cloud APIs are optional, never required. The Ollama path must always work.
3. **Provider abstraction.** Anything that calls out to an LLM or embedding service goes through the adapter pattern. No hardcoded provider URLs in feature code.
4. **No telemetry.** Ever. Period.
5. **Minimal core dependencies.** Heavy stuff lives in optional subpackages.
6. **Graceful degradation.** If a feature can't run (no provider configured, missing index, etc.), it should explain *why* and *how to fix it*, not crash.

## Code of Conduct

Be kind. Be patient. Disagree respectfully. The full Contributor Covenant lives in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).

---

*If anything in this guide is unclear or wrong, please open an issue. Improving the contributor experience is itself a welcome contribution.*
