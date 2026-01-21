import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveChannelId, updateChannelStats, fetchChannelVideos } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort');

    const validSortFields = ['createdAt', 'lastUploadAt', 'viewCount', 'subscriberCount', 'videoCount', 'averageViews'];

    // Default sort
    let orderBy: any = [
        { isPinned: "desc" },
        { createdAt: "desc" }
    ];

    let isManualSort = false;

    if (sort && validSortFields.includes(sort)) {
        if (sort === 'averageViews') {
            isManualSort = true;
            // Fetch all to sort in memory
            orderBy = undefined;
        } else {
            orderBy = [
                { isPinned: "desc" },
                { [sort]: "desc" }
            ];
        }
    }

    let channels = await prisma.channel.findMany({
        include: {
            group: true,
        },
        orderBy,
    });

    if (isManualSort && sort === 'averageViews') {
        channels = channels.sort((a, b) => {
            // Pin priority
            if (a.isPinned !== b.isPinned) {
                return a.isPinned ? -1 : 1;
            }

            const avgA = (a.videoCount > 0) ? Number(a.viewCount) / a.videoCount : 0;
            const avgB = (b.videoCount > 0) ? Number(b.viewCount) / b.videoCount : 0;

            return avgB - avgA; // Descending
        });
    }

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

        const details = [];

        for (const url of urls) {
            try {
                // 1. Resolve real ID
                let channelId = await resolveChannelId(url);

                if (!channelId) {
                    details.push({
                        url,
                        status: 'error',
                        message: '无法解析频道ID (无效的链接)'
                    });
                    continue;
                }

                // 2. Check existence BEFORE fetching stats to save quota
                const existing = await prisma.channel.findUnique({ where: { id: channelId } });

                if (existing) {
                    console.log(`[AddChannel] Channel ${existing.name} (${channelId}) already exists. Update group only.`);
                    // Update group if provided and different
                    if (groupId && existing.groupId !== parseInt(groupId)) {
                        await prisma.channel.update({
                            where: { id: channelId },
                            data: { groupId: parseInt(groupId) }
                        });
                    }

                    details.push({
                        url,
                        status: 'exists',
                        message: '频道已存在',
                        channelName: existing.name
                    });
                    continue; // SKIP fetching stats and videos
                }

                // 3. Refresh stats (Only for NEW channels)
                let stats;
                try {
                    stats = await updateChannelStats(channelId);
                } catch (err) {
                    console.error("Failed to fetch initial stats", err);
                    // Use fallback if stats fetch fails but we have an ID? 
                    // Or treat as error? Let's try to proceed as "Unknown" if we have ID.
                    // But actually resolveChannelId might have succeeded.
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

                details.push({
                    url,
                    status: 'success',
                    message: '添加成功',
                    channelName: ch.name,
                    channel: {
                        ...ch,
                        viewCount: ch.viewCount.toString()
                    }
                });

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
            } catch (e: any) {
                console.error(`[AddChannel] Failed to add ${url}`, e);
                details.push({
                    url,
                    status: 'error',
                    message: e.message || '未知错误'
                });
            }
        }

        return NextResponse.json({ results: details });
    } catch (e) {
        console.error("[API] Failed to parse request body or other error", e);
        return NextResponse.json({ error: "Invalid request body or server error" }, { status: 400 });
    }
}
