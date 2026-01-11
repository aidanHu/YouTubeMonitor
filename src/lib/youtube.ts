import { prisma } from "./prisma";
import { ProxyAgent } from "undici";

// Daily quota limit per key (standard free tier is 10,000)
const DAILY_QUOTA_LIMIT = 10000;

async function fetchWithProxy(url: string) {
    const settings = await prisma.settings.findFirst();
    const options: any = {};
    if (settings?.proxyUrl) {
        try {
            options.dispatcher = new ProxyAgent(settings.proxyUrl);
        } catch (e) {
            console.error("Invalid Proxy URL:", settings.proxyUrl, e);
        }
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function getValidKey() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Reset usage if it's a new day
    // (We do this lazily when fetching keys)
    // Ideally, we'd have a cron, but for a local app, we can check on use.

    // Find a key that is active
    // We need to handle daily reset logic. 
    // Let's just find one that has usage < LIMIT or wasn't used today.

    const keys = await prisma.apiKey.findMany({
        where: { isActive: true },
        orderBy: { lastUsed: 'asc' } // Use least recently used to distribute slightly? Or just first.
    });

    for (const key of keys) {
        const lastUsedDate = new Date(key.lastUsed);
        lastUsedDate.setHours(0, 0, 0, 0);

        if (lastUsedDate.getTime() < today.getTime()) {
            // It's a new day for this key, reset usage
            await prisma.apiKey.update({
                where: { id: key.id },
                data: { usageToday: 0, lastUsed: new Date() }
            });
            key.usageToday = 0; // update local var
        }

        if (key.usageToday < DAILY_QUOTA_LIMIT) {
            return key;
        }
    }

    return null;
}

async function incrementUsage(keyId: number, cost: number) {
    await prisma.apiKey.update({
        where: { id: keyId },
        data: {
            usageToday: { increment: cost },
            lastUsed: new Date()
        }
    });
}

export async function resolveChannelId(url: string) {
    // Extract ID directly
    const idMatch = url.match(/(UC[\w-]{22})/);
    if (idMatch) {
        return idMatch[1];
    }

    // Extract handle
    const handleMatch = url.match(/@([\w-]+)/);
    if (handleMatch) {
        return await resolveHandle(handleMatch[1]);
    }

    // Extract Shorts URL
    const shortsMatch = url.match(/\/shorts\/([\w-]{11})/);
    if (shortsMatch) {
        return await resolveChannelFromVideoId(shortsMatch[1]);
    }

    // Try to extract Video ID from URL (standard watch URLs)
    const videoIdMatch = url.match(/[?&]v=([\w-]{11})/);
    if (videoIdMatch) {
        return await resolveChannelFromVideoId(videoIdMatch[1]);
    }

    // Fallback for share URLs like youtu.be/ID
    const shareMatch = url.match(/youtu\.be\/([\w-]{11})/);
    if (shareMatch) {
        return await resolveChannelFromVideoId(shareMatch[1]);
    }

    // Capture potential raw Video ID
    if (url.match(/^[\w-]{11}$/)) {
        return await resolveChannelFromVideoId(url);
    }

    return null;
}

async function resolveChannelFromVideoId(videoId: string): Promise<string | null> {
    const key = await getValidKey();
    if (!key) throw new Error("No valid API quota available");

    try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${key.key}`;
        const res = await fetchWithProxy(apiUrl);
        await incrementUsage(key.id, 1);

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[Youtube] API Error (resolveVideo): ${res.status} ${res.statusText}`, errorText);
            return null;
        }

        const data = await res.json();
        const channelId = data.items?.[0]?.snippet?.channelId;

        if (channelId) {
            return channelId;
        }
    } catch (e) {
        console.error("[Youtube] Error resolving video to channel:", e);
    }
    return null;
}

