import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsSection({
  id, title, description, children,
}: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-2">
      <div className="px-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      </div>
      {children}
      {description && <p className="px-4 text-xs text-muted-foreground/80">{description}</p>}
    </section>
  );
}

export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "divide-y divide-border/50 overflow-hidden rounded-[22px] border border-border/60 bg-card/70 backdrop-blur-xl",
        "shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SettingsRow({
  icon, title, description, children, className,
}: { icon?: ReactNode; title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.02] sm:flex-row sm:items-center sm:gap-6 sm:px-5", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-foreground/[0.06] text-foreground/70">
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
