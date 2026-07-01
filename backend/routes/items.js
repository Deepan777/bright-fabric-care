import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/items — all active items with both prices.
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, wash_iron_price, iron_only_price, is_active, updated_at
       FROM items
       WHERE is_active = TRUE
       ORDER BY id ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('get items error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/items/:id — update item prices (and optionally name).
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, wash_iron_price, iron_only_price } = req.body || {};
    const { rows } = await query(
      `UPDATE items
       SET name = COALESCE($2, name),
           wash_iron_price = COALESCE($3, wash_iron_price),
           iron_only_price = COALESCE($4, iron_only_price),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, name ?? null, wash_iron_price ?? null, iron_only_price ?? null]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('update item error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/items — add a new item.
router.post('/', async (req, res) => {
  try {
    const { name, wash_iron_price = 0, iron_only_price = 0 } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const { rows } = await query(
      `INSERT INTO items (name, wash_iron_price, iron_only_price, is_active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING *`,
      [name, wash_iron_price, iron_only_price]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('add item error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/items/:id — soft-delete (keeps historical order references intact).
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await query(
      `UPDATE items SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete item error', err);
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
