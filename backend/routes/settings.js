import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/settings — returns all settings as a key/value map.
// (PIN values are only needed server-side for auth; kept here for admin editing.)
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query('SELECT key, value FROM settings');
    const map = {};
    for (const r of rows) map[r.key] = r.value;
    res.json(map);
  } catch (err) {
    console.error('get settings error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// PUT /api/settings — upsert one or more settings. Body is a key/value object.
// Used by the Admin "Change PINs" section.
router.put('/', async (req, res) => {
  try {
    const updates = req.body || {};
    const allowed = ['pin_shop', 'pin_block', 'pin_admin'];
    for (const [key, value] of Object.entries(updates)) {
      if (!allowed.includes(key)) continue;
      await query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, String(value)]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('update settings error', err);
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
