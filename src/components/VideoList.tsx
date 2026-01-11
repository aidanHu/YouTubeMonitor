"use client";

import { VideoCard } from "@/components/VideoCard";
import { calculateVPH } from "@/utils/analytics";
import { LayoutGrid, PlaySquare } from "lucide-react";
import { useEffect, useState } from "react";
import { useData } from "@/context/DataContext";

interface VideoListProps {
    groupId?: number | null;
    filter?: "favorites" | "all";
    sortOrder: "viewCount" | "publishedAt" | "viral" | "vph" | "zScore";
    filterType: "all" | "video" | "short";
    searchQuery?: string;
    dateRange?: "all" | "3d" | "7d" | "30d";
}

export function VideoList({
    groupId = null,
    filter = "all",
    sortOrder,
    filterType,
    searchQuery = "",
    dateRange = "all"
}: VideoListProps) {
    const { videoCache, setVideoCache } = useData();
    const [videos, setVideos] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const generateCacheKey = () => {
        return JSON.stringify({ groupId, filter, sortOrder, filterType, searchQuery, dateRange });
    };

    const fetchVideos = async (reset = false) => {
        const currentCacheKey = generateCacheKey();

        // If resetting, we clear cache immediately for this key
        if (reset) {
            setLoading(true);
        } else {
            // If loading more
            setLoading(true);
        }

        const currentPage = reset ? 1 : page;

        try {
            let url = `/api/videos?page=${currentPage}&limit=50&sort=${sortOrder}&type=${filterType}`;
            if (groupId) url += `&groupId=${groupId}`;
            if (filter === "favorites") url += `&filter=favorites`;
            if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;
            if (dateRange && dateRange !== "all") url += `&dateRange=${dateRange}`;

            const res = await fetch(url);
            const data = await res.json();
            const newVideos = data.data || [];

            setVideos(prev => {
                const nextVideos = reset ? newVideos : [...prev, ...newVideos];
                return nextVideos;
            });

            // Update Cache (Side Effect safely here)
            const nextVideos = reset ? newVideos : [...videos, ...newVideos];
            setVideoCache({
                key: currentCacheKey,
                videos: nextVideos,
                page: currentPage + 1,
                hasMore: data.pagination.page < data.pagination.totalPages
            });

            setHasMore(data.pagination.page < data.pagination.totalPages);
            setPage(currentPage + 1);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const cacheKey = generateCacheKey();

        // Check if cache hits
        if (videoCache.key === cacheKey && videoCache.videos.length > 0) {
            console.log("Restoring videos from cache", videoCache.videos.length);
            setVideos(videoCache.videos);
            setPage(videoCache.page);
            setHasMore(videoCache.hasMore);
            setLoading(false);
            return;
        }

        // Cache miss, clean fetch
        setPage(1);
        fetchVideos(true);
    }, [sortOrder, filterType, groupId, filter, searchQuery, dateRange]);

    return (
        <div>
            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
                {videos.map((video) => {
                    const vph = calculateVPH(video.publishedAt, video.viewCount);
                    // Use channel info from API to calculate Viral Multiplier
                    const channelAvg = (video as any).channel?.avgViews || 0;
                    const channelStdDev = (video as any).channel?.stdDev || 0;
                    const views = Number(video.viewCount);
                    const multiplier = channelAvg > 0 ? views / channelAvg : 0;
                    const zScore = channelStdDev > 0 ? (views - channelAvg) / channelStdDev : 0;

                    const metrics = {
                        vph,
                        er: 0,
                        zScore,
                        multiplier,
                        label: "Normal" as "Normal" | "Viral" | "High"
                    };

                    if (video.likeCount !== undefined && video.commentCount !== undefined) {
                        metrics.er = ((video.likeCount || 0) + (video.commentCount || 0)) / views * 100;
                    }

                    if (multiplier > 2.5) metrics.label = "Viral" as const;
                    else if (multiplier > 1.2) metrics.label = "High" as const;

                    return (
                        <VideoCard
                            key={video.id}
                            video={video}
                            showChannel={true}
                            metrics={metrics}
                        />
                    );
                })}
            </div>

            {/* Loading & More */}
            {loading && (
                <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"></div>
                </div>
            )}

            {!loading && hasMore && videos.length > 0 && (
                <div className="mt-8 text-center">
                    <button
                        onClick={() => fetchVideos(false)}
                        className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-6 py-2 rounded-full text-sm font-medium transition-colors"
                    >
                        加载更多
                    </button>
                </div>
            )}

            {!loading && videos.length === 0 && (
                <div className="text-center py-20">
                    <p className="text-zinc-400">暂无视频</p>
                </div>
            )}
        </div>
    );
}
