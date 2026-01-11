import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subDays } from "date-fns";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type");
        const groupId = searchParams.get("groupId");
        const dateRange = searchParams.get("dateRange") || "3d";
        const filterType = searchParams.get("filterType") || "all";
        const sortOrder = searchParams.get("sort") || "viewCount";

        // Base filter
        let where: any = {};
        if (groupId && groupId !== "null" && groupId !== "-1") {
            where.channel = { groupId: parseInt(groupId) };
        } else if (groupId === "-1") {
            where.channel = { groupId: null };
        }

        // Date Filter
        const now = new Date();
        let dateLimit = subDays(now, 3);
        if (dateRange === "7d") dateLimit = subDays(now, 7);
        if (dateRange === "30d") dateLimit = subDays(now, 30);

        where.publishedAt = { gte: dateLimit };

        // Type Filter
        if (filterType === "video") where.isShort = false;
        if (filterType === "short") where.isShort = true;

        // Shared sort helper
        const sortVideos = (videos: any[], sort: string) => {
            return videos.map(v => {
                const viewCount = Number(v.viewCount);
                const subCount = v.channel.subscriberCount || 1;
                const hoursSince = (now.getTime() - new Date(v.publishedAt).getTime()) / (1000 * 60 * 60);
                const vph = hoursSince > 0 ? viewCount / hoursSince : viewCount;
                const ratio = subCount > 0 ? viewCount / subCount : 0;
                const engagementRate = viewCount > 0 ? ((v.likeCount || 0) + (v.commentCount || 0)) / viewCount : 0;
                const zScore = ratio; // Simplified

                return { ...v, viewCount: v.viewCount.toString(), vph, ratio, engagementRate, zScore };
            }).sort((a, b) => {
                if (sort === "vph") return b.vph - a.vph;
                if (sort === "viral") return b.ratio - a.ratio;
                if (sort === "er") return b.engagementRate - a.engagementRate;
                if (sort === "zScore") return b.zScore - a.zScore;
                return Number(b.viewCount) - Number(a.viewCount);
            });
        };

        // 1. Viral Radar (High Volume)
        if (type === "viral") {
            const videos = await prisma.video.findMany({
                where,
                include: { channel: true },
                take: 200
            });
            // Default sort for Viral is ViewCount or VPH
            const sorted = sortVideos(videos, sortOrder === "viewCount" ? "viewCount" : sortOrder);
            return NextResponse.json(sorted.slice(0, 10));
        }

        // 2. Outliers / Black Horse (High Efficiency)
        if (type === "outlier") {
            const videos = await prisma.video.findMany({
                where,
                include: { channel: true },
                take: 500
            });
            // Default sort for Outlier is Viral Ratio or Z-Score
            // Use user sort if provided, but default to 'viral' if generic 'viewCount' is passed
            const actualSort = (sortOrder === "viewCount") ? "viral" : sortOrder;
            const sorted = sortVideos(videos, actualSort);

            // Filter only true outliers? Or just top sorted? 
            // User wants insights, so pure top sorted by Ratio/ZScore is best "Black Horse"
            return NextResponse.json(sorted.filter(v => v.ratio > 0.5).slice(0, 10));
        }

        // 3. Group Stats (Average View Count per Group)
        if (type === "group_stats") {
            // Need all videos within range, not restricted by selected group (unless we want to? No, usually summary compares groups)
            // The 'where' clause already respects filters. If groupId is passed in query, 'where' limits to that group.
            // But for "Group Stats" we likely want to see ALL groups even if one is selected, OR we only call this when NO group is selected.
            // Let's assume this endpoint is called without groupId restriction, or we verify how it's called.
            // To be safe, let's create a separate 'whereGlobal' that ignores groupId but keeps date/type filters.

            const whereGlobal = { ...where };
            delete whereGlobal.channel; // Remove group restriction

            const videos = await prisma.video.findMany({
                where: whereGlobal,
                select: {
                    viewCount: true,
                    channel: {
                        select: {
                            groupId: true
                        }
                    }
                }
            });

            const groups = await prisma.group.findMany();
            const groupMap = new Map<number | string, { totalViews: number; count: number; name: string }>();

            // Initialize groups
            groups.forEach(g => {
                groupMap.set(g.id, { totalViews: 0, count: 0, name: g.name });
            });
            groupMap.set("null", { totalViews: 0, count: 0, name: "未分组" });

            // Aggregate
            videos.forEach(v => {
                const gid = v.channel.groupId || "null";
                const entry = groupMap.get(gid);
                if (entry) {
                    entry.totalViews += Number(v.viewCount);
                    entry.count += 1;
                }
            });

            const result = Array.from(groupMap.entries())
                .map(([id, data]) => ({
                    id,
                    name: data.name,
                    avgViewCount: data.count > 0 ? Math.round(data.totalViews / data.count) : 0,
                    totalViews: data.totalViews,
                    videoCount: data.count
                }))
                .filter(g => g.videoCount > 0) // Only show active groups? Or all? User said "average playback data for each group".
                .sort((a, b) => b.avgViewCount - a.avgViewCount);

            return NextResponse.json(result);
        }

        // 4. Channel Stats (Top Channels by Views/Avg)
        if (type === "channel_stats") {
            const videos = await prisma.video.findMany({
                where, // Use current filters including groupId
                include: { channel: true }
            });

            const channelMap = new Map<string, { totalViews: number; count: number; avgViews: number; channel: any }>();

            videos.forEach(v => {
                const cid = v.channelId;
                if (!channelMap.has(cid)) {
                    channelMap.set(cid, { totalViews: 0, count: 0, avgViews: 0, channel: v.channel });
                }
                const entry = channelMap.get(cid)!;
                entry.totalViews += Number(v.viewCount);
                entry.count += 1;
            });

            const result = Array.from(channelMap.values())
                .map(d => ({
                    ...d,
                    avgViews: Math.round(d.totalViews / d.count)
                }))
                .sort((a, b) => b.totalViews - a.totalViews) // Default to Total Views
                .slice(0, 50); // Return top 50, let frontend filter top 10

            return NextResponse.json(result);
        }

        return NextResponse.json({ error: "Invalid type" }, { status: 400 });

    } catch (e: any) {
        console.error("Analysis API Error", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
