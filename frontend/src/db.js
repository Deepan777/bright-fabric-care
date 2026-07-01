import Dexie from 'dexie';

// Built-in catalogue used as a last-resort fallback when the app has never
// reached the backend and has nothing cached yet. Lets the app run fully
// (preview on a laptop, or a brand-new offline tablet) with no database.
export const DEFAULT_ITEMS = [
  ['Shorts', 15, 15], ['Towel', 15, 15], ['Banian', 15, 15],
  ['Pillow Cover', 15, 15], ['Lungie', 20, 15], ['T-Shirt', 20, 15],
  ['Shirt', 25, 15], ['Pant', 25, 15], ['Track Pant', 25, 15],
  ['Jeans Pant', 25, 15], ['Turkey Towel', 20, 15], ['Bed Sheet', 60, 15],
  ['Small Blanket', 150, 100], ['Big Blanket', 250, 100], ['Inner', 30, 15],
  ['Socks (Pair)', 30, 15], ['Kerchief', 10, 10], ['Blazer', 200, 100],
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

// --- Local bill-number generation (never resets, per-source counter) ---
// SHOP-0001 for shop, BLOCK-0001 for block collection.
export async function nextBillNumber(source) {
  const prefix = source === 'block_collection' ? 'BLOCK' : 'SHOP';
  const metaKey = source === 'block_collection' ? 'counter_block' : 'counter_shop';

  return db.transaction('rw', db.meta, async () => {
    const row = await db.meta.get(metaKey);
    const next = (row?.value || 0) + 1;
    await db.meta.put({ key: metaKey, value: next });
    return `${prefix}-${String(next).padStart(4, '0')}`;
  });
}

// Cache the item catalogue so pricing works offline.
export async function cacheItems(items) {
  await db.items.clear();
  await db.items.bulkPut(items);
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
