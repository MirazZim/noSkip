import { useState, useEffect, useCallback } from "react";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import { useAdminAuth }  from "@/contexts/AdminAuthContext";

interface FeatureFlag {
  id:          string;
  flag_name:   string;
  entity_type: "user" | "plan" | "global";
  entity_id:   string | null;
  enabled:     boolean;
  updated_at:  string;
}

interface ListFlagsResponse {
  flags: FeatureFlag[];
}

// Groups flags by flag_name for a clean view
function groupFlags(flags: FeatureFlag[]) {
  const groups: Record<string, FeatureFlag[]> = {};
  for (const flag of flags) {
    if (!groups[flag.flag_name]) groups[flag.flag_name] = [];
    groups[flag.flag_name].push(flag);
  }
  return groups;
}

const ENTITY_TYPE_COLORS: Record<string, string> = {
  global: "bg-blue-900/40 text-blue-300 border-blue-800",
  plan:   "bg-purple-900/40 text-purple-300 border-purple-800",
  user:   "bg-green-900/40 text-green-300 border-green-800",
};

export default function AdminFlags() {
  const { adminFetch }   = useAdminFetch();
  const { isSuperAdmin } = useAdminAuth();

  const [flags,      setFlags]      = useState<FeatureFlag[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // New flag form
  const [showForm,      setShowForm]      = useState(false);
  const [formFlagName,  setFormFlagName]  = useState("");
  const [formEntityType, setFormEntityType] = useState<"global" | "plan" | "user">("global");
  const [formEntityId,  setFormEntityId]  = useState("");
  const [formEnabled,   setFormEnabled]   = useState(true);
  const [formSaving,    setFormSaving]    = useState(false);
  const [formError,     setFormError]     = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await adminFetch<ListFlagsResponse>(
      "admin-flags",
      { action: "list_flags" }
    );
    if (err || !data) {
      setError(err ?? "Failed to load flags");
    } else {
      setFlags(data.flags);
    }
    setLoading(false);
  }, [adminFetch]);

  useEffect(() => { loadFlags(); }, [loadFlags]);

  const toggleFlag = async (flag: FeatureFlag) => {
    if (!isSuperAdmin) return;
    setTogglingId(flag.id);
    const { error: err } = await adminFetch("admin-flags", {
      action:      "upsert_flag",
      flag_name:   flag.flag_name,
      entity_type: flag.entity_type,
      entity_id:   flag.entity_id ?? undefined,
      enabled:     !flag.enabled,
    });
    if (!err) {
      setFlags((prev) =>
        prev.map((f) => f.id === flag.id ? { ...f, enabled: !f.enabled } : f)
      );
    }
    setTogglingId(null);
  };

  const deleteFlag = async (flagId: string) => {
    if (!isSuperAdmin || !confirm("Delete this flag?")) return;
    const { error: err } = await adminFetch("admin-flags", {
      action:  "delete_flag",
      flag_id: flagId,
    });
    if (!err) {
      setFlags((prev) => prev.filter((f) => f.id !== flagId));
    }
  };

  const saveNewFlag = async () => {
    if (!formFlagName.trim()) {
      setFormError("Flag name is required");
      return;
    }
    if ((formEntityType === "user" || formEntityType === "plan") && !formEntityId.trim()) {
      setFormError("Entity ID is required for user/plan flags");
      return;
    }
    setFormSaving(true);
    setFormError(null);
    const { error: err } = await adminFetch("admin-flags", {
      action:      "upsert_flag",
      flag_name:   formFlagName.trim(),
      entity_type: formEntityType,
      entity_id:   formEntityType === "global" ? undefined : formEntityId.trim(),
      enabled:     formEnabled,
    });
    if (err) {
      setFormError(err);
    } else {
      setShowForm(false);
      setFormFlagName("");
      setFormEntityType("global");
      setFormEntityId("");
      setFormEnabled(true);
      await loadFlags();
    }
    setFormSaving(false);
  };

  const grouped = groupFlags(flags);
  const flagNames = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Feature Flags</h1>
            <p className="text-gray-400 text-sm mt-1">{flags.length} total flag entries</p>
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
            >
              {showForm ? "Cancel" : "+ New Flag"}
            </button>
          )}
        </div>

        {/* New flag form */}
        {showForm && isSuperAdmin && (
          <div className="mb-6 bg-gray-900 border border-gray-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Create / Update Flag</h2>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Flag name</label>
                <input
                  type="text"
                  value={formFlagName}
                  onChange={(e) => setFormFlagName(e.target.value)}
                  placeholder="e.g. ai_insights"
                  className="bg-gray-800 border border-gray-600 text-gray-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 w-52"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Entity type</label>
                <select
                  value={formEntityType}
                  onChange={(e) => setFormEntityType(e.target.value as "global" | "plan" | "user")}
                  className="bg-gray-800 border border-gray-600 text-gray-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="global">global</option>
                  <option value="plan">plan</option>
                  <option value="user">user</option>
                </select>
              </div>
              {formEntityType !== "global" && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    {formEntityType === "plan" ? "Plan name (e.g. pro)" : "User UUID"}
                  </label>
                  <input
                    type="text"
                    value={formEntityId}
                    onChange={(e) => setFormEntityId(e.target.value)}
                    placeholder={formEntityType === "plan" ? "pro" : "uuid..."}
                    className="bg-gray-800 border border-gray-600 text-gray-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 w-52"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Enabled</label>
                <button
                  onClick={() => setFormEnabled((v) => !v)}
                  className={`w-12 h-7 rounded-full transition-colors ${formEnabled ? "bg-blue-600" : "bg-gray-700"}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white mx-1 transition-transform ${formEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
              <button
                onClick={saveNewFlag}
                disabled={formSaving}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
              >
                {formSaving ? "Saving…" : "Save"}
              </button>
            </div>
            {formError && (
              <p className="text-red-400 text-xs mt-3">{formError}</p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Flags grouped by name */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-900 rounded-xl animate-pulse border border-gray-800" />
            ))}
          </div>
        ) : flagNames.length === 0 ? (
          <div className="text-center text-gray-500 py-16">No feature flags found</div>
        ) : (
          <div className="space-y-3">
            {flagNames.map((name) => (
              <div key={name} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-mono text-sm font-semibold text-gray-100">{name}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {grouped[name].map((flag) => (
                    <div
                      key={flag.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${ENTITY_TYPE_COLORS[flag.entity_type]}`}
                    >
                      <span className="font-medium">{flag.entity_type}</span>
                      {flag.entity_id && (
                        <span className="font-mono opacity-70">{flag.entity_id}</span>
                      )}

                      {/* Toggle */}
                      {isSuperAdmin ? (
                        <button
                          disabled={togglingId === flag.id}
                          onClick={() => toggleFlag(flag)}
                          className={`ml-1 w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${
                            flag.enabled ? "bg-blue-500" : "bg-gray-600"
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 bg-white rounded-full mx-0.5 transition-transform ${
                            flag.enabled ? "translate-x-4" : "translate-x-0"
                          }`} />
                        </button>
                      ) : (
                        <span className={flag.enabled ? "text-green-400" : "text-red-400"}>
                          {flag.enabled ? "ON" : "OFF"}
                        </span>
                      )}

                      {/* Delete */}
                      {isSuperAdmin && (
                        <button
                          onClick={() => deleteFlag(flag.id)}
                          className="ml-1 text-gray-500 hover:text-red-400 transition-colors"
                          title="Delete flag"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}