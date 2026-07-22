import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ToastProvider } from './toast.jsx';
import './styles.css';

// Release any orientation lock so the app freely rotates between portrait
// and landscape on tablets. The manifest already allows "any" orientation;
// this is a belt-and-suspenders for browsers that applied a soft lock.
// (An already-installed home-screen app keeps its install-time orientation
// until it is removed and re-added — see the deploy notes.)
try {
  window.screen?.orientation?.unlock?.();
} catch {
  /* not supported / not permitted — safe to ignore */
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
