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
    <div
      className={`${dim} shrink-0 overflow-hidden rounded-full bg-[#0B3EAF]/10 ring-1 ring-[#0B3EAF]/20 dark:bg-white/10 dark:ring-white/15`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-bold text-[#0B3EAF] dark:text-[#A7D344]">
          {initialsFromName(name)}
        </div>
      )}
    </div>
  );
}

/**
 * WhatsApp-style chat thread for an IT ticket.
 * Props:
 *   ticketId  — number
 *   currentUser — { id, name, ... }
 */
export default function TicketChatThread({ ticketId, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

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

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-scroll to bottom when messages load/arrive
  useEffect(() => {
    if (!loading) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text) return;
    setSendError("");
    setSending(true);
    try {
      const r = await api.post(`/tickets/${ticketId}/messages`, { body: text });
      setMessages((prev) => [...prev, r.data]);
      setDraft("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setSendError(e?.response?.data?.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const myId = Number(currentUser?.id);

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
      <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 dark:border-slate-700 dark:bg-[#141414]">
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
              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
                >
                  <Avatar name={msg.sender_name} imageUrl={msg.sender_image_url} size="sm" />
                  <div className={`max-w-[72%] ${isMine ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                    {!isMine && (
                      <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                        {msg.sender_name}
                      </span>
                    )}
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
                    <span className="text-[9px] text-slate-400 dark:text-slate-500">
                      {formatTime(msg.sent_at)}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
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
      {sendError ? (
        <p className="mt-1 text-[10px] text-red-500">{sendError}</p>
      ) : null}
    </div>
  );
}
