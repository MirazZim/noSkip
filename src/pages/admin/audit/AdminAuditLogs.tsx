import { useState, useEffect, useCallback, useMemo } from "react";
import { useAdminFetch } from "@/hooks/useAdminFetch";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuditLog {
  id: string;
  timestamp: string;
  actor_id: string | null;
  actor_type: string;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
}

interface ListLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

// ✅ FIXED: matches AdminUsers.tsx exactly
interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  plan: string;
  currency_preference: string;
  theme_preference: string;
}

// ✅ FIXED: matches AdminUsers.tsx exactly
interface ListUsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isBanned(user: AdminUser): boolean {
  if (!user.banned_until) return false;
  return new Date(user.banned_until) > new Date();
}

const ACTION_META: Record<string, { color: string; bg: string; dot: string }> = {
  "admin.login": { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400" },
  "admin.logout": { color: "text-slate-400", bg: "bg-slate-500/10  border-slate-500/20", dot: "bg-slate-400" },
  "admin.login_failed": { color: "text-rose-400", bg: "bg-rose-500/10   border-rose-500/20", dot: "bg-rose-400" },
  "admin.login_blocked": { color: "text-red-400", bg: "bg-red-500/10    border-red-500/20", dot: "bg-red-500" },
  "admin.update_plan": { color: "text-blue-400", bg: "bg-blue-500/10   border-blue-500/20", dot: "bg-blue-400" },
  "admin.flag_created": { color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", dot: "bg-violet-400" },
  "admin.flag_updated": { color: "text-amber-400", bg: "bg-amber-500/10  border-amber-500/20", dot: "bg-amber-400" },
  "admin.flag_deleted": { color: "text-rose-400", bg: "bg-rose-500/10   border-rose-500/20", dot: "bg-rose-400" },
};

const PLAN_CHIP: Record<string, string> = {
  free: "bg-slate-500/15  text-slate-400  border-slate-500/20",
  pro: "bg-blue-500/15   text-blue-400   border-blue-500/20",
  team: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  enterprise: "bg-amber-500/15  text-amber-400  border-amber-500/20",
};

const ACTOR_BADGES: Record<string, string> = {
  user: "bg-sky-500/12    text-sky-400   border-sky-500/20",
  admin: "bg-violet-500/12 text-violet-400 border-violet-500/20",
  system: "bg-amber-500/12  text-amber-400 border-amber-500/20",
};

const RESOURCE_BADGES: Record<string, string> = {
  admin_session: "bg-violet-500/10 text-violet-300",
  profile: "bg-sky-500/10    text-sky-300",
  feature_flag: "bg-amber-500/10  text-amber-300",
  expense: "bg-rose-500/10   text-rose-300",
  income: "bg-emerald-500/10 text-emerald-300",
  habit: "bg-teal-500/10   text-teal-300",
  loan: "bg-orange-500/10 text-orange-300",
};

// ─── Chips ────────────────────────────────────────────────────────────────────
function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action];
  if (!meta) return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-300
                     bg-slate-500/10 border border-slate-500/15 px-2 py-0.5 rounded-full">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />{action}
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] border
                      px-2 py-0.5 rounded-full ${meta.color} ${meta.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />{action}
    </span>
  );
}

function ActorBadge({ type }: { type: string }) {
  const cls = ACTOR_BADGES[type] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20";
  return (
    <span className={`inline-flex items-center text-[10px] font-black uppercase tracking-wider
                      px-2 py-0.5 rounded-full border ${cls}`}>
      {type}
    </span>
  );
}

