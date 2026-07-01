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

// Push all unsynced local orders to the cloud. Returns number synced.
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

let intervalId = null;

// Retry sync every 30 seconds automatically.
export function startAutoSync() {
  if (intervalId) return;
  const tick = () => {
    syncNow().catch(() => {
      /* offline — banner already reflects pending count */
    });
  };
  tick();
  intervalId = setInterval(tick, 30000);
  window.addEventListener('online', tick);
}

export function stopAutoSync() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}
