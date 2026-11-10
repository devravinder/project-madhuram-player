import { useTheme } from "@/hooks/useTheme";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "./Elements.js";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <IconButton onClick={() => setTheme(theme == "light" ? "dark" : "light")}>
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"></Sun>
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"></Moon>
      <span className="sr-only">Toggle Theme</span>
    </IconButton>
  );
}
