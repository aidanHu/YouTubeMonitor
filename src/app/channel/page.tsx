"use client";

import { Channel, Group, Video } from "@/types";
import { ArrowLeft, ExternalLink, RefreshCw, ChevronDown, Edit, Trash2, DownloadCloud, Heart } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { calculateChannelStats, analyzeVideo, VideoMetrics } from "@/utils/analytics";
import { VideoCard } from "@/components/VideoCard";
import { MoveChannelModal } from "@/components/MoveChannelModal";
import { useData } from "@/context/DataContext";
import { useDownloads } from "@/context/DownloadContext";
import { invoke } from "@tauri-apps/api/core";
import { show_alert, show_confirm, show_error } from "@/lib/dialogs";
import { ChannelPageSkeleton } from "@/components/ChannelPageSkeleton";
import { VirtuosoGrid } from "react-virtuoso";

interface ChannelDetail extends Channel {
    videos: Video[];
}

function SyncButton({ channel_id, on_sync, on_complete }: { channel_id: string, on_sync: () => void, on_complete: () => void }) {
    const [loading, set_loading] = useState(false);
    const [open, set_open] = useState(false);

    const handle_sync = async (days: number | null) => {
        set_open(false);
        set_loading(true);
        on_sync();

        let date_range = null;
        if (days) {
            date_range = `now-${days}days`;
        }

        try {
            await invoke('refresh_channel', { channel_id, date_range });
            on_complete();
        } catch (e: any) {
            console.error(e);
            await show_error("同步失败: " + e.toString());
        } finally {
            set_loading(false);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => set_open(!open)}
                disabled={loading}
                className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
            >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                {loading ? "同步中..." : "同步视频"}
                <ChevronDown size={14} />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden z-20 flex flex-col">
                    <div className="px-3 py-2 text-xs font-medium text-zinc-500 bg-zinc-50 dark:bg-zinc-950/50">
                        选择时间范围
                    </div>
                    <button onClick={() => handle_sync(30)} className="px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm">
                        最近 30 天
                    </button>
                    <button onClick={() => handle_sync(90)} className="px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm">
                        最近 3 个月
                    </button>
                    <button onClick={() => handle_sync(365)} className="px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm">
                        最近 1 年
                    </button>
                    <button onClick={() => handle_sync(null)} className="px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm text-red-500">
                        全部视频 (耗时)
                    </button>
                </div>
            )}
            {/* Backdrop to close */}
            {open && <div className="fixed inset-0 z-10" onClick={() => set_open(false)} />}
        </div>
    );
}

function ChannelContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const channel_id = searchParams.get('id');
    const { groups, refreshData, set_channels, set_video_cache, channels, scroll_positions, set_scroll_position } = useData();
    const { queue_downloads } = useDownloads();

    const [channel, set_channel] = useState<ChannelDetail | null>(null);
    const [loading, set_loading] = useState(true);
    const [fetching_videos, set_fetching_videos] = useState(false);
    const [is_move_modal_open, set_is_move_modal_open] = useState(false);
    const [active_tab, set_active_tab] = useState<"all" | "videos" | "shorts" | "favorites">("all");
    const [sortBy, set_sort_by] = useState<"published_at" | "view_count" | "vph" | "er" | "z_score" | "viral">("published_at");
    const [is_downloading_all, set_is_downloading_all] = useState(false);

    const scrollerRef = React.useRef<HTMLElement>(null);

    const scrollPosRef = React.useRef(0);

    // 1. Restore effect
    useEffect(() => {
        if (!channel_id || loading) return;
        const key = `channel_${channel_id}`;
        const saved = scroll_positions[key];

        if (saved && saved > 0) {
            const attemptRestore = (tries = 0) => {
                if (scrollerRef.current) {
                    if (scrollerRef.current.scrollHeight >= saved) {
                        scrollerRef.current.scrollTop = saved;
                    } else if (tries < 20) {
                        setTimeout(() => attemptRestore(tries + 1), 50);
                    }
                } else if (tries < 20) {
                    setTimeout(() => attemptRestore(tries + 1), 50);
                }
            };
            // Small delay to ensure layout is stable
            requestAnimationFrame(() => attemptRestore());
        }
    }, [channel_id, loading]);

    // Track scroll position in real-time to avoid "ref is null on unmount" issues
    const handleScroll = useCallback((e: any) => {
        if (e.target) {
            scrollPosRef.current = e.target.scrollTop;
        }
    }, []);

    // 2. Save on unmount
    useEffect(() => {
        return () => {
            if (channel_id && scrollPosRef.current > 0) {
                set_scroll_position(`channel_${channel_id}`, scrollPosRef.current);
            }
        };
    }, [channel_id]);

    const fetch_data = useCallback(() => {
        if (!channel_id) return;

        // If we don't have channel yet, show full loading. 
        // If we have cached channel (optimistic), only show video loading.
        // We can check 'channel' state here? 
        // But useCallback doesn't depend on 'channel' (to avoid loop).
        // relying on set_loading logic inside.

        // Actually we can set_fetching_videos(true) always, and set_loading(true) only if !channel (but we can't see channel here if not in dep).
        // Let's rely on the useEffect below to handle the optimistic set.
        // If we invoke, we should set fetching_videos.
        set_fetching_videos(true);

        invoke<any>('get_channel_details', { id: channel_id })
            .then((data) => {
                set_channel(data);
                set_loading(false);
                set_fetching_videos(false);
            })
            .catch((err) => {
                console.error("[ChannelPage] Error:", err);
                set_loading(false);
                set_fetching_videos(false);
            });
    }, [channel_id]);

    // Optimistic Load from Cache
    useEffect(() => {
        if (channel_id && !channel && channels.length > 0) {
            const cached = channels.find(c => c.id === channel_id);
            if (cached) {
                // Determine group object from group_id if not present
                const group = groups.find(g => g.id === cached.group_id);
                set_channel({ ...cached, videos: [], group });
                set_loading(false); // Show header immediately
                set_fetching_videos(true);
            }
        }
    }, [channel_id, channels, groups, channel]);

    useEffect(() => {
        if (channel_id) {
            fetch_data();
        }
    }, [channel_id, fetch_data]);

    const handle_move_channel = async (group_id: number | null) => {
        if (!channel_id) return;

        // Optimistic Update Local
        const newGroup = group_id ? groups.find(g => g.id === group_id) : undefined;
        set_channel(prev => prev ? { ...prev, group_id, group: newGroup || undefined } : null);

        // Optimistic Update Global (Fixes Dashboard stale data)
        set_channels(prev => prev.map(c =>
            c.id === channel_id
                ? { ...c, group_id, group: newGroup || undefined }
                : c
        ));

        try {
            const result = await invoke<{ moved: boolean; message: string }>('move_channel', {
                id: channel_id,
                group_id
            });

            // Show success message with file movement info
            if (result.moved) {
                await show_alert(result.message);
            }

            refreshData(true);
            set_is_move_modal_open(false);
        } catch (err: any) {
            console.error(err);
            await show_error("移动失败: " + err.toString());
            fetch_data(); // Revert local
            refreshData(true); // Revert global
        }
    };

    const handle_create_group = async (name: string) => {
        try {
            const newGroup = await invoke<Group>('create_group', { name });
            await refreshData(true);
            return newGroup;
        } catch (e: any) {
            const msg = e.toString();
            if (msg.includes("UNIQUE constraint failed")) {
                throw new Error("创建分组失败，分组名已存在，请修改后重新创建");
            }
            throw new Error("创建分组失败: " + msg);
        }
    };

    const handle_delete_channel = async () => {
        if (!channel_id || !await show_confirm("确定要删除该频道吗？所有相关数据将被永久删除。", "确认删除")) return;

        try {
            await invoke('delete_channel', { id: channel_id });
            await refreshData(true);
            router.push("/");
        } catch (error: any) {
            console.error("Delete failed", error);
            await show_error("删除失败: " + error.toString());
        }
    };

    const handle_toggle_favorite = async () => {
        if (!channel) return;
        const newStatus = !channel.is_favorite;

        // Optimistic Update
        set_channel(prev => prev ? { ...prev, is_favorite: newStatus } : null);
        set_channels(prev => prev.map(c => c.id === channel.id ? { ...c, is_favorite: newStatus } : c));

        try {
            await invoke('toggle_channel_favorite', { id: channel.id, is_favorite: newStatus });
        } catch (e: any) {
            console.error(e);
            // Revert
            set_channel(prev => prev ? { ...prev, is_favorite: !newStatus } : null);
            set_channels(prev => prev.map(c => c.id === channel.id ? { ...c, is_favorite: !newStatus } : c));
            await show_error("操作失败: " + e.toString());
        }
    };

    const handle_video_favorite_toggle = (id: string, is_favorite: boolean) => {
        // Optimistic Update Local Channel
        set_channel(prev => {
            if (!prev) return null;
            return {
                ...prev,
                videos: prev.videos.map(v => v.id === id ? { ...v, is_favorite } : v)
            };
        });

        // Optimistic Update Global Cache (to sync with Dashboard)
        set_video_cache((prev: any) => ({
            ...prev,
            videos: prev.videos.map((v: any) => v.id === id ? { ...v, is_favorite } : v)
        }));
    };

    const handle_download_all = async () => {
        if (!channel) return;
        if (await show_confirm(`确定要将 "${channel.name}" 的所有视频加入下载队列吗？`)) {
            set_is_downloading_all(true);
            try {
                if (channel.videos && channel.videos.length > 0) {
                    const downloadItems = channel.videos.map((v: any) => ({
                        id: v.id,
                        title: v.title,
                        thumbnail: v.thumbnail,
                        channel_name: channel.name
                    }));
                    queue_downloads(downloadItems);
                } else {
                    await show_alert("该频道暂无视频数据。");
                }
            } finally {
                set_is_downloading_all(false);
            }
        }
    };

    const stats = useMemo(() => {
        if (!channel?.videos) return { mean: 0, stdDev: 0 };
        return calculateChannelStats(channel.videos);
    }, [channel?.videos]);

    const processedVideos = useMemo(() => {
        if (!channel?.videos) return [];
        return channel.videos.map(video => {
            const metrics = analyzeVideo(video, stats);
            return { ...video, metrics };
        });
    }, [channel?.videos, stats]);

    const sortedVideos = useMemo(() => {
        let filtered = processedVideos.filter(v => {
            if (active_tab === "all") return true;
            if (active_tab === "videos") return !v.is_short;
            if (active_tab === "shorts") return v.is_short;
            if (active_tab === "favorites") return v.is_favorite;
            return true;
        });

        return filtered.sort((a, b) => {
            switch (sortBy) {
                case "published_at":
                    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
                case "view_count":
                    return Number(b.view_count) - Number(a.view_count);
                case "vph":
                    return b.metrics.vph - a.metrics.vph;
                case "er":
                    return b.metrics.er - a.metrics.er;
                case "z_score":
                    return b.metrics.z_score - a.metrics.z_score;
                case "viral":
                    return b.metrics.multiplier - a.metrics.multiplier;
                default:
                    return 0;
            }
        });
    }, [processedVideos, active_tab, sortBy]);
    if (loading) return <ChannelPageSkeleton />;
    if (loading) return <div className="p-8 text-center text-zinc-500">加载中...</div>;
    if (!channel) return <div className="p-8 text-center text-zinc-500">未找到频道</div>;



    return (
        <div className="h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans flex flex-col overflow-hidden">
            {/* Fixed Header Section */}
            <div className="h-8 w-full shrink-0" data-tauri-drag-region />
            <div className="flex-none px-8 pt-8 pb-0 max-w-[2000px] mx-auto w-full">
                {/* ... (Header content omitted for brevity, logic remains same) ... */}
                <button
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 font-medium mb-6"
                >
                    <ArrowLeft size={20} />
                    <span>返回</span>
                </button>

                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-6">
                        <div className="w-24 h-24 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden shrink-0">
                            {channel.thumbnail && <img src={channel.thumbnail} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold">{channel.name}</h1>
                            <div className="flex gap-4 text-sm text-zinc-500 mt-2 items-center">
                                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-xs font-medium">
                                    <span>{channel.group?.name || "未分类"}</span>
                                    <button
                                        onClick={() => set_is_move_modal_open(true)}
                                        className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-400 hover:text-blue-500"
                                    >
                                        <Edit size={10} />
                                    </button>
                                </div>
                                <button
                                    onClick={handle_toggle_favorite}
                                    title={channel.is_favorite ? "取消收藏" : "收藏频道"}
                                    className={`p-1.5 rounded-lg transition-colors ${channel.is_favorite
                                        ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40"
                                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500"
                                        }`}
                                >
                                    <Heart size={16} className={channel.is_favorite ? "fill-current" : ""} />
                                </button>
                                <button
                                    onClick={handle_delete_channel}
                                    title="删除频道"
                                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-red-500"
                                >
                                    <Trash2 size={16} />
                                </button>
                                <span>•</span>
                                <span>{channel.subscriber_count.toLocaleString()} 订阅</span>
                                <span>•</span>
                                <span>{channel.video_count} 视频</span>
                                <span>•</span>
                                <button
                                    onClick={() => invoke('open_url', { url: channel.url })}
                                    className="text-blue-500 hover:underline flex items-center gap-1"
                                >
                                    YouTube <ExternalLink size={12} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handle_download_all}
                            disabled={is_downloading_all}
                            className={`flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${is_downloading_all ? "opacity-50" : ""}`}
                        >
                            <DownloadCloud size={16} className={is_downloading_all ? "animate-pulse" : ""} />
                            下载全部
                        </button>
                        <SyncButton channel_id={channel_id!} on_sync={() => { }} on_complete={fetch_data} />
                    </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-1">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => set_active_tab("all")}
                            className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors ${active_tab === "all" ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                        >
                            全部内容
                        </button>
                        <button
                            onClick={() => set_active_tab("videos")}
                            className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors ${active_tab === "videos" ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                        >
                            Video
                        </button>
                        <button
                            onClick={() => set_active_tab("shorts")}
                            className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors ${active_tab === "shorts" ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                        >
                            Shorts
                        </button>
                        <button
                            onClick={() => set_active_tab("favorites")}
                            className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors flex items-center gap-1 ${active_tab === "favorites" ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                        >
                            <Heart size={14} fill={active_tab === "favorites" ? "currentColor" : "none"} /> 收藏内容
                        </button>
                    </div>

                    <div className="flex items-center gap-2 pb-2 md:pb-0 px-4 md:px-0">
                        <span className="text-xs text-zinc-500">排序:</span>
                        <select
                            value={sortBy}
                            onChange={(e) => set_sort_by(e.target.value as any)}
                            className="bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg px-2 py-1 text-xs font-medium outline-none"
                        >
                            <option value="published_at">发布时间</option>
                            <option value="view_count">播放量</option>
                            <option value="vph">VPH (流量速度)</option>
                            <option value="viral">播放倍率 (Viral)</option>
                            <option value="z_score">Z-Score (Z值)</option>
                            <option value="er">互动率 (ER)</option>
                        </select>
                    </div>
                </div>
            </div>



            {/* Scrollable Content Section */}
            <div className="flex-1 min-h-0 w-full">
                {fetching_videos && sortedVideos.length === 0 && (
                    <div className="flex justify-center items-center h-40">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-500"></div>
                    </div>
                )}

                <VirtuosoGrid
                    style={{ height: '100%' }}
                    scrollerRef={(ref) => {
                        // @ts-ignore
                        scrollerRef.current = ref as HTMLElement;
                        if (ref) {
                            // @ts-ignore
                            ref.onscroll = handleScroll;
                        }
                    }}
                    data={sortedVideos}
                    overscan={200}
                    components={{
                        List: React.forwardRef<HTMLDivElement, React.ComponentPropsWithRef<'div'>>(({ style, children, ...props }, ref) => (
                            <div
                                ref={ref}
                                {...props}
                                style={style}
                                className="grid grid-cols-[repeat(auto-fill,220px)] gap-4 items-stretch p-8 pt-0 max-w-[2000px] mx-auto"
                            >
                                {children}
                            </div>
                        ))
                    }}
                    itemContent={(index: number, video: Video & { metrics: VideoMetrics }) => (
                        <div className="h-full">
                            <VideoCard
                                key={video.id}
                                video={{
                                    ...video,
                                    channel: {
                                        id: channel.id,
                                        name: channel.name,
                                        thumbnail: channel.thumbnail,
                                        url: channel.url
                                    }
                                }}
                                metrics={video.metrics}
                                show_channel={false}
                                on_toggle_favorite={handle_video_favorite_toggle}
                            />
                        </div>
                    )}
                />
            </div>

            <MoveChannelModal
                is_open={is_move_modal_open}
                on_close={() => set_is_move_modal_open(false)}
                groups={groups}
                on_move={handle_move_channel}
                on_group_create={handle_create_group}
                channel_name={channel.name}
                currentGroupId={channel.group_id}
            />
        </div>

    );
}

export default function ChannelPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
            <ChannelContent />
        </Suspense>
    );
}
