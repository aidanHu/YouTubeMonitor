
"use client";

import { useEffect } from "react";

export function GlobalCookieInjector() {
    useEffect(() => {
        // Try to inject cookies if available (Electron only)
        if (typeof window !== 'undefined' && 'electron' in window) {
            console.log("GlobalCookieInjector: Initializing...");
            (window as any).electron.refreshCookies().then((res: any) => {
                if (res?.count) console.log(`GlobalCookieInjector: Injected ${res.count} cookies globally.`);
            }).catch((err: any) => {
                console.error("GlobalCookieInjector: Failed to inject cookies", err);
            });
        }
    }, []);

    return null;
}
