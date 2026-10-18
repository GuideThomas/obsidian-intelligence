# Security Policy

## Supported versions

Security fixes are provided for the latest minor release line.

| Version | Supported |
|---------|-----------|
| 1.2.x   | ✅        |
| < 1.2   | ❌        |

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

Email **mail@thomaswinkler.art** with:

- A description of the vulnerability
- Steps to reproduce (if possible)
- The version you tested against
- Your assessment of impact

You'll get an acknowledgement within 72 hours. Confirmed issues will be fixed
as quickly as reasonably possible and disclosed in the [CHANGELOG](CHANGELOG.md)
once a patched release is out.

## Known advisories

As of **1.2.0 (checked 18.10.2026)**, `npm audit --omit=dev` reports **no
known vulnerabilities** in the published dependency tree
(`@modelcontextprotocol/sdk` 1.32.1, `better-sqlite3`, `dotenv`, optional
`chokidar`).

Earlier releases (1.1.x, SDK 1.29.0) carried transitive advisories in `hono`
and `express`/`path-to-regexp`, which the MCP SDK pulls in for its HTTP and
SSE transports. They were not reachable here — and still would not be:
`obsidian-intelligence` exclusively uses the MCP SDK's **stdio transport**
(`StdioServerTransport`), and the HTTP/SSE transports cannot be enabled
through any supported configuration. You can verify this yourself:

```bash
grep -r "StreamableHTTPServerTransport\|SSEServerTransport" mcp-server.mjs lib/
# → no matches
grep "Transport" mcp-server.mjs
# → only StdioServerTransport
```

One moderate advisory remains in the **dev** dependency `vitest` (fixed in
vitest 5). It affects the test runner only and is not part of the published
package.

## Network and privacy

See [docs/PRIVACY.md](docs/PRIVACY.md) for a complete inventory of what does
and does not leave your machine, and under which configurations.
