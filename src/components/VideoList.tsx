"use client";

import { invoke } from "@tauri-apps/api/core";
import { VideoCard } from "@/components/VideoCard";
import { calculateVPH } from "@/utils/analytics";
import { LayoutGrid, PlaySquare, Lock } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useData } from "@/context/DataContext";
import { VirtuosoGrid } from "react-virtuoso";
import { Video } from "@/types";

interface VideoWithStats extends Video {
    avg_views?: number;
    stdDev?: number;
}

interface VideoListProps {
    group_id?: number | null;
    filter?: "favorites" | "all";
    sort_order: "view_count" | "published_at" | "viral" | "vph" | "z_score";
    filter_type: "all" | "video" | "short";
    search_query?: string;
    date_range?: "all" | "3d" | "7d" | "30d";
    scrollParent?: HTMLElement | null;
}

export function VideoList({
    group_id = null,
    filter = "all",
    sort_order,
    filter_type,
    search_query = "",
    date_range = "all",
    scrollParent
}: VideoListProps) {
    const { video_cache, set_video_cache, is_activated } = useData();
    const [videos, set_videos] = useState<VideoWithStats[]>([]);
    const [loading, set_loading] = useState(false);
    const [page, set_page] = useState(1);
    const [has_more, set_has_more] = useState(true);

    const generateCacheKey = () => {
        return JSON.stringify({ group_id, filter, sort_order, filter_type, search_query, date_range });
    };

    const fetch_videos = async (reset = false) => {
        const currentCacheKey = generateCacheKey();

        // If resetting, we clear cache immediately for this key
        if (reset) {
            set_loading(true);
        } else {
            // If loading more
            set_loading(true);
        }

        const currentPage = reset ? 1 : page;

        try {
            // Updated to use Tauri invoke
            // Mapped to Rust get_videos signature:
            // page, limit, sort, filter_type, group_id, favorites, search, date_range, channel_id

            interface VideoResponse {
                videos: VideoWithStats[];
                has_more: boolean;
                total: number;
            }

            const res = await invoke<VideoResponse>('get_videos', {
                page: currentPage,
                limit: 50,
                sort: sort_order,
                filter_type,
                group_id: group_id || null,
                favorites: filter === 'favorites',
                search: search_query || null,
                date_range: date_range,
                channel_id: null
            });

            const newVideos = res.videos || [];

            set_videos(prev => {
                const nextVideos = reset ? newVideos : [...prev, ...newVideos];
                return nextVideos;
            });

            // Update Cache (Side Effect safely here)
            const nextVideos = reset ? newVideos : [...videos, ...newVideos];
            if (res.has_more !== undefined) {
                set_video_cache({
                    key: currentCacheKey,
                    videos: nextVideos,
                    page: currentPage + 1,
                    has_more: res.has_more
                });
                set_has_more(res.has_more);
            } else {
                // If has_more missing for some reason
                set_has_more(false);
            }
            set_page(currentPage + 1);
        } catch (e) {
            console.error("Failed to fetch videos via Tauri", e);
        } finally {
            set_loading(false);
        }
    };

    useEffect(() => {
        const cacheKey = generateCacheKey();

        // Check if cache hits
        if (video_cache.key === cacheKey && video_cache.videos.length > 0) {
            set_videos(video_cache.videos);
            set_page(video_cache.page);
            set_has_more(video_cache.has_more);
            set_loading(false);
            return;
        }

        // Cache miss, clean fetch
        set_page(1);
        fetch_videos(true);
    }, [sort_order, filter_type, group_id, filter, search_query, date_range, useData().last_updated]);

    // Block view if not activated
    if (!is_activated) {
        return (
            <div className="flex-1 h-full flex items-center justify-center bg-white dark:bg-zinc-900">
                <div className="text-center space-y-4 max-w-sm mx-auto p-8 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">软件未激活</h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                        请输入激活码以解锁全部功能。
                    </p>
                </div>
            </div>
        );
    }

    const handle_toggle_favorite = (id: string, newStatus: boolean) => {
        const updater = (list: any[]) => {
            if (filter === 'favorites' && !newStatus) {
                return list.filter(v => v.id !== id);
            }
            return list.map(v => v.id === id ? { ...v, is_favorite: newStatus } : v);
        };

        set_videos(prev => updater(prev));

        // Update cache so switching tabs doesn't revert state
        if (video_cache.key === generateCacheKey()) {
            set_video_cache((prev: any) => ({
                ...prev,
                videos: updater(prev.videos)
            }));
        }
    };

    return (
        <div className="h-full">
            {/* Grid */}
            {videos.length > 0 && (
                <VirtuosoGrid
                    style={{ height: '100%' }}
                    customScrollParent={scrollParent || undefined}
                    data={videos}
                    overscan={200}
                    components={{
                        List: React.forwardRef<HTMLDivElement, React.ComponentPropsWithRef<'div'>>(({ style, children, ...props }, ref) => (
                            <div
                                ref={ref}
                                {...props}
                                style={style}
                                className="grid grid-cols-[repeat(auto-fill,220px)] gap-4 items-stretch pb-20"
                            >
                                {children}
                            </div>
                        ))
                    }}
                    itemContent={(index: number, video: VideoWithStats) => {
                        const vph = calculateVPH(video.published_at, Number(video.view_count));
                        // Use channel info from backend
                        const channelAvg = video.avg_views || 0;
                        const channelStdDev = video.stdDev || 0;
                        const views = Number(video.view_count);
                        const multiplier = channelAvg > 0 ? views / channelAvg : 0;
                        const z_score = channelStdDev > 0 ? (views - channelAvg) / channelStdDev : 0;

                        const metrics = {
                            vph,
                            er: 0,
                            z_score,
                            multiplier,
                            label: "Normal" as "Normal" | "Viral" | "High"
                        };

                        if (video.like_count !== undefined && video.comment_count !== undefined) {
                            metrics.er = ((video.like_count || 0) + (video.comment_count || 0)) / views * 100;
                        }

                        if (multiplier > 2.5) metrics.label = "Viral" as const;
                        else if (multiplier > 1.2) metrics.label = "High" as const;

                        return (
                            <div className="h-full">
                                <VideoCard
                                    key={video.id}
                                    video={video}
                                    show_channel={true}
                                    metrics={metrics}
                                    on_toggle_favorite={handle_toggle_favorite}
                                />
                            </div>
                        );
                    }}
                    endReached={() => {
                        if (has_more && !loading) {
                            fetch_videos(false);
                        }
                    }}
                />
            )}

            {/* Loading */}
            {loading && (
                <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"></div>
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
