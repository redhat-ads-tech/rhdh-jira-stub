// Minimal regex-based JQL parser.
// Only extracts the fields the Jira plugin actually queries for:
//   project, type/issuetype, resolution, status
// This is NOT a full JQL parser — it just pulls out key=value pairs
// via regex so the stub can filter its generated data set.

'use strict';

function parseJql(jql) {
  const result = {};

  const projectMatch = jql.match(/project\s*=\s*"?([A-Za-z0-9_-]+)"?/i);
  if (projectMatch) {
    result.project = projectMatch[1].toUpperCase();
  }

  // Matches both "type=" and "issuetype=" (Jira accepts either)
  const typeMatch = jql.match(/(?:issue)?type\s*=\s*"?([A-Za-z]+)"?/i);
  if (typeMatch) {
    result.type = typeMatch[1];
  }

  const resolutionMatch = jql.match(/resolution\s*=\s*"?([A-Za-z]+)"?/i);
  if (resolutionMatch) {
    result.resolution = resolutionMatch[1];
  }

  const statusMatch = jql.match(/status\s*=\s*"?([A-Za-z ]+)"?/i);
  if (statusMatch) {
    result.status = statusMatch[1].trim();
  }

  return result;
}

module.exports = { parseJql };
