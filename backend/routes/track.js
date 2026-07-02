import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/track?bill_number=SHOP-0001&mobile=9876543210
// Public, unauthenticated — a customer checks their own order status.
// Requires an exact match on BOTH fields so no one can browse other orders.
router.get('/', async (req, res) => {
  try {
    const { bill_number, mobile } = req.query;
    if (!bill_number || !mobile) {
      return res.status(400).json({ error: 'bill_number and mobile are required' });
    }

    const { rows } = await query(
      `SELECT bill_number, customer_name, block, room_no, delivery_date,
              service_type, total_amount, order_status, payment_status,
              created_at
       FROM orders
       WHERE bill_number = $1 AND mobile = $2`,
      [String(bill_number).trim(), String(mobile).trim()]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: 'No order found for that bill number and mobile number.' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('track error', err);
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
