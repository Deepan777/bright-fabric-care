import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getSession } from '../auth.js';
import {
  getUnsyncedOrders,
  clearLocalData,
  getMeta,
  cacheSettings,
  getLastFetched,
  removeCachedOrder,
  removeCachedOrders,
  getCachedCloudOrders,
} from '../db.js';
import { loadSettings, loadDashboard, forceRefreshAll } from '../dataSync.js';
import { syncNow } from '../sync.js';
import { useToast } from '../toast.jsx';
import {
  printViaRawBT,
  testPrintBytes,
  getPrintMode,
  setPrintMode,
} from '../rawbt.js';
import {
  isNativeApp,
  btListPaired,
  btPrint,
  getSelectedPrinter,
  setSelectedPrinter,
} from '../native.js';

function fmtDateTime(d) {
  if (!d) return 'never';
  try {
    return new Date(d).toLocaleString('en-GB');
  } catch {
    return d;
  }
}

// Date + time (not date-only) so the bill summary shows exactly when each
// bill was created, not just which day.
function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

// Matches the backend's date/month/year filtering, used for the offline
// fallback when the network call for Bill Summary fails.
function matchesPeriod(order, mode, date, month, year) {
  const created = order.created_at ? new Date(order.created_at) : null;
  if (!created) return false;
  if (mode === 'day') return created.toISOString().slice(0, 10) === date;
  if (mode === 'month') return created.toISOString().slice(0, 7) === month;
  if (mode === 'year') return String(created.getFullYear()) === String(year);
  return true;
}

function clothesCount(order) {
  return (order.items || []).reduce((s, it) => s + Number(it.quantity || 0), 0);
}

// Bills / revenue (paid) / outstanding (unpaid) / clothes, split by source
// plus a combined row — lets the admin verify Shop and Block Collection
// totals separately or together at a glance.
function summarizeBySource(orders) {
  const buckets = { shop: [], block_collection: [] };
  for (const o of orders) {
    (buckets[o.source] ||= []).push(o);
  }
  function stats(list) {
    return {
      bills: list.length,
      revenue: list
        .filter((o) => o.payment_status === 'paid')
        .reduce((s, o) => s + Number(o.total_amount), 0),
      outstanding: list
        .filter((o) => o.payment_status === 'unpaid')
        .reduce((s, o) => s + Number(o.total_amount), 0),
      clothes: list.reduce((s, o) => s + clothesCount(o), 0),
    };
  }
  return {
    shop: stats(buckets.shop),
    block: stats(buckets.block_collection),
    combined: stats(orders),
  };
}

