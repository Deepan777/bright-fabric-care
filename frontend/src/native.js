// Bridge to the installed Android app's native Bluetooth printer.
//
// The exact same web bundle powers both the plain website (PWA) and the
// installed app. Inside the app, Capacitor injects `window.Capacitor`, so
// `isNativeApp()` is true and these calls reach the native BluetoothPrinter
// plugin (android/.../BluetoothPrinterPlugin.java) which prints straight to
// the Classic Bluetooth printer — no RawBT, no system dialog. In a normal
// browser `isNativeApp()` is false and the app uses its web print paths.

import { Capacitor, registerPlugin } from '@capacitor/core';

const BluetoothPrinter = registerPlugin('BluetoothPrinter');

const LS_ADDR = 'bfc_printer_address';
const LS_NAME = 'bfc_printer_name';

export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// The printer the user picked once (in Admin > Printer Setup). Stored per
// device so every bill goes straight to it with no chooser.
export function getSelectedPrinter() {
  try {
    const address = localStorage.getItem(LS_ADDR) || '';
    const name = localStorage.getItem(LS_NAME) || '';
    return address ? { address, name } : null;
  } catch {
    return null;
  }
}

export function setSelectedPrinter(address, name) {
  try {
    localStorage.setItem(LS_ADDR, address);
    localStorage.setItem(LS_NAME, name || '');
  } catch {
    /* ignore */
  }
}

// Turns Bluetooth on if it's off — Android shows its own "allow?" prompt.
async function ensureEnabled() {
  const status = await BluetoothPrinter.isEnabled();
  if (!status?.enabled) {
    const res = await BluetoothPrinter.enable();
    if (!res?.enabled) throw new Error('Please switch Bluetooth on to print');
  }
}

export async function btEnable() {
  const res = await BluetoothPrinter.enable();
  return !!res?.enabled;
}

// Devices already paired in Android Settings > Bluetooth. The printer shows
// up here (as "MPT-III") once it has been paired on this tablet.
export async function btListPaired() {
  await ensureEnabled();
  const res = await BluetoothPrinter.listPaired();
  return res?.devices || [];
}

function bytesToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Print raw ESC/POS bytes directly to the selected printer.
export async function btPrint(bytes) {
  const printer = getSelectedPrinter();
  if (!printer) {
    throw new Error('No printer selected yet — set it in Admin > Printer Setup');
  }
  await ensureEnabled();
  await BluetoothPrinter.print({
    address: printer.address,
    base64: bytesToBase64(bytes),
  });
  return true;
}
