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
    published_at: string;
    view_count: string;
    like_count: number | null;
    comment_count: number | null;
    is_short: boolean;
    channel: {
        name: string;
        thumbnail: string | null;
    };
}

import { Suspense } from "react";

function VideosContent() {
    const searchParams = useSearchParams();
    const group_id = searchParams.get("group_id");

    const [videos, set_videos] = useState<Video[]>([]);
    const [loading, set_loading] = useState(true);
    const [sort, set_sort] = useState<"view_count" | "published_at">("view_count");
    const [page, set_page] = useState(1);
    const [has_more, set_has_more] = useState(true);

    const fetch_videos = async (reset = false) => {
        set_loading(true);
        const currentPage = reset ? 1 : page;
        try {
            let url = `/api/videos?page=${currentPage}&limit=50&sort=${sort}`;
            if (group_id) {
                url += `&group_id=${group_id}`;
            }
            const res = await fetch(url);
            const data = await res.json();

            if (reset) {
                set_videos(data.data);
            } else {
                set_videos(prev => [...prev, ...data.data]);
            }

            set_has_more(data.pagination.page < data.pagination.totalPages);
            set_page(currentPage + 1);
        } catch (e) {
            console.error(e);
        } finally {
            set_loading(false);
        }
    };

    useEffect(() => {
        set_page(1);
        fetch_videos(true);
    }, [sort, group_id]);

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
                            onChange={(e) => set_sort(e.target.value as any)}
                            className="bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg px-4 py-2 text-sm font-medium"
                        >
                            <option value="view_count">按播放量</option>
                            <option value="published_at">按时间</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {videos.map((video) => {
                        const views = parseInt(video.view_count);
                        const vph = calculateVPH(video.published_at, views);

                        // Create metrics object for VideoCard
                        const metrics = {
                            vph,
                            er: 0,
                            z_score: 0,
                            multiplier: 0,
                            label: "Normal" as const
                        };

                        if (video.like_count !== null && video.comment_count !== null) {
                            metrics.er = ((video.like_count || 0) + (video.comment_count || 0)) / views * 100;
                        }

                        // Heuristic for "Viral" in global view
                        if (views > 500000 || vph > 1000) {
                            metrics.label = "Viral";
                        }

                        return (
                            <VideoCard
                                key={video.id}
                                video={video}
                                show_channel={true}
                                metrics={metrics}
                            />
                        );
                    })}
                </div>

                {has_more && (
                    <div className="mt-8 text-center">
                        <button
                            onClick={() => fetch_videos(false)}
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
