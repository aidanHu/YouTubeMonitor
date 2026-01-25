'use client';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body>
                <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
                    <h2 style={{ color: 'red' }}>Critical System Error</h2>
                    <p>The application encountered a critical error during initialization.</p>
                    <pre style={{ background: '#f0f0f0', padding: '10px', borderRadius: '4px', overflow: 'auto' }}>
                        {error.message}
                        {error.stack}
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
