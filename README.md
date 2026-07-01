# The Bright Fabric Care — Laundry Management App

Cloud-hosted full-stack laundry management app for **The Bright Fabric Care**, VIT Campus (Mens Hostel). Runs on two Android tablets that share one central PostgreSQL database. Each tablet prints locally (USB/Bluetooth) via `window.print()` — **printing never needs internet**. Orders are saved to IndexedDB first and synced to the cloud in the background.

```
Laundry App/
├── backend/     Node.js + Express API  →  deploy to Render.com
└── frontend/    React + Vite (PWA)     →  deploy to Netlify
```

## Features

- Two worker modes — **Shop Counter** (PIN 1111) and **Block Collection** (PIN 2222), plus **Admin** (PIN 9999)
- New Bill screen with Wash+Iron / Iron Only toggle, 19 item cards, custom "Others" item, PAID/UNPAID
- Offline-first: saves to IndexedDB instantly, auto-syncs every 30 s, yellow banner + sync dots when pending
- Local bill numbers `SHOP-0001` / `BLOCK-0001`, auto-incrementing, never reset
- A5 print bill matching the paper receipt layout
- Orders list (merged local + cloud, filters, search, status/payment actions, reprint)
- Dashboard (today revenue/orders/clothes, outstanding, per-source split, week/month, 7-day CSS bar chart, unpaid list, CSV export)
- Admin (inline price editing, add/delete items, change PINs, view unsynced, manual sync, clear local data, all-time stats)

---

## Local development

**Backend** (needs a local PostgreSQL, or point at the Render DB):

```bash
cd backend
cp .env.example .env         # set DATABASE_URL
npm install
npm start                    # http://localhost:4000  (auto-creates + seeds tables)
```

**Frontend**:

```bash
cd frontend
cp .env.example .env         # set VITE_API_URL=http://localhost:4000
npm install
npm run dev                  # http://localhost:5173
```

---

# DEPLOYMENT — step by step

## Part A — PostgreSQL database on Render.com

1. Create a free account at <https://render.com> and log in.
2. Click **New +** → **PostgreSQL**.
3. Fill in:
   - **Name:** `bright-fabric-care-db`
   - **Database:** `bright_fabric_care`
   - **Region:** choose the one closest to you (e.g. Singapore).
   - **Plan:** **Free**.
4. Click **Create Database** and wait until status is **Available**.
5. On the database page, find the **Connections** section and copy the **Internal Database URL** (looks like `postgresql://...`). You'll paste this into the backend service in Part B.
   - Use the **Internal** URL because the backend runs on Render too (faster, free). Keep the **External** URL handy if you ever connect from your PC.

> The tables are created and seeded **automatically** the first time the backend starts — you do not run any SQL by hand. Seeding happens only once (guarded by a `seeded` flag), so redeploys never duplicate items.

## Part B — Deploy the backend to Render.com

1. Push this project to a GitHub repo (backend and frontend can live in the same repo).
2. In Render, click **New +** → **Web Service** → connect your GitHub repo.
3. Configure:
   - **Name:** `bright-fabric-care-api`
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** **Free**
4. **Environment variables** (under *Advanced* → *Add Environment Variable*):

   | Key            | Value                                              |
   |----------------|----------------------------------------------------|
   | `DATABASE_URL` | *(paste the Internal Database URL from Part A)*     |
   | `NODE_ENV`     | `production`                                        |

   (Do **not** set `PORT` — Render provides it automatically.)
5. Click **Create Web Service**. Watch the logs; you should see
   `First deploy detected — seeding items and settings...` then
   `Bright Fabric Care API running on port ...`.
6. Copy your API URL, e.g. `https://bright-fabric-care-api.onrender.com`.
7. Test it in a browser: visiting `https://<your-api>.onrender.com/api/items` should return the seeded item list as JSON.

> **Free-tier note:** Render free web services sleep after ~15 min idle and take ~30–60 s to wake on the next request. The tablets keep working offline in the meantime and sync once the API wakes.

