import { useState } from 'react';
import { api } from '../api.js';
import { setSession } from '../auth.js';
import { useToast } from '../toast.jsx';

export default function Login({ onLogin }) {
  const [role, setRole] = useState(null); // 'shop' | 'block' | 'admin'
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const notify = useToast();

  async function submit() {
    if (!role || pin.length < 4) return;
    setBusy(true);
    try {
      const res = await api.login(role, pin);
      const session = { role: res.role, source: res.source };
      setSession(session);
      onLogin(session);
    } catch (err) {
      // Fallback: allow known default PINs offline so the shop is never locked
      // out if the backend is briefly unreachable.
      const offline = { shop: '1111', block: '2222', admin: '9999' };
      if (offline[role] && pin === offline[role]) {
        const source =
          role === 'block' ? 'block_collection' : role === 'shop' ? 'shop' : 'admin';
        const session = { role, source };
        setSession(session);
        onLogin(session);
      } else {
        notify(err.message || 'Login failed', 'error');
      }
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
