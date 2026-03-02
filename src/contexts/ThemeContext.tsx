import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Theme = "light" | "dark" | "ocean" | "forest" | "sunset" | "midnight";

export const THEMES: { id: Theme; label: string; color: string; dark: boolean }[] = [
  { id: "dark", label: "Dark", color: "#1e2433", dark: true },
  { id: "light", label: "Light", color: "#f5f5f0", dark: false },
  { id: "ocean", label: "Ocean", color: "#07132a", dark: true },
  { id: "forest", label: "Forest", color: "#070f09", dark: true },
  { id: "sunset", label: "Sunset", color: "#120a05", dark: true },
  { id: "midnight", label: "Midnight", color: "#0e0814", dark: true },
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
    return (stored as Theme) || "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...ALL_THEMES);
    root.classList.add(theme);
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
