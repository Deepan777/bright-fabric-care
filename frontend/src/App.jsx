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
import { cacheItems } from './db.js';
import { loadItems } from './dataSync.js';
import { refreshPendingCount } from './sync.js';
import { warmUpPrinter } from './btPrint.js';
import { useToast } from './toast.jsx';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(getSession());
  const [tab, setTab] = useState('newbill');
  const [items, setItems] = useState([]);
  const [printOrder, setPrintOrder] = useState(null);
  const notify = useToast();

  // Boot instantly from the local item cache — no network wait. If the
  // cache is more than a day old, loadItems() silently refreshes it in the
  // background and calls us back with fresh data when it lands.
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const cached = await loadItems((fresh) => {
        if (!cancelled) setItems(fresh);
      });
      if (!cancelled) {
        setItems(cached);
        setBooting(false);
      }
    }
    boot();
    // Local-only — no network. Populates the "N pending" banner without
    // touching the internet; the app only syncs when the end-of-day
    // Sync button in the header is tapped.
    refreshPendingCount();
    // Best-effort, silent — if a printer was paired before and is already
    // switched on, this warms the Bluetooth connection up now so printing
    // the first bill of the day feels instant instead of waiting to connect.
    warmUpPrinter();
    return () => {
      cancelled = true;
    };
  }, []);

  // Called right after an Admin price/item edit — this is a deliberate,
  // user-triggered action so it fetches immediately rather than waiting
  // for the next scheduled daily refresh.
  async function refreshItems() {
    try {
      const cloud = await api.getItems();
      setItems(cloud);
      await cacheItems(cloud);
    } catch {
      notify('Could not refresh — still using existing prices', 'info');
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

  // Dashboard shows revenue/financial data — admin only. Workers (Shop
  // Counter / Block Collection) never see the tab or the screen.
  const isAdmin = session.role === 'admin';
  const effectiveTab = tab === 'dashboard' && !isAdmin ? 'newbill' : tab;

  return (
    <div className="app">
      <Header
        session={session}
        onLogout={handleLogout}
        onSynced={(fresh) => setItems(fresh.items)}
      />
      <SyncBanner />

      {effectiveTab === 'newbill' && (
        <NewBill
          session={session}
          items={items}
          onBillGenerated={(order) => setPrintOrder(order)}
        />
      )}
      {effectiveTab === 'orders' && (
        <Orders onReprint={(order) => setPrintOrder(order)} />
      )}
      {effectiveTab === 'dashboard' && isAdmin && <Dashboard />}
      {effectiveTab === 'admin' && (
        <Admin items={items} onItemsChanged={refreshItems} />
      )}

      <TabBar active={effectiveTab} onChange={setTab} showDashboard={isAdmin} />
    </div>
  );
}
