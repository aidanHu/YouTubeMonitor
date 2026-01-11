"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Filter } from "lucide-react";
import Link from "next/link";
import { calculateVPH, calculateER } from "@/utils/analytics";
import { useSearchParams } from "next/navigation";
import { VideoCard } from "@/components/VideoCard";

interface Video {
    id: string;
    title: string;
    url: string;
    thumbnail: string | null;
    publishedAt: string;
    viewCount: string;
    likeCount: number | null;
    commentCount: number | null;
    isShort: boolean;
    channel: {
        name: string;
        thumbnail: string | null;
    };
}

import { Suspense } from "react";

function VideosContent() {
    const searchParams = useSearchParams();
    const groupId = searchParams.get("groupId");

    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState<"viewCount" | "publishedAt">("viewCount");
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const fetchVideos = async (reset = false) => {
        setLoading(true);
        const currentPage = reset ? 1 : page;
        try {
            let url = `/api/videos?page=${currentPage}&limit=50&sort=${sort}`;
            if (groupId) {
                url += `&groupId=${groupId}`;
            }
            const res = await fetch(url);
            const data = await res.json();

            if (reset) {
                setVideos(data.data);
            } else {
                setVideos(prev => [...prev, ...data.data]);
            }

            setHasMore(data.pagination.page < data.pagination.totalPages);
            setPage(currentPage + 1);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setPage(1);
        fetchVideos(true);
    }, [sort, groupId]);

    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans p-8">
            <div className="max-w-7xl mx-auto">
                <Link
                    href="/"
                    className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6"
                >
                    <ArrowLeft size={16} className="mr-2" /> 返回仪表盘
                </Link>

                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Filter size={24} /> 所有视频
                    </h1>

                    <div className="flex items-center gap-2">
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as any)}
                            className="bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg px-4 py-2 text-sm font-medium"
                        >
                            <option value="viewCount">按播放量</option>
                            <option value="publishedAt">按时间</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {videos.map((video) => {
                        const views = parseInt(video.viewCount);
                        const vph = calculateVPH(video.publishedAt, views);

                        // Create metrics object for VideoCard
                        const metrics = {
                            vph,
                            er: 0,
                            zScore: 0,
                            multiplier: 0,
                            label: "Normal" as const
                        };

                        if (video.likeCount !== null && video.commentCount !== null) {
                            metrics.er = ((video.likeCount || 0) + (video.commentCount || 0)) / views * 100;
                        }

                        // Heuristic for "Viral" in global view
                        if (views > 500000 || vph > 1000) {
                            metrics.label = "Viral";
                        }

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

                {hasMore && (
                    <div className="mt-8 text-center">
                        <button
                            onClick={() => fetchVideos(false)}
                            disabled={loading}
                            className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-6 py-2 rounded-full text-sm font-medium disabled:opacity-50"
                        >
                            {loading ? "加载中..." : "加载更多"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function GlobalVideosPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">加载中...</div>}>
            <VideosContent />
        </Suspense>
    );
}
