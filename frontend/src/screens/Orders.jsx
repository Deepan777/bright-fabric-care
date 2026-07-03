import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import {
  getLocalOrders,
  cacheCloudOrders,
  patchCachedOrder,
  getLastFetched,
} from '../db.js';
import { loadOrders } from '../dataSync.js';
import { useToast } from '../toast.jsx';

const FILTERS = [
  'All', 'Shop', 'Block', 'Pending', 'Ready', 'Delivered', 'Unpaid',
];

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-GB');
  } catch {
    return d;
  }
}

function fmtDateTime(d) {
  if (!d) return 'never';
  try {
    return new Date(d).toLocaleString('en-GB');
  } catch {
    return d;
  }
}

// Merge + dedup by bill_number, preferring the cloud copy (has a server id).
function mergeOrders(cloud, local) {
  const byBill = new Map();
  for (const o of cloud) {
    byBill.set(o.bill_number, { ...o, _synced: true });
  }
  for (const o of local) {
    if (!byBill.has(o.bill_number)) {
      byBill.set(o.bill_number, { ...o, _synced: o.synced === true });
    }
  }
  return Array.from(byBill.values()).sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
}

export default function Orders({ onReprint }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [paymentPrompt, setPaymentPrompt] = useState(null);
  const notify = useToast();

  // Loads instantly from the local cache. If the cache is more than a day
  // old, loadOrders() silently refreshes it in the background and the
  // onUpdate callback re-merges the view once fresh data lands.
  async function load() {
    setLoading(true);
    const cloud = await loadOrders(async (fresh) => {
      const local = await getLocalOrders();
      setOrders(mergeOrders(fresh, local));
      setLastUpdated(new Date().toISOString());
    });
    const local = await getLocalOrders();
    setOrders(mergeOrders(cloud, local));
    setLastUpdated(await getLastFetched('orders'));
    setLoading(false);
  }

  // Explicit, awaited refresh — for when a worker knows the connection is
  // good right now and wants to see the other tablet's bills immediately.
  async function refreshNow() {
    setRefreshing(true);
    try {
      const cloud = await api.getOrders();
      await cacheCloudOrders(cloud);
      const local = await getLocalOrders();
      setOrders(mergeOrders(cloud, local));
      setLastUpdated(new Date().toISOString());
      notify('Orders refreshed', 'success');
    } catch (err) {
      notify(err.message || 'Could not refresh — still offline', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let list = orders;
    switch (filter) {
      case 'Shop':
        list = list.filter((o) => o.source === 'shop');
        break;
      case 'Block':
        list = list.filter((o) => o.source === 'block_collection');
        break;
      case 'Pending':
        list = list.filter((o) => o.order_status === 'pending');
        break;
      case 'Ready':
        list = list.filter((o) => o.order_status === 'ready');
        break;
      case 'Delivered':
        list = list.filter((o) => o.order_status === 'delivered');
        break;
      case 'Unpaid':
        list = list.filter((o) => o.payment_status === 'unpaid');
        break;
      default:
        break;
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) =>
        [o.block, o.mobile, o.bill_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    return list;
  }, [orders, filter, search]);

  // Status/payment changes patch the cache + on-screen list directly the
  // instant the server confirms them — no need to wait for the next
  // scheduled daily refresh to see your own action take effect.
  async function updateStatus(order, status) {
    if (!order.id) {
      notify('Order not synced yet — try again after sync', 'info');
      return;
    }
    try {
      await api.setOrderStatus(order.id, status);
      await patchCachedOrder(order.id, { order_status: status });
      setOrders((list) =>
        list.map((o) => (o.id === order.id ? { ...o, order_status: status } : o))
      );
      notify('Status changed', 'success');
    } catch (err) {
      notify(err.message || 'Update failed', 'error');
    }
  }

  function markPaid(order) {
    if (!order.id) {
      notify('Order not synced yet — try again after sync', 'info');
      return;
    }
    setPaymentPrompt(order);
  }

  async function confirmMarkPaid(method) {
    const order = paymentPrompt;
    setPaymentPrompt(null);
    try {
      await api.setOrderPayment(order.id, 'paid', method);
      await patchCachedOrder(order.id, {
        payment_status: 'paid',
        payment_method: method,
      });
      setOrders((list) =>
        list.map((o) =>
          o.id === order.id
            ? { ...o, payment_status: 'paid', payment_method: method }
            : o
        )
      );
      notify('Payment marked', 'success');
    } catch (err) {
      notify(err.message || 'Update failed', 'error');
    }
  }

  return (
    <div className="screen">
      <h2>Orders</h2>

      <div className="section-title-row" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#666' }}>
          Updated: {fmtDateTime(lastUpdated)}
        </span>
        <button className="action-btn" onClick={refreshNow} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="filter-tabs">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={filter === f ? 'active' : ''}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <input
        className="search-bar"
        placeholder="Search by block, mobile, bill number"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading && <p>Loading orders…</p>}
      {!loading && filtered.length === 0 && <p>No orders found.</p>}

      {filtered.map((o) => (
        <div key={o.bill_number} className="order-row">
          <div
            className="row-head"
            onClick={() =>
              setExpanded(expanded === o.bill_number ? null : o.bill_number)
            }
          >
            <span className="bill-no">{o.bill_number}</span>
            {!o._synced && <span className="sync-dot" title="Not synced" />}
            <span className="meta">
              {o.block || ''} {o.room_no ? `· ${o.room_no}` : ''}
            </span>
            <span className="meta">₹{Number(o.total_amount).toFixed(0)}</span>
            <span className="meta">
              {o.service_type === 'iron_only' ? 'Iron Only' : 'Wash+Iron'}
            </span>
            <span className={`badge ${o.order_status}`}>{o.order_status}</span>
            <span className={`badge ${o.payment_status}`}>
              {o.payment_status}
              {o.payment_method ? ` (${o.payment_method.toUpperCase()})` : ''}
            </span>
            <span className={`badge ${o.source}`}>
              {o.source === 'block_collection' ? 'Block' : 'Shop'}
            </span>
            <span className="meta">{fmtDate(o.created_at)}</span>
          </div>

          {expanded === o.bill_number && (
            <div className="order-detail">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Rate</th>
                    <th>Qty</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(o.items || []).map((it, i) => (
                    <tr key={i}>
                      <td>{it.item_name}</td>
                      <td>₹{Number(it.rate).toFixed(0)}</td>
                      <td>{it.quantity}</td>
                      <td>₹{Number(it.line_total).toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="order-actions">
                <button
                  className="action-btn"
                  onClick={() => updateStatus(o, 'ready')}
                >
                  Mark Ready
                </button>
                <button
                  className="action-btn"
                  onClick={() => updateStatus(o, 'delivered')}
                >
                  Mark Delivered
                </button>
                {o.payment_status !== 'paid' && (
                  <button
                    className="action-btn solid"
                    onClick={() => markPaid(o)}
                  >
                    Mark Paid
                  </button>
                )}
                <button
                  className="action-btn"
                  onClick={() => onReprint(o)}
                >
                  Reprint
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {paymentPrompt && (
        <div className="modal-overlay" onClick={() => setPaymentPrompt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>How was {paymentPrompt.bill_number} paid?</h3>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => confirmMarkPaid('cash')}
              >
                Cash
              </button>
              <button
                className="btn-primary"
                onClick={() => confirmMarkPaid('upi')}
              >
                UPI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
