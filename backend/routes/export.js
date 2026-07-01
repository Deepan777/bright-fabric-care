import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

function csvCell(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /api/export/csv — download all orders as CSV.
router.get('/csv', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT bill_number, customer_name, block, room_no, mobile,
              delivery_date, service_type, total_amount, order_status,
              payment_status, source, pickup_date, dropback_date,
              worker_note, created_at
       FROM orders ORDER BY created_at DESC`
    );

    const headers = [
      'Bill Number', 'Customer Name', 'Block', 'Room No', 'Mobile',
      'Delivery Date', 'Service Type', 'Total Amount', 'Order Status',
      'Payment Status', 'Source', 'Pickup Date', 'Dropback Date',
      'Worker Note', 'Created At',
    ];

    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.bill_number, r.customer_name, r.block, r.room_no, r.mobile,
          r.delivery_date, r.service_type, r.total_amount, r.order_status,
          r.payment_status, r.source, r.pickup_date, r.dropback_date,
          r.worker_note, r.created_at,
        ].map(csvCell).join(',')
      );
    }

    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (err) {
    console.error('export csv error', err);
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
