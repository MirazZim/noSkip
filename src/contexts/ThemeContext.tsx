import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Theme =
  | "light" | "dark" | "ocean" | "forest" | "sunset" | "midnight"
  | "graphite" | "volt" | "cobalt" | "violet" | "ember" | "rose" | "snow" | "linen";

// `color` is the background and `accent` the primary, both for previews only;
// the real palettes live in index.css under a class named after the id.
export const THEMES: { id: Theme; label: string; color: string; accent: string; dark: boolean; group: "Classic" | "Modern" }[] = [
  { id: "dark", label: "Dark", color: "#1e2433", accent: "#1fd19a", dark: true, group: "Classic" },
  { id: "light", label: "Light", color: "#f5f5f0", accent: "#10b981", dark: false, group: "Classic" },
  { id: "ocean", label: "Ocean", color: "#07132a", accent: "#0dccf2", dark: true, group: "Classic" },
  { id: "forest", label: "Forest", color: "#070f09", accent: "#22c35d", dark: true, group: "Classic" },
  { id: "sunset", label: "Sunset", color: "#120a05", accent: "#fa832e", dark: true, group: "Classic" },
  { id: "midnight", label: "Midnight", color: "#0e0814", accent: "#a65eed", dark: true, group: "Classic" },
  { id: "graphite", label: "Graphite", color: "#0a0a0a", accent: "#fafafa", dark: true, group: "Modern" },
  { id: "volt", label: "Volt", color: "#0a0a0a", accent: "#c6f432", dark: true, group: "Modern" },
  { id: "cobalt", label: "Cobalt", color: "#000000", accent: "#3b82f6", dark: true, group: "Modern" },
  { id: "violet", label: "Violet", color: "#09090b", accent: "#8b5cf6", dark: true, group: "Modern" },
  { id: "ember", label: "Ember", color: "#0c0a09", accent: "#f97316", dark: true, group: "Modern" },
  { id: "rose", label: "Rose", color: "#0a0a0a", accent: "#f43f5e", dark: true, group: "Modern" },
  { id: "snow", label: "Snow", color: "#fafafa", accent: "#0070f3", dark: false, group: "Modern" },
  { id: "linen", label: "Linen", color: "#fafaf9", accent: "#c2410c", dark: false, group: "Modern" },
];

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const ALL_THEMES = THEMES.map((t) => t.id);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem("noskip-theme");
    return ALL_THEMES.includes(stored as Theme) ? (stored as Theme) : "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...ALL_THEMES);
    root.classList.add(theme);
    // Tailwind's `dark:` variants key off the .dark class, so every dark theme
    // carries it too. Theme blocks come after .dark in index.css, so their
    // variables still win.
    root.classList.toggle("dark", THEMES.find((t) => t.id === theme)?.dark ?? true);
    localStorage.setItem("noskip-theme", theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
