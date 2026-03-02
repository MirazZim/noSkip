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
  - Toggled auth screen with support for “primary focus” (Spending discipline, Habit consistency, Both).

---

## Tech Stack

- **Frontend**
  - React + TypeScript
  - Vite / React Router
  - Tailwind CSS
  - shadcn/ui component library
  - lucide‑react icons

- **State & Data**
  - React hooks
  - Custom `AuthContext` for authentication

- **Tooling**
  - ESLint / Prettier (recommended)
  - npm / pnpm / yarn

> Update this section to match your actual stack and tooling.

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
