import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

function initialsFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return String(a + b).toUpperCase() || "?";
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function Avatar({ name, imageUrl, size = "sm" }) {
  const [failed, setFailed] = useState(false);
  const src = imageUrl ? resolvePublicMediaUrl(imageUrl) : "";
  const dim = size === "sm" ? "h-7 w-7 text-[9px]" : "h-8 w-8 text-[10px]";
  return (
    <div className={`${dim} shrink-0 overflow-hidden rounded-full bg-[#0B3EAF]/10 ring-1 ring-[#0B3EAF]/20 dark:bg-white/10 dark:ring-white/15`}>
      {src && !failed ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-bold text-[#0B3EAF] dark:text-[#A7D344]">
          {initialsFromName(name)}
        </div>
      )}
    </div>
  );
}

function IconEdit() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.726 1.341l-.35 1.557a.75.75 0 0 0 .904.904l1.556-.35a2.75 2.75 0 0 0 1.342-.726l4.261-4.262a1.75 1.75 0 0 0 0-2.475Z" />
      <path d="M3.75 13.5A.75.75 0 0 1 3 12.75v-.904a.75.75 0 0 1 .22-.53l6.263-6.263 1.214 1.214-6.263 6.263a.75.75 0 0 1-.53.22H3.75Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd" />
    </svg>
  );
}

/**
 * WhatsApp-style chat thread for an IT ticket.
 * Props:
 *   ticketId    — number
 *   currentUser — { id, name, ... }
 */
