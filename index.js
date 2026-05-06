// Lightweight stub that implements the Jira REST API search endpoint.
// Used by the RHDH Scorecards/Jira plugin so every catalog component
// gets realistic-looking Jira metrics without a real Jira instance.
//
// Data is deterministic — the same project key always produces the same
// set of issues, so metrics are stable across restarts.

'use strict';

const env = require('env-var');
const express = require('express');
const morgan = require('morgan');
const { parseJql } = require('./jql-parser');
const { fnv1a, generateIssues, STATUSES, TYPES } = require('./data-generator');

const HTTP_PORT = env.get('HTTP_PORT').default(8080).asPortNumber();
const HTTP_HOST = env.get('HTTP_HOST').default('0.0.0.0').asString();
const NODE_ENV = env.get('NODE_ENV').default('production').asEnum(['production', 'development']);
const LOG_FORMAT = env.get('LOG_FORMAT').default('combined').asEnum(['combined', 'common', 'dev', 'short', 'tiny']);

const app = express();

app.use(express.json());

// Use 'dev' for coloured concise output locally, 'combined' for production logs
app.use(morgan(LOG_FORMAT, {
  skip: (req) => req.path === '/health',
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Jira issue type objects reused across project and status endpoints
const ISSUE_TYPES = TYPES.map((name, i) => ({
  id: String(i + 1),
  name,
  subtask: false,
}));

// The Jira plugin uses "latest" by default but also supports "2".
// Accept both API versions for all endpoints.
const API = '/rest/api/:version(2|latest)';

// GET /rest/api/{version}/project/{projectKey}
// Returns project metadata including name, key, and available issue types.
app.get(`${API}/project/:projectKey`, (req, res) => {
  const key = req.params.projectKey.toUpperCase();
  res.json({
    id: String(fnv1a(key) % 100000),
    key,
    name: key.charAt(0) + key.slice(1).toLowerCase(),
    avatarUrls: {
      '48x48': '',
      '32x32': '',
      '24x24': '',
      '16x16': '',
    },
    issueTypes: ISSUE_TYPES,
  });
});

// GET /rest/api/{version}/project/{projectKey}/statuses
// Returns the set of statuses grouped by issue type.
app.get(`${API}/project/:projectKey/statuses`, (_req, res) => {
  const statuses = STATUSES.map((name) => ({
    name,
    statusCategory: {
      key: name === 'Done' || name === 'Closed' ? 'done' : name === 'Open' ? 'new' : 'indeterminate',
      name: name === 'Done' || name === 'Closed' ? 'Done' : name === 'Open' ? 'To Do' : 'In Progress',
    },
  }));
  res.json(
    ISSUE_TYPES.map((type) => ({ ...type, statuses }))
  );
});

// Maps each status name to its Jira status category
const STATUS_CATEGORIES = {};
STATUSES.forEach((name) => {
  if (name === 'Done' || name === 'Closed') STATUS_CATEGORIES[name.toLowerCase()] = 'done';
  else if (name === 'Open') STATUS_CATEGORIES[name.toLowerCase()] = 'new';
  else STATUS_CATEGORIES[name.toLowerCase()] = 'indeterminate';
});

// Shared search logic used by both GET and POST search endpoints
function handleSearch(jql, startAt, maxResults) {
  const filters = parseJql(jql);
  if (!filters.project) {
    return { error: 'JQL must include project=KEY' };
  }

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
  // "statuscategory not in (Done)" — exclude issues whose status maps to the given category
  if (filters.statusCategoryNotIn) {
    const excluded = filters.statusCategoryNotIn.map((c) => c.toLowerCase());
    issues = issues.filter((i) => {
      const cat = STATUS_CATEGORIES[i.fields.status.name.toLowerCase()] || 'indeterminate';
      return !excluded.includes(cat);
    });
  }

  const total = issues.length;
  const page = issues.slice(startAt, startAt + maxResults);

  return {
    startAt,
    maxResults,
    total,
    issues: page,
  };
}

// GET /rest/api/{version}/search
// Classic Jira v2 search via query params (used by the Roadie Jira frontend plugin)
app.get(`${API}/search`, (req, res) => {
  const jql = req.query.jql || '';
  const startAt = parseInt(req.query.startAt, 10) || 0;
  const maxResults = Math.min(parseInt(req.query.maxResults, 10) || 50, 100);

  const result = handleSearch(jql, startAt, maxResults);
  if (result.error) {
    return res.status(400).json({ errorMessages: [result.error] });
  }
  res.json(result);
});

// POST /rest/api/{version}/search
// Used by the Scorecards Jira module in Data Center mode (API v2).
// Sends { jql, fields: [], maxResults: 0 } and reads back { total }.
app.post(`${API}/search`, (req, res) => {
  const jql = req.body.jql || '';
  const startAt = parseInt(req.body.startAt, 10) || 0;
  const maxResults = parseInt(req.body.maxResults, 10) || 50;

  const result = handleSearch(jql, startAt, maxResults);
  if (result.error) {
    return res.status(400).json({ errorMessages: [result.error] });
  }
  res.json(result);
});

// POST /rest/api/{version}/search/jql
// Newer Jira search endpoint used by the Roadie Jira frontend plugin.
// JQL + pagination params arrive in the JSON request body.
app.post(`${API}/search/jql`, (req, res) => {
  const jql = req.body.jql || '';
  const startAt = parseInt(req.body.startAt, 10) || 0;
  const maxResults = Math.min(parseInt(req.body.maxResults, 10) || 50, 5000);

  const result = handleSearch(jql, startAt, maxResults);
  if (result.error) {
    return res.status(400).json({ errorMessages: [result.error] });
  }
  res.json(result);
});

// GET /rest/api/{version}/issue/{issueKey}
// Returns a single issue with changelog. The plugin fetches this for detail views.
app.get(`${API}/issue/:issueKey`, (req, res) => {
  const issueKey = req.params.issueKey.toUpperCase();
  const [projectKey] = issueKey.split('-');
  const issues = generateIssues(projectKey);
  const issue = issues.find((i) => i.key === issueKey);
  if (!issue) {
    return res.status(404).json({ errorMessages: [`Issue ${issueKey} not found`] });
  }
  res.json({
    ...issue,
    fields: {
      ...issue.fields,
      assignee: null,
      comment: { comments: [], total: 0 },
    },
    changelog: { histories: [] },
  });
});

// GET /rest/api/{version}/user
// Returns a stub user object. The plugin queries this for avatar display.
app.get(`${API}/user`, (req, res) => {
  const username = req.query.username || 'unknown';
  res.json({
    displayName: username,
    avatarUrls: { '48x48': '', '32x32': '', '24x24': '', '16x16': '' },
  });
});

// GET /rest/dev-status/1.0/issue/detail
// Returns empty PR data. The plugin checks this for linked pull requests.
app.get('/rest/dev-status/1.0/issue/detail', (_req, res) => {
  res.json({ detail: [{ pullRequests: [] }] });
});

// GET /activity
// Returns an empty activity stream. The plugin fetches this for recent activity.
app.get('/activity', (_req, res) => {
  res.type('text/html').send('');
});

app.listen(HTTP_PORT, HTTP_HOST, () => {
  console.log(`jira-stub listening on ${HTTP_HOST}:${HTTP_PORT} (${NODE_ENV})`);
});
