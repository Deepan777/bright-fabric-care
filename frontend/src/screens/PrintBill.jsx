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

export default function PrintBill({ order, onBack }) {
  const items = (order.items || []).filter((i) => i.quantity > 0);
  const blankRows = 5;
  const paid = order.payment_status === 'paid';

  return (
    <div className="print-screen">
      <div className="print-toolbar">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          🖨 Print
        </button>
      </div>

      <div className="bill">
        <div className="shop-name">THE BRIGHT FABRIC CARE</div>
        <div className="shop-sub">VIT Campus - Mens Hostel</div>
        <div className="receipt-title">CASH RECEIPT</div>

        <div className="bill-line">
          <span>No: {order.bill_number}</span>
        </div>
        <div className="bill-line">
          <span>Block: {order.block || '____'}</span>
          <span>Room No: {order.room_no || '____'}</span>
          <span>Date: {fmtDate(order.created_at)}</span>
        </div>
        <div className="bill-line">
          <span>Delivery Date: {fmtDate(order.delivery_date)}</span>
          <span>Time: {fmtTime(order.created_at)}</span>
        </div>
        <div className="bill-line">
          <span>Mobile Number: {order.mobile || '____________'}</span>
        </div>

        <div className="pay-status">
          Payment Status: {paid ? 'PAID ✓' : 'UNPAID ✗'}
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: '18%' }}>No of Linen</th>
              <th style={{ width: '42%' }}>Material</th>
              <th style={{ width: '18%' }}>Rate</th>
              <th style={{ width: '22%' }}>Total Amount Rs. Ps.</th>
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
            {Array.from({ length: blankRows }).map((_, i) => (
              <tr key={`blank-${i}`}>
                <td>&nbsp;</td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            ))}
            <tr className="total-row">
              <td></td>
              <td></td>
              <td className="num">Total</td>
              <td className="amt">
                {Number(order.total_amount).toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="footer">
          <span>Thank You Visit again.</span>
          <span>For The Bright Fabric Care</span>
        </div>
      </div>
    </div>
  );
}
