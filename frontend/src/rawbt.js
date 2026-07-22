// Printing via RawBT — the reliable path for the shop's thermal printer.
//
// Why RawBT and not Web Bluetooth: the MPT-III / PSF80B is a *Classic*
// Bluetooth (SPP) printer. The browser's Web Bluetooth API only speaks
// Bluetooth *Low Energy*, so it can't even see this printer — which is why
// direct browser printing kept failing. RawBT is a tiny free Android app
// that receives our raw ESC/POS bytes and relays them over Android's own
// Bluetooth stack. Because Android remembers the OS-level pairing, the
// printer auto-reconnects the instant it is switched on — no per-print
// setup, exactly the hands-off behaviour the counter staff need.
//
// Format (from the canonical mike42/escpos-php RawbtPrintConnector):
//   intent:base64,<BASE64>#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;
// We also add a browser_fallback_url so a device that doesn't have RawBT
// yet is sent to the Play Store to install it once.

const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=' + RAWBT_PACKAGE;

export function isAndroid() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

// Uint8Array -> base64, chunked so large receipts don't blow the call stack.
function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Hands the ESC/POS byte stream to RawBT. Fire-and-forget: the Android
// intent system takes over from here, so there is no success callback to
// await — the printer either prints (RawBT is installed + printer on) or
// RawBT shows its own on-screen message.
export function printViaRawBT(bytes) {
  const base64 = bytesToBase64(bytes);
  const fallback = encodeURIComponent(PLAY_STORE_URL);
  const url =
    'intent:base64,' +
    base64 +
    '#Intent;scheme=rawbt;package=' +
    RAWBT_PACKAGE +
    ';S.browser_fallback_url=' +
    fallback +
    ';end;';
  window.location.href = url;
}

// Doubles a receipt into a single print job — one copy for the shop's
// records, one for the customer — so both come out of one cut-to-cut run.
export function doubleCopies(bytes) {
  const out = new Uint8Array(bytes.length * 2);
  out.set(bytes, 0);
  out.set(bytes, bytes.length);
  return out;
}

// A tiny receipt used by Admin's "Print Test Receipt" button to confirm the
// RawBT + printer chain works before the counter goes live.
export function testPrintBytes() {
  const ESC = 0x1b;
  const GS = 0x1d;
  const LF = 0x0a;
  const bytes = [ESC, 0x40, ESC, 0x61, 0x01]; // init + centre
  const text = 'THE BRIGHT FABRIC CARE\nPrinter test - OK\n\n\n';
  for (const ch of text) bytes.push(ch.charCodeAt(0));
  bytes.push(ESC, 0x64, 0x03); // feed 3 lines
  bytes.push(GS, 0x56, 0x42, 0x00); // partial cut
  return new Uint8Array(bytes);
}
