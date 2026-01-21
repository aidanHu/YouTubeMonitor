import { NextResponse } from "next/server";
import { resolveChannelId, resolveVideoDetails } from "@/lib/youtube";

export async function POST(request: Request) {
    try {
        const { url } = await request.json();

        if (!url) {
            return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }

        // Extract Video ID
        // 1. Standard: ?v=ID
        let videoId = null;
        const vMatch = url.match(/[?&]v=([\w-]{11})/);
        if (vMatch) {
            videoId = vMatch[1];
        } else {
            // 2. Short: youtu.be/ID
            const shareMatch = url.match(/youtu\.be\/([\w-]{11})/);
            if (shareMatch) {
                videoId = shareMatch[1];
            } else {
                // 3. Shorts: /shorts/ID
                const shortsMatch = url.match(/\/shorts\/([\w-]{11})/);
                if (shortsMatch) {
                    videoId = shortsMatch[1];
                }
            }
        }

        if (!videoId) {
            // If raw ID provided (length 11)
            if (url.match(/^[\w-]{11}$/)) {
                videoId = url;
            } else {
                return NextResponse.json({ error: "Could not parse Video ID from URL" }, { status: 400 });
            }
        }

        const details = await resolveVideoDetails(videoId);
        if (!details) {
            return NextResponse.json({ error: "Video not found" }, { status: 404 });
        }

        return NextResponse.json(details);

    } catch (e: any) {
        console.error("Resolve failed", e);
        return NextResponse.json({ error: e.message || "Resolution failed" }, { status: 500 });
    }
}