## Part C — Deploy the frontend to Netlify

1. Create a free account at <https://netlify.com>.
2. Click **Add new site** → **Import an existing project** → connect the same GitHub repo.
3. Configure the build:
   - **Base directory:** `frontend`
   - **Build command:** `npm run build`
   - **Publish directory:** `frontend/dist`  (Netlify may show `dist` once base is set — that's fine; `netlify.toml` in `frontend/` also sets this).
4. **Environment variables** (Site settings → Environment variables → Add):

   | Key            | Value                                             |
   |----------------|---------------------------------------------------|
   | `VITE_API_URL` | `https://bright-fabric-care-api.onrender.com`     |

   (Use your real Render API URL, **no trailing slash**.)
5. Click **Deploy**. When done you'll get a URL like `https://bright-fabric-care.netlify.app`.
6. (Optional) Rename the site under **Site settings → Change site name** to something memorable.

> If you change `VITE_API_URL` later, trigger a **redeploy** — Vite bakes env vars in at build time.

## Part D — Open the app on an Android tablet (Chrome)

1. On each tablet, open **Chrome**.
2. Go to your Netlify URL, e.g. `https://bright-fabric-care.netlify.app`.
3. On the login screen tap **Shop Counter** (tablet 1) or **Block Collection** (tablet 2), enter the PIN, and log in. The session stays until you log out.
4. Both tablets now read/write the same cloud database, but each prints to its own local printer.

## Part E — Add to the Android home screen (PWA shortcut)

1. In Chrome on the tablet, open the app URL.
2. Tap the **⋮** menu (top-right).
3. Tap **Add to Home screen** (or **Install app**).
4. Confirm the name **The Bright Fabric Care** and tap **Add**.
5. Launch it from the home screen icon — it opens full-screen like a native app.

### Printer setup on the tablet

- Connect the printer via **USB (OTG)** or pair it over **Bluetooth** in Android settings.
- Make sure Android sees it as a printer (install the vendor's print plugin / Mopria if needed).
- In the app, generate a bill → the print view opens → tap **Print** → choose your local printer → paper size **A5**.
- Printing uses the browser's local print pipeline only; it works even with Wi-Fi off.

---

## API reference

| Method | Endpoint                     | Purpose                                   |
|--------|------------------------------|-------------------------------------------|
| POST   | `/api/auth/login`            | Validate PIN, return role + source        |
| GET    | `/api/items`                 | All active items with both prices         |
| POST   | `/api/items`                 | Add new item                              |
| PUT    | `/api/items/:id`             | Update item prices                        |
| DELETE | `/api/items/:id`             | Delete (deactivate) item                  |
| POST   | `/api/orders`                | Create order with items                   |
| GET    | `/api/orders`                | List (filter: source/status/payment/date/search) |
| GET    | `/api/orders/:id`            | Single order with items                   |
| PATCH  | `/api/orders/:id/status`     | Update order_status                       |
| PATCH  | `/api/orders/:id/payment`    | Toggle payment_status                     |
| POST   | `/api/sync`                  | Bulk-sync locally saved orders            |
| GET    | `/api/dashboard`             | Full stats with per-source breakdown      |
| GET    | `/api/export/csv`            | Download all orders as CSV                |
| GET/PUT| `/api/settings`              | Read / change PINs                        |

## Notes & tips

- **Default PINs** live in the `settings` table and can be changed from the Admin screen. If the API is briefly unreachable, the login screen still accepts the original default PINs so the shop is never locked out.
- **App icons:** drop `icon-192.png` and `icon-512.png` into `frontend/public/` for a custom home-screen icon (the app works without them).
- **Bill numbers** are generated per-tablet. If you want the two tablets to never share a range, keep tablet 1 on Shop mode and tablet 2 on Block mode (they use separate `SHOP-`/`BLOCK-` counters).
