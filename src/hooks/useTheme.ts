import { useEffect } from "react";
import { useSetting } from "./useData";

export type ThemeSetting = "system" | "light" | "dark" | "amber" | "rose";

export function useTheme() {
  const [theme] = useSetting<ThemeSetting>("theme", "system");
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const resolved = theme === "system" ? (dark ? "dark" : "light") : theme;
      root.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#1b1d24" : "#ffffff");
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}
