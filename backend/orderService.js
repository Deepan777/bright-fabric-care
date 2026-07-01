import { withTransaction } from './db.js';

// Insert one order plus its line items inside a transaction.
// `order` may carry a client-generated bill_number (SHOP-0001 / BLOCK-0001).
// If the bill_number already exists we treat it as an idempotent no-op and
// return the existing row so re-sync attempts don't create duplicates.
export async function createOrder(order) {
  return withTransaction(async (client) => {
    const {
      bill_number,
      customer_name = null,
      block = null,
      room_no = null,
      mobile = null,
      delivery_date = null,
      service_type = 'wash_iron',
      total_amount = 0,
      order_status = 'pending',
      payment_status = 'unpaid',
      source = 'shop',
      pickup_date = null,
      dropback_date = null,
      worker_note = null,
      created_at = null,
      items = [],
    } = order;

    if (!bill_number) throw new Error('bill_number is required');

    // Idempotency: skip if this bill_number is already stored.
    const existing = await client.query(
      'SELECT id FROM orders WHERE bill_number = $1',
      [bill_number]
    );
    if (existing.rows.length > 0) {
      return { id: existing.rows[0].id, bill_number, duplicate: true };
    }

    const inserted = await client.query(
      `INSERT INTO orders
        (bill_number, customer_name, block, room_no, mobile, delivery_date,
         service_type, total_amount, order_status, payment_status, source,
         pickup_date, dropback_date, worker_note, created_at, updated_at, synced)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
               COALESCE($15, NOW()), NOW(), TRUE)
       RETURNING id`,
      [
        bill_number,
        customer_name,
        block,
        room_no != null ? String(room_no) : null,
        mobile,
        delivery_date || null,
        service_type,
        total_amount,
        order_status,
        payment_status,
        source,
        pickup_date || null,
        dropback_date || null,
        worker_note,
        created_at || null,
      ]
    );

    const orderId = inserted.rows[0].id;

    for (const it of items) {
      await client.query(
        `INSERT INTO order_items (order_id, item_name, rate, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          orderId,
          it.item_name,
          it.rate ?? 0,
          it.quantity ?? 0,
          it.line_total ?? (it.rate ?? 0) * (it.quantity ?? 0),
        ]
      );
    }

    return { id: orderId, bill_number, duplicate: false };
  });
}
