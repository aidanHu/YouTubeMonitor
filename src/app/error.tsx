"use client";

import { useEffect } from "react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 p-6">
            <h2 className="text-2xl font-bold mb-4 text-red-600">Application Error</h2>
            <div className="w-full max-w-2xl bg-zinc-100 dark:bg-zinc-900 p-4 rounded-lg overflow-auto mb-6 border border-zinc-200 dark:border-zinc-800">
                <p className="font-mono text-sm whitespace-pre-wrap break-words text-red-500">
                    {error.message}
                </p>
                {error.digest && (
                    <p className="mt-2 text-xs text-zinc-500">Digest: {error.digest}</p>
                )}
                {error.stack && (
                    <details className="mt-4">
                        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Stack Trace</summary>
                        <pre className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 overflow-auto whitespace-pre-wrap">
                            {error.stack}
                        </pre>
                    </details>
                )}
            </div>
            <div className="flex gap-4">
                <button
                    onClick={
                        // Attempt to recover by trying to re-render the segment
                        () => reset()
                    }
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                    Try again
                </button>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                >
                    Reload Page
                </button>
            </div>
        </div>
    );
}
