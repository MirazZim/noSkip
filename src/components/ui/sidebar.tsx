import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { VariantProps, cva } from "class-variance-authority";
import { Zap } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const SIDEBAR_COOKIE_NAME = "sidebar:state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";
const SIDEBAR_TRIGGER_SEEN_KEY = "sidebar-trigger-seen";

type SidebarContext = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContext | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }
>(({ defaultOpen = true, open: openProp, onOpenChange: setOpenProp, className, style, children, ...props }, ref) => {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open],
  );

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
  }, [isMobile, setOpen, setOpenMobile]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContext>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn("group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar", className)}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
});
SidebarProvider.displayName = "SidebarProvider";

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    side?: "left" | "right";
    variant?: "sidebar" | "floating" | "inset";
    collapsible?: "offcanvas" | "icon" | "none";
  }
>(({ side = "left", variant = "sidebar", collapsible = "offcanvas", className, children, ...props }, ref) => {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        className={cn("flex h-full w-[--sidebar-width] flex-col bg-sidebar text-sidebar-foreground", className)}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-mobile="true"
          className="w-[--sidebar-width] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}
          side={side}
        >
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      ref={ref}
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
    >
      <div
        className={cn(
          "relative h-svh w-[--sidebar-width] bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]"
            : "group-data-[collapsible=icon]:w-[--sidebar-width-icon]",
        )}
      />
      <div
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-[--sidebar-width] transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]"
            : "group-data-[collapsible=icon]:w-[--sidebar-width-icon] group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className,
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow"
        >
          {children}
        </div>
      </div>
    </div>
  );
});
Sidebar.displayName = "Sidebar";

