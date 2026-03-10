import { useState, useEffect, useCallback } from "react";
import { useAdminFetch } from "@/hooks/useAdminFetch";

interface AuditLog {
  id:            string;
  timestamp:     string;
  actor_id:      string | null;
  actor_type:    string;
  actor_email:   string | null;   // ← add this
  action:        string;
  resource_type: string;
  resource_id:   string | null;
  metadata:      Record<string, unknown>;
  ip_address:    string | null;
}

interface ListLogsResponse {
  logs:  AuditLog[];
  total: number;
  page:  number;
  limit: number;
}

const ACTION_COLORS: Record<string, string> = {
  "admin.login":          "text-green-400",
  "admin.logout":         "text-gray-400",
  "admin.login_failed":   "text-red-400",
  "admin.login_blocked":  "text-red-500",
  "admin.update_plan":    "text-blue-400",
  "admin.flag_created":   "text-purple-400",
  "admin.flag_updated":   "text-yellow-400",
  "admin.flag_deleted":   "text-red-400",
};

export default function AdminAuditLogs() {
  const { adminFetch } = useAdminFetch();

  const [logs,     setLogs]     = useState<AuditLog[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Filters
  const [actionFilter,       setActionFilter]       = useState("");
  const [actorTypeFilter,    setActorTypeFilter]    = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");
  const [expandedId,         setExpandedId]         = useState<string | null>(null);

  const LIMIT = 50;

  const loadLogs = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);

    const filters: Record<string, string> = {};
    if (actionFilter)       filters.action        = actionFilter;
    if (actorTypeFilter)    filters.actor_type     = actorTypeFilter;
    if (resourceTypeFilter) filters.resource_type  = resourceTypeFilter;

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
  }, [adminFetch, actionFilter, actorTypeFilter, resourceTypeFilter]);

  useEffect(() => {
    setPage(1);
  }, [actionFilter, actorTypeFilter, resourceTypeFilter]);

  useEffect(() => { loadLogs(page); }, [page, loadLogs]);

  const totalPages = Math.ceil(total / LIMIT);

  const fmt = (d: string) =>
    new Date(d).toLocaleString("en-GB", {
      day:    "2-digit",
      month:  "short",
      year:   "2-digit",
      hour:   "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
          <p className="text-gray-400 text-sm mt-1">{total} total events</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <select
            value={actorTypeFilter}
            onChange={(e) => setActorTypeFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="">All actor types</option>
            <option value="user">user</option>
            <option value="admin">admin</option>
            <option value="system">system</option>
          </select>

          <select
            value={resourceTypeFilter}
            onChange={(e) => setResourceTypeFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="">All resource types</option>
            <option value="admin_session">admin_session</option>
            <option value="profile">profile</option>
            <option value="feature_flag">feature_flag</option>
            <option value="expense">expense</option>
            <option value="income">income</option>
            <option value="habit">habit</option>
            <option value="loan">loan</option>
          </select>

          <input
            type="text"
            placeholder="Filter by action (e.g. admin.login)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 w-72"
          />

          {(actionFilter || actorTypeFilter || resourceTypeFilter) && (
            <button
              onClick={() => {
                setActionFilter("");
                setActorTypeFilter("");
                setResourceTypeFilter("");
              }}
              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Timestamp</th>
                  <th className="text-left px-5 py-3">Action</th>
                  <th className="text-left px-5 py-3">Actor</th>
                  <th className="text-left px-5 py-3">Resource</th>
                  <th className="text-left px-5 py-3">IP</th>
                  <th className="text-left px-5 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-3.5 bg-gray-800 rounded animate-pulse w-28" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-500 py-12">
                      No logs found
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <>
                      <tr
                        key={log.id}
                        className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      >
                        {/* Timestamp */}
                        <td className="px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                          {fmt(log.timestamp)}
                        </td>

                        {/* Action */}
                        <td className="px-5 py-3 font-mono text-xs">
                          <span className={ACTION_COLORS[log.action] ?? "text-gray-300"}>
                            {log.action}
                          </span>
                        </td>

                        {/* Actor */}
<td className="px-5 py-3">
  <span className="text-xs text-gray-300">{log.actor_type}</span>
  {log.actor_email ? (
    <div className="text-xs text-gray-400">{log.actor_email}</div>
  ) : log.actor_id ? (
    <div className="font-mono text-xs text-gray-500">{log.actor_id.slice(0, 8)}…</div>
  ) : null}
</td>

                        {/* Resource */}
                        <td className="px-5 py-3">
                          <span className="text-xs text-gray-300">{log.resource_type}</span>
                          {log.resource_id && (
                            <div className="font-mono text-xs text-gray-500 truncate max-w-xs">
                              {String(log.resource_id).slice(0, 16)}…
                            </div>
                          )}
                        </td>

                        {/* IP */}
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">
                          {log.ip_address ?? "—"}
                        </td>

                        {/* Expand */}
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {expandedId === log.id ? "▲" : "▼"}
                        </td>
                      </tr>

                      {/* Expanded metadata */}
                      {expandedId === log.id && (
                        <tr key={`${log.id}-meta`} className="bg-gray-800/40">
                          <td colSpan={6} className="px-5 py-3">
                            <pre className="text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
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
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800 text-sm text-gray-400">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}