export default function HomePage() {
  return (
    <main>
      <h1>Drsell</h1>
      <p className="muted">AI customer support for Shopify</p>
      <div className="nav" style={{ marginTop: '1.5rem' }}>
        <a className="btn" href="/app">Shopify embedded admin</a>
        <a className="btn" href="/" style={{ marginLeft: '0.75rem' }}>
          Merchant dashboard
        </a>
      </div>
    </main>
  );
}
