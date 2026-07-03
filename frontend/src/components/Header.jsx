import { useEffect, useState } from 'react';
import { onSyncState } from '../sync.js';
import { endOfDaySync } from '../dataSync.js';
import { useToast } from '../toast.jsx';

// The one place to touch the internet: tap this once (ideally at the end
// of the day) to push every locally created bill to the cloud and pull
// fresh items/prices/orders/dashboard. The rest of the day the app runs
// entirely from local storage — no automatic background network calls.
export default function Header({ session, onLogout, onSynced }) {
  const [syncState, setSyncState] = useState({ pending: 0 });
  const [busy, setBusy] = useState(false);
  const notify = useToast();

  useEffect(() => onSyncState(setSyncState), []);

  const modeLabel =
    session.role === 'admin'
      ? 'Admin'
      : session.source === 'block_collection'
      ? 'Block Collection'
      : 'Shop Counter';

  async function handleSync() {
    setBusy(true);
    try {
      const result = await endOfDaySync();
      onSynced?.(result);
      notify(
        result.pushed > 0
          ? `Synced ${result.pushed} bill(s) and refreshed data`
          : 'Up to date — data refreshed',
        'success'
      );
    } catch (err) {
      notify(err.message || 'Could not sync — check your internet connection', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="header">
      <h1>The Bright Fabric Care</h1>
      <div className="header-right">
        <span className="mode-chip">{modeLabel}</span>
        <button
          className="btn-sync"
          onClick={handleSync}
          disabled={busy}
          title="Sync now — tap once at the end of the day"
        >
          {busy ? 'Syncing…' : `↻ Sync${syncState.pending > 0 ? ` (${syncState.pending})` : ''}`}
        </button>
        <button className="btn-logout" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
