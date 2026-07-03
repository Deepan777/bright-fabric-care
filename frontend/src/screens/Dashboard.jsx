import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { cacheDashboard, getLastFetched } from '../db.js';
import { loadDashboard } from '../dataSync.js';
import { useToast } from '../toast.jsx';

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

function dayLabel(d) {
  try {
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'short' });
  } catch {
    return '';
  }
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [paymentPrompt, setPaymentPrompt] = useState(null);
  const notify = useToast();

  // Shows cached stats instantly. If the cache is more than a day old,
  // loadDashboard() silently refreshes it in the background.
  async function load() {
    const cached = await loadDashboard((fresh) => {
      setData(fresh);
      setLastUpdated(new Date().toISOString());
    });
    if (cached) {
      setData(cached);
      setLastUpdated(await getLastFetched('dashboard'));
      setError(null);
      return;
    }
    // No cache at all yet (very first time Admin opens this) — one real fetch.
    try {
      const fresh = await api.getDashboard();
      await cacheDashboard(fresh);
      setData(fresh);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      setError(
        err.message || 'Could not load dashboard — connect to the internet once to load it.'
      );
    }
  }

  // Explicit, awaited refresh for when the admin wants current numbers now.
  async function refreshNow() {
    setRefreshing(true);
    try {
      const fresh = await api.getDashboard();
      await cacheDashboard(fresh);
      setData(fresh);
      setLastUpdated(new Date().toISOString());
      setError(null);
      notify('Dashboard refreshed', 'success');
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

  async function confirmMarkPaid(method) {
    const order = paymentPrompt;
    setPaymentPrompt(null);
    try {
      await api.setOrderPayment(order.id, 'paid', method);
      notify('Payment marked', 'success');
      refreshNow(); // stats changed — worth an immediate real refresh
    } catch (err) {
      notify(err.message || 'Update failed', 'error');
    }
  }

  function exportCsv() {
    // Uses the backend endpoint; browser handles the download.
    window.open(api.exportCsvUrl(), '_blank');
  }

  if (error) {
    return (
      <div className="screen">
        <h2>Dashboard</h2>
        <p>{error}</p>
        <button className="btn-primary" style={{ width: 'auto' }} onClick={load}>
          Try Again
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="screen">
        <h2>Dashboard</h2>
        <p>Loading…</p>
      </div>
    );
  }

  const maxRev = Math.max(1, ...data.last7Days.map((d) => d.revenue));

  return (
    <div className="screen">
      <h2>Dashboard</h2>

      <div className="section-title-row" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#666' }}>
          Updated: {fmtDateTime(lastUpdated)}
        </span>
        <button className="action-btn" onClick={refreshNow} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-label">Today Revenue (paid)</div>
          <div className="stat-value">₹{data.today.revenue.toFixed(0)}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Today Orders</div>
          <div className="stat-value">{data.today.orders}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Today Clothes</div>
          <div className="stat-value">{data.today.clothes}</div>
        </div>
        <div className="stat-card orange">
          <div className="stat-label">Outstanding Amount</div>
          <div className="stat-value">₹{data.outstanding.toFixed(0)}</div>
        </div>
      </div>

      <div className="split-row">
        <div className="split-card">
          <div className="label">Shop total (today, paid)</div>
          <div className="value">₹{data.today.shopRevenue.toFixed(0)}</div>
        </div>
        <div className="split-card">
          <div className="label">Block Collection (today, paid)</div>
          <div className="value">₹{data.today.blockRevenue.toFixed(0)}</div>
        </div>
        <div className="split-card">
          <div className="label">This week (paid)</div>
          <div className="value">₹{data.weekRevenue.toFixed(0)}</div>
        </div>
        <div className="split-card">
          <div className="label">This month (paid)</div>
          <div className="value">₹{data.monthRevenue.toFixed(0)}</div>
        </div>
      </div>

      <div className="section-title">Last 7 Days Revenue</div>
      <div className="bar-chart">
        {data.last7Days.map((d) => (
          <div className="bar-col" key={d.day}>
            <div className="bar-value">₹{d.revenue.toFixed(0)}</div>
            <div
              className="bar"
              style={{ height: `${(d.revenue / maxRev) * 100}%` }}
            />
            <div className="bar-label">{dayLabel(d.day)}</div>
          </div>
        ))}
      </div>

      <div className="section-title">Unpaid Orders</div>
      {data.unpaidOrders.length === 0 ? (
        <p>No unpaid orders 🎉</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Block</th>
                <th>Room</th>
                <th>Amount</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.unpaidOrders.map((o) => (
                <tr key={o.id}>
                  <td>{o.block || ''}</td>
                  <td>{o.room_no || ''}</td>
                  <td>₹{Number(o.total_amount).toFixed(0)}</td>
                  <td>{fmtDate(o.created_at)}</td>
                  <td>
                    <button
                      className="action-btn solid"
                      onClick={() => setPaymentPrompt(o)}
                    >
                      Mark Paid
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-title section-title-row">
        <span>All-time totals</span>
        <button className="btn-primary" style={{ width: 'auto' }} onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <div className="split-row">
        <div className="split-card">
          <div className="label">Total orders ever</div>
          <div className="value">{data.allTime.totalOrders}</div>
        </div>
        <div className="split-card">
          <div className="label">Total revenue ever</div>
          <div className="value">₹{data.allTime.totalRevenue.toFixed(0)}</div>
        </div>
        <div className="split-card">
          <div className="label">Total outstanding</div>
          <div className="value">₹{data.allTime.totalOutstanding.toFixed(0)}</div>
        </div>
      </div>

      {paymentPrompt && (
        <div className="modal-overlay" onClick={() => setPaymentPrompt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>How was this bill paid?</h3>
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