export default function Admin({ items, onItemsChanged }) {
  const session = getSession();
  const [unlocked, setUnlocked] = useState(session?.role === 'admin');
  const [pin, setPin] = useState('');
  const notify = useToast();

  // Editable copy of item rows.
  const [rows, setRows] = useState([]);
  const [newItem, setNewItem] = useState({ name: '', wash: '', iron: '' });
  const [pins, setPins] = useState({ pin_shop: '', pin_block: '', pin_admin: '' });
  const [unsynced, setUnsynced] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [stats, setStats] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [clearStep, setClearStep] = useState(0);

  // Bill summary (by day / month / year) + per-bill delete.
  const [summaryMode, setSummaryMode] = useState('day');
  const [summaryDate, setSummaryDate] = useState(todayStr());
  const [summaryMonth, setSummaryMonth] = useState(currentMonthStr());
  const [summaryYear, setSummaryYear] = useState(String(new Date().getFullYear()));
  const [summarySource, setSummarySource] = useState('all');
  const [summaryOrders, setSummaryOrders] = useState(null);
  const [summaryOffline, setSummaryOffline] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [confirmDeleteOrder, setConfirmDeleteOrder] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [dataRefreshedAt, setDataRefreshedAt] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [printMode, setPrintModeState] = useState(getPrintMode());
  // Native app printer selection.
  const native = isNativeApp();
  const [pairedList, setPairedList] = useState(null);
  const [selectedPrinter, setSelectedPrinterState] = useState(getSelectedPrinter());
  const [printerScanning, setPrinterScanning] = useState(false);

  useEffect(() => {
    setRows(items.map((i) => ({ ...i })));
  }, [items]);

  useEffect(() => {
    if (!unlocked) return;
    refreshMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  function testPrint() {
    if (native) {
      btPrint(testPrintBytes())
        .then(() => notify('Test printed', 'success'))
        .catch((err) => notify(err?.message || 'Test print failed', 'error'));
      return;
    }
    printViaRawBT(testPrintBytes());
    notify('Test sent to printer', 'success');
  }

  // Native app: load the printers already paired in Android settings so the
  // admin can pick which one this device prints to.
  async function scanPrinters() {
    setPrinterScanning(true);
    try {
      const devices = await btListPaired();
      setPairedList(devices);
      if (devices.length === 0) {
        notify('No paired devices — pair the printer in Android Settings first', 'info');
      }
    } catch (err) {
      notify(err?.message || 'Could not read Bluetooth devices', 'error');
    } finally {
      setPrinterScanning(false);
    }
  }

  function choosePrinter(device) {
    setSelectedPrinter(device.address, device.name);
    setSelectedPrinterState({ address: device.address, name: device.name });
    notify(`Printer set: ${device.name || device.address}`, 'success');
  }

  function changePrintMode(mode) {
    setPrintMode(mode);
    setPrintModeState(mode);
    notify(
      mode === 'rawbt'
        ? 'This device will print to the Bluetooth printer'
        : mode === 'system'
        ? 'This device will use the system print dialog'
        : 'Printer type set to automatic',
      'success'
    );
  }

  // Cache-first — instant, at most one background network touch per day.
  async function refreshMeta() {
    setUnsynced(await getUnsyncedOrders());
    setLastSync(await getMeta('last_sync'));
    setDataRefreshedAt(await getLastFetched('settings'));

    const dash = await loadDashboard((fresh) => setStats(fresh.allTime));
    if (dash) setStats(dash.allTime);

    const s = await loadSettings((fresh) => {
      setPins({
        pin_shop: fresh.pin_shop || '',
        pin_block: fresh.pin_block || '',
        pin_admin: fresh.pin_admin || '',
      });
      setDataRefreshedAt(new Date().toISOString());
    });
    setPins({
      pin_shop: s.pin_shop || '',
      pin_block: s.pin_block || '',
      pin_admin: s.pin_admin || '',
    });
  }

  // PIN check is against the local cache — instant, works offline.
  async function tryUnlock() {
    const settings = await loadSettings();
    if (String(pin) === String(settings.pin_admin)) {
      setUnlocked(true);
    } else {
      notify('Incorrect admin PIN', 'error');
    }
  }

  // Pulls fresh items/settings/orders/dashboard right now instead of
  // waiting for the once-a-day background refresh.
  async function refreshAllData() {
    setRefreshingAll(true);
    try {
      await forceRefreshAll();
      setDataRefreshedAt(new Date().toISOString());
      await refreshMeta();
      onItemsChanged();
      notify('Data refreshed', 'success');
    } catch (err) {
      notify(err.message || 'Could not refresh — still offline', 'error');
    } finally {
      setRefreshingAll(false);
    }
  }

  function editRow(id, field, value) {
    setRows((r) =>
      r.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }

  async function saveAllPrices() {
    try {
      for (const row of rows) {
        await api.updateItem(row.id, {
          wash_iron_price: Number(row.wash_iron_price),
          iron_only_price: Number(row.iron_only_price),
        });
      }
      notify('Prices updated', 'success');
      onItemsChanged();
    } catch (err) {
      notify(err.message || 'Save failed', 'error');
    }
  }

  async function addItem() {
    if (!newItem.name.trim()) return notify('Enter item name', 'error');
    try {
      await api.addItem({
        name: newItem.name.trim(),
        wash_iron_price: Number(newItem.wash) || 0,
        iron_only_price: Number(newItem.iron) || 0,
      });
      notify('Item added', 'success');
      setNewItem({ name: '', wash: '', iron: '' });
      onItemsChanged();
    } catch (err) {
      notify(err.message || 'Add failed', 'error');
    }
  }

  async function doDelete(item) {
    try {
      await api.deleteItem(item.id);
      notify('Item deleted', 'success');
      setConfirmDelete(null);
      onItemsChanged();
    } catch (err) {
      notify(err.message || 'Delete failed', 'error');
    }
  }

  async function savePins() {
    try {
      await api.updateSettings(pins);
      // Update the local cache immediately so the new PINs work on this
      // tablet right away, without waiting for the next daily refresh.
      await cacheSettings(pins);
      notify('PINs updated', 'success');
    } catch (err) {
      notify(err.message || 'Save failed', 'error');
    }
  }

  async function manualSync() {
    try {
      const n = await syncNow();
      notify(`Synced ${n} order(s)`, 'success');
      refreshMeta();
    } catch {
      notify('Sync failed — still offline', 'error');
    }
  }

  // Always fetches the FULL period (no source filter) so the Shop / Block /
  // Combined breakdown below is always complete; the source dropdown only
  // filters which bills show in the detail table.
  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const params = {};
      if (summaryMode === 'day') params.date = summaryDate;
      if (summaryMode === 'month') params.month = summaryMonth;
      if (summaryMode === 'year') params.year = summaryYear;
      const orders = await api.getOrders(params);
      setSummaryOrders(orders);
      setSummaryOffline(false);
    } catch (err) {
      // Offline fallback — filter the last cached full order list locally
      // so the summary still works without a connection.
      const cached = await getCachedCloudOrders();
      if (cached.length) {
        const filtered = cached.filter((o) =>
          matchesPeriod(o, summaryMode, summaryDate, summaryMonth, summaryYear)
        );
        setSummaryOrders(filtered);
        setSummaryOffline(true);
        notify('Offline — showing last synced data', 'info');
      } else {
        notify(err.message || 'Could not load summary', 'error');
      }
    } finally {
      setSummaryLoading(false);
    }
  }

  async function deleteOrder(order) {
    try {
      await api.deleteOrder(order.id);
      await removeCachedOrder(order.id);
      notify('Bill deleted', 'success');
      setConfirmDeleteOrder(null);
      setSummaryOrders((list) => list.filter((o) => o.id !== order.id));
    } catch (err) {
      notify(err.message || 'Delete failed', 'error');
    }
  }

  // The bills currently visible in the table below (period + source
  // filter applied) — what "Delete All Shown Bills" acts on.
  const shownSummaryOrders = (summaryOrders || []).filter(
    (o) => summarySource === 'all' || o.source === summarySource
  );

  // Bulk delete — everything currently shown in the Bills table. Mirrors
  // the exact same filters server-side (period + source) rather than
  // deleting by id one at a time, so it works correctly no matter how many
  // bills match. Admin-only by virtue of living behind the Admin PIN wall.
  async function deleteAllShown() {
    setDeletingAll(true);
    try {
      const params = {};
      if (summaryMode === 'day') params.date = summaryDate;
      if (summaryMode === 'month') params.month = summaryMonth;
      if (summaryMode === 'year') params.year = summaryYear;
      if (summarySource !== 'all') params.source = summarySource;
      if (Object.keys(params).length === 0) params.all = 'true';

      const result = await api.deleteOrders(params);
      const ids = shownSummaryOrders.map((o) => o.id);
      await removeCachedOrders(ids);
      setSummaryOrders((list) => list.filter((o) => !ids.includes(o.id)));
      notify(`Deleted ${result.count} bill(s)`, 'success');
      setConfirmDeleteAll(false);
    } catch (err) {
      notify(err.message || 'Bulk delete failed', 'error');
    } finally {
      setDeletingAll(false);
    }
  }

  async function confirmClearLocal() {
    if (clearStep < 2) {
      setClearStep(clearStep + 1);
      return;
    }
    await clearLocalData();
    setClearStep(0);
    notify('Local data cleared', 'success');
    refreshMeta();
  }

  if (!unlocked) {
    return (
      <div className="login">
        <h1>Admin</h1>
        <div className="sub">Enter admin PIN to continue</div>
        <input
          className="pin-input"
          type="password"
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
        />
        <button className="btn-primary" onClick={tryUnlock}>
          Unlock
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>Admin</h2>

      {/* Items table */}
      <div className="admin-section">
        <div className="section-title">Items &amp; Prices</div>
        <div className="admin-item-row" style={{ fontWeight: 700 }}>
          <span>Name</span>
          <span>Wash+Iron</span>
          <span>Iron Only</span>
          <span></span>
        </div>
        {rows.map((row) => (
          <div className="admin-item-row" key={row.id}>
            <span>{row.name}</span>
            <input
              type="number"
              value={row.wash_iron_price}
              onChange={(e) => editRow(row.id, 'wash_iron_price', e.target.value)}
            />
            <input
              type="number"
              value={row.iron_only_price}
              onChange={(e) => editRow(row.id, 'iron_only_price', e.target.value)}
            />
            <button
              className="btn-danger"
              style={{ flex: 'none', padding: '10px 14px' }}
              onClick={() => setConfirmDelete(row)}
            >
              Delete
            </button>
          </div>
        ))}
        <button
          className="btn-primary"
          style={{ marginTop: 14 }}
          onClick={saveAllPrices}
        >
          Save All Prices
        </button>
      </div>

      {/* Add new item */}
      <div className="admin-section">
        <div className="section-title">Add New Item</div>
        <div className="admin-item-row">
          <input
            placeholder="Item name"
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
          />
          <input
            type="number"
            placeholder="Wash+Iron"
            value={newItem.wash}
            onChange={(e) => setNewItem({ ...newItem, wash: e.target.value })}
          />
          <input
            type="number"
            placeholder="Iron Only"
            value={newItem.iron}
            onChange={(e) => setNewItem({ ...newItem, iron: e.target.value })}
          />
          <button className="btn-primary" style={{ flex: 'none' }} onClick={addItem}>
            Add
          </button>
        </div>
      </div>

      {/* Change PINs */}
      <div className="admin-section">
        <div className="section-title">Change PINs</div>
        <div className="field-grid">
          <div className="field">
            <label>Shop Counter PIN</label>
            <input
              value={pins.pin_shop}
              maxLength={4}
              onChange={(e) =>
                setPins({ ...pins, pin_shop: e.target.value.replace(/\D/g, '') })
              }
            />
          </div>
          <div className="field">
            <label>Block Collection PIN</label>
            <input
              value={pins.pin_block}
              maxLength={4}
              onChange={(e) =>
                setPins({ ...pins, pin_block: e.target.value.replace(/\D/g, '') })
              }
            />
          </div>
          <div className="field">
            <label>Admin PIN</label>
            <input
              value={pins.pin_admin}
              maxLength={4}
              onChange={(e) =>
                setPins({ ...pins, pin_admin: e.target.value.replace(/\D/g, '') })
              }
            />
          </div>
        </div>
        <button className="btn-primary" style={{ marginTop: 12 }} onClick={savePins}>
          Save PINs
        </button>
      </div>

      {/* Printer setup. Inside the installed app this is a direct Bluetooth
          picker; on the plain website it explains the RawBT fallback. */}
      <div className="admin-section">
        <div className="section-title">Printer Setup</div>

        <div
          className="print-status"
          style={{
            background: native ? '#e8f5e9' : '#fff4e5',
            color: native ? 'var(--green)' : 'var(--orange)',
            marginBottom: 12,
          }}
        >
          {native
            ? '✓ Running as the installed app — prints directly over Bluetooth'
            : '● Running as a website in the browser — install the app for direct printing'}
        </div>

        {native ? (
          <>
            <p style={{ color: '#666' }}>
              This device prints <strong>directly</strong> to the Bluetooth
              printer — no other app. Do this once per tablet/phone:
            </p>
            <ol className="setup-steps">
              <li>
                Switch the printer on. In <strong>Settings → Bluetooth</strong>,
                pair the printer (shows as <strong>“MPT-III”</strong>). PIN, if
                asked, is usually <strong>0000</strong> or <strong>1234</strong>.
              </li>
              <li>Tap “Find Printers” below and choose it from the list.</li>
              <li>Tap “Print Test Receipt” to confirm.</li>
            </ol>

            <p style={{ fontWeight: 700, marginBottom: 8 }}>
              Selected printer:{' '}
              {selectedPrinter ? (
                <span style={{ color: 'var(--green)' }}>
                  {selectedPrinter.name || selectedPrinter.address}
                </span>
              ) : (
                <span style={{ color: 'var(--red)' }}>none yet</span>
              )}
            </p>

            <button
              className="btn-primary"
              style={{ width: 'auto', marginRight: 8 }}
              onClick={scanPrinters}
              disabled={printerScanning}
            >
              {printerScanning ? 'Finding…' : '🔍 Find Printers'}
            </button>
            <button
              className="btn-secondary"
              style={{ width: 'auto' }}
              onClick={testPrint}
              disabled={!selectedPrinter}
            >
              🖨 Print Test Receipt
            </button>

            {pairedList && pairedList.length > 0 && (
              <div className="printer-list">
                {pairedList.map((d) => {
                  const isSel = selectedPrinter?.address === d.address;
                  return (
                    <button
                      key={d.address}
                      className={`printer-row${isSel ? ' active' : ''}`}
                      onClick={() => choosePrinter(d)}
                    >
                      <span>{d.name || '(unnamed device)'}</span>
                      <span className="printer-addr">{d.address}</span>
                      {isSel && <span className="printer-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <p style={{ color: '#666' }}>
              You’re using the website in a browser. For the best, most direct
              printing, install <strong>The Bright Fabric Care app</strong> (APK)
              on the tablet — it prints straight to the Bluetooth printer with
              nothing in between. In the browser, printing uses the RawBT app:
            </p>
            <ol className="setup-steps">
              <li>
                Install the free <strong>RawBT</strong> app from the Play Store.
              </li>
              <li>
                In <strong>Settings → Bluetooth</strong>, pair the printer
                (shows as <strong>“MPT-III”</strong>; PIN <strong>0000</strong>/
                <strong>1234</strong>).
              </li>
              <li>
                Open <strong>RawBT</strong> → set that printer as its{' '}
                <strong>default</strong> printer.
              </li>
              <li>Tap “Print Test Receipt” to confirm.</li>
            </ol>
            <button
              className="btn-primary"
              style={{ width: 'auto' }}
              onClick={testPrint}
            >
              🖨 Print Test Receipt
            </button>

            <div className="print-mode">
              <div className="print-mode-label">Printer type on this device:</div>
              <div className="print-mode-options">
                <button
                  className={printMode === 'auto' ? 'active' : ''}
                  onClick={() => changePrintMode('auto')}
                >
                  Automatic
                </button>
                <button
                  className={printMode === 'rawbt' ? 'active' : ''}
                  onClick={() => changePrintMode('rawbt')}
                >
                  Bluetooth printer (RawBT)
                </button>
                <button
                  className={printMode === 'system' ? 'active' : ''}
                  onClick={() => changePrintMode('system')}
                >
                  USB / system dialog
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Unsynced orders */}
      <div className="admin-section">
        <div className="section-title">
          Unsynced Orders ({unsynced.length})
        </div>
        {unsynced.length === 0 ? (
          <p>All orders are synced.</p>
        ) : (
          <ul>
            {unsynced.map((o) => (
              <li key={o.localId}>
                {o.bill_number} — {o.block || '—'} {o.room_no || ''} — ₹
                {Number(o.total_amount).toFixed(0)}
              </li>
            ))}
          </ul>
        )}
        <button className="btn-primary" onClick={manualSync}>
          Sync Now
        </button>
        <p style={{ color: '#666', marginTop: 8 }}>
          Last sync:{' '}
          {lastSync ? new Date(lastSync).toLocaleString('en-GB') : 'never'}
        </p>
      </div>

      {/* Daily data refresh */}
      <div className="admin-section">
        <div className="section-title">Data Refresh</div>
        <p style={{ color: '#666' }}>
          Items, prices, PINs, orders, and dashboard stats refresh
          automatically once a day in the background to keep the app fast
          and working offline. Use this to pull the latest right now instead
          of waiting.
        </p>
        <button
          className="btn-primary"
          onClick={refreshAllData}
          disabled={refreshingAll}
        >
          {refreshingAll ? 'Refreshing…' : 'Refresh Data Now'}
        </button>
        <p style={{ color: '#666', marginTop: 8 }}>
          Last data refresh: {fmtDateTime(dataRefreshedAt)}
        </p>
      </div>

      {/* Bill summary by day / month / year, split Shop vs Block vs Combined */}
      <div className="admin-section">
        <div className="section-title section-title-row">
          <span>Bill Summary</span>
          {summaryOffline && <span className="badge unpaid">Offline (cached)</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <select value={summaryMode} onChange={(e) => setSummaryMode(e.target.value)}>
            <option value="day">By Day</option>
            <option value="month">By Month</option>
            <option value="year">By Year</option>
            <option value="all">All Time</option>
          </select>
          {summaryMode === 'day' && (
            <input
              type="date"
              value={summaryDate}
              onChange={(e) => setSummaryDate(e.target.value)}
            />
          )}
          {summaryMode === 'month' && (
            <input
              type="month"
              value={summaryMonth}
              onChange={(e) => setSummaryMonth(e.target.value)}
            />
          )}
          {summaryMode === 'year' && (
            <input
              type="number"
              value={summaryYear}
              onChange={(e) => setSummaryYear(e.target.value)}
              style={{ width: 100 }}
            />
          )}
          <button className="btn-primary" style={{ width: 'auto' }} onClick={loadSummary}>
            {summaryLoading ? 'Loading…' : 'View Summary'}
          </button>
        </div>

        {summaryOrders && summaryOrders.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="data-table breakdown-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Bills</th>
                    <th>Clothes</th>
                    <th>Revenue (paid)</th>
                    <th>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const b = summarizeBySource(summaryOrders);
                    return (
                      <>
                        <tr>
                          <td className="row-label">🧺 Shop Counter</td>
                          <td>{b.shop.bills}</td>
                          <td>{b.shop.clothes}</td>
                          <td>₹{b.shop.revenue.toFixed(0)}</td>
                          <td>₹{b.shop.outstanding.toFixed(0)}</td>
                        </tr>
                        <tr>
                          <td className="row-label">🚪 Block Collection</td>
                          <td>{b.block.bills}</td>
                          <td>{b.block.clothes}</td>
                          <td>₹{b.block.revenue.toFixed(0)}</td>
                          <td>₹{b.block.outstanding.toFixed(0)}</td>
                        </tr>
                        <tr className="row-combined">
                          <td className="row-label">Combined</td>
                          <td>{b.combined.bills}</td>
                          <td>{b.combined.clothes}</td>
                          <td>₹{b.combined.revenue.toFixed(0)}</td>
                          <td>₹{b.combined.outstanding.toFixed(0)}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            <div className="section-title-row" style={{ marginTop: 18, marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 700, color: 'var(--navy)' }}>Bills</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select
                  value={summarySource}
                  onChange={(e) => setSummarySource(e.target.value)}
                >
                  <option value="all">All Sources</option>
                  <option value="shop">Shop Counter only</option>
                  <option value="block_collection">Block Collection only</option>
                </select>
                <button
                  className="btn-danger"
                  style={{ width: 'auto', padding: '8px 14px', minHeight: 36 }}
                  onClick={() => setConfirmDeleteAll(true)}
                  disabled={summaryOffline || shownSummaryOrders.length === 0}
                  title={summaryOffline ? 'Reconnect to delete bills' : ''}
                >
                  🗑 Delete All Shown Bills
                </button>
              </div>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bill No</th>
                    <th>Source</th>
                    <th>Block / Room</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {summaryOrders
                    .filter((o) => summarySource === 'all' || o.source === summarySource)
                    .map((o) => (
                      <tr key={o.id}>
                        <td>{o.bill_number}</td>
                        <td>
                          <span className={`badge ${o.source}`}>
                            {o.source === 'block_collection' ? 'Block' : 'Shop'}
                          </span>
                        </td>
                        <td>
                          {o.block || '—'} {o.room_no || ''}
                        </td>
                        <td>₹{Number(o.total_amount).toFixed(0)}</td>
                        <td>
                          <span className={`badge ${o.order_status}`}>
                            {o.order_status}
                          </span>{' '}
                          <span className={`badge ${o.payment_status}`}>
                            {o.payment_status}
                            {o.payment_method ? ` (${o.payment_method.toUpperCase()})` : ''}
                          </span>
                        </td>
                        <td>{fmtDate(o.created_at)}</td>
                        <td>
                          <button
                            className="btn-danger"
                            style={{ padding: '8px 12px', minHeight: 36, flex: 'none' }}
                            onClick={() => setConfirmDeleteOrder(o)}
                            disabled={summaryOffline}
                            title={summaryOffline ? 'Reconnect to delete bills' : ''}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {summaryOrders && summaryOrders.length === 0 && (
          <p>No bills found for that period.</p>
        )}
        {!summaryOrders && (
          <p style={{ color: '#666' }}>
            Choose a period and tap "View Summary".
          </p>
        )}
      </div>

      {/* Summary stats */}
      {stats && (
        <div className="admin-section">
          <div className="section-title">Summary</div>
          <div className="split-row">
            <div className="split-card">
              <div className="label">Total orders ever</div>
              <div className="value">{stats.totalOrders}</div>
            </div>
            <div className="split-card">
              <div className="label">Total revenue ever</div>
              <div className="value">₹{stats.totalRevenue.toFixed(0)}</div>
            </div>
            <div className="split-card">
              <div className="label">Total outstanding</div>
              <div className="value">₹{stats.totalOutstanding.toFixed(0)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div className="admin-section">
        <div className="section-title">Clear Local Data</div>
        <p style={{ color: '#666' }}>
          Removes all locally buffered orders and counters on THIS tablet.
          Cloud data is not affected.
        </p>
        <button className="btn-danger" style={{ flex: 'none' }} onClick={confirmClearLocal}>
          {clearStep === 0
            ? 'Clear Local IndexedDB'
            : clearStep === 1
            ? 'Are you sure? Tap again'
            : 'Really clear? Final confirm'}
        </button>
        {clearStep > 0 && (
          <button
            className="btn-secondary"
            style={{ flex: 'none', marginLeft: 8 }}
            onClick={() => setClearStep(0)}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Delete bill confirmation */}
      {confirmDeleteOrder && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteOrder(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete bill “{confirmDeleteOrder.bill_number}”?</h3>
            <p>
              This permanently removes the bill and its items from the cloud
              database. This cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setConfirmDeleteOrder(null)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => deleteOrder(confirmDeleteOrder)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete ALL shown bills confirmation — bulk, admin-only */}
      {confirmDeleteAll && (
        <div className="modal-overlay" onClick={() => !deletingAll && setConfirmDeleteAll(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete {shownSummaryOrders.length} bill(s)?</h3>
            <p>
              This permanently deletes every bill currently shown —{' '}
              {summaryMode === 'day' && `for ${summaryDate}`}
              {summaryMode === 'month' && `for ${summaryMonth}`}
              {summaryMode === 'year' && `for ${summaryYear}`}
              {summaryMode === 'all' && 'across all time'}
              {summarySource !== 'all' &&
                (summarySource === 'shop' ? ', Shop Counter only' : ', Block Collection only')}
              . Total value: ₹
              {shownSummaryOrders
                .reduce((s, o) => s + Number(o.total_amount), 0)
                .toFixed(0)}
              . This cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setConfirmDeleteAll(false)}
                disabled={deletingAll}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={deleteAllShown}
                disabled={deletingAll}
              >
                {deletingAll ? 'Deleting…' : `Delete ${shownSummaryOrders.length} Bill(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete item confirmation */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete “{confirmDelete.name}”?</h3>
            <p>This removes it from the item catalogue on both tablets.</p>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button className="btn-danger" onClick={() => doDelete(confirmDelete)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
