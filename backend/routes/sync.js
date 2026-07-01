import { Router } from 'express';
import { createOrder } from '../orderService.js';

const router = Router();

// POST /api/sync — accepts { orders: [...] } saved locally on a tablet and
// pushes them all at once. Idempotent per bill_number.
router.post('/', async (req, res) => {
  try {
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    const results = [];
    for (const order of orders) {
      try {
        const r = await createOrder(order);
        results.push({ bill_number: order.bill_number, ok: true, ...r });
      } catch (err) {
        console.error('sync order failed', order?.bill_number, err.message);
        results.push({
          bill_number: order?.bill_number,
          ok: false,
          error: err.message,
        });
      }
    }
    res.json({ ok: true, synced: results.filter((r) => r.ok).length, results });
  } catch (err) {
    console.error('sync error', err);
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
