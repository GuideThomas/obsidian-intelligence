# Providers

`obsidian-intelligence` is provider-agnostic. You bring your own LLM and your
own embeddings model, or run everything locally with Ollama, or skip both
entirely.

There are two independent provider slots:

- **LLM** — used for catalysts and (optional) note enrichment
- **Embeddings** — used for semantic search, `find_similar`, and hybrid RRF

Both default to `auto`, which tries Ollama on `localhost:11434` and falls back
to `none` if Ollama isn't reachable. **The tool always works without any
provider** — graph analysis, FTS5 search, engagement, and reports are 100 %
local and need nothing.

---

## LLM providers

| Provider | `LLM_PROVIDER` | Required env | Notes |
|---|---|---|---|
| **Auto-detect** | `auto` (default) | — | Tries Ollama, else `none` |
| **Ollama** (local) | `ollama` | `OLLAMA_HOST` (optional, default `http://localhost:11434`), `LLM_MODEL` (e.g. `llama3.1:8b`) | Free, fully local |
| **OpenAI / compatible** | `openai` | `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` | Works with OpenAI, Mistral, Together, Groq, LiteLLM, OpenRouter, vLLM, anything OpenAI-compatible |
| **None** | `none` | — | Catalysts/enrichment disabled |

### Examples

**Ollama (recommended free option)**
```ini
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1:8b
```

**OpenAI**
```ini
LLM_PROVIDER=openai
LLM_API_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=sk-...
```

**Groq (fast & cheap, OpenAI-compatible)**
```ini
LLM_PROVIDER=openai
LLM_API_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
LLM_API_KEY=gsk_...
```

**Local LiteLLM proxy**
```ini
LLM_PROVIDER=openai
LLM_API_URL=http://localhost:4000
LLM_MODEL=cheap
LLM_API_KEY=sk-anything
```

---

## Embeddings providers

| Provider | `EMBEDDINGS_PROVIDER` | Required env | Dimensions | Notes |
|---|---|---|---|---|
| **Auto-detect** | `auto` (default) | — | — | Tries Ollama `nomic-embed-text`, else `none` |
| **Ollama** (local) | `ollama` | `OLLAMA_HOST` (optional), `EMBEDDINGS_MODEL` (default `nomic-embed-text`) | 768 | Free, fully local |
| **Gemini** | `gemini` | `GEMINI_API_KEY`, `EMBEDDINGS_MODEL` (default `gemini-embedding-001`) | 768 | Free tier available |
| **OpenAI / compatible** | `openai` | `LLM_API_URL` *or* `EMBEDDINGS_API_URL`, `LLM_API_KEY` *or* `EMBEDDINGS_API_KEY`, `EMBEDDINGS_MODEL` (default `text-embedding-3-small`) | 1536 | Works with any OpenAI-compatible embeddings endpoint |
| **None** | `none` | — | — | Semantic / hybrid search disabled |

### Examples

**Ollama (recommended free option)**
```ini
EMBEDDINGS_PROVIDER=ollama
EMBEDDINGS_MODEL=nomic-embed-text
```

Make sure the model is pulled:
```bash
ollama pull nomic-embed-text
```

**Gemini (free tier)**
```ini
EMBEDDINGS_PROVIDER=gemini
GEMINI_API_KEY=...
```

**OpenAI**
```ini
EMBEDDINGS_PROVIDER=openai
LLM_API_KEY=sk-...
EMBEDDINGS_MODEL=text-embedding-3-small
```

---

## Cost comparison (rough, April 2026)

For a vault of ~5 000 notes (~3 M tokens):

| Setup | LLM cost | Embeddings cost | Privacy |
|---|---:|---:|---|
| Ollama (local) | $0 | $0 | Fully local |
| Gemini free tier | n/a | $0 (within quota) | Embeddings sent to Google |
| OpenAI | ~$0.50 (gpt-4o-mini, ~1k catalysts) | ~$0.06 (text-embedding-3-small) | Sent to OpenAI |
| Groq | ~$0.20 | n/a | Sent to Groq |

> Numbers are illustrative and depend on your vault size, enrichment frequency,
> and provider pricing. The tool re-uses cached embeddings via `content_hash`,
> so re-indexing only re-embeds *changed* notes.

---

## Picking a provider

| You want… | Use |
|---|---|
| Maximum privacy, willing to run a local model | **Ollama** for both |
| Best quality embeddings, free | **Gemini** + Ollama LLM (or none) |
| Fewest moving parts, money is fine | **OpenAI** for both |
| No network calls at all | `LLM_PROVIDER=none` + `EMBEDDINGS_PROVIDER=none` |

See the full env reference in [.env.example](../.env.example) and the privacy
guarantees in [PRIVACY.md](PRIVACY.md).
