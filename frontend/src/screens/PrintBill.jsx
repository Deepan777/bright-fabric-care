import { useState } from 'react';
import { buildReceiptBytes } from '../escpos.js';
import { printBytes, bluetoothSupported } from '../btPrint.js';
import { useToast } from '../toast.jsx';

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-GB');
  } catch {
    return d;
  }
}

function fmtTime(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// 80mm thermal receipt layout (Helett BillQuick Lite USB printer).
// Block/Room No are enlarged since workers scan them at a glance, and the
// bill always prints at least 8 inches long regardless of item count —
// see .bill-spacer / min-height in styles.css.
export default function PrintBill({ order, onBack }) {
  const items = (order.items || []).filter((i) => i.quantity > 0);
  const paid = order.payment_status === 'paid';
  const [btBusy, setBtBusy] = useState(false);
  const notify = useToast();

  // Streams raw ESC/POS bytes straight to the Bluetooth printer — no
  // Chrome print dialog involved. First tap shows the device chooser
  // (pick the printer, e.g. "MPT-III"); after that it reconnects silently.
  async function bluetoothPrint() {
    setBtBusy(true);
    try {
      await printBytes(buildReceiptBytes(order));
      notify('Sent to printer', 'success');
    } catch (err) {
      if (err?.name === 'NotFoundError') {
        notify('No printer selected', 'info');
      } else {
        notify(err.message || 'Bluetooth print failed', 'error');
      }
    } finally {
      setBtBusy(false);
    }
  }

  return (
    <div className="print-screen">
      <div className="print-toolbar">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          🖨 Print
        </button>
        {bluetoothSupported() && (
          <button
            className="btn-primary"
            onClick={bluetoothPrint}
            disabled={btBusy}
          >
            {btBusy ? 'Sending…' : '📶 Bluetooth Print'}
          </button>
        )}
      </div>

      <div className="bill">
        <div className="shop-name">THE BRIGHT FABRIC CARE</div>
        <div className="shop-sub">VIT Campus - Mens Hostel</div>

        <div className="bill-rule" />
        <div className="receipt-title">CASH RECEIPT</div>
        <div className="bill-rule" />

        <div className="bill-field">
          Bill No: <strong>{order.bill_number}</strong>
        </div>

        <div className="bill-highlight">Block: {order.block || '____'}</div>
        <div className="bill-highlight">Room No: {order.room_no || '____'}</div>

        <div className="bill-field">Date: {fmtDate(order.created_at)}</div>
        <div className="bill-field">
          Delivery: {fmtDate(order.delivery_date)}  Time: {fmtTime(order.created_at)}
        </div>
        <div className="bill-field">
          Mobile: {order.mobile || '____________'}
        </div>

        <div className="bill-rule" />

        <div className={`pay-status-box ${paid ? 'paid' : 'unpaid'}`}>
          PAYMENT: {paid ? 'PAID ✓' : 'UNPAID ✗'}
          {paid && order.payment_method ? ` (${order.payment_method.toUpperCase()})` : ''}
        </div>

        <div className="bill-rule" />

        <table>
          <thead>
            <tr>
              <th style={{ width: '14%' }}>Qty</th>
              <th style={{ width: '46%' }}>Material</th>
              <th style={{ width: '18%' }}>Rate</th>
              <th style={{ width: '22%' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="num">{it.quantity}</td>
                <td>{it.item_name}</td>
                <td className="num">{Number(it.rate).toFixed(0)}</td>
                <td className="amt">{Number(it.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bill-rule" />

        <div className="total-line">
          <span>Total</span>
          <span>Rs. {Number(order.total_amount).toFixed(2)}</span>
        </div>

        <div className="bill-rule" />

        <div className="bill-spacer" />

        <div className="footer">
          <div>Thank You! Visit again.</div>
          <div>For The Bright Fabric Care</div>
        </div>
      </div>
    </div>
  );
}
