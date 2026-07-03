import { useState } from 'react';
import { setSession } from '../auth.js';
import { loadSettings } from '../dataSync.js';
import { useToast } from '../toast.jsx';

const PIN_KEY_BY_ROLE = { shop: 'pin_shop', block: 'pin_block', admin: 'pin_admin' };
const SOURCE_BY_ROLE = { shop: 'shop', block: 'block_collection', admin: 'admin' };

export default function Login({ onLogin }) {
  const [role, setRole] = useState(null); // 'shop' | 'block' | 'admin'
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const notify = useToast();

  // PINs are checked against the local cache — instant, works with zero
  // internet. The cache itself refreshes at most once a day in the
  // background (or immediately after an Admin PIN change), so login never
  // has to wait on a network round-trip.
  async function submit() {
    if (!role || pin.length < 4) return;
    setBusy(true);
    try {
      const settings = await loadSettings();
      const expected = settings[PIN_KEY_BY_ROLE[role]];
      if (String(pin) !== String(expected)) {
        notify('Incorrect PIN', 'error');
        return;
      }
      const session = { role, source: SOURCE_BY_ROLE[role] };
      setSession(session);
      onLogin(session);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <h1>The Bright Fabric Care</h1>
      <div className="sub">VIT Campus · Mens Hostel</div>

      <div className="role-buttons">
        <button
          className={`role-btn ${role === 'shop' ? 'selected' : ''}`}
          onClick={() => setRole('shop')}
        >
          Shop Counter
        </button>
        <button
          className={`role-btn ${role === 'block' ? 'selected' : ''}`}
          onClick={() => setRole('block')}
        >
          Block Collection
        </button>
      </div>

      <input
        className="pin-input"
        type="password"
        inputMode="numeric"
        maxLength={4}
        placeholder="••••"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />

      <button
        className="btn-primary"
        disabled={!role || pin.length < 4 || busy}
        onClick={submit}
      >
        {busy ? 'Checking…' : 'Login'}
      </button>

      <button
        className={`admin-role-btn ${role === 'admin' ? 'selected' : ''}`}
        onClick={() => setRole('admin')}
      >
        {role === 'admin' ? 'Admin selected — enter PIN' : 'Admin login'}
      </button>
    </div>
  );
}
