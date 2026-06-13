export const TICKET_ISSUE_TYPES = [
  { value: "hardware", label: "Hardware" },
  { value: "software", label: "Software" },
  { value: "report_access", label: "Report Access" },
  { value: "report", label: "Report" },
  { value: "other", label: "Other" },
];

export function parseTicketAttachmentsRaw(raw) {
  if (raw == null || raw === "") return [];
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function issueTypeLabelFromTitle(title) {
  const raw = String(title || "");
  const m = raw.match(/^\s*\[([^\]]+)\]\s*/);
  return (m?.[1] || "").trim();
}

export function titleWithoutTypePrefix(title) {
  const raw = String(title || "").trim();
  return raw.replace(/^\s*\[[^\]]+\]\s*/, "").trim() || raw;
}

export function ticketToEditForm(ticket) {
  const typeLabel = issueTypeLabelFromTitle(ticket?.title);
  const typeEntry = TICKET_ISSUE_TYPES.find((t) => t.label === typeLabel);
  const issueType = typeEntry?.value ?? (typeLabel === "Other" ? "other" : "hardware");
  const stripped = titleWithoutTypePrefix(ticket?.title);

  if (issueType === "other") {
    return {
      issueType: "other",
      otherIssue: ticket?.description?.trim() || stripped,
      title: "",
      description: "",
      priority: ticket?.priority || "medium",
      assigneeId: ticket?.assignee_id != null ? String(ticket.assignee_id) : "",
      attachments: parseTicketAttachmentsRaw(ticket?.attachments),
    };
  }

  return {
    issueType,
    title: stripped,
    description: ticket?.description?.trim() || "",
    otherIssue: "",
    priority: ticket?.priority || "medium",
    assigneeId: ticket?.assignee_id != null ? String(ticket.assignee_id) : "",
    attachments: parseTicketAttachmentsRaw(ticket?.attachments),
  };
}

export function buildTicketPayload({
  issueType,
  title,
  description,
  otherIssue,
  priority,
  assigneeId,
  attachments,
}) {
  const typeLabel = TICKET_ISSUE_TYPES.find((x) => x.value === issueType)?.label || "Issue";

  if (issueType === "other") {
    const detail = String(otherIssue || "").trim();
    if (!detail) {
      return { error: "Please describe your issue." };
    }
    const payloadTitle = `[Other] ${detail.length > 90 ? `${detail.slice(0, 87)}…` : detail}`;
    return {
      payload: {
        title: payloadTitle,
        description: detail.length > 90 ? detail : undefined,
        priority,
        assignee_id: Number(assigneeId),
        attachments: attachments?.length > 0 ? attachments : undefined,
      },
    };
  }

  const trimmedTitle = String(title || "").trim();
  if (!trimmedTitle) {
    return { error: "Please enter a short title." };
  }

  return {
    payload: {
      title: `[${typeLabel}] ${trimmedTitle}`,
      description: String(description || "").trim() || undefined,
      priority,
      assignee_id: Number(assigneeId),
      attachments: attachments?.length > 0 ? attachments : undefined,
    },
  };
}

export function canUserEditTicket(ticket, user, { isIT = false, isAdmin = false } = {}) {
  if (!ticket || user?.id == null) return false;
  if (ticket.status !== "open") return false;
  if (isIT || isAdmin) return true;
  return Number(ticket.user_id) === Number(user.id);
}
