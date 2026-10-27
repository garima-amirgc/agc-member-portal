const { db } = require("../config/db");
const { ROLES, canonicalRole } = require("../config/constants");

const FACILITIES = ["AQM", "SCF", "ASP"];
const SEVERITIES = ["L1", "L2", "L3", "L4"];
const STATUSES = ["open", "in_progress", "closed"];

const MAX_TEXT = 4000;
const MAX_INCIDENT_ATTACHMENTS = 5;

// Mirrors itTickets.service.js's attachment handling: a JSON array of
// {url, name} stored as a TEXT column. Accepts either an array already, or
// a JSON string (as a multipart/form-style body would send it).
function normalizeAttachmentsJson(raw) {
  let value = raw;
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const item of value.slice(0, MAX_INCIDENT_ATTACHMENTS)) {
    const url = typeof item === "string" ? item : item?.url;
    const name =
      typeof item === "object" && item?.name != null ? String(item.name).trim().slice(0, 200) : "";
    if (!url || typeof url !== "string") continue;
    const u = url.trim();
    if (u.length < 8 || u.length > 2048) continue;
    out.push({ url: u, name: name || "attachment" });
  }
  return out.length ? JSON.stringify(out) : null;
}

function parseAttachmentsRow(raw) {
  if (raw == null || String(raw).trim() === "") return [];
  try {
    const arr = JSON.parse(String(raw));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function badRequest(message) {
  const e = new Error(message);
  e.statusCode = 400;
  return e;
}

function normalizeFacility(raw) {
  const v = String(raw || "").trim().toUpperCase();
  if (!FACILITIES.includes(v)) {
    throw badRequest("Please choose a valid facility (AQM, SCF, or ASP).");
  }
  return v;
}

function normalizeSeverity(raw) {
  const v = String(raw || "").trim().toUpperCase();
  if (!SEVERITIES.includes(v)) {
    throw badRequest("Please choose a severity level (L1-L4).");
  }
  return v;
}

function normalizeStatus(raw) {
  const v = String(raw || "open").trim().toLowerCase();
  if (!STATUSES.includes(v)) {
    throw badRequest("Invalid status. Choose open, in_progress, or closed.");
  }
  return v;
}

function normalizeDate(raw) {
  const s = String(raw || "").trim();
  if (!s) throw badRequest("Incident date is required.");
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw badRequest("Invalid incident date.");
  // Keep whatever the client sent if it already looks like a plain date
  // (yyyy-mm-dd) — avoids shifting the date across timezones.
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : d.toISOString().slice(0, 10);
}

function normalizeText(raw, { required = false, label = "This field" } = {}) {
  const s = raw == null ? "" : String(raw).trim();
  if (required && !s) throw badRequest(`${label} is required.`);
  if (s.length > MAX_TEXT) throw badRequest(`${label} is too long.`);
  return s || null;
}

const SELECT_BASE = `
  SELECT i.*,
    reporter.name AS reported_by_name, reporter.email AS reported_by_email,
    closer.name AS closed_by_name
  FROM cfo_incidents i
  LEFT JOIN users reporter ON reporter.id = i.reported_by
  LEFT JOIN users closer ON closer.id = i.closed_by
`;

function mapRow(row) {
  if (!row) return row;
  return {
    id: Number(row.id),
    facility: row.facility,
    department: row.department || null,
    incident_date: row.incident_date,
    severity: row.severity,
    status: row.status,
    description: row.description,
    financial_impact: row.financial_impact || null,
    root_cause: row.root_cause || null,
    corrective_action: row.corrective_action || null,
    preventive_action: row.preventive_action || null,
    reported_by: row.reported_by != null ? Number(row.reported_by) : null,
    reported_by_name: row.reported_by_name || null,
    reported_by_email: row.reported_by_email || null,
    closed_by: row.closed_by != null ? Number(row.closed_by) : null,
    closed_by_name: row.closed_by_name || null,
    closed_at: row.closed_at || null,
    attachments: parseAttachmentsRow(row.attachments),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listIncidents({ facility, status, severity } = {}) {
  const clauses = [];
  const params = [];
  if (facility) {
    clauses.push("i.facility = ?");
    params.push(normalizeFacility(facility));
  }
  if (status) {
    clauses.push("i.status = ?");
    params.push(normalizeStatus(status));
  }
  if (severity) {
    clauses.push("i.severity = ?");
    params.push(normalizeSeverity(severity));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db
    .prepare(
      `${SELECT_BASE} ${where} ORDER BY datetime(i.incident_date) DESC, i.id DESC`
    )
    .all(...params);
  return (rows || []).map(mapRow);
}

async function getIncidentById(id) {
  const row = await db.prepare(`${SELECT_BASE} WHERE i.id = ?`).get(Number(id));
  return mapRow(row);
}

async function createIncident(userId, body) {
  const facility = normalizeFacility(body?.facility);
  const incidentDate = normalizeDate(body?.incident_date);
  const severity = normalizeSeverity(body?.severity);
  const description = normalizeText(body?.description, { required: true, label: "Description" });
  const department = normalizeText(body?.department, { label: "Department" });
  const financialImpact = normalizeText(body?.financial_impact, { label: "Financial impact" });
  const rootCause = normalizeText(body?.root_cause, { label: "Root cause" });
  const correctiveAction = normalizeText(body?.corrective_action, { label: "Corrective action" });
  const preventiveAction = normalizeText(body?.preventive_action, { label: "Preventive action" });
  const attachmentsJson = normalizeAttachmentsJson(body?.attachments);

  const result = await db
    .prepare(
      `INSERT INTO cfo_incidents
        (facility, department, incident_date, severity, status, description,
         financial_impact, root_cause, corrective_action, preventive_action,
         reported_by, attachments, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      facility,
      department,
      incidentDate,
      severity,
      description,
      financialImpact,
      rootCause,
      correctiveAction,
      preventiveAction,
      userId,
      attachmentsJson
    );

  const id = result.lastInsertRowid;
  return getIncidentById(id);
}

async function updateIncident(userId, incidentId, body) {
  const id = Number(incidentId);
  if (!Number.isFinite(id) || id < 1) throw badRequest("Invalid incident id");

  const existing = await db.prepare("SELECT * FROM cfo_incidents WHERE id = ?").get(id);
  if (!existing) {
    const e = new Error("Incident not found");
    e.statusCode = 404;
    throw e;
  }

  const facility = body?.facility != null ? normalizeFacility(body.facility) : existing.facility;
  const incidentDate = body?.incident_date != null ? normalizeDate(body.incident_date) : existing.incident_date;
  const severity = body?.severity != null ? normalizeSeverity(body.severity) : existing.severity;
  const status = body?.status != null ? normalizeStatus(body.status) : existing.status;
  const description =
    body?.description !== undefined
      ? normalizeText(body.description, { required: true, label: "Description" })
      : existing.description;
  const department = body?.department !== undefined ? normalizeText(body.department, { label: "Department" }) : existing.department;
  const financialImpact =
    body?.financial_impact !== undefined
      ? normalizeText(body.financial_impact, { label: "Financial impact" })
      : existing.financial_impact;
  const rootCause =
    body?.root_cause !== undefined ? normalizeText(body.root_cause, { label: "Root cause" }) : existing.root_cause;
  const correctiveAction =
    body?.corrective_action !== undefined
      ? normalizeText(body.corrective_action, { label: "Corrective action" })
      : existing.corrective_action;
  const preventiveAction =
    body?.preventive_action !== undefined
      ? normalizeText(body.preventive_action, { label: "Preventive action" })
      : existing.preventive_action;
  const attachmentsJson =
    body?.attachments !== undefined ? normalizeAttachmentsJson(body.attachments) : existing.attachments;

  const wasClosed = existing.status === "closed";
  const isNowClosed = status === "closed";
  let closedBy = existing.closed_by;
  let closedAt = existing.closed_at;
  if (isNowClosed && !wasClosed) {
    closedBy = userId;
    closedAt = new Date().toISOString();
  } else if (!isNowClosed && wasClosed) {
    closedBy = null;
    closedAt = null;
  }

  await db
    .prepare(
      `UPDATE cfo_incidents SET
        facility = ?, department = ?, incident_date = ?, severity = ?, status = ?,
        description = ?, financial_impact = ?, root_cause = ?, corrective_action = ?,
        preventive_action = ?, attachments = ?, closed_by = ?, closed_at = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      facility,
      department,
      incidentDate,
      severity,
      status,
      description,
      financialImpact,
      rootCause,
      correctiveAction,
      preventiveAction,
      attachmentsJson,
      closedBy,
      closedAt,
      id
    );

  return getIncidentById(id);
}

// Deleting an incident report permanently removes a compliance record, so —
// unlike adding/updating, which the incident_report_edit grant covers — this
// is restricted to full Administrators, the same restriction IT Tickets uses
// for deleteTicket().
async function deleteIncident(actor, incidentId) {
  if (!actor || canonicalRole(actor.role) !== ROLES.ADMIN) {
    const e = new Error("Only administrators can delete incident reports");
    e.statusCode = 403;
    throw e;
  }
  const id = Number(incidentId);
  if (!Number.isFinite(id) || id < 1) throw badRequest("Invalid incident id");
  const existing = await db.prepare("SELECT id FROM cfo_incidents WHERE id = ?").get(id);
  if (!existing) {
    const e = new Error("Incident not found");
    e.statusCode = 404;
    throw e;
  }
  await db.prepare("DELETE FROM cfo_incidents WHERE id = ?").run(id);
  return { deleted: id };
}

module.exports = {
  FACILITIES,
  SEVERITIES,
  STATUSES,
  listIncidents,
  getIncidentById,
  createIncident,
  updateIncident,
  deleteIncident,
};
