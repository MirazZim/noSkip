import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        {/* ← make main the scroll container with fixed height */}
        <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">

          <header
            className="sticky top-0 z-50 h-14 flex items-center border-b border-border/40 px-4 lg:px-6"
            style={{
              background: "hsl(var(--card) / 0.50)",
              backdropFilter: "blur(16px) saturate(160%)",
              WebkitBackdropFilter: "blur(16px) saturate(160%)",
            }}
          >
            <SidebarTrigger />
          </header>

          <div className="flex-1 p-4 lg:p-6">
            {children}
          </div>

        </main>
      </div>
    </SidebarProvider>
  );
}