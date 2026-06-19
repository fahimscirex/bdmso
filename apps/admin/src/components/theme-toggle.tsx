import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

// Single click flips light <-> dark. The pre-paint script in index.html and
// next-themes share the 'bdmso-theme' storage key, so there's no flash.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      <Sun className="size-4 scale-100 rotate-0 transition-all duration-200 dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute size-4 scale-0 rotate-90 transition-all duration-200 dark:scale-100 dark:rotate-0" />
    </Button>
  );
}
