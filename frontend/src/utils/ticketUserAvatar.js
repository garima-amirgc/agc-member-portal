import { resolvePublicMediaUrl } from "./mediaUrl";

/**
 * Profile photo for the user who submitted a ticket.
 * Uses API join data; if missing and this is the current user's ticket, uses fresh /users/me avatar.
 */
export function ticketRequesterPhotoUrl(ticket, currentUser) {
  if (!ticket) return "";
  const fromApi = ticket.user_profile_image_url ?? ticket.userProfileImageUrl ?? "";
  const trimmed = String(fromApi || "").trim();
  const isOwnTicket =
    currentUser?.id != null &&
    ticket.user_id != null &&
    Number(ticket.user_id) === Number(currentUser.id);
  const raw = trimmed || (isOwnTicket ? String(currentUser?.profile_image_url || "").trim() : "");
  return resolvePublicMediaUrl(raw);
}
