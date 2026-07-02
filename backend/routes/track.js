import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/track?block=A Block&room_no=101
// Public, unauthenticated — a customer checks their own orders using the
// same block + room number they gave when dropping off laundry.
// Returns the most recent orders for that block + room (newest first).
router.get('/', async (req, res) => {
  try {
    const { block, room_no } = req.query;
    if (!block || !room_no) {
      return res.status(400).json({ error: 'block and room_no are required' });
    }

    const { rows } = await query(
      `SELECT bill_number, customer_name, block, room_no, delivery_date,
              service_type, total_amount, order_status, payment_status,
              created_at
       FROM orders
       WHERE block = $1 AND room_no = $2
       ORDER BY created_at DESC
       LIMIT 20`,
      [String(block).trim(), String(room_no).trim()]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: 'No orders found for that block and room number.' });
    }

    res.json(rows);
  } catch (err) {
    console.error('track error', err);
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
