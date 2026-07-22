package com.brightfabriccare.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.Set;
import java.util.UUID;

/**
 * Direct Bluetooth Classic (SPP) printing — no helper app in between.
 *
 * A web page cannot open a Classic-Bluetooth serial socket; this native
 * plugin can. It connects to an already-paired printer, writes the raw
 * ESC/POS bytes the web app builds, and closes. The web layer talks to it
 * through Capacitor's bridge (see frontend/src/native.js).
 *
 * We only ever talk to *bonded* (already paired in Android Settings) devices,
 * so no Bluetooth scanning — that keeps us to the single BLUETOOTH_CONNECT
 * runtime permission on Android 12+.
 */
@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = {
        @Permission(alias = "bt", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class BluetoothPrinterPlugin extends Plugin {

    // Standard Serial Port Profile UUID used by ESC/POS thermal printers.
    private static final UUID SPP_UUID =
        UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothAdapter getAdapter() {
        BluetoothManager bm =
            (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        if (bm != null) return bm.getAdapter();
        return BluetoothAdapter.getDefaultAdapter();
    }

    // Runtime BLUETOOTH_CONNECT is only required on Android 12+ (API 31).
    private boolean needsRuntimePermission() {
        return Build.VERSION.SDK_INT >= 31;
    }

    private boolean hasBtPermission() {
        if (!needsRuntimePermission()) return true;
        return getPermissionState("bt") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        BluetoothAdapter adapter = getAdapter();
        JSObject ret = new JSObject();
        ret.put("supported", adapter != null);
        ret.put("enabled", adapter != null && adapter.isEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        BluetoothAdapter adapter = getAdapter();
        if (adapter == null) {
            call.reject("This device has no Bluetooth");
            return;
        }
        if (adapter.isEnabled()) {
            JSObject ret = new JSObject();
            ret.put("enabled", true);
            call.resolve(ret);
            return;
        }
        // Shows Android's own "Allow app to turn on Bluetooth?" prompt.
        Intent intent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
        startActivityForResult(call, intent, "enableResult");
    }

    @ActivityCallback
    private void enableResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        BluetoothAdapter adapter = getAdapter();
        JSObject ret = new JSObject();
        ret.put("enabled", adapter != null && adapter.isEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void listPaired(PluginCall call) {
        if (!hasBtPermission()) {
            requestPermissionForAlias("bt", call, "afterPermList");
            return;
        }
        doListPaired(call);
    }

    @PermissionCallback
    private void afterPermList(PluginCall call) {
        if (!hasBtPermission()) {
            call.reject("Bluetooth permission is needed to find the printer");
            return;
        }
        doListPaired(call);
    }

    private void doListPaired(PluginCall call) {
        BluetoothAdapter adapter = getAdapter();
        if (adapter == null) {
            call.reject("This device has no Bluetooth");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth is switched off");
            return;
        }
        JSArray devices = new JSArray();
        try {
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            for (BluetoothDevice d : bonded) {
                JSObject o = new JSObject();
                o.put("name", d.getName());
                o.put("address", d.getAddress());
                devices.put(o);
            }
        } catch (SecurityException e) {
            call.reject("Bluetooth permission is needed to find the printer");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("devices", devices);
        call.resolve(ret);
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (!hasBtPermission()) {
            requestPermissionForAlias("bt", call, "afterPermPrint");
            return;
        }
        doPrint(call);
    }

    @PermissionCallback
    private void afterPermPrint(PluginCall call) {
        if (!hasBtPermission()) {
            call.reject("Bluetooth permission is needed to print");
            return;
        }
        doPrint(call);
    }

    private void doPrint(PluginCall call) {
        final String address = call.getString("address");
        final String base64 = call.getString("base64");
        if (address == null || address.isEmpty()) {
            call.reject("No printer selected");
            return;
        }
        if (base64 == null) {
            call.reject("Nothing to print");
            return;
        }

        final BluetoothAdapter adapter = getAdapter();
        if (adapter == null) {
            call.reject("This device has no Bluetooth");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth is switched off");
            return;
        }

        // Socket connect + write must not run on the UI thread.
        new Thread(() -> {
            byte[] data;
            try {
                data = Base64.decode(base64, Base64.DEFAULT);
            } catch (Exception e) {
                call.reject("Bad print data");
                return;
            }

            BluetoothDevice device;
            try {
                device = adapter.getRemoteDevice(address);
            } catch (Exception e) {
                call.reject("That printer is no longer paired. Re-pair it in Settings > Bluetooth.");
                return;
            }

            BluetoothSocket socket = openSocket(device);
            if (socket == null) {
                call.reject("Could not reach the printer. Switch it on, keep it nearby, and make sure it is paired.");
                return;
            }

            try {
                OutputStream out = socket.getOutputStream();
                out.write(data);
                out.flush();
                // Give the printer a moment to drain before we drop the link.
                try { Thread.sleep(400); } catch (InterruptedException ignored) {}
                out.close();
                socket.close();
                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            } catch (SecurityException e) {
                closeQuietly(socket);
                call.reject("Bluetooth permission is needed to print");
            } catch (Exception e) {
                closeQuietly(socket);
                call.reject("Printer connected but did not accept the receipt. Try again.");
            }
        }).start();
    }

    /**
     * Opens an RFCOMM socket, trying two ways. Many cheap ESC/POS printers do
     * not advertise the SPP service record, so the standard
     * createRfcommSocketToServiceRecord() connect fails — the hidden
     * createRfcommSocket(channel 1) call is the well-known workaround.
     * Returns a connected socket, or null if both attempts fail.
     */
    private BluetoothSocket openSocket(BluetoothDevice device) {
        // Attempt 1: standard, secure SPP.
        try {
            BluetoothSocket s = device.createRfcommSocketToServiceRecord(SPP_UUID);
            s.connect();
            return s;
        } catch (Exception e1) {
            // fall through to the reflection fallback
        }
        // Attempt 2: hidden createRfcommSocket(1) — works with most no-name
        // thermal printers that reject the first method.
        try {
            Method m = device.getClass().getMethod("createRfcommSocket", int.class);
            BluetoothSocket s = (BluetoothSocket) m.invoke(device, 1);
            s.connect();
            return s;
        } catch (Exception e2) {
            return null;
        }
    }

    private void closeQuietly(BluetoothSocket s) {
        if (s != null) {
            try { s.close(); } catch (Exception ignored) {}
        }
    }
}
