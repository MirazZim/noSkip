import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsSection({
  id, title, description, children,
}: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 space-y-3">
      <div className="px-1">
        <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card", className)}>
      {children}
    </div>
  );
}

export function SettingsRow({
  icon, title, description, children, className,
}: { icon?: ReactNode; title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
        </div>
      </div>
      {children && <div className="shrink-0 sm:ml-auto">{children}</div>}
    </div>
  );
}
