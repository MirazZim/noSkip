import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";

// Pages are split into their own chunks so the first load only downloads the
// page being opened (admin, charts and the 3D coach stay out of the main bundle).
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Habits = lazy(() => import("./pages/Habits"));
const PersonaShift = lazy(() => import("./pages/PersonaShift"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/users/AdminUsers"));
const AdminAuditLogs = lazy(() => import("./pages/admin/audit/AdminAuditLogs"));
const AdminFlags = lazy(() => import("./pages/admin/flags/AdminFlags"));

const CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Changes from other devices arrive instantly via useRealtimeSync, so page
      // switches can reuse cached data instead of refetching on every mount.
      staleTime: 1000 * 60,
      gcTime: CACHE_MAX_AGE,         // must be >= the persister maxAge or restored data is dropped
    },
  },
});

// Snapshot of the cache in localStorage, so a returning visit renders the last
// known data instantly while fresh data loads in the background. Cleared on sign-out.
const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: "noskip-query-cache",
});

// staleTime: Infinity queries would never refetch after a restore, so keep them in memory only.
const NON_PERSISTED_KEYS = new Set(["feature_flags_resolved", "ai_insights"]);

function PageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <PageSpinner />;
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <PageSpinner />;
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister,
      maxAge: CACHE_MAX_AGE,
      buster: "v1",
      dehydrateOptions: {
        shouldDehydrateQuery: (query) =>
          query.state.status === "success" && !NON_PERSISTED_KEYS.has(String(query.queryKey[0])),
      },
    }}
  >
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AdminAuthProvider>
            <AuthProvider>
              <Suspense fallback={<PageSpinner />}>
                <Routes>
                  {/* User routes */}
                  <Route path="/auth"     element={<PublicRoute><Auth /></PublicRoute>} />
                  <Route path="/"        element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
                  <Route path="/habits"   element={<ProtectedRoute><Habits /></ProtectedRoute>} />
                  <Route path="/persona"  element={<ProtectedRoute><PersonaShift /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

                  {/* Admin routes — completely separate auth */}
                  <Route path="/admin/login" element={<AdminLogin />} />
                  <Route path="/admin" element={
                    <AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>
                  } />
                  <Route path="/admin/users" element={
                    <AdminProtectedRoute><AdminUsers /></AdminProtectedRoute>
                  } />
                  <Route path="/admin/audit" element={
                    <AdminProtectedRoute><AdminAuditLogs /></AdminProtectedRoute>
                  } />
                  <Route path="/admin/flags" element={
                    <AdminProtectedRoute><AdminFlags /></AdminProtectedRoute>
                  } />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AuthProvider>
          </AdminAuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </PersistQueryClientProvider>
);

export default App;