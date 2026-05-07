// Deterministic fake-issue generator.
//
// Given a project key (e.g. "PARASOL"), this module always produces the
// exact same set of issues. It works by:
//   1. Hashing the project key with FNV-1a to get a 32-bit seed
//   2. Feeding that seed into a Mulberry32 PRNG
//   3. Using the PRNG to pick issue counts, types, statuses, etc.
//
// This means metrics shown in RHDH Scorecards are stable across
// pod restarts and don't require any persistent storage.

'use strict';

// FNV-1a hash — turns a project key string into a 32-bit integer
// used to seed the PRNG. Standard FNV offset basis and prime.
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Mulberry32 — a simple seeded PRNG that returns floats in [0, 1).
// Each call advances the internal state so successive calls produce
// different (but reproducible) values.
function mulberry32(seed) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pools that issues are randomly assembled from
const STATUSES = ['Open', 'In Progress', 'In Review', 'Done', 'Closed'];
const TYPES = ['Bug', 'Task', 'Story', 'Epic'];
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
// SVG data URIs for priority icons so the plugin can render them without an external Jira instance
const PRIORITY_ICONS = {
  Highest: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.5 9.9c-.5.3-1.1.1-1.4-.3s-.1-1.1.3-1.4l5-3c.3-.2.7-.2 1 0l5 3c.5.3.6.9.3 1.4s-.9.6-1.4.3L8 7.2 3.5 9.9z" fill="#CF3104"/><path d="M3.5 13.4c-.5.3-1.1.1-1.4-.3-.3-.5-.1-1.1.3-1.4l5-3c.3-.2.7-.2 1 0l5 3c.5.3.6.9.3 1.4-.3.5-.9.6-1.4.3L8 10.7l-4.5 2.7z" fill="#CF3104"/></svg>'),
  High: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.5 11.4c-.5.3-1.1.1-1.4-.3-.3-.5-.1-1.1.3-1.4l5-3c.3-.2.7-.2 1 0l5 3c.5.3.6.9.3 1.4-.3.5-.9.6-1.4.3L8 8.7l-4.5 2.7z" fill="#E8552D"/></svg>'),
  Medium: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M3.5 9.9c-.5.3-1.1.1-1.4-.3s-.1-1.1.3-1.4l5-3c.3-.2.7-.2 1 0l5 3c.5.3.6.9.3 1.4s-.9.6-1.4.3L8 7.2 3.5 9.9z" fill="#F79232"/><path d="M3.5 13.4c-.5.3-1.1.1-1.4-.3-.3-.5-.1-1.1.3-1.4l5-3c.3-.2.7-.2 1 0l5 3c.5.3.6.9.3 1.4-.3.5-.9.6-1.4.3L8 10.7l-4.5 2.7z" fill="#F79232" transform="rotate(180 8 11.4)"/></svg>'),
  Low: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M12.5 6.1c.5-.3 1.1-.1 1.4.3.3.5.1 1.1-.3 1.4l-5 3c-.3.2-.7.2-1 0l-5-3c-.5-.3-.6-.9-.3-1.4.3-.5.9-.6 1.4-.3L8 8.8l4.5-2.7z" fill="#2A8735"/></svg>'),
  Lowest: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M12.5 6.1c.5-.3 1.1-.1 1.4.3.3.5.1 1.1-.3 1.4l-5 3c-.3.2-.7.2-1 0l-5-3c-.5-.3-.6-.9-.3-1.4.3-.5.9-.6 1.4-.3L8 8.8l4.5-2.7z" fill="#2A8735"/><path d="M12.5 2.6c.5-.3 1.1-.1 1.4.3.3.5.1 1.1-.3 1.4l-5 3c-.3.2-.7.2-1 0l-5-3c-.5-.3-.6-.9-.3-1.4.3-.5.9-.6 1.4-.3L8 5.3l4.5-2.7z" fill="#2A8735"/></svg>'),
};
const ADJECTIVES = ['Flaky', 'Broken', 'Missing', 'Slow', 'Incorrect', 'Outdated', 'Unclear', 'Redundant'];
const NOUNS = ['login flow', 'dashboard widget', 'API response', 'database query', 'error handling', 'unit test', 'form validation', 'search index', 'email notification', 'user profile', 'cache layer', 'build pipeline'];

// Generates the full unfiltered issue set for a project.
// Filtering by type/status/resolution happens in index.js after generation.
function generateIssues(projectKey) {
  const seed = fnv1a(projectKey);
  const rand = mulberry32(seed);

  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const count = 5 + Math.floor(rand() * 20); // 5–24 issues per project

  const issues = [];
  for (let i = 1; i <= count; i++) {
    const status = pick(STATUSES);
    const type = pick(TYPES);
    const priority = pick(PRIORITIES);
    const resolved = status === 'Done' || status === 'Closed';

    // Dates are relative to "now" so issues always look recent
    const now = Date.now();
    const MS_PER_DAY = 86400000;
    const createdDaysAgo = Math.floor(rand() * 30); // 0–30 days ago
    const updatedDaysAgo = Math.floor(rand() * createdDaysAgo); // between created and now
    const created = new Date(now - createdDaysAgo * MS_PER_DAY);
    const updated = new Date(now - updatedDaysAgo * MS_PER_DAY);

    issues.push({
      id: String(10000 + i),
      key: `${projectKey}-${i}`,
      fields: {
        summary: `${pick(ADJECTIVES)} ${pick(NOUNS)}`,
        status: { name: status },
        issuetype: { name: type },
        priority: { name: priority, iconUrl: PRIORITY_ICONS[priority] },
        resolution: resolved ? { name: 'Done' } : null,
        // Jira uses +0000 suffix, not Z
        created: created.toISOString().replace('Z', '+0000'),
        updated: updated.toISOString().replace('Z', '+0000'),
      },
    });
  }
  return issues;
}

module.exports = { fnv1a, generateIssues, STATUSES, TYPES };
