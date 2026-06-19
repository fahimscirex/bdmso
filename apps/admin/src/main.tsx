import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import './index.css';
import { App } from './App';
import { RouterProvider } from './router';
import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="bdmso-theme" disableTransitionOnChange>
      <TooltipProvider delayDuration={150}>
        <AuthProvider>
          <RouterProvider>
            <App />
            <Toaster richColors position="top-right" />
          </RouterProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
);
