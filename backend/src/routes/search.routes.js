const express = require("express");
const { db, isPostgres } = require("../config/db");
const { authRequired } = require("../middleware/auth");
const { ROLES, canonicalRole } = require("../config/constants");
const { hasAdminGrant, ADMIN_GRANT_KEYS } = require("../config/adminGrants");
const userDeptSvc = require("../services/userDepartments.service");

const router = express.Router();
router.use(authRequired);

const MAX_PER_CATEGORY = 5;

function like(q) {
  return `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}

async function searchUsers(q) {
  const p = like(q);
  const rows = await db
    .prepare(
      `SELECT id, name, email, department, business_unit, profile_image_url
       FROM users
       WHERE (name LIKE ? OR email LIKE ? OR department LIKE ? OR business_unit LIKE ?)
         AND role <> 'Admin'
       ORDER BY name ASC
       LIMIT ?`
    )
    .all(p, p, p, p, MAX_PER_CATEGORY);
  return rows.map((r) => ({
    category: "People",
    title: r.name || r.email,
    subtitle: [r.department, r.business_unit].filter(Boolean).join(" · "),
    link: "/team",
    image: r.profile_image_url || "",
  }));
}

async function searchNewHires(q) {
  const p = like(q);
  const rows = await db
    .prepare(
      `SELECT id, title, description, image_url FROM new_hires
       WHERE published = 1 AND (title LIKE ? OR description LIKE ?)
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(p, p, MAX_PER_CATEGORY);
  return rows.map((r) => ({
    category: "New Hires",
    title: r.title || "",
    subtitle: r.description || "",
    link: `/new-hires/${encodeURIComponent(String(r.id))}`,
    image: r.image_url || "",
  }));
}

async function searchEmployeeOfMonth(q) {
  const p = like(q);
  const rows = await db
    .prepare(
      `SELECT e.id, e.citation, e.image_url,
              COALESCE(NULLIF(TRIM(e.manual_name), ''), u.name) AS emp_name,
              u.profile_image_url AS emp_photo
       FROM employee_of_month e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.published = 1
         AND (COALESCE(NULLIF(TRIM(e.manual_name), ''), u.name) LIKE ? OR e.citation LIKE ?)
       ORDER BY e.year DESC, e.month DESC LIMIT ?`
    )
    .all(p, p, MAX_PER_CATEGORY);
  return rows.map((r) => ({
    category: "Employee of the Month",
    title: "Employee of the Month",
    subtitle: r.emp_name || "",
    link: `/employee-of-month/${encodeURIComponent(String(r.id))}`,
    image: r.image_url || r.emp_photo || "",
  }));
}

async function searchLeadership(q) {
  const p = like(q);
  const rows = await db
    .prepare(
      `SELECT id, title, description, image_url FROM leadership_updates
       WHERE published = 1 AND (title LIKE ? OR description LIKE ?)
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(p, p, MAX_PER_CATEGORY);
  return rows.map((r) => ({
    category: "Leadership Update",
    title: r.title || "",
    subtitle: r.description || "",
    link: `/leadership-updates/${encodeURIComponent(String(r.id))}`,
    image: r.image_url || "",
  }));
}

async function searchCustomerWins(q) {
  const p = like(q);
  const rows = await db
    .prepare(
      `SELECT id, title, description, image_url FROM customer_wins
       WHERE published = 1 AND (title LIKE ? OR description LIKE ?)
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(p, p, MAX_PER_CATEGORY);
  return rows.map((r) => ({
    category: "Customer Win",
    title: r.title || "",
    subtitle: r.description || "",
    link: `/customer-wins/${encodeURIComponent(String(r.id))}`,
    image: r.image_url || "",
  }));
}

async function searchCommunity(q) {
  const p = like(q);
  const rows = await db
    .prepare(
      `SELECT id, title, description, image_url FROM community_involvement
       WHERE published = 1 AND (title LIKE ? OR description LIKE ?)
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(p, p, MAX_PER_CATEGORY);
  return rows.map((r) => ({
    category: "Community Involvement",
    title: r.title || "",
    subtitle: r.description || "",
    link: `/community-involvement/${encodeURIComponent(String(r.id))}`,
    image: r.image_url || "",
  }));
}

async function searchUpcoming(q) {
  const p = like(q);
  const rows = await db
    .prepare(
      `SELECT id, title, description FROM facility_upcoming
       WHERE title LIKE ? OR description LIKE ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(p, p, MAX_PER_CATEGORY);
  return rows.map((r) => ({
    category: "Upcoming Event",
    title: r.title || "",
    subtitle: r.description || "",
    link: `/upcoming/${encodeURIComponent(String(r.id))}`,
    image: "",
  }));
}

async function searchTickets(q, userId, canSeeAll) {
  const p = like(q);
  let rows;
  if (canSeeAll) {
    rows = await db
      .prepare(
        `SELECT t.id, t.title, t.status, u.name AS user_name
         FROM it_tickets t
         JOIN users u ON u.id = t.user_id
         WHERE (t.title LIKE ? OR t.description LIKE ?)
         ORDER BY t.created_at DESC LIMIT ?`
      )
      .all(p, p, MAX_PER_CATEGORY);
  } else {
    rows = await db
      .prepare(
        `SELECT id, title, status FROM it_tickets
         WHERE user_id = ? AND (title LIKE ? OR description LIKE ?)
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(userId, p, p, MAX_PER_CATEGORY);
  }
  return rows.map((r) => ({
    category: "IT Ticket",
    title: r.title || `Ticket #${r.id}`,
    subtitle: canSeeAll && r.user_name ? `By ${r.user_name} · ${r.status}` : r.status || "",
    link: "/it-tickets",
    image: "",
  }));
}

router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ results: [] });

    const isAdmin = canonicalRole(req.user.role) === ROLES.ADMIN;
    const isIT = await userDeptSvc.hasDepartment(req.user.id, "IT");
    const hasTicketVisibility = hasAdminGrant(req.user, ADMIN_GRANT_KEYS.IT_TICKETS);
    const canSeeAllTickets =
      isAdmin
        ? req.user.adminGrants == null || (Array.isArray(req.user.adminGrants) && req.user.adminGrants.length === 0)
        : hasTicketVisibility;

    const [
      people,
      newHires,
      eom,
      leadership,
      customerWins,
      community,
      upcoming,
      tickets,
    ] = await Promise.all([
      searchUsers(q),
      searchNewHires(q),
      searchEmployeeOfMonth(q),
      searchLeadership(q),
      searchCustomerWins(q),
      searchCommunity(q),
      searchUpcoming(q),
      searchTickets(q, req.user.id, canSeeAllTickets || isIT),
    ]);

    const results = [
      ...people,
      ...newHires,
      ...eom,
      ...leadership,
      ...customerWins,
      ...community,
      ...upcoming,
      ...tickets,
    ];

    return res.json({ results });
  } catch (e) {
    console.error("[search]", e);
    return res.status(500).json({ message: "Search failed." });
  }
});

module.exports = router;
