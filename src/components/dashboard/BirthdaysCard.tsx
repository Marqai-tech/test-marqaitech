'use client';

/**
 * Task 136 — Birthdays section for the self-service dashboard.
 * Task 138 — WhatsApp-style greeting card preview: "Send Wishes" opens a
 * chat-styled preview of the greeting card (editable message) before sending.
 * Task 149 — featured celebrant block with big photo + per-employee Send Wishes.
 * Task 151 — TODAY ONLY per request: the card now lists ONLY the colleagues
 * whose birthday falls TODAY. The "This month" and "Coming up" lists were
 * removed — no more month-long listings.
 * EVERY logged-in user can send a small greetings card ("Send Wishes") —
 * bell notification + festive email — once per sender per birthday year.
 */
import { useCallback, useEffect, useState } from 'react';
import { FiCalendar, FiSend, FiCheck, FiGift, FiX, FiMessageCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

interface BirthdayWish {
  senderName: string;
  source?: string;
  message?: string | null;
}

interface BirthdayPerson {
  employeeId: string;
  name: string;
  employeeCode: string;
  department: string | null;
  designation: string | null;
  avatar: string | null;
  originalBirthday: string | null;
  dateOfBirth?: string | null;
  birthdaySource?: 'original_birthday' | 'date_of_birth';
  wishes?: BirthdayWish[];
  wishCount?: number;
  wishedByMe?: boolean;
  daysUntil?: number;
  dayOfMonth?: number;
}

function Avatar({ p, size = 40 }: { p: BirthdayPerson; size?: number }) {
  return (
    <div
      className="rounded-full bg-gradient-to-br from-fuchsia-400 to-amber-400 flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size, fontSize: size / 3 }}
    >
      {p.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
      ) : (
        p.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
      )}
    </div>
  );
}

