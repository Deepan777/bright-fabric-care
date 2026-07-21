import { useEffect, useRef, useState } from 'react';
import { buildReceiptBytes } from '../escpos.js';
import { printTwice, bluetoothSupported, hasPairedPrinter } from '../btPrint.js';
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
// Prints automatically the moment this screen opens — no button tap, no
// Bluetooth chooser. Workers just need the printer switched on; pairing
// happens once, in advance, from Admin > Bluetooth Printer. Every bill
// prints 2 copies (records + customer).
export default function PrintBill({ order, onBack }) {
  const items = (order.items || []).filter((i) => i.quantity > 0);
  const paid = order.payment_status === 'paid';
  // status: idle | checking | unpaired | connecting | printing | done | error | unavailable
  const [status, setStatus] = useState('idle');
  const [copyNum, setCopyNum] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const notify = useToast();
  const startedOnce = useRef(false);

  async function runAutoPrint() {
    if (!bluetoothSupported()) {
      setStatus('unavailable');
      return;
    }
    setStatus('checking');
    const paired = await hasPairedPrinter();
    if (!paired) {
      setStatus('unpaired');
      return;
    }
    setStatus('connecting');
    try {
      await printTwice(buildReceiptBytes(order), (n) => {
        setCopyNum(n);
        setStatus('printing');
      });
      setStatus('done');
      notify('Printed 2 copies', 'success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Printing failed');
    }
  }

  useEffect(() => {
    if (startedOnce.current) return;
    startedOnce.current = true;
    runAutoPrint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="print-screen">
      <div className="print-toolbar">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>

        {(status === 'checking' || status === 'connecting') && (
          <div className="print-status connecting">🔄 Connecting to printer…</div>
        )}
        {status === 'printing' && (
          <div className="print-status connecting">
            🖨 Printing copy {copyNum} of 2…
          </div>
        )}
        {status === 'done' && (
          <div className="print-status done">✅ Printed — 2 copies done</div>
        )}
        {status === 'error' && (
          <div className="print-status error">
            ⚠ Printer not found. Switch it on, keep it nearby, and tap Retry.
          </div>
        )}
        {status === 'unpaired' && (
          <div className="print-status error">
            ⚠ Printer not set up yet. Ask Admin to pair it once (Admin &gt; Bluetooth Printer).
          </div>
        )}

        {(status === 'error' || status === 'done') && (
          <button className="btn-primary" onClick={runAutoPrint}>
            🖨 {status === 'done' ? 'Print Again' : 'Retry'}
          </button>
        )}

        {/* Always-available fallback — opens the system print dialog
            (works with a USB-connected printer, no Bluetooth needed). */}
        <button className="btn-secondary" onClick={() => window.print()}>
          Print via USB
        </button>
      </div>

      {errorMsg && status === 'error' && (
        <p style={{ color: '#666', fontSize: 13, marginTop: -8, marginBottom: 8 }}>
          {errorMsg}
        </p>
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
