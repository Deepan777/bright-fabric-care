export default function Header({ session, onLogout }) {
  const modeLabel =
    session.role === 'admin'
      ? 'Admin'
      : session.source === 'block_collection'
      ? 'Block Collection'
      : 'Shop Counter';

  return (
    <header className="header">
      <h1>The Bright Fabric Care</h1>
      <div className="header-right">
        <span className="mode-chip">{modeLabel}</span>
        <button className="btn-logout" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
