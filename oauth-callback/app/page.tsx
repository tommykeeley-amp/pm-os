export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: '#0f0f0f',
      color: '#fff'
    }}>
      <div style={{ textAlign: 'center', maxWidth: '600px', padding: '20px' }}>
        <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>PM-OS OAuth</h1>
        <p style={{ color: '#888', fontSize: '18px' }}>
          This service handles OAuth callbacks for the PM-OS desktop application.
        </p>
      </div>
    </div>
  );
}
