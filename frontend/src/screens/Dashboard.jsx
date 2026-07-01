import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../toast.jsx';

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-GB');
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
  const notify = useToast();

  async function load() {
    try {
      setData(await api.getDashboard());
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not load dashboard');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markPaid(id) {
    try {
      await api.setOrderPayment(id, 'paid');
      notify('Payment marked', 'success');
      load();
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
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
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
                <td>{o.customer_name || '—'}</td>
                <td>{o.block || ''}</td>
                <td>{o.room_no || ''}</td>
                <td>₹{Number(o.total_amount).toFixed(0)}</td>
                <td>{fmtDate(o.created_at)}</td>
                <td>
                  <button
                    className="action-btn solid"
                    onClick={() => markPaid(o.id)}
                  >
                    Mark Paid
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div
        className="section-title"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
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
    </div>
  );
}
