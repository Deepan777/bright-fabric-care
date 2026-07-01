const TABS = [
  { key: 'newbill', label: 'New Bill', icon: '🧾' },
  { key: 'orders', label: 'Orders', icon: '📋' },
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'admin', label: 'Admin', icon: '⚙️' },
];

export default function TabBar({ active, onChange }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={active === t.key ? 'active' : ''}
          onClick={() => onChange(t.key)}
        >
          <span className="tab-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
