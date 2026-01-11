import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveChannelId, updateChannelStats, fetchChannelVideos } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET() {
    const channels = await prisma.channel.findMany({
        include: {
            group: true,
        },
        orderBy: {
            createdAt: "desc",
        },
    });
    // Convert BigInt to string for JSON serialization
    const serialized = channels.map((c) => ({
        ...c,
        viewCount: c.viewCount.toString(),
    }));
    return NextResponse.json(serialized);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { urls, groupId } = body; // Expect array of URLs

        if (!Array.isArray(urls)) {
            return NextResponse.json({ error: "Invalid URLs" }, { status: 400 });
        }

        const results = [];
        for (const url of urls) {
            try {
                // 1. Resolve real ID
                let channelId = await resolveChannelId(url);

                if (!channelId) {
                    console.error(`Could not resolve ID for ${url}`);
                    continue;
                }

                // 2. Check existence BEFORE fetching stats to save quota
                const existing = await prisma.channel.findUnique({ where: { id: channelId } });

                if (existing) {
                    console.log(`[AddChannel] Channel ${existing.name} (${channelId}) already exists. Update group only.`);
                    // Update group if provided and different
                    if (groupId && existing.groupId !== parseInt(groupId)) {
                        const updated = await prisma.channel.update({
                            where: { id: channelId },
                            data: { groupId: parseInt(groupId) }
                        });
                        results.push(updated);
                    } else {
                        results.push(existing);
                    }
                    continue; // SKIP fetching stats and videos
                }

                // 3. Refresh stats (Only for NEW channels)
                let stats;
                try {
                    stats = await updateChannelStats(channelId);
                } catch (err) {
                    console.error("Failed to fetch initial stats", err);
                    stats = {
                        name: url,
                        thumbnail: null,
                        subscriberCount: 0,
                        viewCount: 0n,
                        videoCount: 0,
                        uploadsPlaylistId: null
                    };
                }

                // 4. Create in DB
                const ch = await prisma.channel.create({
                    data: {
                        id: channelId,
                        url: `https://www.youtube.com/channel/${channelId}`,
                        name: stats.name || "Unknown",
                        thumbnail: stats.thumbnail,
                        subscriberCount: stats.subscriberCount,
                        viewCount: stats.viewCount,
                        videoCount: stats.videoCount,
                        groupId: groupId ? parseInt(groupId) : null
                    }
                });
                results.push(ch);

                // 5. Fetch initial videos immediately (Cost: 2)
                if (stats.uploadsPlaylistId) {
                    try {
                        const sevenDaysAgo = new Date();
                        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                        const videos = await fetchChannelVideos(channelId, stats.uploadsPlaylistId, sevenDaysAgo);
                        for (const video of videos) {
                            await prisma.video.upsert({
                                where: { id: video.id },
                                update: {
                                    viewCount: video.viewCount,
                                    likeCount: video.likeCount,
                                    commentCount: video.commentCount,
                                    updatedAt: new Date(),
                                    isShort: video.isShort
                                },
                                create: {
                                    id: video.id,
                                    title: video.title,
                                    url: video.url,
                                    thumbnail: video.thumbnail,
                                    publishedAt: video.publishedAt,
                                    viewCount: video.viewCount,
                                    likeCount: video.likeCount,
                                    commentCount: video.commentCount,
                                    channelId: channelId,
                                    isShort: video.isShort
                                }
                            });
                        }
                    } catch (videoErr) {
                        console.error(`[AddChannel] Failed to fetch initial videos for ${channelId}`, videoErr);
                    }
                }
            } catch (e) {
                console.error(`[AddChannel] Failed to add ${url}`, e);
            }
        }

        const serializedResults = results.map(channel => ({
            ...channel,
            viewCount: channel.viewCount.toString()
        }));

        return NextResponse.json(serializedResults);
    } catch (e) {
        console.error("[API] Failed to parse request body or other error", e);
        return NextResponse.json({ error: "Invalid request body or server error" }, { status: 400 });
    }
}
