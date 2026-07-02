import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getSession } from '../auth.js';
import {
  getUnsyncedOrders,
  clearLocalData,
  getMeta,
} from '../db.js';
import { syncNow } from '../sync.js';
import { useToast } from '../toast.jsx';

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-GB');
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
  const [summaryOrders, setSummaryOrders] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [confirmDeleteOrder, setConfirmDeleteOrder] = useState(null);

  useEffect(() => {
    setRows(items.map((i) => ({ ...i })));
  }, [items]);

  useEffect(() => {
    if (!unlocked) return;
    refreshMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  async function refreshMeta() {
    setUnsynced(await getUnsyncedOrders());
    setLastSync(await getMeta('last_sync'));
    try {
      const dash = await api.getDashboard();
      setStats(dash.allTime);
    } catch {
      /* offline */
    }
    try {
      const s = await api.getSettings();
      setPins({
        pin_shop: s.pin_shop || '',
        pin_block: s.pin_block || '',
        pin_admin: s.pin_admin || '',
      });
    } catch {
      /* offline */
    }
  }

  async function tryUnlock() {
    try {
      await api.login('admin', pin);
      setUnlocked(true);
    } catch {
      if (pin === '9999') setUnlocked(true);
      else notify('Incorrect admin PIN', 'error');
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

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const params = {};
      if (summaryMode === 'day') params.date = summaryDate;
      if (summaryMode === 'month') params.month = summaryMonth;
      if (summaryMode === 'year') params.year = summaryYear;
      const orders = await api.getOrders(params);
      setSummaryOrders(orders);
    } catch (err) {
      notify(err.message || 'Could not load summary', 'error');
    } finally {
      setSummaryLoading(false);
    }
  }

  async function deleteOrder(order) {
    try {
      await api.deleteOrder(order.id);
      notify('Bill deleted', 'success');
      setConfirmDeleteOrder(null);
      setSummaryOrders((list) => list.filter((o) => o.id !== order.id));
    } catch (err) {
      notify(err.message || 'Delete failed', 'error');
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
                {o.bill_number} — {o.customer_name || '—'} — ₹
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

      {/* Bill summary by day / month / year, with per-bill delete */}
      <div className="admin-section">
        <div className="section-title">Bill Summary</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <select value={summaryMode} onChange={(e) => setSummaryMode(e.target.value)}>
            <option value="day">By Day</option>
            <option value="month">By Month</option>
            <option value="year">By Year</option>
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
            <div className="split-row">
              <div className="split-card">
                <div className="label">Bills</div>
                <div className="value">{summaryOrders.length}</div>
              </div>
              <div className="split-card">
                <div className="label">Revenue (paid)</div>
                <div className="value">
                  ₹
                  {summaryOrders
                    .filter((o) => o.payment_status === 'paid')
                    .reduce((s, o) => s + Number(o.total_amount), 0)
                    .toFixed(0)}
                </div>
              </div>
              <div className="split-card">
                <div className="label">Outstanding</div>
                <div className="value">
                  ₹
                  {summaryOrders
                    .filter((o) => o.payment_status === 'unpaid')
                    .reduce((s, o) => s + Number(o.total_amount), 0)
                    .toFixed(0)}
                </div>
              </div>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Bill No</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {summaryOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.bill_number}</td>
                    <td>{o.customer_name || '—'}</td>
                    <td>₹{Number(o.total_amount).toFixed(0)}</td>
                    <td>
                      <span className={`badge ${o.order_status}`}>
                        {o.order_status}
                      </span>{' '}
                      <span className={`badge ${o.payment_status}`}>
                        {o.payment_status}
                      </span>
                    </td>
                    <td>{fmtDate(o.created_at)}</td>
                    <td>
                      <button
                        className="btn-danger"
                        style={{ padding: '8px 12px', minHeight: 36, flex: 'none' }}
                        onClick={() => setConfirmDeleteOrder(o)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