// ─── Sidebar Trigger ────────────────────────────────────────────────────────
const SidebarTrigger = React.forwardRef<React.ElementRef<typeof Button>, React.ComponentProps<typeof Button>>(
  ({ className, onClick, ...props }, ref) => {
    const { toggleSidebar } = useSidebar();

    const [showHint, setShowHint] = React.useState(false);

    React.useEffect(() => {
      try {
        const seen = localStorage.getItem(SIDEBAR_TRIGGER_SEEN_KEY);
        if (!seen) setShowHint(true);
      } catch {}
    }, []);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      toggleSidebar();
      if (showHint) {
        try { localStorage.setItem(SIDEBAR_TRIGGER_SEEN_KEY, "1"); } catch {}
        setShowHint(false);
      }
    };

    return (
      <>
        <style>{`
          /* ── DARK MODE — nuclear outward bloom ── */
          @keyframes darkPulse {
            0%, 100% {
              box-shadow:
                0 0 6px   3px  rgba(var(--primary-rgb), 1),
                0 0 18px  6px  rgba(var(--primary-rgb), 1),
                0 0 40px  12px rgba(var(--primary-rgb), 0.9),
                0 0 80px  24px rgba(var(--primary-rgb), 0.65),
                0 0 140px 40px rgba(var(--primary-rgb), 0.35),
                0 0 200px 60px rgba(var(--primary-rgb), 0.15),
                inset 0 0 16px 4px rgba(var(--primary-rgb), 0.6);
            }
            50% {
              box-shadow:
                0 0 10px  4px  rgba(var(--primary-rgb), 1),
                0 0 28px  10px rgba(var(--primary-rgb), 1),
                0 0 60px  18px rgba(var(--primary-rgb), 1),
                0 0 110px 35px rgba(var(--primary-rgb), 0.85),
                0 0 180px 55px rgba(var(--primary-rgb), 0.55),
                0 0 260px 80px rgba(var(--primary-rgb), 0.25),
                inset 0 0 28px 8px rgba(var(--primary-rgb), 0.9);
            }
          }

          /*
           * ── LIGHT MODE — colored shadow casting downward + tight ring + strong inset ──
           * Key: we TRIPLE the shadow spread values vs before so they're impossible to miss
           * even against white. The downward cast shadows are the hero here.
           */
          @keyframes lightPulse {
            0%, 100% {
              box-shadow:
                /* crisp outer ring — always visible */
                0 0 0    3px  rgba(var(--primary-rgb), 1),
                /* tight colored halo */
                0 0 12px 6px  rgba(var(--primary-rgb), 0.95),
                0 0 28px 10px rgba(var(--primary-rgb), 0.75),
                /* downward cast colored shadow — the magic for light mode */
                0 8px  28px 6px  rgba(var(--primary-rgb), 0.7),
                0 16px 50px 12px rgba(var(--primary-rgb), 0.5),
                0 24px 80px 20px rgba(var(--primary-rgb), 0.3),
                /* inset — button interior glows */
                inset 0 0 16px 4px rgba(var(--primary-rgb), 0.5);
            }
            50% {
              box-shadow:
                0 0 0    3px  rgba(var(--primary-rgb), 1),
                0 0 18px 8px  rgba(var(--primary-rgb), 1),
                0 0 40px 14px rgba(var(--primary-rgb), 0.9),
                0 10px 40px 10px rgba(var(--primary-rgb), 0.9),
                0 20px 70px 18px rgba(var(--primary-rgb), 0.65),
                0 32px 110px 28px rgba(var(--primary-rgb), 0.4),
                inset 0 0 28px 8px rgba(var(--primary-rgb), 0.75);
            }
          }

          @keyframes iconNuclear {
            0%, 100% {
              filter:
                drop-shadow(0 0 3px  hsl(var(--primary)))
                drop-shadow(0 0 10px hsl(var(--primary)))
                drop-shadow(0 0 22px hsl(var(--primary)))
                drop-shadow(0 0 40px hsl(var(--primary) / 0.95));
              transform: scale(1);
            }
            50% {
              filter:
                drop-shadow(0 0 5px  hsl(var(--primary)))
                drop-shadow(0 0 15px hsl(var(--primary)))
                drop-shadow(0 0 35px hsl(var(--primary)))
                drop-shadow(0 0 60px hsl(var(--primary)))
                drop-shadow(0 0 90px hsl(var(--primary) / 0.85));
              transform: scale(1.2);
            }
          }
          @keyframes innerCorePulse {
            0%, 100% { opacity: 0.8; transform: scale(1); }
            50%       { opacity: 1;   transform: scale(1.3); }
          }
          @keyframes halo1Dark {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50%       { opacity: 1;   transform: scale(1.25); }
          }
          @keyframes halo2Dark {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50%       { opacity: 0.7; transform: scale(1.5); }
          }
          @keyframes halo3Dark {
            0%, 100% { opacity: 0.12; transform: scale(1); }
            50%       { opacity: 0.35; transform: scale(1.8); }
          }
          /* Light mode halos — stronger opacity, tighter radii so color is denser */
          @keyframes halo1Light {
            0%, 100% { opacity: 0.8; transform: scale(1); }
            50%       { opacity: 1;   transform: scale(1.2); }
          }
          @keyframes halo2Light {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50%       { opacity: 0.85; transform: scale(1.35); }
          }
          @keyframes sidebarHintFadeIn {
            from { opacity: 0; transform: translateX(-8px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes sidebarDotPing {
            0%, 100% { transform: scale(1); opacity: 0.6; }
            50%       { transform: scale(2.2); opacity: 0; }
          }

          .sidebar-trigger-btn {
            border: 2px solid rgba(var(--primary-rgb), 1) !important;
            border-radius: 0.75rem !important;
            transition: background 0.2s ease !important;
            position: relative !important;
          }

          /* DARK */
          .dark .sidebar-trigger-btn {
            background: rgba(var(--primary-rgb), 0.3) !important;
            animation: darkPulse 1.6s ease-in-out infinite !important;
          }
          .dark .sidebar-trigger-btn:hover {
            background: rgba(var(--primary-rgb), 0.45) !important;
          }
          .dark .stb-halo1 { animation: halo1Dark 1.6s ease-in-out infinite; }
          .dark .stb-halo2 { animation: halo2Dark 1.6s ease-in-out infinite; }
          .dark .stb-halo3 { animation: halo3Dark 1.6s ease-in-out infinite; }

          /* LIGHT */
          :not(.dark) .sidebar-trigger-btn {
            background: rgba(var(--primary-rgb), 0.14) !important;
            animation: lightPulse 1.6s ease-in-out infinite !important;
          }
          :not(.dark) .sidebar-trigger-btn:hover {
            background: rgba(var(--primary-rgb), 0.24) !important;
          }
          :not(.dark) .stb-halo1 {
            background: radial-gradient(circle at 50% 60%,
              rgba(var(--primary-rgb), 0.28) 0%,
              rgba(var(--primary-rgb), 0.1)  50%,
              transparent 70%) !important;
            animation: halo1Light 1.6s ease-in-out infinite !important;
          }
          :not(.dark) .stb-halo2 {
            background: radial-gradient(circle at 50% 65%,
              rgba(var(--primary-rgb), 0.18) 0%,
              rgba(var(--primary-rgb), 0.05) 50%,
              transparent 70%) !important;
            animation: halo2Light 1.6s ease-in-out infinite !important;
          }
          :not(.dark) .stb-halo3 { display: none; }

          /* Shared halo base styles */
          .stb-core {
            position: absolute;
            inset: -4px;
            border-radius: 1rem;
            pointer-events: none;
            animation: innerCorePulse 1.6s ease-in-out infinite;
            background: radial-gradient(circle at 50% 50%,
              rgba(var(--primary-rgb), 0.7)  0%,
              rgba(var(--primary-rgb), 0.3)  40%,
              transparent 70%);
          }
          .stb-halo1 {
            position: absolute;
            inset: -16px;
            border-radius: 1.5rem;
            pointer-events: none;
            background: radial-gradient(circle at 50% 50%,
              rgba(var(--primary-rgb), 0.5)  0%,
              rgba(var(--primary-rgb), 0.15) 50%,
              transparent 70%);
          }
          .stb-halo2 {
            position: absolute;
            inset: -36px;
            border-radius: 2.5rem;
            pointer-events: none;
            background: radial-gradient(circle at 50% 50%,
              rgba(var(--primary-rgb), 0.35) 0%,
              rgba(var(--primary-rgb), 0.08) 50%,
              transparent 70%);
          }
          .stb-halo3 {
            position: absolute;
            inset: -60px;
            border-radius: 4rem;
            pointer-events: none;
            background: radial-gradient(circle at 50% 50%,
              rgba(var(--primary-rgb), 0.25) 0%,
              rgba(var(--primary-rgb), 0.06) 50%,
              transparent 70%);
          }
          .sidebar-trigger-icon {
            animation: iconNuclear 1.6s ease-in-out infinite;
            color: hsl(var(--primary));
            position: relative;
            z-index: 10;
          }
        `}</style>

        <div className="relative inline-flex items-center">
          <div className="relative inline-flex items-center justify-center" style={{ padding: 20, margin: -20 }}>
            <span aria-hidden className="stb-halo3" />
            <span aria-hidden className="stb-halo2" />
            <span aria-hidden className="stb-halo1" />

            <Button
              ref={ref}
              data-sidebar="trigger"
              variant="ghost"
              size="icon"
              className={cn("relative h-9 w-9 sidebar-trigger-btn overflow-visible", className)}
              onClick={handleClick}
              {...props}
            >
              <span aria-hidden className="stb-core" />
              <Zap className="sidebar-trigger-icon h-[18px] w-[18px]" />
              <span className="sr-only">Toggle Sidebar</span>
            </Button>
          </div>

          {/* New-user hint pill */}
          {showHint && (
            <div
              className="absolute left-full ml-6 z-50 flex items-center gap-1.5 pointer-events-none"
              style={{ animation: "sidebarHintFadeIn 0.4s ease 0.6s both" }}
            >
              <div className="w-0 h-0 border-y-[5px] border-y-transparent border-r-[6px]"
                style={{ borderRightColor: "rgba(var(--primary-rgb), 0.2)" }} />
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border"
                style={{
                  background: "rgba(var(--primary-rgb), 0.08)",
                  borderColor: "rgba(var(--primary-rgb), 0.3)",
                  boxShadow: "0 0 24px rgba(var(--primary-rgb), 0.35)",
                }}
              >
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span
                    className="absolute inline-flex h-full w-full rounded-full bg-primary"
                    style={{ animation: "sidebarDotPing 1.5s ease infinite" }}
                  />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                <span
                  className="text-[11px] font-medium tracking-wide"
                  style={{ color: "hsl(var(--primary))" }}
                >
                  Tap to open menu
                </span>
              </div>
            </div>
          )}
        </div>
      </>
    );
  },
);
SidebarTrigger.displayName = "SidebarTrigger";
// ────────────────────────────────────────────────────────────────────────────

