// Direct Bluetooth printing via the Web Bluetooth API — bypasses Chrome's
// print dialog entirely and streams raw ESC/POS bytes to the printer,
// exactly like the vendor's POS app does.
//
// Requirements: Chrome on Android (or desktop), HTTPS, Bluetooth ON.
// The printer must expose a BLE (Bluetooth Low Energy) channel — most
// budget 80mm printers (including MPT-III types) are dual-mode and do.

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

let cachedDevice = null;
let cachedCharacteristic = null;

export function bluetoothSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

async function findWritableCharacteristic(server) {
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
        return c;
      }
    }
  }
  return null;
}

async function connect() {
  // Reuse the previous connection when it is still alive.
  if (cachedDevice?.gatt?.connected && cachedCharacteristic) {
    return cachedCharacteristic;
  }

  // Reconnect to the previously chosen device without re-prompting.
  if (cachedDevice) {
    try {
      const server = await cachedDevice.gatt.connect();
      const c = await findWritableCharacteristic(server);
      if (c) {
        cachedCharacteristic = c;
        return c;
      }
    } catch {
      /* fall through to a fresh chooser */
    }
  }

  // Fresh pick — Chrome shows its device chooser; the worker selects the
  // printer (e.g. "MPT-III") once, after which we remember it.
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: CANDIDATE_SERVICES,
  });
  const server = await device.gatt.connect();
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

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Send an ESC/POS byte stream to the printer, chunked for BLE.
export async function printBytes(bytes) {
  if (!bluetoothSupported()) {
    throw new Error('Bluetooth printing needs Chrome with Bluetooth support.');
  }
  const characteristic = await connect();
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
