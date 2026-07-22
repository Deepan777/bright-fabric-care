import { useEffect, useRef, useState } from 'react';
import { buildReceiptBytes } from '../escpos.js';
import { printViaRawBT, doubleCopies, preferRawBT } from '../rawbt.js';
import { isNativeApp, btPrint, getSelectedPrinter } from '../native.js';
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
// Printing path:
//   • Installed app (native): connects straight to the paired Bluetooth
//     printer and prints 2 copies directly — no other app, no dialog.
//   • Plain website on a tablet: hands off to RawBT.
//   • Desktop browser: the system print dialog for a USB printer.
export default function PrintBill({ order, onBack }) {
  const items = (order.items || []).filter((i) => i.quantity > 0);
  const paid = order.payment_status === 'paid';
  const native = isNativeApp();
  // Web fallbacks (only used when NOT the installed app).
  const useBluetooth = preferRawBT();
  const [sent, setSent] = useState(false);
  // Native print status: idle | printing | done | error
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const notify = useToast();
  const autoFired = useRef(false);

  // Both copies (records + customer) in one connect-write-close.
  function twoCopyBytes() {
    return doubleCopies(buildReceiptBytes(order));
  }

  // Direct native print — connects to the paired printer and writes the bytes.
  async function nativePrint() {
    setStatus('printing');
    setErrorMsg('');
    try {
      await btPrint(twoCopyBytes());
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err?.message || 'Could not print');
    }
  }

  // RawBT hand-off (plain website on a tablet).
  function rawbtPrint() {
    printViaRawBT(twoCopyBytes());
    setSent(true);
    notify('Sent to printer', 'success');
  }

  useEffect(() => {
    if (autoFired.current) return;
    autoFired.current = true;
    if (native) {
      nativePrint();
      return;
    }
    if (useBluetooth) {
      // Let the receipt paint first, then hand off to RawBT.
      const t = setTimeout(() => {
        printViaRawBT(twoCopyBytes());
        setSent(true);
      }, 350);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noPrinter = native && !getSelectedPrinter();

  return (
    <div className="print-screen">
      <div className="print-toolbar">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>

        {native ? (
          <button
            className="btn-primary btn-print-big"
            onClick={nativePrint}
            disabled={status === 'printing'}
          >
            🖨{' '}
            {status === 'printing'
              ? 'Printing…'
              : status === 'done'
              ? 'Print Again'
              : 'Print 2 Copies'}
          </button>
        ) : useBluetooth ? (
          <button className="btn-primary btn-print-big" onClick={rawbtPrint}>
            🖨 {sent ? 'Print Again' : 'Print 2 Copies'}
          </button>
        ) : (
          <button className="btn-primary btn-print-big" onClick={() => window.print()}>
            🖨 Print
          </button>
        )}
      </div>

      {native && noPrinter && (
        <div className="print-status error">
          ⚠ No printer chosen on this device yet. Open Admin &gt; Printer Setup
          and pick the printer once.
        </div>
      )}
      {native && status === 'printing' && (
        <div className="print-status connecting">🖨 Printing 2 copies…</div>
      )}
      {native && status === 'done' && (
        <div className="print-status done">✅ Printed 2 copies.</div>
      )}
      {native && status === 'error' && (
        <div className="print-status error">
          ⚠ {errorMsg}. Switch the printer on, keep it nearby, and tap
          “Print Again”.
        </div>
      )}
      {!native && useBluetooth && sent && (
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
