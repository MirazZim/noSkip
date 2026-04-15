# NoSkip

NoSkip is a personal productivity web application that combines two essential self‑improvement tools — a daily **expense tracker** and a **habit tracker** — into one clean, unified dashboard. The core philosophy is simple: *what gets tracked, gets improved*.

By logging spending and habits side by side, NoSkip helps you see how your financial discipline and daily behaviors influence each other over time.

> 🔗 **Live site:** https://no-skip-main.vercel.app/

---

## Features

- **Unified dashboard**
  - View daily expenses and habit streaks in a single, focused layout.
  - Reduce app‑hopping and keep your self‑improvement data in one place.
- **Daily expense tracking**
  - Add expenses with category, amount, and notes.
  - See recent spending at a glance to stay accountable.
- **Habit tracking**
  - Create custom habits and mark them as completed per day.
  - Visualize streaks and consistency over weeks.
- **Clarity‑first design**
  - Minimal, distraction‑free UI.
  - Dark, modern look with subtle highlights for key information.
- **Authentication**
  - Email/password sign up & sign in.
  - Toggled auth screen with support for "primary focus" (Spending discipline, Habit consistency, Both).

---

## Tech Stack

- **Frontend**
  - React + TypeScript
  - Vite / React Router
  - Tailwind CSS
  - shadcn/ui component library
  - lucide‑react icons
- **State & Data**
  - TanStack Query (React Query)
  - Custom `AuthContext` for authentication
  - Supabase (PostgreSQL + Auth + Storage)
- **Tooling**
  - ESLint / Prettier
  - Vitest + Testing Library
  - npm / pnpm / yarn

---

## Getting Started

### Prerequisites

- Node.js (LTS recommended, e.g. 18+)
- npm / yarn / pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/MirazZim/noSkip.git
cd noSkip

# Install dependencies
npm install
# or
yarn
# or
pnpm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Run Locally

```bash
npm run dev
```

---

## Architecture

### System Architecture

```mermaid
graph TB
    subgraph "Client Layer — Browser"
        UI[React UI Components]
        Router[React Router]
        State[TanStack Query Cache]
    end

    subgraph "Business Logic Layer"
        subgraph "Custom Hooks"
            useHabits[useHabits]
            useExpenses[useExpenses]
            useIncomes[useIncomes]
            useLoans[useLoans]
            useSavings[useSavings]
        end
        subgraph "Context Providers"
            AuthContext[AuthContext]
            AdminAuthContext[AdminAuthContext]
            ThemeContext[ThemeContext]
        end
    end

    subgraph "Data Layer"
        SupabaseClient[Supabase Client]
        QueryClient[React Query Client]
    end

    subgraph "Backend — Supabase"
        Auth[Supabase Auth]
        Database[(PostgreSQL + RLS)]
        Storage[Supabase Storage]
    end

    subgraph "DevOps"
        GitHub[GitHub]
        Vercel[Vercel CDN]
    end

    UI --> Router
    Router --> useHabits
    Router --> useExpenses
    useHabits --> QueryClient
    useExpenses --> QueryClient
    AuthContext --> SupabaseClient
    QueryClient --> SupabaseClient
    SupabaseClient --> Auth
    SupabaseClient --> Database
    GitHub -->|push| Vercel
    Vercel -.->|serves| UI

    style UI fill:#4f46e5,color:#fff
    style Database fill:#10b981,color:#fff
    style SupabaseClient fill:#3b82f6,color:#fff
    style useHabits fill:#8b5cf6,color:#fff
    style useExpenses fill:#8b5cf6,color:#fff
```

---

### Component Architecture

```mermaid
graph LR
    subgraph "Habits Feature"
        HabitsPage[Habits Page]
        HabitTabs[Tabs: Habits / Analytics]

        subgraph "Habits Tab"
            HabitList[Habit List]
            HabitListItem[Habit List Item — DnD Sortable]
            HabitDetail[Habit Detail Panel]
            AddHabitDialog[Add Habit Dialog]
            EditHabitDialog[Edit Habit Dialog]
            StreakGrid[Streak Grid]
        end

        subgraph "Analytics Tab"
            HabitAnalytics[Habit Analytics]
            DailyCompletions[Daily Completions Chart]
            CompletionRate[Completion Rate Chart]
            MonthlyTrends[Monthly Trends Chart]
            CSVExport[CSV Export]
        end
    end

    HabitsPage --> HabitTabs
    HabitTabs --> HabitList
    HabitTabs --> HabitAnalytics
    HabitList --> HabitListItem
    HabitList --> HabitDetail
    HabitList --> AddHabitDialog
    HabitDetail --> EditHabitDialog
    HabitDetail --> StreakGrid
    HabitAnalytics --> DailyCompletions
    HabitAnalytics --> CompletionRate
    HabitAnalytics --> MonthlyTrends
    HabitAnalytics --> CSVExport

    style HabitsPage fill:#4f46e5,color:#fff
    style HabitAnalytics fill:#8b5cf6,color:#fff
```

