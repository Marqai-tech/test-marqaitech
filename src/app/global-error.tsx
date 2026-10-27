'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the full error to console so we can see it
    console.error('[GLOBAL_ERROR]', error?.message);
    console.error('[GLOBAL_ERROR_STACK]', error?.stack);
    console.error('[GLOBAL_ERROR_DIGEST]', error?.digest);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: '40px', fontFamily: 'monospace', fontSize: '14px' }}>
          <h2 style={{ color: 'red' }}>Global Error Caught</h2>
          <p><strong>Message:</strong> {error?.message || 'Unknown error'}</p>
          <p><strong>Digest:</strong> {error?.digest || 'N/A'}</p>
          <pre style={{ background: '#f5f5f5', padding: '20px', overflow: 'auto', maxWidth: '900px' }}>
            {error?.stack || 'No stack trace'}
          </pre>
          <button
            onClick={() => reset()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
