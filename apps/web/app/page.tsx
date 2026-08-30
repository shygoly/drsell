export default function HomePage() {
  return (
    <main>
      <h1>Drsell</h1>
      <p className="muted">Shopify AI 客服 · 腾讯云 ADP</p>
      <div className="nav" style={{ marginTop: '1.5rem' }}>
        <a className="btn" href="/app">Shopify 嵌入后台</a>
        <a className="btn" href="/" style={{ marginLeft: '0.75rem' }}>
          商家 Dashboard
        </a>
      </div>
    </main>
  );
}
