import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { nextBillNumber, saveLocalOrder } from '../db.js';
import { syncNow } from '../sync.js';
import { useToast } from '../toast.jsx';

const BLOCKS = Array.from({ length: 26 }, (_, i) =>
  `${String.fromCharCode(65 + i)} Block`
);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewBill({ session, items, onBillGenerated }) {
  const isBlock = session.source === 'block_collection';
  const notify = useToast();

  const [serviceType, setServiceType] = useState('wash_iron');
  const [qtys, setQtys] = useState({}); // itemName -> quantity
  const [customItems, setCustomItems] = useState([]); // {item_name, rate, quantity}
  const [payment, setPayment] = useState(null); // 'paid' | 'unpaid'
  const [paymentMethod, setPaymentMethod] = useState(null); // 'cash' | 'upi'

  const [mobile, setMobile] = useState('');
  const [block, setBlock] = useState('');
  const [roomNo, setRoomNo] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(todayStr());
  const [pickupDate, setPickupDate] = useState(todayStr());
  const [dropbackDate, setDropbackDate] = useState('');
  const [workerNote, setWorkerNote] = useState('');

  const [showOthers, setShowOthers] = useState(false);
  const [othersName, setOthersName] = useState('');
  const [othersRate, setOthersRate] = useState('');
  const [busy, setBusy] = useState(false);

  const priceOf = (item) =>
    serviceType === 'wash_iron'
      ? Number(item.wash_iron_price)
      : Number(item.iron_only_price);

  // Regular catalogue items excluding the "Others" placeholder card.
  const gridItems = items.filter((i) => i.name !== 'Others');
  const othersItem = items.find((i) => i.name === 'Others');

  const setQty = (name, delta) =>
    setQtys((q) => {
      const next = Math.max(0, (q[name] || 0) + delta);
      return { ...q, [name]: next };
    });

  const lineItems = useMemo(() => {
    const fromGrid = gridItems
      .filter((i) => (qtys[i.name] || 0) > 0)
      .map((i) => {
        const rate = priceOf(i);
        const quantity = qtys[i.name];
        return {
          item_name: i.name,
          rate,
          quantity,
          line_total: rate * quantity,
        };
      });
    return [...fromGrid, ...customItems];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtys, customItems, serviceType, items]);

  const totalCount = lineItems.reduce((s, l) => s + l.quantity, 0);
  const grandTotal = lineItems.reduce((s, l) => s + l.line_total, 0);

  function addCustomItem() {
    const rate = Number(othersRate);
    if (!othersName.trim() || !(rate >= 0)) {
      notify('Enter a name and price', 'error');
      return;
    }
    setCustomItems((c) => [
      ...c,
      { item_name: othersName.trim(), rate, quantity: 1, line_total: rate },
    ]);
    setOthersName('');
    setOthersRate('');
    setShowOthers(false);
  }

  function resetForm() {
    setQtys({});
    setCustomItems([]);
    setPayment(null);
    setPaymentMethod(null);
    setMobile('');
    setBlock('');
    setRoomNo('');
    setDeliveryDate(todayStr());
    setPickupDate(todayStr());
    setDropbackDate('');
    setWorkerNote('');
  }

  async function generateBill() {
    if (lineItems.length === 0) {
      notify('Add at least one item', 'error');
      return;
    }
    if (!payment) {
      notify('Select PAID or UNPAID', 'error');
      return;
    }
    if (payment === 'paid' && !paymentMethod) {
      notify('Select Cash or UPI', 'error');
      return;
    }
    setBusy(true);
    try {
      const bill_number = await nextBillNumber(session.source);
      const order = {
        bill_number,
        block: block || null,
        room_no: roomNo || null,
        mobile: mobile || null,
        delivery_date: deliveryDate || null,
        service_type: serviceType,
        total_amount: grandTotal,
        order_status: 'pending',
        payment_status: payment,
        payment_method: payment === 'paid' ? paymentMethod : null,
        source: session.source,
        pickup_date: isBlock ? pickupDate || null : null,
        dropback_date: isBlock ? dropbackDate || null : null,
        worker_note: isBlock ? workerNote || null : null,
        created_at: new Date().toISOString(),
        items: lineItems,
      };

      // 1) Save to IndexedDB instantly.
      await saveLocalOrder(order);

      // 2) Attempt cloud sync in the background (never blocks printing).
      syncNow().catch(() => {
        notify('Saved locally — syncing when connected', 'info');
      });

      // 3) Open the print view immediately.
      notify('Bill saved', 'success');
      onBillGenerated(order);
      resetForm();
    } catch (err) {
      notify(err.message || 'Could not save bill', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <h2>New Bill — {isBlock ? 'Block Collection' : 'Shop Counter'}</h2>

      <div className="service-toggle">
        <button
          className={serviceType === 'wash_iron' ? 'active' : ''}
          onClick={() => setServiceType('wash_iron')}
        >
          Wash + Iron
        </button>
        <button
          className={serviceType === 'iron_only' ? 'active' : ''}
          onClick={() => setServiceType('iron_only')}
        >
          Iron Only
        </button>
      </div>

      <div className="field-grid">
        <div className="field">
          <label>Mobile</label>
          <input
            inputMode="numeric"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </div>
        <div className="field">
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
        <div className="field">
          <label>Room No</label>
          <input
            type="number"
            value={roomNo}
            onChange={(e) => setRoomNo(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Delivery Date</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
          />
        </div>

        {isBlock && (
          <>
            <div className="field">
              <label>Pickup Date</label>
              <input
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Dropback Date</label>
              <input
                type="date"
                value={dropbackDate}
                onChange={(e) => setDropbackDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Worker Note (optional)</label>
              <input
                value={workerNote}
                onChange={(e) => setWorkerNote(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className="item-grid">
        {gridItems.map((item) => {
          const qty = qtys[item.name] || 0;
          return (
            <div
              key={item.id}
              className={`item-card ${qty > 0 ? 'active' : ''}`}
            >
              <div className="item-name">{item.name}</div>
              <div className="item-price">₹{priceOf(item)}</div>
              <div className="qty-row">
                <button
                  className="qty-btn"
                  onClick={() => setQty(item.name, -1)}
                  aria-label={`decrease ${item.name}`}
                >
                  −
                </button>
                <span className="qty-display">{qty}</span>
                <button
                  className="qty-btn"
                  onClick={() => setQty(item.name, 1)}
                  aria-label={`increase ${item.name}`}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}

        {/* Others card — opens custom item popup */}
        <div className={`item-card ${customItems.length ? 'active' : ''}`}>
          <div className="item-name">Others</div>
          <div className="item-price">Custom item</div>
          <button
            className="btn-primary"
            style={{ minHeight: 48 }}
            onClick={() => setShowOthers(true)}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Custom items already added */}
      {customItems.length > 0 && (
        <div style={{ marginBottom: 100 }}>
          <div className="section-title">Custom items</div>
          {customItems.map((c, idx) => (
            <div key={idx} className="admin-item-row">
              <span>{c.item_name}</span>
              <span>₹{c.rate}</span>
              <span>Qty {c.quantity}</span>
              <button
                className="action-btn"
                onClick={() =>
                  setCustomItems((list) => list.filter((_, i) => i !== idx))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Sticky bottom bar */}
      <div className="bottom-bar">
        <div className="totals">
          {totalCount} items ·{' '}
          <span className="amount">₹{grandTotal.toFixed(0)}</span>
        </div>
        <button
          className={`pay-btn paid ${payment === 'paid' ? 'selected' : ''}`}
          onClick={() => setPayment('paid')}
        >
          PAID
        </button>
        <button
          className={`pay-btn unpaid ${payment === 'unpaid' ? 'selected' : ''}`}
          onClick={() => {
            setPayment('unpaid');
            setPaymentMethod(null);
          }}
        >
          UNPAID
        </button>
        {payment === 'paid' && (
          <>
            <button
              className={`pay-btn method ${paymentMethod === 'cash' ? 'selected' : ''}`}
              onClick={() => setPaymentMethod('cash')}
            >
              Cash
            </button>
            <button
              className={`pay-btn method ${paymentMethod === 'upi' ? 'selected' : ''}`}
              onClick={() => setPaymentMethod('upi')}
            >
              UPI
            </button>
          </>
        )}
        <button
          className="btn-generate"
          disabled={
            busy ||
            lineItems.length === 0 ||
            !payment ||
            (payment === 'paid' && !paymentMethod)
          }
          onClick={generateBill}
        >
          {busy ? 'Saving…' : 'Generate Bill'}
        </button>
      </div>

      {/* Others popup */}
      {showOthers && (
        <div className="modal-overlay" onClick={() => setShowOthers(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Custom Item</h3>
            <div className="field">
              <label>Item name</label>
              <input
                value={othersName}
                onChange={(e) => setOthersName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Price (₹)</label>
              <input
                type="number"
                value={othersRate}
                onChange={(e) => setOthersRate(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowOthers(false)}
              >
                Cancel
              </button>
              <button className="btn-primary" onClick={addCustomItem}>
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
