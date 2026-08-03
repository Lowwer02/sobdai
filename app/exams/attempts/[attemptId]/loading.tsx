/**
 * Loading skeleton for the attempt review route. Static markup only — no data
 * fetching, no client JS. Mirrors the page's dark/gold design tokens.
 */
export default function AttemptReviewLoading() {
  const block = { background: 'rgba(255,255,255,0.04)', borderRadius: '10px' }
  return (
    <div
      className="min-h-screen animate-pulse"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <div style={{ maxWidth: '820px', margin: '0 auto', padding: '32px 20px 80px' }}>
        <div style={{ ...block, width: '120px', height: '16px', marginBottom: '20px' }} />
        {/* Summary card skeleton */}
        <div
          className="card"
          style={{ padding: '24px', marginBottom: '28px' }}
        >
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <div style={{ ...block, width: '54px', height: '22px' }} />
            <div style={{ ...block, width: '90px', height: '22px' }} />
          </div>
          <div style={{ ...block, width: '60%', height: '26px', marginBottom: '18px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '18px' }}>
            <div style={{ ...block, height: '64px' }} />
            <div style={{ ...block, height: '64px' }} />
            <div style={{ ...block, height: '64px' }} />
          </div>
          <div style={{ ...block, width: '40%', height: '14px' }} />
        </div>
        {/* Question skeletons */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="card" style={{ padding: '20px', marginBottom: '16px' }}>
            <div style={{ ...block, width: '70px', height: '20px', marginBottom: '14px' }} />
            <div style={{ ...block, width: '95%', height: '16px', marginBottom: '8px' }} />
            <div style={{ ...block, width: '80%', height: '16px', marginBottom: '14px' }} />
            <div style={{ ...block, width: '100%', height: '48px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
