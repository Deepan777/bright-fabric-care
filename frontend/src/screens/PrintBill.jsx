import { useEffect, useRef, useState } from 'react';
import { buildReceiptBytes } from '../escpos.js';
import { printViaRawBT, doubleCopies, preferRawBT } from '../rawbt.js';
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

// 80mm thermal receipt layout. Block/Room No are enlarged since workers
// scan them at a glance, and the bill always prints at least 8 inches long
// regardless of item count — see .bill-spacer / min-height in styles.css.
//
// Printing is automatic on Android: the moment this screen opens it hands
// the receipt (2 copies) to the RawBT app, which relays it to the Bluetooth
// printer. Staff never connect anything — they just keep the printer on.
// A big "Print Again" button is always there in case they need another copy
// or the printer was off. On Windows/desktop it falls back to the browser's
// system print dialog for the USB printer.
export default function PrintBill({ order, onBack }) {
  const items = (order.items || []).filter((i) => i.quantity > 0);
  const paid = order.payment_status === 'paid';
  // On the counter tablets/phones the thermal (RawBT) printer is the main
  // path; only a genuine desktop with a USB printer uses the system dialog.
  const useBluetooth = preferRawBT();
  const [sent, setSent] = useState(false);
  const notify = useToast();
  const autoFired = useRef(false);

  // One RawBT job containing both copies (records + customer).
  function sendToPrinter() {
    printViaRawBT(doubleCopies(buildReceiptBytes(order)));
    setSent(true);
    notify('Sent to printer', 'success');
  }

  useEffect(() => {
    if (!useBluetooth || autoFired.current) return;
    autoFired.current = true;
    // Let the receipt paint first, then hand off to RawBT. The hand-off
    // rides the "Generate Bill" tap's activation, so Android allows it.
    const t = setTimeout(() => {
      printViaRawBT(doubleCopies(buildReceiptBytes(order)));
      setSent(true);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="print-screen">
      <div className="print-toolbar">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>

        {useBluetooth ? (
          <>
            {/* The one main action on a counter device: straight to the
                Bluetooth thermal printer via RawBT — never the system dialog. */}
            <button className="btn-primary btn-print-big" onClick={sendToPrinter}>
              🖨 {sent ? 'Print Again' : 'Print 2 Copies'}
            </button>
          </>
        ) : (
          <button className="btn-primary btn-print-big" onClick={() => window.print()}>
            🖨 Print
          </button>
        )}
      </div>

      {useBluetooth && sent && (
        <div className="print-status done">
          ✅ Sent 2 copies to the printer. If nothing came out, switch the
          printer on and tap “Print Again”.
        </div>
      )}

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
