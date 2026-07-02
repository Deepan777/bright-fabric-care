import { useState } from 'react';
import { api } from '../api.js';

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-GB');
  } catch {
    return d;
  }
}

// Public page — no login required. A customer enters their bill number and
// mobile number (both must match) to see their order status.
export default function TrackOrder() {
  const [billNumber, setBillNumber] = useState('');
  const [mobile, setMobile] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function check() {
    setError('');
    setResult(null);
    if (!billNumber.trim() || !mobile.trim()) {
      setError('Enter both bill number and mobile number');
      return;
    }
    setBusy(true);
    try {
      const order = await api.trackOrder(billNumber.trim(), mobile.trim());
      setResult(order);
    } catch (err) {
      setError(err.message || 'Order not found');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <h1>The Bright Fabric Care</h1>
      <div className="sub">Check your laundry status</div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>Bill Number</label>
        <input
          placeholder="e.g. SHOP-0001"
          value={billNumber}
          onChange={(e) => setBillNumber(e.target.value.toUpperCase())}
        />
      </div>
      <div className="field" style={{ marginBottom: 20 }}>
        <label>Mobile Number</label>
        <input
          inputMode="numeric"
          placeholder="10-digit mobile number"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
          onKeyDown={(e) => e.key === 'Enter' && check()}
        />
      </div>

      <button className="btn-primary" onClick={check} disabled={busy}>
        {busy ? 'Checking…' : 'Check Status'}
      </button>

      {error && (
        <p style={{ color: '#c62828', fontWeight: 600, marginTop: 16 }}>{error}</p>
      )}

      {result && (
        <div className="order-row" style={{ marginTop: 20, textAlign: 'left' }}>
          <div className="row-head">
            <span className="bill-no">{result.bill_number}</span>
            <span className={`badge ${result.order_status}`}>
              {result.order_status}
            </span>
            <span className={`badge ${result.payment_status}`}>
              {result.payment_status}
            </span>
          </div>
          <p style={{ marginTop: 10 }}>
            <strong>{result.customer_name || 'Customer'}</strong>
            <br />
            {result.block ? `${result.block} · Room ${result.room_no || ''}` : ''}
          </p>
          <p>
            Service: {result.service_type === 'iron_only' ? 'Iron Only' : 'Wash + Iron'}
          </p>
          <p>Delivery Date: {fmtDate(result.delivery_date)}</p>
          <p>Total Amount: ₹{Number(result.total_amount).toFixed(0)}</p>
        </div>
      )}
    </div>
  );
}
