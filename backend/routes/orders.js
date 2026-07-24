import { Router } from 'express';
import { query } from '../db.js';
import { createOrder } from '../orderService.js';

const router = Router();

// Attach line items to a list of order rows.
async function attachItems(orders) {
  if (orders.length === 0) return orders;
  const ids = orders.map((o) => o.id);
  const { rows: items } = await query(
    `SELECT id, order_id, item_name, rate, quantity, line_total
     FROM order_items WHERE order_id = ANY($1::int[])`,
    [ids]
  );
  const byOrder = {};
  for (const it of items) {
    (byOrder[it.order_id] ||= []).push(it);
  }
  return orders.map((o) => ({ ...o, items: byOrder[o.id] || [] }));
}

// POST /api/orders — create an order with its items.
router.post('/', async (req, res) => {
  try {
    const result = await createOrder(req.body || {});
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    console.error('create order error', err);
    res.status(500).json({ error: err.message || 'server error' });
  }
});

// GET /api/orders — filterable list, newest first.
// Query params: source, status, payment, date (YYYY-MM-DD), month (YYYY-MM),
// year (YYYY), search
router.get('/', async (req, res) => {
  try {
    const { source, status, payment, date, month, year, search } = req.query;
    const clauses = [];
    const params = [];

    if (source) {
      params.push(source);
      clauses.push(`source = $${params.length}`);
    }
    if (status) {
      params.push(status);
      clauses.push(`order_status = $${params.length}`);
    }
    if (payment) {
      params.push(payment);
      clauses.push(`payment_status = $${params.length}`);
    }
    if (date) {
      params.push(date);
      clauses.push(`created_at::date = $${params.length}`);
    }
    if (month) {
      params.push(month);
      clauses.push(`to_char(created_at, 'YYYY-MM') = $${params.length}`);
    }
    if (year) {
      params.push(year);
      clauses.push(`extract(year from created_at) = $${params.length}::int`);
    }
    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      clauses.push(
        `(customer_name ILIKE ${p} OR block ILIKE ${p} OR mobile ILIKE ${p} OR bill_number ILIKE ${p})`
      );
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT 1000`,
      params
    );
    res.json(await attachItems(rows));
  } catch (err) {
    console.error('list orders error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/orders/:id — single order with full item list.
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM orders WHERE id = $1', [
      req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    const [withItems] = await attachItems(rows);
    res.json(withItems);
  } catch (err) {
    console.error('get order error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PATCH /api/orders/:id/status  { order_status }
router.patch('/:id/status', async (req, res) => {
  try {
    const { order_status } = req.body || {};
    const valid = ['pending', 'ready', 'delivered'];
    if (!valid.includes(order_status)) {
      return res.status(400).json({ error: 'invalid order_status' });
    }
    const { rows } = await query(
      `UPDATE orders SET order_status = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, order_status]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('status update error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PATCH /api/orders/:id/payment  { payment_status, payment_method }
// payment_method (cash | upi) is only kept when marking as paid.
router.patch('/:id/payment', async (req, res) => {
  try {
    const { payment_status, payment_method } = req.body || {};
    const valid = ['paid', 'unpaid'];
    if (!valid.includes(payment_status)) {
      return res.status(400).json({ error: 'invalid payment_status' });
    }
    const validMethod = ['cash', 'upi'];
    const method =
      payment_status === 'paid' && validMethod.includes(payment_method)
        ? payment_method
        : null;
    const { rows } = await query(
      `UPDATE orders SET payment_status = $2, payment_method = $3, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, payment_status, method]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('payment update error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/orders — bulk delete (admin-only feature, gated by the PIN
// wall in the app's Admin screen). Uses the same filters as GET so it
// deletes exactly what the admin is looking at (a day/month/year, a
// source, or both). Refuses to run with zero filters unless all=true is
// passed explicitly, so a request that forgot its filters can't wipe the
// whole table by accident.
router.delete('/', async (req, res) => {
  try {
    const { source, status, payment, date, month, year, search, all } = req.query;
    const clauses = [];
    const params = [];

    if (source) {
      params.push(source);
      clauses.push(`source = $${params.length}`);
    }
    if (status) {
      params.push(status);
      clauses.push(`order_status = $${params.length}`);
    }
    if (payment) {
      params.push(payment);
      clauses.push(`payment_status = $${params.length}`);
    }
    if (date) {
      params.push(date);
      clauses.push(`created_at::date = $${params.length}`);
    }
    if (month) {
      params.push(month);
      clauses.push(`to_char(created_at, 'YYYY-MM') = $${params.length}`);
    }
    if (year) {
      params.push(year);
      clauses.push(`extract(year from created_at) = $${params.length}::int`);
    }
    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      clauses.push(
        `(customer_name ILIKE ${p} OR block ILIKE ${p} OR mobile ILIKE ${p} OR bill_number ILIKE ${p})`
      );
    }

    if (clauses.length === 0 && all !== 'true') {
      return res.status(400).json({
        error: 'Refusing to delete with no filters — pass all=true to delete every bill',
      });
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rowCount } = await query(`DELETE FROM orders ${where}`, params);
    res.json({ ok: true, count: rowCount });
  } catch (err) {
    console.error('bulk delete orders error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/orders/:id — permanently delete a bill (and its line items).
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM orders WHERE id = $1', [
      req.params.id,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete order error', err);
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
