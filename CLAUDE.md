# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NoSkip is a personal-productivity web app pairing an **expense tracker** and a **habit tracker** in one dashboard, with an **AI Finance Analyst** and an identity-based **Persona Shift** feature. React + Vite + TypeScript frontend, Supabase backend (Postgres + Auth + Edge Functions), deployed on Vercel.

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:8080
npm run build        # production build → dist/
npm run build:dev    # build in development mode
npm run lint         # ESLint over the repo
npm run preview      # serve the built dist/
npm test             # vitest run (one-shot)
npm run test:watch   # vitest watch mode
```

Run a single test file: `npx vitest run src/path/to/file.test.ts`. Tests live next to source as `*.test.ts`/`*.spec.tsx` (see `vitest.config.ts`); environment is jsdom with `@testing-library/react`, setup in `src/test/setup.ts`.

Edge functions (Deno) deploy via the Supabase CLI, not the Vite build:
```bash
supabase functions deploy generate-insights
supabase secrets set OPENROUTER_API_KEY=...   # function secrets live on Supabase, never in the bundle
```

## Environment

Frontend reads these from `.env` (Vite `import.meta.env`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` — note: this is the actual var name in `src/integrations/supabase/client.ts`. The README's mention of `VITE_SUPABASE_ANON_KEY` is stale.
- `VITE_SUPABASE_PROJECT_ID`

## Architecture

**Data access goes through React Query hooks, one per domain.** `src/hooks/use{Habits,Expenses,Incomes,Loans,Savings,CustomCategories,PersonaRules}.ts` each export `useX()` queries plus `useAddX`/`useUpdateX`/`useDeleteX` mutations that call `supabase` directly and `invalidateQueries` on success. Components never touch the Supabase client directly — always go via a hook. The Supabase singleton is `@/integrations/supabase/client` and `@/integrations/supabase/types.ts` holds generated DB types (do not hand-edit).

**Query key convention:** `["domain", user?.id]` (e.g. `["habits", user?.id]`). Queries gate on auth with `enabled: !!user`. Reorder mutations are optimistic with snapshot rollback — see `useReorderHabits` as the canonical pattern.

**Two independent auth systems:**
- User auth: `AuthContext` (`useAuth()`) wraps Supabase Auth (email/password), persisted in `localStorage`. Routes are guarded by `ProtectedRoute`/`PublicRoute` in `App.tsx`.
- Admin auth: `AdminAuthContext` (`useAdminAuth()`) is completely separate — a custom token from the `admin-login` edge function stored in `sessionStorage`, guarded by `AdminProtectedRoute`. Roles: `super_admin` / `support_agent`. Admin pages are under `src/pages/admin/`.

**Persona Shift reuses the habit engine.** A "persona rule" is a row in the `habits` table with `category = 'persona_shift'` (regular habits use `category = 'habit'`). Completions, streaks, check-off, and reorder are all shared with habits. The only new piece is the AI coach reaction fired on create/edit via the `evaluate-persona-rule` edge function — it never blocks saving (failures degrade to a `none` flag). See `usePersonaRules.ts`.

**Feature flags** are resolved server-side via the `get_my_flags` RPC and read through `useFeatureFlag("flag_name")` (cached for the session). Admins manage flags under `/admin/flags`.

**Currency** is per-user (`profiles.currency_preference`). Always format money with `formatAmount` from `useCurrency()` rather than hardcoding a symbol.

**Audit logging** is fire-and-forget via `auditLog()` in `src/lib/auditLog.ts` (calls the `log_audit_event` RPC); it silently no-ops on failure and must never block the UI.

### Backend (Supabase)

- **Migrations:** `supabase/migrations/*.sql` (timestamp-prefixed). The DB enforces per-user isolation through Row Level Security on all tables.
- **Edge functions:** `supabase/functions/*/index.ts` (Deno). `_shared/` holds `cors.ts`, `openrouter.ts` (LLM client + model), and `adminAuth.ts` (`verifyAdminToken`, SHA-256 token hashing). Admin functions (`admin-users`, `admin-audit`, `admin-flags`) all verify the admin session token first.
- **`generate-insights`** is the AI Finance Analyst: it reads cycle-bound expenses/habits/budgets/memories, computes a **deterministic** financial-health score in code, asks the LLM (OpenRouter) only for the prose verdict, then overwrites the AI's score with the computed value and upserts `ai_insights` + `ai_memories`. The math stays in code; the AI only writes the words.

## Conventions

- Path alias `@/` → `src/` (configured in both `vite.config.ts` and `vitest.config.ts`).
- UI is shadcn/ui (`src/components/ui/`, configured via `components.json`) on Tailwind; icons are `lucide-react`; toasts via `sonner`. Drag-and-drop uses `@dnd-kit`.
- Feature components are grouped by domain under `src/components/{dashboard,expenses,habits,persona}/`.
- Deployment is automatic via Vercel on push to `main`; SPA rewrites are in `vercel.json`.
