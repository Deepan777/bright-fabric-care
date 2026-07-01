import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// POST /api/auth/login  { role: 'shop' | 'block' | 'admin', pin: '1111' }
// Validates the PIN against the settings table and returns the role + source.
router.post('/login', async (req, res) => {
  try {
    const { role, pin } = req.body || {};
    if (!role || !pin) {
      return res.status(400).json({ error: 'role and pin are required' });
    }

    const keyByRole = {
      shop: 'pin_shop',
      block: 'pin_block',
      admin: 'pin_admin',
    };
    const settingKey = keyByRole[role];
    if (!settingKey) {
      return res.status(400).json({ error: 'invalid role' });
    }

    const { rows } = await query('SELECT value FROM settings WHERE key = $1', [
      settingKey,
    ]);
    const expected = rows[0]?.value;

    if (!expected || String(pin) !== String(expected)) {
      return res.status(401).json({ error: 'Incorrect PIN' });
    }

    const sourceByRole = {
      shop: 'shop',
      block: 'block_collection',
      admin: 'admin',
    };

    return res.json({
      ok: true,
      role,
      source: sourceByRole[role],
    });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