export default function TicketChatThread({ ticketId, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete state
  const [deletingMsgId, setDeletingMsgId] = useState(null);

  const chatBoxRef = useRef(null);
  const textareaRef = useRef(null);
  const editRef = useRef(null);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    const el = chatBoxRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const myId = Number(currentUser?.id);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/tickets/${ticketId}/messages`);
      setMessages(Array.isArray(r.data) ? r.data : []);
      setError("");
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { void load(); }, [load]);

  // Scroll to bottom only on initial load (instant, no page jump)
  useEffect(() => {
    if (!loading) scrollToBottom("instant");
  }, [loading, scrollToBottom]);

  // Focus edit textarea when entering edit mode
  useEffect(() => {
    if (editingId) setTimeout(() => editRef.current?.focus(), 30);
  }, [editingId]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text) return;
    setSendError("");
    setSending(true);
    try {
      const r = await api.post(`/tickets/${ticketId}/messages`, { body: text });
      setMessages((prev) => [...prev, r.data]);
      setDraft("");
      setTimeout(() => scrollToBottom(), 50);
    } catch (e) {
      setSendError(e?.response?.data?.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setEditDraft(msg.body);
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
    setEditError("");
  };

  const saveEdit = async () => {
    const text = editDraft.trim();
    if (!text) return;
    setEditSaving(true);
    setEditError("");
    try {
      const r = await api.patch(`/tickets/${ticketId}/messages/${editingId}`, { body: text });
      setMessages((prev) => prev.map((m) => (m.id === editingId ? r.data : m)));
      cancelEdit();
    } catch (e) {
      setEditError(e?.response?.data?.message || "Could not save edit.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (msgId) => {
    setDeletingMsgId(msgId);
    try {
      await api.delete(`/tickets/${ticketId}/messages/${msgId}`);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (e) {
      console.error("Delete message failed:", e?.response?.data?.message || e);
    } finally {
      setDeletingMsgId(null);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  };

  const onEditKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveEdit(); }
    if (e.key === "Escape") cancelEdit();
  };

  return (
    <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-[#A7D344]" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#0B3EAF] dark:text-[#A7D344]">
          Ticket Chat
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          — messages between requester and IT
        </span>
      </div>

      {/* Messages area */}
      <div ref={chatBoxRef} className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 dark:border-slate-700 dark:bg-[#141414]">
        {loading ? (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">Loading…</p>
        ) : error ? (
          <p className="text-center text-xs text-red-500">{error}</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            No messages yet. Send one below to start the conversation.
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => {
              const isMine = Number(msg.sender_id) === myId;
              const isDeleting = deletingMsgId === msg.id;
              const isEditing = editingId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={[
                    "group flex items-end gap-2 transition-opacity",
                    isMine ? "flex-row-reverse" : "flex-row",
                    isDeleting ? "opacity-40 pointer-events-none" : "",
                  ].join(" ")}
                >
                  <Avatar name={msg.sender_name} imageUrl={msg.sender_image_url} size="sm" />

                  <div className={`max-w-[72%] flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                    {!isMine && (
                      <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                        {msg.sender_name}
                      </span>
                    )}

                    {/* Edit / delete controls (own messages only, fade in on hover) */}
                    {isMine && !isEditing && (
                      <div className="mb-0.5 flex items-center gap-0.5 self-end opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => startEdit(msg)}
                          className="rounded p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-[#0B3EAF] dark:hover:bg-white/10 dark:hover:text-[#A7D344]"
                        >
                          <IconEdit />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => handleDelete(msg.id)}
                          className="rounded p-0.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                        >
                          <IconTrash />
                        </button>
                      </div>
                    )}

                    {/* Bubble — edit mode or normal */}
                    {isEditing ? (
                      <div className="w-full min-w-[200px]">
                        <textarea
                          ref={editRef}
                          className="w-full resize-none rounded-xl border border-[#0B3EAF]/40 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/20 dark:border-[#A7D344]/30 dark:bg-[#1a1a1a] dark:text-slate-200 dark:focus:border-[#A7D344] dark:focus:ring-[#A7D344]/20"
                          rows={2}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={onEditKeyDown}
                          disabled={editSaving}
                        />
                        {editError ? <p className="mt-0.5 text-[9px] text-red-500">{editError}</p> : null}
                        <div className="mt-1 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={editSaving || !editDraft.trim()}
                            className="rounded-lg bg-[#0B3EAF] px-2.5 py-0.5 text-[10px] font-bold text-white transition hover:bg-[#0a35a0] disabled:opacity-50 dark:bg-[#A7D344] dark:text-[#0a0a0a] dark:hover:bg-[#93bb2e]"
                          >
                            {editSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={editSaving}
                            className="rounded-lg px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                          >
                            Cancel
                          </button>
                          <span className="text-[9px] text-slate-400">Esc to cancel</span>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={[
                          "rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm",
                          isMine
                            ? "rounded-br-sm bg-[#0B3EAF] text-white"
                            : "rounded-bl-sm bg-white text-slate-800 ring-1 ring-slate-200 dark:bg-[#1e1e1e] dark:text-slate-200 dark:ring-slate-700",
                        ].join(" ")}
                      >
                        {msg.body}
                      </div>
                    )}

                    <span className="text-[9px] text-slate-400 dark:text-slate-500">
                      {formatTime(msg.sent_at)}
                      {msg.edited_at ? <span className="ml-1 italic opacity-70">· edited</span> : null}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reply box */}
      <div className="mt-2 flex items-end gap-2">
        <textarea
          ref={textareaRef}
          className="min-h-[38px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#0B3EAF] focus:ring-2 focus:ring-[#0B3EAF]/20 dark:border-slate-700 dark:bg-[#1a1a1a] dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-[#A7D344] dark:focus:ring-[#A7D344]/20"
          rows={1}
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending || !!error}
        />
        <button
          type="button"
          className="shrink-0 inline-flex items-center justify-center rounded-xl bg-[#0B3EAF] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#0a35a0] disabled:opacity-50 dark:bg-[#A7D344] dark:text-[#0a0a0a] dark:hover:bg-[#93bb2e]"
          onClick={sendMessage}
          disabled={sending || !draft.trim() || !!error}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
      {sendError ? <p className="mt-1 text-[10px] text-red-500">{sendError}</p> : null}
    </div>
  );
}
