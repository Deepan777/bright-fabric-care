// Direct Bluetooth printing via the Web Bluetooth API — bypasses Chrome's
// print dialog entirely and streams raw ESC/POS bytes to the printer,
// exactly like the vendor's POS app does.
//
// Requirements: Chrome on Android (or desktop), HTTPS, Bluetooth ON.
// The printer must expose a BLE (Bluetooth Low Energy) channel — most
// budget 80mm printers (including MPT-III types) are dual-mode and do.
//
// Design goal: workers never see a Bluetooth chooser or a "Connect" button.
// An admin pairs the printer ONCE (pairPrinter, in Admin > Printer). After
// that, Chrome remembers the permission forever, so every later print just
// silently reconnects (autoConnect via navigator.bluetooth.getDevices())
// with no user gesture needed — staff just switch the printer on.

// Write-channel service UUIDs used by the common ESC/POS printer chipsets.
const CANDIDATE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // common ESC/POS BLE service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip transparent UART
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 style UART
  '0000ff00-0000-1000-8000-00805f9b34fb', // generic vendor UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // another common printer service
];

const CHUNK_SIZE = 100; // BLE writes must be small; chunk + pace the stream
const CHUNK_DELAY_MS = 20;
const CONNECT_TIMEOUT_MS = 7000;
const CONNECT_ATTEMPTS = 2; // per remembered device
const BETWEEN_COPIES_DELAY_MS = 700; // let the printer feed + cut before the next job

// Remembered service/characteristic UUIDs from the last successful connect —
// lets every reconnect skip the slow "enumerate every service" scan and go
// straight to the right one. This is the main fix for sluggish reconnects.
const LS_SERVICE = 'bt_printer_service_uuid';
const LS_CHAR = 'bt_printer_char_uuid';

let cachedDevice = null;
let cachedCharacteristic = null;

export function bluetoothSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

// Whether Chrome can silently reconnect (persistent permissions API). Most
// current Chrome on Android/desktop supports this; a handful of very old
// builds don't, in which case we fall back to always asking the admin to
// re-pair.
function canAutoReconnect() {
  return bluetoothSupported() && typeof navigator.bluetooth.getDevices === 'function';
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function findWritableCharacteristic(server) {
  // Fast path: the exact service/characteristic we found last time.
  const savedService = localStorage.getItem(LS_SERVICE);
  const savedChar = localStorage.getItem(LS_CHAR);
  if (savedService && savedChar) {
    try {
      const service = await server.getPrimaryService(savedService);
      const characteristic = await service.getCharacteristic(savedChar);
      if (characteristic.properties.writeWithoutResponse || characteristic.properties.write) {
        return characteristic;
      }
    } catch {
      /* printer changed or GATT table differs — fall through to a full scan */
    }
  }

  const services = await server.getPrimaryServices();
  for (const service of services) {
    let chars;
    try {
      chars = await service.getCharacteristics();
    } catch {
      continue;
    }
    for (const c of chars) {
      if (c.properties.writeWithoutResponse || c.properties.write) {
        localStorage.setItem(LS_SERVICE, service.uuid);
        localStorage.setItem(LS_CHAR, c.uuid);
        return c;
      }
    }
  }
  return null;
}

async function connectToDevice(device) {
  const server = await withTimeout(
    device.gatt.connect(),
    CONNECT_TIMEOUT_MS,
    'Could not reach the printer — is it switched on and nearby?'
  );
  const characteristic = await findWritableCharacteristic(server);
  if (!characteristic) {
    device.gatt.disconnect();
    throw new Error(
      'This printer does not offer a writable Bluetooth channel the browser can use.'
    );
  }
  device.addEventListener('gattserverdisconnected', () => {
    cachedCharacteristic = null;
  });
  cachedDevice = device;
  cachedCharacteristic = characteristic;
  return characteristic;
}

// ---- One-time setup (Admin only) ----
// Shows Chrome's device chooser. Meant to run once, on this tablet, by
// whoever sets it up — every print after this reconnects silently.
export async function pairPrinter() {
  if (!bluetoothSupported()) {
    throw new Error('This browser does not support Bluetooth printing.');
  }
  // Clear remembered UUIDs in case a different printer is being paired.
  localStorage.removeItem(LS_SERVICE);
  localStorage.removeItem(LS_CHAR);
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: CANDIDATE_SERVICES,
  });
  await connectToDevice(device);
  return device.name || 'Printer';
}