const SidebarRail = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
  ({ className, ...props }, ref) => {
    const { toggleSidebar } = useSidebar();

    return (
      <button
        ref={ref}
        data-sidebar="rail"
        aria-label="Toggle Sidebar"
        tabIndex={-1}
        onClick={toggleSidebar}
        title="Toggle Sidebar"
        className={cn(
          "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] group-data-[side=left]:-right-4 group-data-[side=right]:left-0 hover:after:bg-sidebar-border sm:flex",
          "[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize",
          "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
          "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar",
          "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
          "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarRail.displayName = "SidebarRail";

const SidebarInset = React.forwardRef<HTMLDivElement, React.ComponentProps<"main">>(({ className, ...props }, ref) => {
  return (
    <main
      ref={ref}
      className={cn(
        "relative flex min-h-svh flex-1 flex-col bg-background",
        "peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow",
        className,
      )}
      {...props}
    />
  );
});
SidebarInset.displayName = "SidebarInset";

const SidebarInput = React.forwardRef<React.ElementRef<typeof Input>, React.ComponentProps<typeof Input>>(
  ({ className, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        data-sidebar="input"
        className={cn(
          "h-8 w-full bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarInput.displayName = "SidebarInput";

const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(({ className, ...props }, ref) => {
  return <div ref={ref} data-sidebar="header" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
});
SidebarHeader.displayName = "SidebarHeader";

const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(({ className, ...props }, ref) => {
  return <div ref={ref} data-sidebar="footer" className={cn("flex flex-col gap-2 p-2", className)} {...props} />;
});
SidebarFooter.displayName = "SidebarFooter";

const SidebarSeparator = React.forwardRef<React.ElementRef<typeof Separator>, React.ComponentProps<typeof Separator>>(
  ({ className, ...props }, ref) => {
    return (
      <Separator
        ref={ref}
        data-sidebar="separator"
        className={cn("mx-2 w-auto bg-sidebar-border", className)}
        {...props}
      />
    );
  },
);
SidebarSeparator.displayName = "SidebarSeparator";

const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className,
      )}
      {...props}
    />
  );
});
SidebarContent.displayName = "SidebarContent";

const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
});
SidebarGroup.displayName = "SidebarGroup";

const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentProps<"div"> & { asChild?: boolean }>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";

    return (
      <Comp
        ref={ref}
        data-sidebar="group-label"
        className={cn(
          "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opa] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarGroupLabel.displayName = "SidebarGroupLabel";

const SidebarGroupAction = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button"> & { asChild?: boolean }>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        data-sidebar="group-action"
        className={cn(
          "absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          "after:absolute after:-inset-2 after:md:hidden",
          "group-data-[collapsible=icon]:hidden",
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarGroupAction.displayName = "SidebarGroupAction";

const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="group-content" className={cn("w-full text-sm", className)} {...props} />
  ),
);
SidebarGroupContent.displayName = "SidebarGroupContent";

const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(({ className, ...props }, ref) => (
  <ul ref={ref} data-sidebar="menu" className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />
));
SidebarMenu.displayName = "SidebarMenu";

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(({ className, ...props }, ref) => (
  <li ref={ref} data-sidebar="menu-item" className={cn("group/menu-item relative", className)} {...props} />
));
SidebarMenuItem.displayName = "SidebarMenuItem";

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:!p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string | React.ComponentProps<typeof TooltipContent>;
  } & VariantProps<typeof sidebarMenuButtonVariants>
>(({ asChild = false, isActive = false, variant = "default", size = "default", tooltip, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  const { isMobile, state } = useSidebar();

  const button = (
    <Comp
      ref={ref}
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  );

  if (!tooltip) {
    return button;
  }

  if (typeof tooltip === "string") {
    tooltip = { children: tooltip };
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" align="center" hidden={state !== "collapsed" || isMobile} {...tooltip} />
    </Tooltip>
  );
});
SidebarMenuButton.displayName = "SidebarMenuButton";

const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean;
    showOnHover?: boolean;
  }
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-action"
      className={cn(
        "absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform peer-hover/menu-button:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 after:md:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0",
        className,
      )}
      {...props}
    />
  );
});
SidebarMenuAction.displayName = "SidebarMenuAction";

const SidebarMenuBadge = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 select-none items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground",
        "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  ),
);
SidebarMenuBadge.displayName = "SidebarMenuBadge";

const SidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    showIcon?: boolean;
  }
>(({ className, showIcon = false, ...props }, ref) => {
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);

  return (
    <div
      ref={ref}
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />}
      <Skeleton
        className="h-4 max-w-[--skeleton-width] flex-1"
        data-sidebar="menu-skeleton-text"
        style={{ "--skeleton-width": width } as React.CSSProperties}
      />
    </div>
  );
});
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton";

const SidebarMenuSub = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  ),
);
SidebarMenuSub.displayName = "SidebarMenuSub";

const SidebarMenuSubItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(({ ...props }, ref) => (
  <li ref={ref} {...props} />
));
SidebarMenuSubItem.displayName = "SidebarMenuSubItem";

const SidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<"a"> & {
    asChild?: boolean;
    size?: "sm" | "md";
    isActive?: boolean;
  }
>(({ asChild = false, size = "md", isActive, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
});
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};