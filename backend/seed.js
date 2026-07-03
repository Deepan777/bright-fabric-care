import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default item catalogue with both prices.
// Iron Only price is 10 for every item except Bed Sheet (20).
const DEFAULT_ITEMS = [
  ['Shorts', 15, 10],
  ['Towel', 15, 10],
  ['Banian', 15, 10],
  ['Pillow Cover', 15, 10],
  ['Lungie', 20, 10],
  ['T-Shirt', 20, 10],
  ['Shirt', 25, 10],
  ['Pant', 25, 10],
  ['Track Pant', 25, 10],
  ['Jeans Pant', 25, 10],
  ['Turkey Towel', 20, 10],
  ['Bed Sheet', 60, 20],
  ['Small Blanket', 150, 10],
  ['Big Blanket', 250, 10],
  ['Inner', 30, 10],
  ['Socks (Pair)', 30, 10],
  ['Kerchief', 10, 10],
  ['Blazer', 200, 10],
  ['Others', 0, 0],
];

const DEFAULT_SETTINGS = [
  ['pin_shop', '1111'],
  ['pin_block', '2222'],
  ['pin_admin', '9999'],
  ['seeded', 'true'],
];

// Applies the schema, then seeds items + settings ONLY on the first deploy.
export async function initDatabase() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await query(schema);

  const { rows } = await query(
    `SELECT value FROM settings WHERE key = 'seeded'`
  );
  const alreadySeeded = rows.length > 0 && rows[0].value === 'true';

  if (alreadySeeded) {
    console.log('Database already seeded — skipping seed.');
    return;
  }

  console.log('First deploy detected — seeding items and settings...');

  for (const [name, wash, iron] of DEFAULT_ITEMS) {
    await query(
      `INSERT INTO items (name, wash_iron_price, iron_only_price, is_active)
       VALUES ($1, $2, $3, TRUE)`,
      [name, wash, iron]
    );
  }

  for (const [key, value] of DEFAULT_SETTINGS) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }

  console.log('Seed complete.');
}

// Allow `npm run seed` to run standalone.
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  initDatabase()
    .then(() => {
      console.log('Done.');
      return pool.end();
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