// True if a printer has been paired before on this device/browser — used
// to decide whether to attempt silent auto-printing at all.
export async function hasPairedPrinter() {
  if (!canAutoReconnect()) return false;
  try {
    const devices = await navigator.bluetooth.getDevices();
    return devices.length > 0;
  } catch {
    return false;
  }
}

export async function pairedPrinterName() {
  if (!canAutoReconnect()) return '';
  try {
    const devices = await navigator.bluetooth.getDevices();
    return devices[0]?.name || '';
  } catch {
    return '';
  }
}

// Removes the remembered printer so Admin can pair a replacement.
export async function forgetPrinter() {
  try {
    if (cachedDevice?.gatt?.connected) cachedDevice.gatt.disconnect();
    if (canAutoReconnect()) {
      const devices = await navigator.bluetooth.getDevices();
      for (const d of devices) {
        if (typeof d.forget === 'function') await d.forget();
      }
    }
  } catch {
    /* ignore */
  }
  cachedDevice = null;
  cachedCharacteristic = null;
  localStorage.removeItem(LS_SERVICE);
  localStorage.removeItem(LS_CHAR);
}

// Silently reconnects to the previously paired printer — no chooser, no
// button tap. This is what makes printing feel automatic.
async function autoConnect() {
  if (cachedDevice?.gatt?.connected && cachedCharacteristic) {
    return cachedCharacteristic;
  }
  if (cachedDevice) {
    try {
      return await connectToDevice(cachedDevice);
    } catch {
      /* fall through and look it up again below */
    }
  }
  if (!canAutoReconnect()) {
    throw new Error('No printer paired yet — ask an admin to pair it once in Admin > Bluetooth Printer.');
  }
  const devices = await navigator.bluetooth.getDevices();
  if (devices.length === 0) {
    throw new Error('No printer paired yet — ask an admin to pair it once in Admin > Bluetooth Printer.');
  }
  let lastErr;
  for (const device of devices) {
    for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt++) {
      try {
        return await connectToDevice(device);
      } catch (err) {
        lastErr = err;
        await delay(300);
      }
    }
  }
  throw lastErr || new Error('Could not reach the printer — is it switched on and nearby?');
}

// Best-effort, silent — call this early (app boot, screen open) so the BLE
// link is already warm by the time a bill needs printing. Never throws.
export async function warmUpPrinter() {
  if (!(await hasPairedPrinter())) return;
  try {
    await autoConnect();
  } catch {
    /* printer probably off/out of range — the real print attempt will retry */
  }
}

async function writeBytes(characteristic, bytes) {
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    await delay(CHUNK_DELAY_MS);
  }
}

// Send an ESC/POS byte stream to the printer, chunked for BLE.
export async function printBytes(bytes) {
  if (!bluetoothSupported()) {
    throw new Error('Bluetooth printing needs Chrome with Bluetooth support.');
  }
  const characteristic = await autoConnect();
  await writeBytes(characteristic, bytes);
}

// Every bill prints two copies — one for records, one for the customer.
// onProgress(1) fires before the first copy, onProgress(2) before the second.
export async function printTwice(bytes, onProgress) {
  onProgress?.(1);
  await printBytes(bytes);
  await delay(BETWEEN_COPIES_DELAY_MS);
  onProgress?.(2);
  await printBytes(bytes);
}
