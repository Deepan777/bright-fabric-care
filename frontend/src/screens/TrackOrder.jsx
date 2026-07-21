import { useState } from 'react';
import { api } from '../api.js';
import { BLOCKS } from '../blocks.js';

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-GB');
  } catch {
    return d;
  }
}

// Public page — no login required. A customer enters the same block + room
// number they gave when dropping off laundry to see their order status.
export default function TrackOrder() {
  const [block, setBlock] = useState('');
  const [roomNo, setRoomNo] = useState('');
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function check() {
    setError('');
    setOrders(null);
    if (!block || !roomNo.trim()) {
      setError('Select your block and enter your room number');
      return;
    }
    setBusy(true);
    try {
      const result = await api.trackOrders(block, roomNo.trim());
      setOrders(result);
    } catch (err) {
      setError(err.message || 'No orders found');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <h1>The Bright Fabric Care</h1>
      <div className="sub">Check your laundry status</div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>Block</label>
        <select value={block} onChange={(e) => setBlock(e.target.value)}>
          <option value="">Select block</option>
          {BLOCKS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 20 }}>
        <label>Room No</label>
        <input
          inputMode="numeric"
          placeholder="e.g. 101"
          value={roomNo}
          onChange={(e) => setRoomNo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && check()}
        />
      </div>

      <button className="btn-primary" onClick={check} disabled={busy}>
        {busy ? 'Checking…' : 'Check Status'}
      </button>

      {error && (
        <p style={{ color: '#c62828', fontWeight: 600, marginTop: 16 }}>{error}</p>
      )}

      {orders && (
        <div style={{ marginTop: 20, textAlign: 'left' }}>
          {orders.map((o) => (
            <div className="order-row" key={o.bill_number}>
              <div className="row-head">
                <span className="bill-no">{o.bill_number}</span>
                <span className={`badge ${o.order_status}`}>{o.order_status}</span>
                <span className={`badge ${o.payment_status}`}>
                  {o.payment_status}
                </span>
              </div>
              <p style={{ marginTop: 10 }}>
                Service: {o.service_type === 'iron_only' ? 'Iron Only' : 'Wash + Iron'}
              </p>
              <p>Delivery Date: {fmtDate(o.delivery_date)}</p>
              <p>Total Amount: ₹{Number(o.total_amount).toFixed(0)}</p>
              <p style={{ color: '#666', fontSize: 14 }}>
                Placed: {fmtDate(o.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
