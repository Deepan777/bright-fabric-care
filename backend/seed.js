import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default item catalogue with both prices.
const DEFAULT_ITEMS = [
  ['Shorts', 15, 15],
  ['Towel', 15, 15],
  ['Banian', 15, 15],
  ['Pillow Cover', 15, 15],
  ['Lungie', 20, 15],
  ['T-Shirt', 20, 15],
  ['Shirt', 25, 15],
  ['Pant', 25, 15],
  ['Track Pant', 25, 15],
  ['Jeans Pant', 25, 15],
  ['Turkey Towel', 20, 15],
  ['Bed Sheet', 60, 15],
  ['Small Blanket', 150, 100],
  ['Big Blanket', 250, 100],
  ['Inner', 30, 15],
  ['Socks (Pair)', 30, 15],
  ['Kerchief', 10, 10],
  ['Blazer', 200, 100],
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
