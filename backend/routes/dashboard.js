import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/dashboard — full stats with per-source breakdown.
router.get('/', async (_req, res) => {
  try {
    // Today's figures
    const todayRevenue = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS v
       FROM orders
       WHERE created_at::date = CURRENT_DATE AND payment_status = 'paid'`
    );
    const todayOrders = await query(
      `SELECT COUNT(*) AS v FROM orders WHERE created_at::date = CURRENT_DATE`
    );
    const todayClothes = await query(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS v
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at::date = CURRENT_DATE`
    );
    const outstanding = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS v
       FROM orders WHERE payment_status = 'unpaid'`
    );

    // Revenue split by source (paid, today)
    const splitToday = await query(
      `SELECT source, COALESCE(SUM(total_amount), 0) AS v
       FROM orders
       WHERE created_at::date = CURRENT_DATE AND payment_status = 'paid'
       GROUP BY source`
    );
    const shopToday = Number(
      splitToday.rows.find((r) => r.source === 'shop')?.v || 0
    );
    const blockToday = Number(
      splitToday.rows.find((r) => r.source === 'block_collection')?.v || 0
    );

    // Week / month revenue (paid)
    const weekRevenue = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS v
       FROM orders
       WHERE payment_status = 'paid'
         AND created_at >= date_trunc('week', CURRENT_DATE)`
    );
    const monthRevenue = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS v
       FROM orders
       WHERE payment_status = 'paid'
         AND created_at >= date_trunc('month', CURRENT_DATE)`
    );

    // Last 7 days revenue (paid), one bucket per day including empty days.
    const last7 = await query(
      `SELECT d::date AS day,
              COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0) AS revenue,
              COUNT(o.id) AS orders
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') d
       LEFT JOIN orders o ON o.created_at::date = d::date
       GROUP BY d
       ORDER BY d ASC`
    );

    // Unpaid orders list
    const unpaid = await query(
      `SELECT id, bill_number, customer_name, block, room_no, total_amount,
              created_at, source
       FROM orders WHERE payment_status = 'unpaid'
       ORDER BY created_at DESC`
    );

    // All-time totals
    const totals = await query(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS total_revenue,
         COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'unpaid'), 0) AS total_outstanding
       FROM orders`
    );

    res.json({
      today: {
        revenue: Number(todayRevenue.rows[0].v),
        orders: Number(todayOrders.rows[0].v),
        clothes: Number(todayClothes.rows[0].v),
        shopRevenue: shopToday,
        blockRevenue: blockToday,
      },
      outstanding: Number(outstanding.rows[0].v),
      weekRevenue: Number(weekRevenue.rows[0].v),
      monthRevenue: Number(monthRevenue.rows[0].v),
      last7Days: last7.rows.map((r) => ({
        day: r.day,
        revenue: Number(r.revenue),
        orders: Number(r.orders),
      })),
      unpaidOrders: unpaid.rows,
      allTime: {
        totalOrders: Number(totals.rows[0].total_orders),
        totalRevenue: Number(totals.rows[0].total_revenue),
        totalOutstanding: Number(totals.rows[0].total_outstanding),
      },
    });
  } catch (err) {
    console.error('dashboard error', err);
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
