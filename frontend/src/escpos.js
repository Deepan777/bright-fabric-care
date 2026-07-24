// Builds the raw ESC/POS byte stream for the receipt — the command language
// thermal printers (like the PSF80B) understand natively over Bluetooth.
// 80mm paper = 48 characters per line in the standard font, 24 when
// double-width. ASCII only: thermal printers don't have the ₹ glyph in
// their default codepage, so amounts are printed as "Rs.".

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const COLS = 48; // normal font columns on 80mm paper
const COLS_WIDE = 24; // columns when double-width is on

// Target minimum receipt length: 6 inches. A normal text line advances the
// paper ~30/203 inch, so ~41 normal lines ≈ 6in. Double-height lines count
// as 2 units.
const MIN_LINE_UNITS = 41;

function ascii(value) {
  return String(value ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[✓]/g, '')
    .replace(/[✗]/g, 'X')
    .replace(/[^\x20-\x7e]/g, '');
}

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-GB');
  } catch {
    return String(d);
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

export function buildReceiptBytes(order) {
  const bytes = [];
  let lineUnits = 0;

  const push = (...vals) => bytes.push(...vals);
  const pushText = (s) => {
    for (const ch of ascii(s)) push(ch.charCodeAt(0));
  };

  // Style helpers
  const alignCenter = () => push(ESC, 0x61, 1);
  const alignLeft = () => push(ESC, 0x61, 0);
  const boldOn = () => push(ESC, 0x45, 1);
  const boldOff = () => push(ESC, 0x45, 0);
  const doubleOn = () => push(GS, 0x21, 0x11); // double width + height
  const doubleOff = () => push(GS, 0x21, 0x00);
  // Double height only (width unchanged) — makes the items table rows
  // taller/easier to read without doubling character width, so the 48-col
  // padding below still lines up correctly on paper.
  const heightOn = () => push(GS, 0x21, 0x01);

  const line = (s = '') => {
    pushText(s);
    push(LF);
    lineUnits += 1;
  };
  const bigLine = (s = '') => {
    pushText(s);
    push(LF);
    lineUnits += 2;
  };
  const divider = () => line('-'.repeat(COLS));

  const padRight = (s, n) => {
    s = ascii(s);
    return s.length > n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
  };
  const padLeft = (s, n) => {
    s = ascii(s);
    return s.length > n ? s.slice(0, n) : ' '.repeat(n - s.length) + s;
  };

  // --- Header ---
  push(ESC, 0x40); // initialise printer
  alignCenter();
  doubleOn();
  boldOn();
  bigLine('THE BRIGHT');
  bigLine('FABRIC CARE');
  doubleOff();
  boldOff();
  line('VIT Campus - Mens Hostel');
  divider();
  boldOn();
  line('CASH RECEIPT');
  boldOff();
  divider();

  // --- Bill details ---
  alignLeft();
  boldOn();
  line(`Bill No: ${order.bill_number}`);
  boldOff();

  // Block + Room in large text — the fields workers read at a glance.
  doubleOn();
  boldOn();
  bigLine(`Block: ${order.block || '____'}`);
  bigLine(`Room No: ${order.room_no || '____'}`);
  doubleOff();
  boldOff();

  line(`Date: ${fmtDate(order.created_at)}  Time: ${fmtTime(order.created_at)}`);
  line(`Delivery: ${fmtDate(order.delivery_date)}`);
  line(`Mobile: ${order.mobile || '____________'}`);
  divider();

  // --- Payment status ---
  const paid = order.payment_status === 'paid';
  const method =
    paid && order.payment_method ? ` (${order.payment_method.toUpperCase()})` : '';
  alignCenter();
  doubleOn();
  boldOn();
  bigLine(paid ? `PAID${method}` : 'UNPAID');
  doubleOff();
  boldOff();
  divider();

  // --- Items table ---
  alignLeft();
  boldOn();
  line(padRight('Qty', 4) + padRight('Material', 24) + padLeft('Rate', 8) + padLeft('Amount', 12));
  boldOff();
  divider();

  const items = (order.items || []).filter((i) => i.quantity > 0);
  const totalClothes = items.reduce((s, it) => s + Number(it.quantity), 0);
  heightOn();
  for (const it of items) {
    bigLine(
      padRight(String(it.quantity), 4) +
        padRight(it.item_name, 24) +
        padLeft(Number(it.rate).toFixed(0), 8) +
        padLeft(Number(it.line_total).toFixed(2), 12)
    );
  }
  doubleOff();
  divider();

  // --- Total ---
  boldOn();
  line(`Total Clothes: ${totalClothes}`);
  boldOff();
  doubleOn();
  boldOn();
  bigLine(`TOTAL  Rs.${Number(order.total_amount).toFixed(2)}`);
  doubleOff();
  boldOff();
  divider();

  // --- Footer ---
  alignCenter();
  line('Thank You! Visit again.');
  line('For The Bright Fabric Care');

  // Pad the receipt to the 8-inch minimum length.
  while (lineUnits < MIN_LINE_UNITS) {
    push(LF);
    lineUnits += 1;
  }

  // Feed past the tear line, then cut.
  push(ESC, 0x64, 4); // feed 4 lines
  push(GS, 0x56, 0x42, 0x00); // partial cut

  return new Uint8Array(bytes);
}
