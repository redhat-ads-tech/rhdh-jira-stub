// Lightweight stub that implements the Jira REST API search endpoint.
// Used by the RHDH Scorecards/Jira plugin so every catalog component
// gets realistic-looking Jira metrics without a real Jira instance.
//
// Data is deterministic — the same project key always produces the same
// set of issues, so metrics are stable across restarts.

'use strict';

const env = require('env-var');
const express = require('express');
const { parseJql } = require('./jql-parser');
const { generateIssues } = require('./data-generator');

const HTTP_PORT = env.get('HTTP_PORT').default(8080).asPortNumber();
const HTTP_HOST = env.get('HTTP_HOST').default('0.0.0.0').asString();
const NODE_ENV = env.get('NODE_ENV').default('production').asEnum(['production', 'development']);

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Mirrors GET /rest/api/2/search from the Jira REST API v2.
// Accepts: jql (string), startAt (number), maxResults (number)
app.get('/rest/api/2/search', (req, res) => {
  const jql = req.query.jql || '';
  const startAt = parseInt(req.query.startAt, 10) || 0;
  const maxResults = Math.min(parseInt(req.query.maxResults, 10) || 50, 100);

  const filters = parseJql(jql);
  if (!filters.project) {
    return res.status(400).json({ errorMessages: ['JQL must include project=KEY'] });
  }

  // Generate the full issue set for the project, then narrow it down
  let issues = generateIssues(filters.project);

  // Post-filter: the generator creates all issue types/statuses for a project,
  // and we filter here to match what the JQL asked for.
  if (filters.type) {
    issues = issues.filter((i) => i.fields.issuetype.name.toLowerCase() === filters.type.toLowerCase());
  }
  if (filters.status) {
    issues = issues.filter((i) => i.fields.status.name.toLowerCase() === filters.status.toLowerCase());
  }
  if (filters.resolution) {
    if (filters.resolution.toLowerCase() === 'unresolved') {
      issues = issues.filter((i) => i.fields.resolution === null);
    } else {
      issues = issues.filter((i) => i.fields.resolution && i.fields.resolution.name.toLowerCase() === filters.resolution.toLowerCase());
    }
  }

  const total = issues.length;
  const page = issues.slice(startAt, startAt + maxResults);

  res.json({
    startAt,
    maxResults,
    total,
    issues: page,
  });
});

app.listen(HTTP_PORT, HTTP_HOST, () => {
  console.log(`jira-stub listening on ${HTTP_HOST}:${HTTP_PORT} (${NODE_ENV})`);
});
