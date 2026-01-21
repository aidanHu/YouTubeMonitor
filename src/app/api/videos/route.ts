import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const sort = searchParams.get("sort") || "viewCount"; // viewCount, publishedAt, vph, viral
    const groupId = searchParams.get("groupId");
    const type = searchParams.get("type") || "all"; // all, video, short
    const filter = searchParams.get("filter"); // favorites
    const q = searchParams.get("q"); // Search query
    const dateRange = searchParams.get("dateRange"); // 3d, 7d, 30d, all

    console.log(`API videos: dateRange=${dateRange}, sort=${sort}, page=${page}`);

    const skip = (page - 1) * limit;

    const where: any = {};

    if (dateRange && dateRange !== "all") {
        const now = new Date();
        let days = 0;
        if (dateRange === "3d") days = 3;
        else if (dateRange === "7d") days = 7;
        else if (dateRange === "30d") days = 30;

        if (days > 0) {
            const dateThreshold = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
            // Ensure db compare works
            where.publishedAt = {
                gte: dateThreshold
            };
            console.log(`Filtering from: ${dateThreshold.toISOString()}`);
        }
    }
    if (groupId && groupId !== "all") {
        const id = parseInt(groupId);
        where.channel = {
            groupId: id === -1 ? null : id
        };
    }

    if (filter === "favorites") {
        where.isFavorite = true;
    }

    if (type === "video") {
        where.isShort = false;
    } else if (type === "short") {
        where.isShort = true;
    }

    if (q) {
        where.title = {
            contains: q
        };
    }

    try {
        let sortedVideoIds: string[] = [];
        let total = 0;

        // Specialized sorting for computed metrics (VPH, Viral (Multiplier), Z-Score)
        if (sort === "vph" || sort === "viral" || sort === "zScore") {
            // 1. Fetch minimal data for ALL matching videos
            const allVideos = await prisma.video.findMany({
                where,
                select: {
                    id: true,
                    publishedAt: true,
                    viewCount: true,
                    channelId: true
                }
            });
            total = allVideos.length;

            // 2. Prepare for scoring (Calculate Mean and StdDev)
            let channelStats = new Map<string, { mean: number, stdDev: number }>();

            if (sort === "viral" || sort === "zScore") {
                // Determine involved channels
                const distinctChannelIds = [...new Set(allVideos.map(v => v.channelId))];

                // Fetch ALL videos for these channels to compute accurate stats (not just filtered ones)
                // Wait, fetching ALL videos for ALL channels might be too heavy if huge.
                // But for a monitor app it's likely okay. 
                // Alternatively, use the videos we have? No, stats should be based on channel history.
                // Let's rely on Prisma groupBy check or just fetch needed stats.
                // To get StdDev, we need raw values. Prisma groupBy doesn't give StdDev.
                // We'll fetch viewCounts for these channels.

                const videosForStats = await prisma.video.findMany({
                    where: { channelId: { in: distinctChannelIds } },
                    select: { channelId: true, viewCount: true }
                });

                const tempStats = new Map<string, { sum: number, count: number, values: number[] }>();

                for (const v of videosForStats) {
                    const views = Number(v.viewCount);
                    if (!tempStats.has(v.channelId)) {
                        tempStats.set(v.channelId, { sum: 0, count: 0, values: [] });
                    }
                    const stat = tempStats.get(v.channelId)!;
                    stat.sum += views;
                    stat.count++;
                    stat.values.push(views);
                }

                tempStats.forEach((stat, channelId) => {
                    const mean = stat.count > 0 ? stat.sum / stat.count : 0;
                    // Calc StdDev
                    let sqDiffSum = 0;
                    for (const val of stat.values) {
                        sqDiffSum += Math.pow(val - mean, 2);
                    }
                    const variance = stat.count > 0 ? sqDiffSum / stat.count : 0;
                    const stdDev = Math.sqrt(variance);

                    channelStats.set(channelId, { mean, stdDev });
                });
            }

            // 3. Sort in memory
            allVideos.sort((a, b) => {
                let scoreA = 0;
                let scoreB = 0;

                if (sort === "vph") {
                    const hoursA = (Date.now() - a.publishedAt.getTime()) / (1000 * 60 * 60);
                    const hoursB = (Date.now() - b.publishedAt.getTime()) / (1000 * 60 * 60);
                    scoreA = Number(a.viewCount) / Math.max(hoursA, 0.1);
                    scoreB = Number(b.viewCount) / Math.max(hoursB, 0.1);
                } else if (sort === "viral") { // Multiplier
                    const statsA = channelStats.get(a.channelId);
                    const statsB = channelStats.get(b.channelId);
                    scoreA = (statsA && statsA.mean > 0) ? Number(a.viewCount) / statsA.mean : 0;
                    scoreB = (statsB && statsB.mean > 0) ? Number(b.viewCount) / statsB.mean : 0;
                } else if (sort === "zScore") {
                    const statsA = channelStats.get(a.channelId);
                    const statsB = channelStats.get(b.channelId);
                    scoreA = (statsA && statsA.stdDev > 0) ? (Number(a.viewCount) - statsA.mean) / statsA.stdDev : 0;
                    scoreB = (statsB && statsB.stdDev > 0) ? (Number(b.viewCount) - statsB.mean) / statsB.stdDev : 0;
                }

                return scoreB - scoreA; // Descending
            });

            // 4. Slash and paginate
            const pagedItems = allVideos.slice(skip, skip + limit);
            sortedVideoIds = pagedItems.map(v => v.id);

        } else {
            // Standard Database Sorting
            let orderBy: any = {};
            if (sort === "viewCount") {
                orderBy = { viewCount: "desc" };
            } else if (sort === "publishedAt") {
                orderBy = { publishedAt: "desc" };
            } else {
                orderBy = { publishedAt: "desc" };
            }

            const [videos, count] = await Promise.all([
                prisma.video.findMany({
                    where,
                    select: { id: true },
                    orderBy,
                    skip,
                    take: limit,
                }),
                prisma.video.count({ where })
            ]);

            sortedVideoIds = videos.map(v => v.id);
            total = count;
        }

        // ...

        // 5. Hydrate full data for the selected IDs
        if (sortedVideoIds.length === 0) {
            return NextResponse.json({
                data: [],
                pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
            });
        }

        const videosData = await prisma.video.findMany({
            where: { id: { in: sortedVideoIds } },
            include: { channel: true }
        });

        // Re-sort results to match the ID order
        const videosMap = new Map(videosData.map(v => [v.id, v]));
        const orderedVideos = sortedVideoIds
            .map(id => videosMap.get(id))
            .filter(v => v !== undefined) as typeof videosData;

        // 6. Append Channel Stats (Avg Views) for Frontend Display Logic
        // We calculate this for the *current page* of videos so the frontend can show multipliers
        const pageChannelIds = [...new Set(orderedVideos.map(v => v.channelId))];

        // Recalculate stats for the PAGE items (or reuse if we have them?)
        // To be consistent, let's just fetch/calc safely for these IDs again or carry over.
        // Doing it again for just the page channels is cheap.

        const videosForPageStats = await prisma.video.findMany({
            where: { channelId: { in: pageChannelIds } },
            select: { channelId: true, viewCount: true }
        });

        // Compute Mean/StdDev for page items
        const finalStats = new Map<string, { mean: number, stdDev: number }>();
        // ... (Same logic as above, can refactor to helper but inline is fine for now)
        // Actually, let's reuse logic.

        const tempStats = new Map<string, { sum: number, count: number, values: number[] }>();
        for (const v of videosForPageStats) {
            const views = Number(v.viewCount);
            if (!tempStats.has(v.channelId)) tempStats.set(v.channelId, { sum: 0, count: 0, values: [] });
            const s = tempStats.get(v.channelId)!;
            s.sum += views; s.count++; s.values.push(views);
        }
        tempStats.forEach((s, id) => {
            const mean = s.count > 0 ? s.sum / s.count : 0;
            const sqDiff = s.values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
            const stdDev = Math.sqrt(s.count > 0 ? sqDiff / s.count : 0);
            finalStats.set(id, { mean, stdDev });
        });

        const serialized = orderedVideos.map(v => {
            const stats = finalStats.get(v.channelId) || { mean: 0, stdDev: 0 };
            return {
                id: v.id,
                title: v.title,
                url: v.url,
                thumbnail: v.thumbnail,
                publishedAt: v.publishedAt,
                viewCount: v.viewCount.toString(),
                likeCount: v.likeCount,
                commentCount: v.commentCount,
                isShort: v.isShort,
                isFavorite: v.isFavorite,
                channelId: v.channelId,
                channel: {
                    id: v.channel.id,
                    name: v.channel.name,
                    thumbnail: v.channel.thumbnail,
                    url: v.channel.url,
                    subscriberCount: v.channel.subscriberCount,
                    viewCount: v.channel.viewCount.toString(),
                    videoCount: v.channel.videoCount,
                    isFavorite: v.channel.isFavorite,
                    avgViews: stats.mean,
                    stdDev: stats.stdDev
                },
                localPath: v.localPath // Expose local path for frontend
            };
        });

        return NextResponse.json({
            data: serialized,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (e) {
        console.error("Failed to fetch videos", e);
        return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 });
    }
}