```mermaid
graph LR
    subgraph "Expenses Feature"
        ExpensesPage[Expenses Page]

        subgraph "Expense Management"
            ExpenseList[Expense List]
            AddExpenseDialog[Add Expense Dialog]
            EditExpenseDialog[Edit Expense Dialog]
            MonthPicker[Month Picker]
            CalendarView[Month Calendar View]
            DayDetailView[Day Detail View]
        end

        subgraph "Income & Loans"
            IncomeList[Income List]
            AddIncomeDialog[Add Income Dialog]
            LoanList[Loan List]
            LoanOverview[Loan Overview Widget]
        end

        subgraph "Analytics & Tracking"
            ExpenseCharts[Expense Charts]
            SummaryCards[Summary Cards]
            BudgetManager[Budget Manager]
            SavingsTracker[Savings Tracker]
        end
    end

    ExpensesPage --> ExpenseList
    ExpensesPage --> IncomeList
    ExpensesPage --> LoanList
    ExpensesPage --> ExpenseCharts
    ExpenseList --> AddExpenseDialog
    ExpenseList --> EditExpenseDialog
    ExpenseList --> MonthPicker
    ExpenseList --> CalendarView
    CalendarView --> DayDetailView

    style ExpensesPage fill:#10b981,color:#fff
    style ExpenseCharts fill:#3b82f6,color:#fff
```

---

### Data Flow

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant Hook
    participant ReactQuery
    participant Supabase
    participant Database

    User->>UI: Interact (e.g. Add Habit)
    UI->>Hook: Call mutation (useAddHabit)
    Hook->>ReactQuery: Execute mutation
    ReactQuery->>Supabase: API call (insert)
    Supabase->>Database: Insert record
    Database-->>Supabase: Success response
    Supabase-->>ReactQuery: Data returned
    ReactQuery->>ReactQuery: Invalidate cache
    ReactQuery->>Supabase: Refetch data
    Supabase->>Database: Query updated data
    Database-->>Supabase: Return data
    Supabase-->>ReactQuery: Updated data
    ReactQuery-->>Hook: Return updated data
    Hook-->>UI: Update component
    UI-->>User: Show updated UI
```

---

### Database Schema

```mermaid
erDiagram
    USERS ||--o{ HABITS : owns
    USERS ||--o{ EXPENSES : owns
    USERS ||--o{ INCOMES : owns
    USERS ||--o{ LOANS : owns
    USERS ||--o{ SAVINGS : owns
    HABITS ||--o{ HABIT_COMPLETIONS : has
    USERS ||--o{ CUSTOM_CATEGORIES : defines

    USERS {
        uuid id PK
        string email
        timestamp created_at
    }
    HABITS {
        uuid id PK
        uuid user_id FK
        string name
        string frequency
        int sort_order
    }
    HABIT_COMPLETIONS {
        uuid id PK
        uuid habit_id FK
        date completed_on
    }
    EXPENSES {
        uuid id PK
        uuid user_id FK
        string category
        numeric amount
        date expense_date
        text notes
    }
    INCOMES {
        uuid id PK
        uuid user_id FK
        numeric amount
        date income_date
    }
    LOANS {
        uuid id PK
        uuid user_id FK
        string label
        numeric amount
        date due_date
    }
    SAVINGS {
        uuid id PK
        uuid user_id FK
        string goal_name
        numeric target
        numeric current
    }
    CUSTOM_CATEGORIES {
        uuid id PK
        uuid user_id FK
        string name
    }
```

---

## Security

- Row Level Security (RLS) enabled on all Supabase tables — users can only access their own data.
- JWT tokens managed and auto-refreshed by the Supabase client.
- Admin role with elevated permissions and a separate audit log table.

---

## Deployment

Deployed automatically via Vercel on every push to `main`.

```mermaid
graph LR
    GitHub[GitHub Repository]
    Vercel[Vercel Platform]
    CDN[Vercel CDN]
    Users[End Users]
    Supabase[Supabase Backend]

    GitHub -->|push / PR| Vercel
    Vercel -->|build & deploy| CDN
    CDN -->|serve static assets| Users
    Users -->|API calls| Supabase
    Vercel -.->|env vars| Supabase

    style Vercel fill:#000,color:#fff
    style Supabase fill:#3ecf8e,color:#fff
```

---

## Roadmap

- [ ] Progressive Web App (PWA) — offline support & installability
- [ ] Real-time multi-device sync
- [ ] Push notifications for habit reminders
- [ ] AI-powered insights and predictions
- [ ] PDF report export
- [ ] Calendar and fitness app integrations

---

## License

MIT
