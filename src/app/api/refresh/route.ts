import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateChannelStats, fetchChannelVideos, resolveChannelId } from "@/lib/youtube";

export async function POST(request: Request) {
    let body: any = {};
    try {
        const text = await request.text();
        if (text) body = JSON.parse(text);
    } catch (e) {
        // Ignore JSON parse error, assume empty
    }

    const { groupId, range } = body;

    // Filter Channels
    let where: any = {};
    if (groupId) {
        where.groupId = parseInt(groupId);
    } else if (groupId === null) {
        // Uncategorized
        where.groupId = null;
    }

    const channels = await prisma.channel.findMany({ where });
    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Calculate Date Range
    let minDate: Date | undefined = undefined;
    if (range && range !== 'all') {
        const now = new Date();
        const past = new Date();
        if (range === '3d') past.setDate(now.getDate() - 3);
        else if (range === '7d') past.setDate(now.getDate() - 7);
        else if (range === '30d') past.setDate(now.getDate() - 30);
        else if (range === '3m') past.setDate(now.getDate() - 90);
        else if (range === '6m') past.setDate(now.getDate() - 180);
        else if (range === '1y') past.setDate(now.getDate() - 365);
        minDate = past;
    }

    // Parallelize processing in chunks to speed up but control concurrency?
    // For now, keep serial loop to respect rate limits per key in a simple way

    for (const channel of channels) {
        try {
            let targetId = channel.id;

            // 0. Auto-migrate Legacy IDs (Mock IDs are short, Real IDs are 24 chars)
            if (channel.id.startsWith("UC") && channel.id.length < 20 && channel.url) {
                console.log(`Detected legacy ID ${channel.id}, attempting to resolve real ID...`);
                try {
                    const realId = await resolveChannelId(channel.url);
                    if (realId && realId !== channel.id) {
                        console.log(`Resolved real ID: ${realId}. Migrating...`);

                        // Check if real ID already exists
                        const existing = await prisma.channel.findUnique({ where: { id: realId } });

                        // Delete the old "fake" channel
                        await prisma.channel.delete({ where: { id: channel.id } });

                        if (!existing) {
                            // Create the new channel with the real ID
                            await prisma.channel.create({
                                data: {
                                    id: realId,
                                    url: channel.url,
                                    name: channel.name,
                                    groupId: channel.groupId,
                                    thumbnail: channel.thumbnail,
                                }
                            });
                        }

                        targetId = realId;
                    }
                } catch (migrationErr) {
                    console.error("Migration failed, skipping channel", migrationErr);
                    continue;
                }
            }

            // 1. Update Channel Stats (Cost: 1)
            const stats = await updateChannelStats(targetId);

            await prisma.channel.update({
                where: { id: targetId },
                data: {
                    name: stats.name,
                    thumbnail: stats.thumbnail,
                    subscriberCount: stats.subscriberCount,
                    viewCount: stats.viewCount,
                    videoCount: stats.videoCount,
                }
            });

            // 2. Fetch Videos (Cost: 2 - 1 for playlistItems, 1 for videos)
            if (stats.uploadsPlaylistId) {
                const videos = await fetchChannelVideos(targetId, stats.uploadsPlaylistId, minDate);

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
                            channelId: targetId,
                            isShort: video.isShort
                        }
                    });
                }
            }

            results.success++;
        } catch (e: any) {
            console.error(`[Refresh] Failed to refresh channel ${channel.name} (${channel.id}):`, e);
            results.failed++;
            // Extract meaningful error message
            const msg = e instanceof Error ? e.message : String(e);
            const cleanMsg = msg.replace("Error: ", "");
            results.errors.push(`${channel.name}: ${cleanMsg}`);
        }
    }

    return NextResponse.json(results);
}
