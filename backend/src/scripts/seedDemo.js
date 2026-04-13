/**
 * Legacy demo seeding (sample users, courses, Big Buck Bunny URLs, fake upcoming rows) is disabled.
 * The server no longer calls these on startup.
 *
 * To wipe existing DB content and use only real uploads/data, run
 * `scripts/purge-training-content.sql` in your SQL client (or DO query UI), then restart the API.
 */

async function seedDemoIfEmpty() {}

async function backfillAdminDemoAssignmentsIfNeeded() {}

async function seedDefaultUpcomingIfEmpty() {}

module.exports = { seedDemoIfEmpty, backfillAdminDemoAssignmentsIfNeeded, seedDefaultUpcomingIfEmpty };
