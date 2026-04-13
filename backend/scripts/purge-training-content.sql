-- Destructive: removes ALL users, courses, lessons, assignments, tickets, leave requests,
-- resource docs, upcoming events, and related rows. Schema is preserved.
-- Run once in PostgreSQL (DigitalOcean query UI, psql, DBeaver) when connected to your app database.
-- After this, set SEED_DEFAULT_ADMIN=1 in .env for ONE boot if you need admin@company.com again, then remove it.

BEGIN;

TRUNCATE TABLE
  lesson_completions,
  manager_notifications,
  assignments,
  lessons,
  courses,
  leave_requests,
  it_tickets,
  resource_progress,
  resource_documents,
  facility_upcoming,
  user_facilities,
  user_departments,
  users
RESTART IDENTITY CASCADE;

COMMIT;