async function resolveHandle(handle: string): Promise<string | null> {
    const key = await getValidKey();
    if (!key) {
        console.error("[Youtube] resolveHandle: No valid key found.");
        throw new Error("No valid API quota available");
    }

    try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=%40${handle}&key=${key.key}`;

        const res = await fetchWithProxy(apiUrl);
        await incrementUsage(key.id, 1);

        if (!res.ok) {
            const errorText = await res.text();
            console.error(`[Youtube] API Error (resolveHandle): ${res.status} ${res.statusText}`, errorText);
            return null;
        }

        const data = await res.json();
        const id = data.items?.[0]?.id || null;
        return id;
    } catch (e) {
        console.error("[Youtube] Error resolving handle:", e);
        return null;
    }
}

export async function updateChannelStats(channelId: string) {
    const key = await getValidKey();
    if (!key) {
        console.error("[Youtube] updateChannelStats: No valid key found.");
        throw new Error("No valid API quota available (Quota exceeded for all keys)");
    }

    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${key.key}`;

    let res;
    try {
        res = await fetchWithProxy(channelUrl);
    } catch (networkErr) {
        console.error(`[Youtube] Network Error (updateChannelStats):`, networkErr);
        throw new Error("Network error fetching channel stats");
    }

    await incrementUsage(key.id, 1);

    if (!res.ok) {
        const errorText = await res.text();
        console.error(`[Youtube] API Error (updateChannelStats) - Status: ${res.status}:`, errorText);
        throw new Error(`Failed to fetch channel stats: ${res.status} ${res.statusText} - ${errorText}`);
    }

    const data = await res.json();
    const item = data.items?.[0];

    if (!item) {
        console.error(`[Youtube] Channel not found for ID: ${channelId}`);
        throw new Error("Channel not found");
    }

    const snippet = item.snippet;
    const stats = item.statistics;
    const contentDetails = item.contentDetails;

    // We should also sync videos immediately if possible, or trigger it separately.
    // Let's return the channel data and the uploads playlist ID.

    return {
        name: snippet.title,
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
        subscriberCount: parseInt(stats.subscriberCount || "0"),
        viewCount: BigInt(stats.viewCount || "0"),
        videoCount: parseInt(stats.videoCount || "0"),
        uploadsPlaylistId: contentDetails.relatedPlaylists?.uploads
    };
}

export async function fetchChannelVideos(channelId: string, uploadsPlaylistId?: string, minDate?: Date) {
    const key = await getValidKey();
    if (!key) throw new Error("No valid keys");

    // If we don't have uploadsPlaylistId, we might need to fetch channel details again.
    let playlistId = uploadsPlaylistId;
    if (!playlistId) {
        // Fetch channel to get playlist ID (Cost: 1)
        const stats = await updateChannelStats(channelId);
        playlistId = stats.uploadsPlaylistId;
    }

    if (!playlistId) return [];

    let allVideos: any[] = [];
    let nextPageToken: string | undefined = undefined;
    let shouldContinue = true;

    // Safety limit to prevent infinite loops or massive quota usage
    // 50 pages * 50 videos = 2500 videos max per refresh
    let pageCount = 0;
    const MAX_PAGES = 50; 

    while (shouldContinue && pageCount < MAX_PAGES) {
        const url: string = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50&key=${key.key}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;

        const res = await fetchWithProxy(url);
        await incrementUsage(key.id, 1);

        if (!res.ok) break;

        const data = await res.json();
        const items = data.items || [];
        
        if (items.length === 0) break;

        for (const item of items) {
            const publishedAt = new Date(item.snippet.publishedAt);
            
            // If minDate is set and we reached a video older than minDate
            if (minDate && publishedAt < minDate) {
                shouldContinue = false;
                break; // Stop processing this page
            }
            allVideos.push(item);
        }

        nextPageToken = data.nextPageToken;
        if (!nextPageToken || !shouldContinue) {
            break;
        }
        
        pageCount++;
    }

    if (allVideos.length === 0) return [];

    // Now we have the video IDs. We need view counts and duration.
    // We must call videos.list for these IDs (Cost: 1 per 50 videos)
    // Batch in chunks of 50
    const chunkSize = 50;
    const finalResults = [];

    for (let i = 0; i < allVideos.length; i += chunkSize) {
        const chunk = allVideos.slice(i, i + chunkSize);
        const videoIds = chunk.map((item: any) => item.contentDetails.videoId);

        if (videoIds.length === 0) continue;

        const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${videoIds.join(',')}&key=${key.key}`;
        const vRes = await fetchWithProxy(videosUrl);
        await incrementUsage(key.id, 1);

        if (!vRes.ok) continue;
        const vData = await vRes.json();

        const processed = (vData.items || []).map((v: any) => {
            let isShort = false;
            if (v.contentDetails?.duration) {
                // Parse Duration (ISO 8601, e.g. PT1M, PT59S)
                // Simple regex for hours, minutes, seconds
                const duration = v.contentDetails.duration;
                const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                if (match) {
                    const hours = parseInt(match[1] || "0");
                    const minutes = parseInt(match[2] || "0");
                    const seconds = parseInt(match[3] || "0");
                    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
                    if (totalSeconds <= 60) {
                        isShort = true;
                    }
                }
            }

            return {
                id: v.id,
                title: v.snippet.title,
                thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url,
                publishedAt: new Date(v.snippet.publishedAt),
                viewCount: BigInt(v.statistics.viewCount || "0"),
                likeCount: parseInt(v.statistics.likeCount || "0"),
                commentCount: parseInt(v.statistics.commentCount || "0"),
                url: `https://www.youtube.com/watch?v=${v.id}`,
                isShort
            };
        });

        finalResults.push(...processed);
    }
    
    return finalResults;
}
