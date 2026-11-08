import { createRoot } from 'react-dom/client';

import '@/i18n';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';
import { registerPushWorker } from '@/push/push-api';

// Optional capability; no permission request or subscription on page load.
void registerPushWorker().catch(() => {});

import {
  initializeTheme,
  ThemeProvider,
} from '@/theme-context';

initializeTheme();

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ThemeProvider>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </ThemeProvider>
);