function ResourceChip({ type }: { type: string }) {
  const cls = RESOURCE_BADGES[type] ?? "bg-slate-500/10 text-slate-300";
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md ${cls}`}>
      {type}
    </span>
  );
}

function PlanChip({ plan }: { plan: string }) {
  const cls = PLAN_CHIP[plan] ?? PLAN_CHIP.free;
  return (
    <span className={`inline-flex items-center text-[9px] font-black uppercase tracking-wider
                      px-1.5 py-0.5 rounded-full border ${cls}`}>
      {plan}
    </span>
  );
}

// ─── Avatar (deterministic color from email) ──────────────────────────────────
function Avatar({ email, size = "md" }: { email: string; size?: "sm" | "md" }) {
  const initials = email.slice(0, 2).toUpperCase();
  const hue = email.split("").reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]";
  return (
    <span
      className={`${dim} rounded-full flex items-center justify-center font-black shrink-0 select-none`}
      style={{ background: `hsl(${hue},55%,28%)`, color: `hsl(${hue},80%,72%)` }}
    >
      {initials}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminAuditLogs() {
  const { adminFetch } = useAdminFetch();

  // Log state
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [actorTypeFilter, setActorTypeFilter] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // User monitor
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userPanelOpen, setUserPanelOpen] = useState(true);

  const LIMIT = 50;

  // ✅ FIXED: correct endpoint "admin-users" + correct params matching AdminUsers.tsx
  useEffect(() => {
    (async () => {
      setUsersLoading(true);
      const { data } = await adminFetch<ListUsersResponse>(
        "admin-users",                                    // ← was "admin-audit"
        { action: "list_users", page: 1, limit: 200 }    // ← added page + limit
      );
      if (data?.users) setUsers(data.users);
      setUsersLoading(false);
    })();
  }, [adminFetch]);

  // Load logs
  const loadLogs = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);

    const filters: Record<string, string> = {};
    if (actionFilter) filters.action = actionFilter;
    if (actorTypeFilter) filters.actor_type = actorTypeFilter;
    if (resourceTypeFilter) filters.resource_type = resourceTypeFilter;
    if (selectedUser) filters.actor_id = selectedUser.id;

    const { data, error: err } = await adminFetch<ListLogsResponse>(
      "admin-audit",
      { action: "list_logs", page: p, limit: LIMIT, filters }
    );

    if (err || !data) {
      setError(err ?? "Failed to load logs");
    } else {
      setLogs(data.logs);
      setTotal(data.total);
    }
    setLoading(false);
  }, [adminFetch, actionFilter, actorTypeFilter, resourceTypeFilter, selectedUser]);

  useEffect(() => { setPage(1); }, [actionFilter, actorTypeFilter, resourceTypeFilter, selectedUser]);
  useEffect(() => { loadLogs(page); }, [page, loadLogs]);

  const totalPages = Math.ceil(total / LIMIT);
  const hasFilters = !!(actionFilter || actorTypeFilter || resourceTypeFilter || selectedUser);

  const fmt = (d: string) =>
    new Date(d).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

  const filteredUsers = useMemo(() =>
    users.filter((u) =>
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.id.toLowerCase().includes(userSearch.toLowerCase())
    ),
    [users, userSearch]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080b11] text-gray-100">
      <div className="h-[2px] w-full bg-gradient-to-r from-violet-600 via-blue-500 to-emerald-500" />

      <div className="max-w-[1600px] mx-auto px-6 py-8">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <h1 className="text-xl font-black tracking-tight text-white">Audit Logs</h1>
              {selectedUser && (
                <span className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1
                                 bg-violet-500/15 border border-violet-500/25 text-violet-300 rounded-full">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  Scoped: {selectedUser.email}
                </span>
              )}
            </div>
            <p className="text-[13px] text-slate-500 ml-[22px]">
              {loading
                ? <span className="inline-block w-16 h-3 bg-slate-800 rounded animate-pulse" />
                : <><span className="text-slate-300 font-semibold">{total.toLocaleString()}</span> events {selectedUser ? "for this user" : "recorded"}</>
              }
            </p>
          </div>

          <button
            onClick={() => loadLogs(page)}
            disabled={loading}
            className="flex items-center gap-2 text-[12px] font-bold px-4 py-2 rounded-xl
                       bg-slate-800/80 border border-slate-700/50 text-slate-300
                       hover:bg-slate-700/80 hover:text-white transition-all
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* ── Two-column layout ─────────────────────────────────────────── */}
        <div className="flex gap-5 items-start">

          {/* ══ LEFT: USER PANEL ══════════════════════════════════════════ */}
          <div className={`shrink-0 transition-all duration-300 ${userPanelOpen ? "w-[272px]" : "w-[44px]"}`}>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50
                            backdrop-blur-sm overflow-hidden sticky top-6">

              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60 bg-slate-900/80">
                {userPanelOpen && (
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="h-3.5 w-3.5 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-4.5 0 2.625 2.625 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                    </svg>
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 truncate">Users</span>
                    {!usersLoading && (
                      <span className="text-[10px] font-bold text-slate-600">({users.length})</span>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setUserPanelOpen((v) => !v)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg
                             bg-slate-800/60 border border-slate-700/40 text-slate-500
                             hover:text-slate-300 hover:border-slate-600 transition-all shrink-0"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d={userPanelOpen ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
                  </svg>
                </button>
              </div>

              {userPanelOpen && (
                <>
                  {/* Search */}
                  <div className="px-3 py-2.5 border-b border-slate-800/40">
                    <div className="relative">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600 pointer-events-none"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Search users…"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-300
                                   text-[11px] rounded-xl pl-7 pr-3 py-1.5
                                   focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20
                                   placeholder:text-slate-600 transition-colors"
                      />
                    </div>
                  </div>

                  {/* All users row */}
                  <button
                    onClick={() => setSelectedUser(null)}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 transition-colors text-left
                                border-b border-slate-800/30 border-l-2 ${!selectedUser ? "bg-violet-600/15 border-l-violet-500" : "hover:bg-slate-800/30 border-l-transparent"
                      }`}
                  >
                    <div className="h-8 w-8 rounded-full flex items-center justify-center
                                    bg-slate-700/60 border border-slate-600/40 shrink-0">
                      <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[12px] font-bold truncate ${!selectedUser ? "text-violet-300" : "text-slate-300"}`}>
                        All users
                      </p>
                      <p className="text-[10px] text-slate-600">{users.length} accounts</p>
                    </div>
                  </button>

                  {/* User list */}
                  <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
                    {usersLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-slate-800/20">
                          <div className="h-8 w-8 rounded-full bg-slate-800 animate-pulse shrink-0" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-2.5 w-28 bg-slate-800 rounded-full animate-pulse" />
                            <div className="h-2 w-14 bg-slate-800/60 rounded-full animate-pulse" />
                          </div>
                        </div>
                      ))
                    ) : filteredUsers.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <p className="text-[11px] text-slate-600">No users found</p>
                      </div>
                    ) : (
                      filteredUsers.map((user) => {
                        const isSelected = selectedUser?.id === user.id;
                        const banned = isBanned(user);
                        return (
                          <button
                            key={user.id}
                            onClick={() => setSelectedUser(isSelected ? null : user)}
                            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 transition-all
                                        text-left border-b border-slate-800/20 border-l-2 group ${isSelected
                                ? "bg-violet-600/15 border-l-violet-500"
                                : "hover:bg-slate-800/30 border-l-transparent"
                              }`}
                          >
                            {/* Avatar with banned indicator */}
                            <div className="relative shrink-0">
                              <Avatar email={user.email} />
                              {banned && (
                                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full
                                                 bg-rose-500 border-2 border-slate-900 flex items-center justify-center">
                                  <span className="text-[6px] font-black text-white">✕</span>
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className={`text-[11px] font-semibold truncate leading-tight ${isSelected ? "text-violet-300" : "text-slate-300 group-hover:text-slate-100"
                                }`}>
                                {user.email}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {/* ✅ FIXED: use plan + verified/banned — no actor_type */}
                                <PlanChip plan={user.plan} />
                                {banned ? (
                                  <span className="text-[9px] font-bold text-rose-400">banned</span>
                                ) : !user.email_confirmed_at ? (
                                  <span className="text-[9px] text-amber-500/70">unverified</span>
                                ) : null}
                              </div>
                            </div>

                            {isSelected && (
                              <svg className="h-3.5 w-3.5 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ══ RIGHT: LOG TABLE ══════════════════════════════════════════ */}
          <div className="flex-1 min-w-0">

            {/* Scoped user banner */}
            {selectedUser && (
              <div className="flex items-center justify-between mb-4 px-4 py-3
                              rounded-2xl bg-violet-950/40 border border-violet-500/20">
                <div className="flex items-center gap-3">
                  <Avatar email={selectedUser.email} size="sm" />
                  <div>
                    <p className="text-[12px] font-black text-violet-200">{selectedUser.email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-violet-400/50 font-mono">{selectedUser.id.slice(0, 16)}…</p>
                      <PlanChip plan={selectedUser.plan} />
                      {isBanned(selectedUser) && (
                        <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10
                                         border border-rose-500/20 px-1.5 py-0.5 rounded-full">
                          banned
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5
                             rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400
                             hover:bg-violet-500/20 transition-all"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear scope
                </button>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2.5 mb-5 p-4 rounded-2xl
                            bg-slate-900/60 border border-slate-800/60 backdrop-blur-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 mr-1">Filter</span>

              <div className="relative">
                <select
                  value={actorTypeFilter}
                  onChange={(e) => setActorTypeFilter(e.target.value)}
                  className="appearance-none bg-slate-800/80 border border-slate-700/60 text-slate-200
                             text-[12px] font-semibold rounded-xl pl-3 pr-7 py-2
                             focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30
                             cursor-pointer transition-colors hover:border-slate-600"
                >
                  <option value="">All actors</option>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                  <option value="system">system</option>
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              <div className="relative">
                <select
                  value={resourceTypeFilter}
                  onChange={(e) => setResourceTypeFilter(e.target.value)}
                  className="appearance-none bg-slate-800/80 border border-slate-700/60 text-slate-200
                             text-[12px] font-semibold rounded-xl pl-3 pr-7 py-2
                             focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30
                             cursor-pointer transition-colors hover:border-slate-600"
                >
                  <option value="">All resources</option>
                  <option value="admin_session">admin_session</option>
                  <option value="profile">profile</option>
                  <option value="feature_flag">feature_flag</option>
                  <option value="expense">expense</option>
                  <option value="income">income</option>
                  <option value="habit">habit</option>
                  <option value="loan">loan</option>
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search action…"
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700/60 text-slate-200
                             text-[12px] font-medium rounded-xl pl-8 pr-3 py-2
                             focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30
                             placeholder:text-slate-600 transition-colors hover:border-slate-600"
                />
              </div>

              {hasFilters && (
                <button
                  onClick={() => {
                    setActionFilter("");
                    setActorTypeFilter("");
                    setResourceTypeFilter("");
                    setSelectedUser(null);
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400
                             hover:text-white bg-slate-800/60 border border-slate-700/40 hover:border-slate-600
                             px-3 py-2 rounded-xl transition-all"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear all
                </button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 flex items-center gap-3 px-4 py-3.5
                              bg-rose-950/40 border border-rose-800/50 rounded-2xl text-rose-300 text-sm">
                <svg className="h-4 w-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {error}
              </div>
            )}

            {/* Table */}
            <div className="rounded-2xl border border-slate-800/60 overflow-hidden
                            bg-slate-900/40 backdrop-blur-sm shadow-2xl shadow-black/30">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80">
                      {["Timestamp", "Action", "Actor", "Resource", "IP Address", ""].map((h, i) => (
                        <th key={i} className="text-left px-5 py-3.5 text-[10px] font-black uppercase
                                               tracking-[0.12em] text-slate-600 bg-slate-900/60 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <tr key={i} className="border-b border-slate-800/30">
                          {[32, 28, 24, 20, 24, 4].map((w, j) => (
                            <td key={j} className="px-5 py-3.5">
                              <div className="h-3 bg-slate-800 rounded-full animate-pulse" style={{ width: `${w * 4}px` }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-20 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-12 w-12 rounded-2xl bg-slate-800/60 flex items-center justify-center">
                              <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                            </div>
                            <p className="text-slate-500 text-sm font-medium">No logs found</p>
                            {hasFilters && <p className="text-slate-600 text-xs">Try clearing your filters</p>}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      logs.map((log, rowIdx) => (
                        <>
                          <tr
                            key={log.id}
                            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                            className={`border-b border-slate-800/30 cursor-pointer transition-colors group
                              ${expandedId === log.id ? "bg-slate-800/50" : "hover:bg-slate-800/25"}
                              ${rowIdx % 2 !== 0 ? "bg-slate-900/20" : ""}
                            `}
                          >
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                                {fmt(log.timestamp)}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <ActionBadge action={log.action} />
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-col gap-1">
                                <ActorBadge type={log.actor_type} />
                                {log.actor_email ? (
                                  <span className="text-[11px] text-slate-400 font-medium">{log.actor_email}</span>
                                ) : log.actor_id ? (
                                  <span className="font-mono text-[11px] text-slate-600">{log.actor_id.slice(0, 8)}…</span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-col gap-1">
                                <ResourceChip type={log.resource_type} />
                                {log.resource_id && (
                                  <span className="font-mono text-[11px] text-slate-600 truncate max-w-[160px]">
                                    {String(log.resource_id).slice(0, 16)}…
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              {log.ip_address ? (
                                <span className="font-mono text-[11px] text-slate-400 bg-slate-800/60
                                                 border border-slate-700/40 px-2 py-0.5 rounded-lg">
                                  {log.ip_address}
                                </span>
                              ) : (
                                <span className="text-slate-700 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <span
                                className={`inline-flex items-center justify-center h-6 w-6 rounded-lg
                                  transition-all duration-200 border text-[10px]
                                  ${expandedId === log.id
                                    ? "bg-violet-500/20 border-violet-500/30 text-violet-400"
                                    : "bg-slate-800/60 border-slate-700/40 text-slate-500 group-hover:border-slate-600"
                                  }`}
                                style={{ transform: expandedId === log.id ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
                              >▾</span>
                            </td>
                          </tr>

                          {expandedId === log.id && (
                            <tr key={`${log.id}-meta`}>
                              <td colSpan={6} className="bg-[#0d1117] border-b border-slate-800/40">
                                <div className="px-6 py-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Metadata</span>
                                    <div className="flex-1 h-px bg-slate-800" />
                                  </div>
                                  <pre className="text-[12px] text-emerald-300/80 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3.5
                                border-t border-slate-800/60 bg-slate-900/40">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">
                      Page <span className="text-slate-300 font-bold">{page}</span> of{" "}
                      <span className="text-slate-300 font-bold">{totalPages}</span>
                    </span>
                    <span className="text-slate-700">·</span>
                    <span className="text-[11px] text-slate-600">
                      {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold
                                 rounded-xl bg-slate-800/80 border border-slate-700/50 text-slate-300
                                 hover:bg-slate-700/80 hover:text-white disabled:opacity-30
                                 disabled:cursor-not-allowed transition-all"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Prev
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let p: number;
                        if (totalPages <= 5) p = i + 1;
                        else if (page <= 3) p = i + 1;
                        else if (page >= totalPages - 2) p = totalPages - 4 + i;
                        else p = page - 2 + i;
                        return (
                          <button key={p} onClick={() => setPage(p)}
                            className={`h-7 w-7 text-[11px] font-bold rounded-lg transition-all ${p === page
                              ? "bg-violet-600 text-white shadow-lg shadow-violet-500/25"
                              : "text-slate-400 hover:text-white hover:bg-slate-700/60"
                              }`}
                          >{p}</button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold
                                 rounded-xl bg-slate-800/80 border border-slate-700/50 text-slate-300
                                 hover:bg-slate-700/80 hover:text-white disabled:opacity-30
                                 disabled:cursor-not-allowed transition-all"
                    >
                      Next
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
