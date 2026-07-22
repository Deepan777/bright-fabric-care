// Session is kept only for the current app run (sessionStorage), NOT saved
// forever. This way every time the app is freshly opened, the user is shown
// the role picker and chooses Shop Counter / Block Collection / Admin again
// — instead of the app silently re-opening into whatever role was used last.
// An accidental page refresh or a background auto-update during active use
// stays in the same session context, so a worker isn't logged out mid-bill.
const KEY = 'bfc_session';

// One-time migration: earlier builds saved the session in localStorage,
// which is what made the app auto-resume the last role every time. Clear it
// so the role picker reliably shows on every open from now on.
try {
  localStorage.removeItem(KEY);
} catch {
  /* ignore */
}

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function setSession(session) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