/** WhatsApp-style greeting card preview + send (Task 138). */
function WishModal({ person, onClose, onSent }: { person: BirthdayPerson; onClose: () => void; onSent: (id: string) => void }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/birthdays/wish', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ employeeId: person.employeeId, message: message.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to send wishes');
      if (d.alreadyWished) {
        toast.success(`You already sent ${person.name} your wishes this year`);
      } else {
        const delivered = (d.delivered?.notifications || 0) + (d.delivered?.emails || 0);
        toast.success(`🎂 Wishes sent to ${person.name}${delivered > 0 ? ` (card + ${delivered} alert${delivered === 1 ? '' : 's'})` : ''}`);
      }
      onSent(person.employeeId);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send wishes');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* WhatsApp-style header */}
        <div className="bg-[#075E54] text-white px-4 py-3 flex items-center gap-3">
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 transition" aria-label="Close">
            <FiX className="w-4 h-4" />
          </button>
          <Avatar p={person} size={34} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{person.name}</p>
            <p className="text-[11px] text-emerald-100/80 truncate">birthday wishes · greeting card</p>
          </div>
        </div>

        {/* Chat wallpaper with the greeting-card bubble preview */}
        <div
          className="px-4 py-6 space-y-3"
          style={{ backgroundColor: '#ECE5DD', backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        >
          <p className="text-center text-[11px] text-slate-500 bg-white/80 rounded-full px-3 py-1 w-fit mx-auto">TODAY · PREVIEW</p>

          {/* The greeting card bubble */}
          <div className="relative max-w-[85%]">
            <div className="rounded-2xl rounded-tr-sm overflow-hidden shadow-md bg-[#DCF8C6]">
              <div className="bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400 px-4 py-5 text-center">
                <p className="text-3xl leading-none mb-1">🎉🎂</p>
                <p className="text-white font-extrabold text-lg drop-shadow">Happy Birthday!</p>
                <p className="text-white/95 text-sm font-semibold mt-0.5">{person.name.split(' ')[0]} 🎈</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[13px] text-slate-800 whitespace-pre-wrap break-words">
                  {message.trim() ? message.trim() : 'Wishing you a fantastic year ahead filled with joy and success! 🎁'}
                </p>
                <p className="text-[11px] text-slate-500 text-right mt-1.5 flex items-center justify-end gap-1">
                  now <span className="text-sky-500">✓✓</span>
                </p>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 text-center">
            Delivered as a bell notification + a festive greeting-card email to {person.name.split(' ')[0]}.
          </p>
        </div>

        {/* Message composer + send */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2 bg-white">
          <input
            type="text"
            value={message}
            maxLength={300}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Type your birthday message for ${person.name.split(' ')[0]}…`}
            className="flex-1 px-4 py-2.5 rounded-full border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-slate-50"
          />
          <button
            onClick={send}
            disabled={sending}
            className="w-10 h-10 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow hover:brightness-105 transition disabled:opacity-60"
            aria-label="Send wishes"
          >
            <FiSend className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BirthdaysCard() {
  const [today, setToday] = useState<BirthdayPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wished, setWished] = useState<Record<string, boolean>>({});
  const [modalPerson, setModalPerson] = useState<BirthdayPerson | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/birthdays', { headers: getAuthHeaders() });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load birthdays');
      setToday(d.today || []);
      const map: Record<string, boolean> = {};
      for (const p of (d.today || []) as BirthdayPerson[]) map[p.employeeId] = Boolean(p.wishedByMe);
      setWished(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load birthdays');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Task 149 — template "Team Birthday" FEATURED person: today's first
     celebrant. Task 151 — the card is TODAY-ONLY, so the featured celebrant
     is simply today's first birthday person (no month/upcoming fallback). */
  const featured = today[0] || null;
  const othersToday = today.slice(1);

  /** The wishes mini-feed under a birthday person (Task 138). */
  const WishesFeed = ({ p }: { p: BirthdayPerson }) => {
    const wishes = p.wishes || [];
    if (wishes.length === 0) return null;
    return (
      <div className="mt-2 space-y-1 pl-1">
        {wishes.slice(0, 3).map((w, i) => (
          <p key={i} className="text-[11px] text-white/50 flex items-start gap-1.5">
            <FiMessageCircle className="w-3 h-3 mt-0.5 text-fuchsia-300 flex-shrink-0" />
            <span className="truncate">
              <span className="font-semibold text-white/80">{w.senderName}</span>
              {w.message ? `: ${w.message}` : ' sent birthday wishes 🎉'}
            </span>
          </p>
        ))}
        {wishes.length > 3 && <p className="text-[11px] text-fuchsia-300 font-medium pl-5">+ {wishes.length - 3} more wish{wishes.length - 3 === 1 ? '' : 'es'}</p>}
      </div>
    );
  };

  /* Task 148 — FULL dark card, template "Team Birthday" (card-bg-5 bg-dark)
     pattern: near-black gradient, festive glows, white text, glass rows.
     Task 151 — TODAY ONLY: featured celebrant + "also celebrating today". */
  return (
    <div className="relative overflow-hidden rounded-2xl border-0 shadow-lg shadow-slate-900/25 bg-gradient-to-br from-[#171E2E] via-[#1C2436] to-[#2A1F35] p-5 h-full flex flex-col">
      <div className="pointer-events-none absolute -top-12 -right-10 w-36 h-36 bg-fuchsia-500/25 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute -bottom-14 -left-8 w-32 h-32 bg-amber-400/20 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -left-10 w-24 h-24 bg-[#6C4FD6]/25 rounded-full blur-3xl" />
      <div className="relative flex-1 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span className="text-lg">🎂</span> Birthdays
          <span className="text-xs font-medium text-white/50">celebrating today only</span>
        </h3>
        <button onClick={load} className="text-xs text-white/60 hover:text-fuchsia-300 flex items-center gap-1">
          <FiCalendar className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-white/60">Loading birthdays…</div>
      ) : error ? (
        <div className="py-4 text-center text-sm text-red-300">{error}</div>
      ) : !featured ? (
        <div className="py-6 text-center">
          <p className="text-2xl mb-2">🎈</p>
          <p className="text-sm text-white/70 font-medium">No birthdays today</p>
          <p className="text-xs text-white/40 mt-1">The next team celebration will appear here on the day itself.</p>
        </div>
      ) : (
        <>
          {/* ══ FEATURED celebrant — big photo + greeting-card Send Wishes ══ */}
          <div className="text-center rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-5 mb-3">
            <div className="relative w-fit mx-auto">
              <Avatar p={featured} size={84} />
              <span className="absolute -top-2 -right-2 text-2xl drop-shadow">🎉</span>
            </div>
            <p className="text-white font-bold mt-3 leading-tight">{featured.name}</p>
            <p className="text-xs text-white/60 mt-0.5">
              {featured.designation || featured.department || 'Team member'}
              {featured.designation && featured.department ? ` · ${featured.department}` : ''}
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-fuchsia-200 bg-fuchsia-400/15 border border-fuchsia-300/25 rounded-full px-3 py-1 mt-2">
              🎂 It&apos;s their birthday today!
            </span>
            {(featured.wishCount || 0) > 0 && (
              <p className="text-[11px] text-white/50 mt-1.5">
                {featured.wishCount} wish{featured.wishCount === 1 ? '' : 'es'} sent 🎉
                {featured.birthdaySource === 'date_of_birth' && <span className="ml-1.5 text-[10px] bg-white/10 border border-white/20 text-white/70 rounded px-1 py-0.5">from Date of Birth</span>}
              </p>
            )}
            <div className="mt-3">
              {wished[featured.employeeId] || featured.wishedByMe ? (
                <span className="text-xs font-semibold text-emerald-300 inline-flex items-center gap-1 bg-emerald-400/15 border border-emerald-300/30 px-3 py-2 rounded-lg">
                  <FiCheck className="w-3.5 h-3.5" /> Wished
                </span>
              ) : (
                <button
                  onClick={() => setModalPerson(featured)}
                  className="text-xs font-bold text-white bg-gradient-to-r from-fuchsia-500 to-pink-500 px-4 py-2 rounded-lg inline-flex items-center gap-1.5 hover:opacity-90 hover:shadow-lg hover:shadow-fuchsia-500/30 transition"
                >
                  <FiSend className="w-3.5 h-3.5" /> Send Wishes
                </button>
              )}
            </div>
            <WishesFeed p={featured} />
          </div>

          {othersToday.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <FiGift className="w-3.5 h-3.5" /> Also celebrating today
              </p>
              <div className="space-y-2">
                {othersToday.map((p) => (
                  <div key={p.employeeId} className="rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar p={p} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {p.name} <span className="text-xs font-normal text-white/50">· {p.employeeCode}{p.department ? ` · ${p.department}` : ''}</span>
                        </p>
                        <p className="text-xs text-white/50">
                          {p.wishCount || 0} wish{(p.wishCount || 0) === 1 ? '' : 'es'} sent today 🎉
                          {p.birthdaySource === 'date_of_birth' && <span className="ml-1.5 text-[10px] bg-white/10 border border-white/20 text-white/70 rounded px-1 py-0.5">from Date of Birth</span>}
                        </p>
                      </div>
                      {wished[p.employeeId] || p.wishedByMe ? (
                        <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1 bg-emerald-400/15 border border-emerald-300/30 px-2.5 py-1.5 rounded-lg">
                          <FiCheck className="w-3.5 h-3.5" /> Wished
                        </span>
                      ) : (
                        <button
                          onClick={() => setModalPerson(p)}
                          className="text-xs font-bold text-white bg-gradient-to-r from-fuchsia-500 to-pink-500 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:opacity-90 transition"
                        >
                          <FiSend className="w-3.5 h-3.5" /> Send Wishes
                        </button>
                      )}
                    </div>
                    <WishesFeed p={p} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {modalPerson && (
        <WishModal
          person={modalPerson}
          onClose={() => setModalPerson(null)}
          onSent={(id) => setWished((m) => ({ ...m, [id]: true }))}
        />
      )}
      </div>
    </div>
  );
}
