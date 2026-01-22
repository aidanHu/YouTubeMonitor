"use client";

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Eye } from "lucide-react";
import Link from "next/link";
import { WatchPageActions } from "@/components/WatchPageActions";

interface VideoDetail {
    id: string;
    title: string;
    description: string;
    published_at: string;
    view_count: string;
    like_count: string;
    comment_count: string;
    channel: {
        id: string;
        name: string;
        thumbnail: string;
    };
    url: string;
    local_path?: string | null;
    is_favorite?: boolean;
}

export default function WatchClientPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const id = searchParams.get('id');
    const [video, set_video] = useState<VideoDetail | null>(null);
    const [loading, set_loading] = useState(true);

    useEffect(() => {
        if (id) {
            invoke<any>('get_video', { id })
                .then(data => {
                    const videoDetail: VideoDetail = {
                        id: data.id,
                        title: data.title,
                        description: "", // Not stored in DB currently
                        published_at: data.published_at,
                        view_count: String(data.view_count),
                        like_count: String(data.like_count || 0),
                        comment_count: String(data.comment_count || 0),
                        channel: {
                            id: data.channel_id,
                            name: data.channel_name,
                            thumbnail: data.channel_thumbnail || ""
                        },
                        url: data.url,
                        local_path: data.local_path,
                        is_favorite: data.is_favorite
                    };
                    set_video(videoDetail);
                    set_loading(false);
                })
                .catch(err => {
                    console.error("WatchPage Error:", err);
                    set_loading(false);
                });
        }
    }, [id]);

    return (
        <div className="h-screen overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
            {/* Header / Back Button - Matches Channel Page Layout */}
            <div className="h-8 w-full shrink-0" data-tauri-drag-region />
            <div className="max-w-[2000px] mx-auto px-8 pt-8 w-full">
                <button
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 font-medium"
                >
                    <ArrowLeft size={20} />
                    <span>返回</span>
                </button>
            </div>

            {/* Main Content Area */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                {loading ? (
                    <div className="flex items-center justify-center h-[60vh] text-zinc-500">
                        <div className="animate-pulse">加载中...</div>
                    </div>
                ) : !video ? (
                    <div className="flex items-center justify-center h-[60vh] text-zinc-500">视频未找到</div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Main Content: Player & Actions */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Player */}
                            <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl">
                                <iframe
                                    src={`https://www.youtube.com/embed/${id}?autoplay=1`}
                                    className="w-full h-full"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                            </div>

                            {/* Title */}
                            <div>
                                <h1 className="text-2xl font-bold leading-tight mb-2">{video.title}</h1>
                                <div className="flex items-center gap-4 text-sm text-zinc-500">
                                    <span className="flex items-center gap-1"><Eye size={16} /> {Number(video.view_count).toLocaleString()} 观看</span>
                                    <span className="flex items-center gap-1"><Calendar size={16} /> {new Date(video.published_at).toLocaleDateString()}</span>
                                </div>
                            </div>

                            {/* Action Bar - Isolated Component for Performance */}
                            <WatchPageActions video={video} />

                            {/* Description */}
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed">
                                {video.description}
                            </div>
                        </div>

                        {/* Sidebar: Channel Info & Stats */}
                        <div className="overflow-hidden">
                            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                                <h3 className="font-bold text-lg mb-4">关于频道</h3>
                                <Link href={`/channel?id=${video.channel.id}`} className="flex items-center gap-3 mb-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 p-2 -mx-2 rounded-xl transition-colors group">
                                    <img src={video.channel.thumbnail} className="w-12 h-12 rounded-full group-hover:opacity-90 transition-opacity" />
                                    <div className="font-bold text-lg truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{video.channel.name}</div>
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
