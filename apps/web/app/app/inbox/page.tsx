'use client';

const MOCK = [
  { id: '1', from: 'alice@example.com', preview: '请问发货多久到？', at: '今天 10:21' },
  { id: '2', from: 'bob@example.com', preview: '想改收货地址', at: '昨天 18:02' },
];

export default function InboxPage() {
  return (
    <div className="panel">
      <h2>收件箱</h2>
      <p className="muted">P1 将接入真实会话；当前展示结构占位。</p>
      <ul>
        {MOCK.map((c) => (
          <li key={c.id} style={{ marginBottom: '0.75rem' }}>
            <strong>{c.from}</strong>
            <div className="muted">{c.preview} · {c.at}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
