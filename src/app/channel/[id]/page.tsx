"use client";

import { Channel, Group } from "@/types";
import { ArrowLeft, ExternalLink, RefreshCw, ChevronDown, Edit, Trash2, DownloadCloud, Heart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback, use } from "react";
import { calculateChannelStats, analyzeVideo, VideoMetrics } from "@/utils/analytics";
import { VideoCard } from "@/components/VideoCard";
import { MoveChannelModal } from "@/components/MoveChannelModal";
import { useData } from "@/context/DataContext";
import { useDownloads } from "@/context/DownloadContext";

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
}

interface ChannelDetail extends Channel {
    videos: Video[];
}

function SyncButton({ channelId, onSync, onComplete }: { channelId: string, onSync: () => void, onComplete: () => void }) {
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const handleSync = async (days: number | null) => {
        setOpen(false);
        setLoading(true);
        onSync(); // Trigger parent loading state if desired, or just show local spinner

        let fromDate = null;
        if (days) {
            const date = new Date();
            date.setDate(date.getDate() - days);
            fromDate = date.toISOString();
        }

        try {
            await fetch(`/api/channels/${channelId}`, {
                method: "POST",
                body: JSON.stringify({ fromDate })
            });
            onComplete();
        } catch (e) {
            console.error(e);
            alert("同步失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
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
                    <button onClick={() => handleSync(30)} className="px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm">
                        最近 30 天
                    </button>
                    <button onClick={() => handleSync(90)} className="px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm">
                        最近 3 个月
                    </button>
                    <button onClick={() => handleSync(365)} className="px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm">
                        最近 1 年
                    </button>
                    <button onClick={() => handleSync(null)} className="px-4 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm text-red-500">
                        全部视频 (耗时)
                    </button>
                </div>
            )}
            {/* Backdrop to close */}
            {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
        </div>
    );
}

export default function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id: channelId } = use(params);
    const { groups, refreshData, setChannels } = useData();
    const { queueDownloads } = useDownloads(); // hook
    // State restoration
    // const [channelId, setChannelId] = useState<string | null>(null);
    const [channel, setChannel] = useState<ChannelDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<"all" | "videos" | "shorts">("all");
    const [sortBy, setSortBy] = useState<"publishedAt" | "viewCount" | "vph" | "er" | "zScore" | "viral">("publishedAt");
    const [isDownloadingAll, setIsDownloadingAll] = useState(false); // state

    // useEffect(() => {
    //     params.then((p) => setChannelId(p.id));
    // }, [params]);

    const fetchData = useCallback(() => {
        if (!channelId) return;
        setLoading(true);
        fetch(`/api/channels/${channelId}`)
            .then(async (res) => {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") === -1) {
                    throw new Error("Received non-JSON response from API");
                }
                if (!res.ok) throw new Error("Failed to load");
                return res.json();
            })
            .then((data) => {
                setChannel(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error("[ChannelPage] Error:", err);
                setLoading(false);
            });
    }, [channelId]);

    useEffect(() => {
        if (channelId) {
            fetchData();
        }
    }, [channelId, fetchData]);

    const handleMoveChannel = async (groupId: number | null) => {
        if (!channelId) return;

        // Optimistic Update Local
        const newGroup = groupId ? groups.find(g => g.id === groupId) : undefined;
        setChannel(prev => prev ? { ...prev, groupId, group: newGroup || undefined } : null);

        // Optimistic Update Global (Fixes Dashboard stale data)
        setChannels(prev => prev.map(c =>
            c.id === channelId
                ? { ...c, groupId, group: newGroup || undefined }
                : c
        ));

        try {
            const res = await fetch(`/api/channels/${channelId}`, {
                method: "PATCH",
                body: JSON.stringify({ groupId }),
            });
            if (!res.ok) throw new Error("Move failed");

            // Background refresh to confirm
            refreshData(true);
            setIsMoveModalOpen(false);
        } catch (err) {
            console.error(err);
            alert("移动失败");
            fetchData(); // Revert local
            refreshData(true); // Revert global
        }
    };

    const handleCreateGroup = async (name: string) => {
        const res = await fetch("/api/groups", {
            method: "POST",
            body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error("Failed to create group");
        const newGroup = await res.json();
        await refreshData(true); // Update global groups
        return newGroup;
    };

    const handleDeleteChannel = async () => {
        if (!channelId || !confirm("确定要删除该频道吗？所有相关数据将被永久删除。")) return;

        try {
            const res = await fetch(`/api/channels/${channelId}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Delete failed");
            await refreshData(true); // Refresh global list
            router.push("/"); // Back to dashboard
        } catch (error) {
            console.error("Delete failed", error);
            alert("删除失败");
        }
    };

    const handleToggleFavorite = async () => {
        if (!channel) return;
        const newStatus = !channel.isFavorite;

        // Optimistic Update
        setChannel(prev => prev ? { ...prev, isFavorite: newStatus } : null);
        setChannels(prev => prev.map(c => c.id === channel.id ? { ...c, isFavorite: newStatus } : c));

        try {
            const res = await fetch(`/api/channels/${channel.id}`, {
                method: "PATCH",
                body: JSON.stringify({ isFavorite: newStatus })
            });

            if (!res.ok) throw new Error("Failed to update favorite status");
        } catch (e) {
            console.error(e);
            // Revert
            setChannel(prev => prev ? { ...prev, isFavorite: !newStatus } : null);
            setChannels(prev => prev.map(c => c.id === channel.id ? { ...c, isFavorite: !newStatus } : c));
            alert("操作失败");
        }
    };

    const handleDownloadAll = async () => {
        if (!channel) return;
        if (confirm(`确定要将 "${channel.name}" 的所有视频加入下载队列吗？`)) {
            setIsDownloadingAll(true);
            try {
                if (channel.videos && channel.videos.length > 0) {
                    const downloadItems = channel.videos.map((v: any) => ({
                        id: v.id,
                        title: v.title,
                        thumbnail: v.thumbnail,
                        channelName: channel.name
                    }));
                    queueDownloads(downloadItems);
                } else {
                    alert("该频道暂无视频数据。");
                }
            } finally {
                setIsDownloadingAll(false);
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
            if (activeTab === "all") return true;
            if (activeTab === "videos") return !v.isShort;
            if (activeTab === "shorts") return v.isShort;
            return true;
        });

        return filtered.sort((a, b) => {
            switch (sortBy) {
                case "publishedAt":
                    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
                case "viewCount":
                    return Number(b.viewCount) - Number(a.viewCount);
                case "vph":
                    return b.metrics.vph - a.metrics.vph;
                case "er":
                    return b.metrics.er - a.metrics.er;
                case "zScore":
                    return b.metrics.zScore - a.metrics.zScore;
                case "viral":
                    return b.metrics.multiplier - a.metrics.multiplier;
                default:
                    return 0;
            }
        });
    }, [processedVideos, activeTab, sortBy]);

    if (loading) return <div className="p-8 text-center text-zinc-500">加载中...</div>;
    if (!channel) return <div className="p-8 text-center text-zinc-500">未找到频道</div>;

    return (
        <div className="h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans flex flex-col overflow-hidden">
            {/* Fixed Header Section */}
            <div className="flex-none p-8 pb-0 max-w-[1800px] mx-auto w-full">
                <button
                    onClick={() => router.back()}
                    className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6"
                >
                    <ArrowLeft size={16} className="mr-2" /> 返回
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
                                        onClick={() => setIsMoveModalOpen(true)}
                                        className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-400 hover:text-blue-500"
                                    >
                                        <Edit size={10} />
                                    </button>
                                </div>
                                <button
                                    onClick={handleToggleFavorite}
                                    title={channel.isFavorite ? "取消收藏" : "收藏频道"}
                                    className={`p-1.5 rounded-lg transition-colors ${channel.isFavorite
                                        ? "bg-yellow-50 text-yellow-500 dark:bg-yellow-900/20 dark:text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
                                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-yellow-500"
                                        }`}
                                >
                                    <Heart size={16} className={channel.isFavorite ? "fill-current" : ""} />
                                </button>
                                <button
                                    onClick={handleDeleteChannel}
                                    title="删除频道"
                                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-red-500"
                                >
                                    <Trash2 size={16} />
                                </button>
                                <span>•</span>
                                <span>{channel.subscriberCount.toLocaleString()} 订阅</span>
                                <span>•</span>
                                <span>{channel.videoCount} 视频</span>
                                <span>•</span>
                                <a href={channel.url} target="_blank" className="text-blue-500 hover:underline flex items-center gap-1">
                                    YouTube <ExternalLink size={12} />
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleDownloadAll}
                            disabled={isDownloadingAll}
                            className={`flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${isDownloadingAll ? "opacity-50" : ""}`}
                        >
                            <DownloadCloud size={16} className={isDownloadingAll ? "animate-pulse" : ""} />
                            下载全部
                        </button>
                        <SyncButton channelId={channelId!} onSync={() => { }} onComplete={fetchData} />
                    </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-1">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setActiveTab("all")}
                            className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors ${activeTab === "all" ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                        >
                            全部内容
                        </button>
                        <button
                            onClick={() => setActiveTab("videos")}
                            className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors ${activeTab === "videos" ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                        >
                            长视频
                        </button>
                        <button
                            onClick={() => setActiveTab("shorts")}
                            className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors ${activeTab === "shorts" ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                        >
                            Shorts
                        </button>
                    </div>

                    <div className="flex items-center gap-2 pb-2 md:pb-0 px-4 md:px-0">
                        <span className="text-xs text-zinc-500">排序:</span>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="bg-zinc-100 dark:bg-zinc-800 border-none rounded-lg px-2 py-1 text-xs font-medium outline-none"
                        >
                            <option value="publishedAt">发布时间</option>
                            <option value="viewCount">播放量</option>
                            <option value="vph">VPH (流量速度)</option>
                            <option value="viral">播放倍率 (Viral)</option>
                            <option value="zScore">Z-Score (Z值)</option>
                            <option value="er">互动率 (ER)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Scrollable Content Section */}
            <div className="flex-1 overflow-y-auto min-h-0 w-full">
                <div className="max-w-[1800px] mx-auto p-8 pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                        {sortedVideos.map((video) => {
                            return (
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
                                    showChannel={false}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            <MoveChannelModal
                isOpen={isMoveModalOpen}
                onClose={() => setIsMoveModalOpen(false)}
                groups={groups}
                onMove={handleMoveChannel}
                onGroupCreate={handleCreateGroup}
                channelName={channel.name}
                currentGroupId={channel.groupId}
            />
        </div>

    );
}
