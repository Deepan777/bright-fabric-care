const ALL_TABS = [
  { key: 'newbill', label: 'New Bill', icon: '🧾' },
  { key: 'orders', label: 'Orders', icon: '📋' },
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'admin', label: 'Admin', icon: '⚙️' },
];

// Dashboard shows revenue/financial data, so it's admin-only. Workers
// (Shop Counter / Block Collection) get New Bill, Orders, and Admin
// (the Admin tab stays PIN-gated for them, same as before).
export default function TabBar({ active, onChange, showDashboard }) {
  const tabs = showDashboard
    ? ALL_TABS
    : ALL_TABS.filter((t) => t.key !== 'dashboard');

  return (
    <nav className="tabbar">
      {tabs.map((t) => (
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
