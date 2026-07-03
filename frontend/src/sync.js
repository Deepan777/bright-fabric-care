import { api } from './api.js';
import { getUnsyncedOrders, markSynced, setMeta } from './db.js';

// Simple pub/sub so the header banner can reflect sync state.
const listeners = new Set();
let state = { pending: 0, lastSync: null, syncing: false };

export function onSyncState(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function emit(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

// Local-only — recomputes how many bills are waiting to sync. No network
// call, so this is safe to run on every boot regardless of connectivity.
export async function refreshPendingCount() {
  const unsynced = await getUnsyncedOrders();
  emit({ pending: unsynced.length });
  return unsynced.length;
}

// Push all unsynced local orders to the cloud. Returns number synced.
// Only ever called explicitly (the header's end-of-day Sync button, or
// Admin's Sync Now) — the app never touches the network automatically
// during the day, so it stays fast and reliable on a bad connection.
export async function syncNow() {
  const unsynced = await getUnsyncedOrders();
  emit({ pending: unsynced.length });
  if (unsynced.length === 0) return 0;

  emit({ syncing: true });
  try {
    // Strip the local-only key before sending.
    const payload = unsynced.map(({ localId, synced, ...rest }) => ({
      ...rest,
      _localId: localId,
    }));
    const result = await api.syncOrders(payload);

    // Mark each successfully synced order.
    const okBills = new Set(
      (result.results || []).filter((r) => r.ok).map((r) => r.bill_number)
    );
    let count = 0;
    for (const o of unsynced) {
      if (okBills.has(o.bill_number)) {
        await markSynced(o.localId);
        count += 1;
      }
    }

    const now = new Date().toISOString();
    await setMeta('last_sync', now);
    const stillPending = (await getUnsyncedOrders()).length;
    emit({ pending: stillPending, lastSync: now, syncing: false });
    return count;
  } catch (err) {
    emit({ syncing: false });
    throw err;
  }
}

