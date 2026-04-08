# Security Policy

## Supported versions

Security fixes are provided for the latest minor release line.

| Version | Supported |
|---------|-----------|
| 1.1.x   | ✅        |
| < 1.1   | ❌        |

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

## Known transitive advisories

`obsidian-intelligence` depends on [`@modelcontextprotocol/sdk`][mcp-sdk], which
in turn pulls in `hono` and `express`/`path-to-regexp` for its **HTTP and SSE
transport implementations**. As of SDK 1.29.0, these transitive packages carry
the following advisories:

- [GHSA-wmmm-f939-6g9c][] — hono: middleware bypass via repeated slashes in
  `serveStatic` (high)
- [GHSA-j3q9-mxjg-w52f][] — path-to-regexp: ReDoS via sequential optional
  groups (high)
- [GHSA-27v5-c462-wpq7][] — path-to-regexp: ReDoS via multiple wildcards (high)

### Are you affected?

**No, not in the default obsidian-intelligence configuration.**

`obsidian-intelligence` exclusively uses the MCP SDK's **stdio transport**
(`StdioServerTransport`). The vulnerable hono/express code is only loaded when
an MCP server uses the HTTP or SSE transports — which this project does not,
and which cannot be enabled through any supported configuration.

You can verify this yourself:

```bash
grep -r "StreamableHTTPServerTransport\|SSEServerTransport" mcp-server.mjs lib/
# → no matches
grep "Transport" mcp-server.mjs
# → only StdioServerTransport
```

No user-reachable code path in `obsidian-intelligence` invokes the vulnerable
modules. They exist on disk after `npm install` purely as transitive
dependencies of the SDK.

### Tracking

These issues are tracked upstream in the MCP SDK. They will be resolved
automatically once upstream bumps its dependencies; we will bump the SDK pin
and ship a patch release as soon as that happens.

[mcp-sdk]: https://github.com/modelcontextprotocol/typescript-sdk
[GHSA-wmmm-f939-6g9c]: https://github.com/advisories/GHSA-wmmm-f939-6g9c
[GHSA-j3q9-mxjg-w52f]: https://github.com/advisories/GHSA-j3q9-mxjg-w52f
[GHSA-27v5-c462-wpq7]: https://github.com/advisories/GHSA-27v5-c462-wpq7

## Network and privacy

See [docs/PRIVACY.md](docs/PRIVACY.md) for a complete inventory of what does
and does not leave your machine, and under which configurations.
