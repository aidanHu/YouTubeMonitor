
"use client";

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function GlobalCookieInjector() {
    useEffect(() => {
        // Identify environment
        const is_tauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

        if (is_tauri) {
            console.log("GlobalCookieInjector: Initializing (Native)...");
            invoke("refresh_cookies")
                .then((res: any) => {
                    if (res?.success && res.count) {
                        console.log(`GlobalCookieInjector: Parsed ${res.count} cookies successfully.`);
                    } else if (res?.message) {
                        console.log("GlobalCookieInjector:", res.message);
                    }
                })
                .catch((err) => {
                    console.error("GlobalCookieInjector: Failed to load cookies", err);
                });
        }
    }, []);

    return null;
}
