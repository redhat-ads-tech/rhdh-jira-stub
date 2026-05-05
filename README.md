# RHDH Jira Stub

A lightweight Node.js service that implements the Jira REST API search endpoint (`GET /rest/api/2/search`). It returns deterministic fake data seeded from the project key, giving every RHDH catalog component realistic-looking Jira metrics without requiring a real Jira instance.

## Why

The RHDH Scorecards plugin supports Jira as a data source for project health metrics (open issues, bug counts, etc.), but we don't want to maintain a JIRA instance. This stub acts as a drop-in Jira backend so the plugin works out of the box in demo environments.

## How It Works

1. The project key from the JQL query (e.g. `project=PARASOL`) is hashed with FNV-1a to produce a 32-bit seed
2. A Mulberry32 PRNG generates 5-24 issues per project with deterministic summaries, statuses, types, priorities, and dates
3. JQL filters (`type=Bug`, `resolution=Unresolved`, etc.) are applied as post-filters on the generated set

The same project key always produces the same issues, so metrics are stable across pod restarts.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{"status":"ok"}` |
| `GET` | `/rest/api/2/search` | Jira-compatible search (params: `jql`, `startAt`, `maxResults`) |

## Running Locally

```bash
npm install
node index.js
```

```bash
curl 'http://localhost:8080/rest/api/2/search?jql=project=PARASOL'
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PORT` | `8080` | Server port |
| `HTTP_HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `production` | `production` or `development` |

## Container Image

Built automatically on push to `main` via GitHub Actions and published to `ghcr.io`.

```bash
podman build -f Containerfile -t rhdh-jira-stub .
podman run -p 8080:8080 rhdh-jira-stub
```
