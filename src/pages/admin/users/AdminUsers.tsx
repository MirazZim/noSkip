import { useState, useEffect, useCallback } from "react";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import { useAdminAuth }  from "@/contexts/AdminAuthContext";

interface AdminUser {
  id:                  string;
  email:               string;
  created_at:          string;
  last_sign_in_at:     string | null;
  email_confirmed_at:  string | null;
  banned_until:        string | null;
  plan:                string;
  currency_preference: string;
  theme_preference:    string;
}

interface ListUsersResponse {
  users: AdminUser[];
  total: number;
  page:  number;
  limit: number;
}

const PLAN_COLORS: Record<string, string> = {
  free:       "bg-gray-700 text-gray-300",
  pro:        "bg-blue-900 text-blue-300",
  team:       "bg-purple-900 text-purple-300",
  enterprise: "bg-yellow-900 text-yellow-300",
};

const PLANS = ["free", "pro", "team", "enterprise"];

function isBanned(user: AdminUser): boolean {
  if (!user.banned_until) return false;
  return new Date(user.banned_until) > new Date();
}

export default function AdminUsers() {
  const { adminFetch }   = useAdminFetch();
  const { isSuperAdmin } = useAdminAuth();

  const [users,       setUsers]       = useState<AdminUser[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [updatingId,  setUpdatingId]  = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const LIMIT = 20;

  const loadUsers = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await adminFetch<ListUsersResponse>(
      "admin-users",
      { action: "list_users", page: p, limit: LIMIT }
    );
    if (err || !data) {
      setError(err ?? "Failed to load users");
    } else {
      setUsers(data.users);
      setTotal(data.total);
    }
    setLoading(false);
  }, [adminFetch]);

  useEffect(() => { loadUsers(page); }, [page, loadUsers]);

  const updatePlan = async (userId: string, plan: string) => {
    if (!isSuperAdmin) return;
    setUpdatingId(userId);
    const { error: err } = await adminFetch("admin-users", {
      action: "update_plan", user_id: userId, plan,
    });
    if (!err) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, plan } : u));
    }
    setUpdatingId(null);
  };

  const banUser = async (userId: string) => {
    if (!isSuperAdmin) return;
    setActioningId(userId);
    const { error: err } = await adminFetch("admin-users", {
      action: "ban_user", user_id: userId,
    });
    if (!err) {
      // Set banned_until to far future so isBanned() returns true
      setUsers((prev) => prev.map((u) =>
        u.id === userId
          ? { ...u, banned_until: "2999-01-01T00:00:00Z" }
          : u
      ));
    }
    setActioningId(null);
  };

  const unbanUser = async (userId: string) => {
    if (!isSuperAdmin) return;
    setActioningId(userId);
    const { error: err } = await adminFetch("admin-users", {
      action: "unban_user", user_id: userId,
    });
    if (!err) {
      setUsers((prev) => prev.map((u) =>
        u.id === userId ? { ...u, banned_until: null } : u
      ));
    }
    setActioningId(null);
  };

  const deleteUser = async (userId: string) => {
    if (!isSuperAdmin) return;
    setActioningId(userId);
    const { error: err } = await adminFetch("admin-users", {
      action: "delete_user", user_id: userId,
    });
    if (!err) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setTotal((t) => t - 1);
    }
    setActioningId(null);
    setConfirmDelete(null);
  };

  const totalPages = Math.ceil(total / LIMIT);

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "2-digit",
    }) : "—";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-gray-400 text-sm mt-1">{total} total users</p>
        </div>

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
                  <th className="text-left px-5 py-3">Email</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Plan</th>
                  <th className="text-left px-5 py-3">Joined</th>
                  <th className="text-left px-5 py-3">Last Sign In</th>
                  {isSuperAdmin && (
                    <th className="text-left px-5 py-3">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      {[...Array(isSuperAdmin ? 6 : 5)].map((_, j) => (
                        <td key={j} className="px-5 py-4">
                          <div className="h-4 bg-gray-800 rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 6 : 5} className="text-center text-gray-500 py-12">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const banned = isBanned(user);
                    const actioning = actioningId === user.id;
                    return (
                      <tr
                        key={user.id}
                        className={`border-b border-gray-800/50 transition-colors ${
                          banned ? "bg-red-950/20" : "hover:bg-gray-800/30"
                        }`}
                      >
                        {/* Email */}
                        <td className="px-5 py-4 font-mono text-xs text-gray-200">
                          {user.email}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          {banned ? (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-900/50 text-red-400 border border-red-800">
                              Banned
                            </span>
                          ) : user.email_confirmed_at ? (
                            <span className="text-green-400 text-xs">✓ Active</span>
                          ) : (
                            <span className="text-yellow-500 text-xs">Unverified</span>
                          )}
                        </td>

                        {/* Plan */}
                        <td className="px-5 py-4">
                          {isSuperAdmin ? (
                            <select
                              value={user.plan}
                              disabled={updatingId === user.id || banned}
                              onChange={(e) => updatePlan(user.id, e.target.value)}
                              className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                            >
                              {PLANS.map((p) => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${PLAN_COLORS[user.plan] ?? PLAN_COLORS.free}`}>
                              {user.plan}
                            </span>
                          )}
                        </td>

                        {/* Dates */}
                        <td className="px-5 py-4 text-gray-400 text-xs">{fmt(user.created_at)}</td>
                        <td className="px-5 py-4 text-gray-400 text-xs">{fmt(user.last_sign_in_at)}</td>

                        {/* Actions */}
                        {isSuperAdmin && (
                          <td className="px-5 py-4">
                            {confirmDelete === user.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-400">Sure?</span>
                                <button
                                  onClick={() => deleteUser(user.id)}
                                  disabled={actioning}
                                  className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded disabled:opacity-50"
                                >
                                  {actioning ? "…" : "Yes, delete"}
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {/* Ban / Unban */}
                                {banned ? (
                                  <button
                                    onClick={() => unbanUser(user.id)}
                                    disabled={actioning}
                                    className="px-2 py-1 bg-green-800 hover:bg-green-700 text-green-300 text-xs rounded disabled:opacity-50 transition-colors"
                                  >
                                    {actioning ? "…" : "Unban"}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => banUser(user.id)}
                                    disabled={actioning}
                                    className="px-2 py-1 bg-yellow-900 hover:bg-yellow-800 text-yellow-300 text-xs rounded disabled:opacity-50 transition-colors"
                                  >
                                    {actioning ? "…" : "Ban"}
                                  </button>
                                )}

                                {/* Delete */}
                                <button
                                  onClick={() => setConfirmDelete(user.id)}
                                  disabled={actioning}
                                  className="px-2 py-1 bg-red-900/50 hover:bg-red-800 text-red-400 text-xs rounded disabled:opacity-50 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
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