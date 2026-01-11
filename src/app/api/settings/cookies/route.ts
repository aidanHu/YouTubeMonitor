
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const settings = await prisma.settings.findFirst();
        if (!settings || !settings.cookieSource || settings.cookieSource === "none") {
            return NextResponse.json({ cookies: [] });
        }

        const source = settings.cookieSource;

        // Only support direct file paths for playback injection for now
        // Browser keywords (chrome, firefox) are handled by yt-dlp internal logic, 
        // extracting them here requires a heavy external process which we should avoid for UI latency.
        if (!source.startsWith("/") && !source.includes("\\") && (source.length < 3 || source[1] !== ':')) {
            return NextResponse.json({ cookies: [], warning: "Browser cookie source not supported for playback. Please export to cookies.txt." });
        }

        if (!fs.existsSync(source)) {
            return NextResponse.json({ cookies: [], error: "Cookie file not found" });
        }

        const content = fs.readFileSync(source, 'utf-8');
        const cookies = parseNetscapeCookies(content);

        return NextResponse.json({ cookies });
    } catch (e: any) {
        console.error("Failed to read cookies", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

function parseNetscapeCookies(text: string) {
    const cookies: any[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
        if (!line || line.startsWith('#') || line.trim() === '') continue;

        const parts = line.split('\t');
        if (parts.length < 7) continue;

        const [domain, _flag, path, secure, expiration, name, value] = parts;

        // Filter for YouTube/Google cookies only to be safe/clean
        if (!domain.includes("youtube") && !domain.includes("google")) continue;

        cookies.push({
            url: (secure === "TRUE" ? "https://" : "http://") + domain.replace(/^\./, ''),
            domain: domain,
            path: path,
            secure: secure === "TRUE",
            // expirationDate: Number(expiration), // Electron expects 'expirationDate'
            name: name,
            value: value.trim()
        });
    }
    return cookies;
}
