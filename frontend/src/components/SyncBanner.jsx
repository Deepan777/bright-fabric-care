import { useEffect, useState } from 'react';
import { onSyncState } from '../sync.js';

export default function SyncBanner() {
  const [state, setState] = useState({ pending: 0 });

  useEffect(() => onSyncState(setState), []);

  if (!state.pending) return null;

  return (
    <div className="sync-banner">
      Saved locally — syncing when connected ({state.pending} pending)
    </div>
  );
}
