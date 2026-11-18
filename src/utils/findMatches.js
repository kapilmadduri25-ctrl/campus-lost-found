const items = require('../db/items');

/**
 * EXTRA FEATURE: duplicate / possible-match detection.
 *
 * Delegates to the SQL implementation so the scoring rule lives in one place:
 * same category, opposite type, open status, and at least one shared keyword.
 */
async function findPossibleMatches(params) {
  return items.findMatches(params);
}

module.exports = { findPossibleMatches };
