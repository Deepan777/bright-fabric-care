import { api } from './api.js';
import {
  cacheItems,
  getCachedItems,
  DEFAULT_ITEMS,
  cacheSettings,
  getCachedSettings,
  cacheCloudOrders,
  getCachedCloudOrders,
  cacheDashboard,
  getCachedDashboard,
  isStale,
} from './db.js';
import { syncNow } from './sync.js';

// Every loader below returns cached data INSTANTLY — no network wait, ever.
// If that cache is more than a day old, a background fetch silently
// refreshes it and calls onUpdate(fresh) if the caller wants to react —
// the network is touched at most once a day per data type, and a slow or
// unstable connection never blocks the screen from showing up.

export async function loadItems(onUpdate) {
  const cached = await getCachedItems();
  const result = cached.length ? cached : DEFAULT_ITEMS;
  if (await isStale('items')) {
    api
      .getItems()
      .then(async (fresh) => {
        await cacheItems(fresh);
        onUpdate?.(fresh);
      })
      .catch(() => {
        /* offline — keep using cache/defaults, try again next time */
      });
  }
  return result;
}

export async function loadSettings(onUpdate) {
  const cached = await getCachedSettings();
  if (await isStale('settings')) {
    api
      .getSettings()
      .then(async (fresh) => {
        await cacheSettings(fresh);
        onUpdate?.(fresh);
      })
      .catch(() => {});
  }
  return cached;
}

export async function loadOrders(onUpdate) {
  const cached = await getCachedCloudOrders();
  if (await isStale('orders')) {
    api
      .getOrders()
      .then(async (fresh) => {
        await cacheCloudOrders(fresh);
        onUpdate?.(fresh);
      })
      .catch(() => {});
  }
  return cached;
}

export async function loadDashboard(onUpdate) {
  const cached = await getCachedDashboard();
  if (await isStale('dashboard')) {
    api
      .getDashboard()
      .then(async (fresh) => {
        await cacheDashboard(fresh);
        onUpdate?.(fresh);
      })
      .catch(() => {});
  }
  return cached;
}

// Explicit, awaited refresh for a manual "Refresh now" action. Unlike the
// silent background loaders above, this one throws on failure so the
// caller can show a toast telling the worker it's still offline.
export async function forceRefreshAll() {
  const [items, settings, orders, dashboard] = await Promise.all([
    api.getItems(),
    api.getSettings(),
    api.getOrders(),
    api.getDashboard(),
  ]);
  await Promise.all([
    cacheItems(items),
    cacheSettings(settings),
    cacheCloudOrders(orders),
    cacheDashboard(dashboard),
  ]);
  return { items, settings, orders, dashboard };
}

// The one action to run at the end of the day: push every locally created
// bill up to the cloud, then pull fresh items/prices/settings/orders/
// dashboard. This is the ONLY time the app is expected to need internet —
// the rest of the day it runs entirely from local storage.
export async function endOfDaySync() {
  const pushed = await syncNow();
  const fresh = await forceRefreshAll();
  return { pushed, ...fresh };
}
