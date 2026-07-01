import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { initDatabase } from './seed.js';
import authRoutes from './routes/auth.js';
import itemsRoutes from './routes/items.js';
import ordersRoutes from './routes/orders.js';
import dashboardRoutes from './routes/dashboard.js';
import exportRoutes from './routes/export.js';
import syncRoutes from './routes/sync.js';
import settingsRoutes from './routes/settings.js';

dotenv.config();

const app = express();

app.use(cors()); // both tablets talk to this API from the Netlify origin
app.use(express.json({ limit: '2mb' }));

// Health check for Render.
app.get('/', (_req, res) => res.json({ ok: true, service: 'bright-fabric-care-api' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/settings', settingsRoutes);

const PORT = process.env.PORT || 4000;

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Bright Fabric Care API running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });
