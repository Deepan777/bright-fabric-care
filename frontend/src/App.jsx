import { useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import TabBar from './components/TabBar.jsx';
import SyncBanner from './components/SyncBanner.jsx';
import Login from './screens/Login.jsx';
import NewBill from './screens/NewBill.jsx';
import Orders from './screens/Orders.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Admin from './screens/Admin.jsx';
import PrintBill from './screens/PrintBill.jsx';
import TrackOrder from './screens/TrackOrder.jsx';

import { getSession, clearSession } from './auth.js';
import { api } from './api.js';
import { cacheItems, getCachedItems, DEFAULT_ITEMS } from './db.js';
import { startAutoSync } from './sync.js';
import { useToast } from './toast.jsx';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(getSession());
  const [tab, setTab] = useState('newbill');
  const [items, setItems] = useState([]);
  const [printOrder, setPrintOrder] = useState(null);
  const notify = useToast();

  // First-launch: load item catalogue (from cloud, falling back to cache) and
  // start the background sync loop.
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const cloud = await api.getItems();
        if (!cancelled) {
          setItems(cloud);
          await cacheItems(cloud);
        }
      } catch {
        // Offline — use whatever we cached last time, or the built-in
        // defaults so the app still works with no backend at all.
        const cached = await getCachedItems();
        if (!cancelled) setItems(cached.length ? cached : DEFAULT_ITEMS);
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    boot();
    startAutoSync();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshItems() {
    try {
      const cloud = await api.getItems();
      setItems(cloud);
      await cacheItems(cloud);
    } catch {
      /* offline */
    }
  }

  function handleLogout() {
    clearSession();
    setSession(null);
    setTab('newbill');
  }

  // Public, no-login page for customers to check their own order status.
  if (window.location.pathname.startsWith('/track')) {
    return <TrackOrder />;
  }

  if (booting) {
    return (
      <div className="spinner-wrap">
        <div className="spinner" />
        <div>Loading The Bright Fabric Care…</div>
      </div>
    );
  }

  if (!session) {
    return <Login onLogin={setSession} />;
  }

  // Print view takes over the whole screen (tab bar + header hidden by CSS).
  if (printOrder) {
    return <PrintBill order={printOrder} onBack={() => setPrintOrder(null)} />;
  }

  return (
    <div className="app">
      <Header session={session} onLogout={handleLogout} />
      <SyncBanner />

      {tab === 'newbill' && (
        <NewBill
          session={session}
          items={items}
          onBillGenerated={(order) => setPrintOrder(order)}
        />
      )}
      {tab === 'orders' && (
        <Orders onReprint={(order) => setPrintOrder(order)} />
      )}
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'admin' && (
        <Admin items={items} onItemsChanged={refreshItems} />
      )}

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
