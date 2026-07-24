import Dexie from 'dexie';

// Built-in catalogue used as a last-resort fallback when the app has never
// reached the backend and has nothing cached yet. Lets the app run fully
// (preview on a laptop, or a brand-new offline tablet) with no database.
// Iron Only price is 10 for every item except Bed Sheet (20).
export const DEFAULT_ITEMS = [
  ['Shorts', 15, 10], ['Towel', 15, 10], ['Banian', 15, 10],
  ['Pillow Cover', 15, 10], ['Lungie', 20, 10], ['T-Shirt', 20, 10],
  ['Shirt', 25, 10], ['Pant', 25, 10], ['Track Pant', 25, 10],
  ['Jeans Pant', 25, 10], ['Turkey Towel', 20, 10], ['Bed Sheet', 60, 20],
  ['Small Blanket', 150, 10], ['Big Blanket', 250, 10], ['Inner', 30, 10],
  ['Socks (Pair)', 30, 10], ['Kerchief', 10, 10], ['Blazer', 200, 10],
  ['Others', 0, 0],
].map(([name, wash_iron_price, iron_only_price], i) => ({
  id: i + 1,
  name,
  wash_iron_price,
  iron_only_price,
  is_active: true,
}));

// Local offline buffer. Every order is written here first, instantly,
// then synced to the cloud in the background.
export const db = new Dexie('brightFabricCare');

db.version(1).stores({
  // localId is the Dexie primary key; bill_number is the human/business id.
  orders: '++localId, bill_number, source, order_status, payment_status, synced, created_at',
  items: 'id, name',        // cached item catalogue for offline pricing
  meta: 'key',              // counters + misc local settings
});

// --- Local bill-number generation ---
// Format: BFC<YY>-<NNNN>, e.g. BFC26-0001. The year auto-updates each
// January and the sequence resets to 0001 for the new year.
// Shop and Block Collection print on two independent offline tablets, so
// each source gets its own numeric range within the year (Shop starts at
// 0001, Block starts at 5001) — this guarantees no two tablets can ever
// generate the same bill number while offline, while still looking like
// one clean series to the customer.
const SOURCE_OFFSET = { shop: 0, block_collection: 5000 };

export async function nextBillNumber(source) {
  const yy = String(new Date().getFullYear()).slice(-2);
  const key = source === 'block_collection' ? 'block' : 'shop';
  const metaKey = `counter_${key}_${yy}`;
  const offset = SOURCE_OFFSET[source] ?? 0;

  return db.transaction('rw', db.meta, async () => {
    const row = await db.meta.get(metaKey);
    const next = (row?.value || 0) + 1;
    await db.meta.put({ key: metaKey, value: next });
    const seq = offset + next;
    return `BFC${yy}-${String(seq).padStart(4, '0')}`;
  });
}

// Cache the item catalogue so pricing works offline.
export async function cacheItems(items) {
  await db.items.clear();
  await db.items.bulkPut(items);
  await setLastFetched('items');
}

export async function getCachedItems() {
  return db.items.orderBy('id').toArray();
}

// Save an order locally (synced=false until the cloud confirms).
export async function saveLocalOrder(order) {
  const localId = await db.orders.add({ ...order, synced: false });
  return localId;
}

export async function getUnsyncedOrders() {
  return db.orders.filter((o) => o.synced === false).toArray();
}

export async function markSynced(localId) {
  await db.orders.update(localId, { synced: true });
}

export async function getLocalOrders() {
  return db.orders.orderBy('created_at').reverse().toArray();
}

export async function clearLocalData() {
  await db.orders.clear();
  await db.meta.clear();
}

export async function setMeta(key, value) {
  await db.meta.put({ key, value });
}

export async function getMeta(key) {
  const row = await db.meta.get(key);
  return row?.value;
}

// --- Daily data cache ---
// The app should only touch the network once a day per data type (items,
// settings, orders list, dashboard) — everything else reads from here
// instantly. See dataSync.js for the loaders that use this.
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getLastFetched(name) {
  return getMeta(`lastFetched_${name}`);
}

export async function setLastFetched(name) {
  await setMeta(`lastFetched_${name}`, new Date().toISOString());
}

export async function isStale(name, maxAgeMs = DAY_MS) {
  const ts = await getLastFetched(name);
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > maxAgeMs;
}

const DEFAULT_SETTINGS = { pin_shop: '1111', pin_block: '2222', pin_admin: '9999' };

export async function cacheSettings(settings) {
  await setMeta('cache_settings', settings);
  await setLastFetched('settings');
}

export async function getCachedSettings() {
  return (await getMeta('cache_settings')) || DEFAULT_SETTINGS;
}

export async function cacheCloudOrders(orders) {
  await setMeta('cache_cloud_orders', orders);
  await setLastFetched('orders');
}

export async function getCachedCloudOrders() {
  return (await getMeta('cache_cloud_orders')) || [];
}

// Update one cached order in place right after a write succeeds (status
// change, payment, etc.) so the list reflects it instantly without waiting
// for the next daily pull.
export async function patchCachedOrder(id, patch) {
  const cached = await getCachedCloudOrders();
  const updated = cached.map((o) => (o.id === id ? { ...o, ...patch } : o));
  await setMeta('cache_cloud_orders', updated);
  return updated;
}

export async function removeCachedOrder(id) {
  const cached = await getCachedCloudOrders();
  const updated = cached.filter((o) => o.id !== id);
  await setMeta('cache_cloud_orders', updated);
  return updated;
}

// Bulk version — one read-modify-write instead of N, for Admin's
// delete-all-shown-bills action.
export async function removeCachedOrders(ids) {
  const idSet = new Set(ids);
  const cached = await getCachedCloudOrders();
  const updated = cached.filter((o) => !idSet.has(o.id));
  await setMeta('cache_cloud_orders', updated);
  return updated;
}

export async function cacheDashboard(data) {
  await setMeta('cache_dashboard', data);
  await setLastFetched('dashboard');
}

export async function getCachedDashboard() {
  return getMeta('cache_dashboard');
}
