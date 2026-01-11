"use client";

import { Channel } from "@/types";
import { ExternalLink, Users, Video, Eye, Trash2, FolderInput, RefreshCw, Heart, DownloadCloud, Copy, Check, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useDownloads } from "@/context/DownloadContext";

interface ChannelCardProps {
    channel: Channel;
    onDelete?: (id: string, name: string) => void;
    onMove?: (id: string, name: string, currentGroupId: number | null) => void;
    onRefresh?: () => Promise<void>;
    onToggleFavorite?: (id: string, isFavorite: boolean) => Promise<void>;
}

export function ChannelCard({ channel, onDelete, onMove, onRefresh, onToggleFavorite }: ChannelCardProps) {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const { queueDownloads } = useDownloads();

    const handleRefresh = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!onRefresh) return;

        setIsRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleDownloadAll = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (confirm(`确定要将 "${channel.name}" 的所有视频加入下载队列吗？\n(请确保已刷新该频道以获取最新视频列表)`)) {
            setIsDownloadingAll(true);
            try {
                // Fetch full channel details including videos
                const res = await fetch(`/api/channels/${channel.id}`);
                const data = await res.json();

                if (data.videos && data.videos.length > 0) {
                    const downloadItems = data.videos.map((v: any) => ({
                        id: v.id,
                        title: v.title,
                        thumbnail: v.thumbnail,
                        channelName: channel.name
                    }));
                    queueDownloads(downloadItems);
                    // Optional: Show a toast? For now just button state
                } else {
                    alert("未找到该频道的视频数据，请先尝试刷新数据。");
                }
            } catch (err) {
                console.error("Failed to fetch channel videos", err);
                alert("获取视频列表失败");
            } finally {
                setIsDownloadingAll(false);
            }
        }
    };

    return (
        <Link href={`/channel/${channel.id}`}>
            <div className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 hover:shadow-lg hover:border-blue-500/30 transition-all cursor-pointer h-full flex flex-col justify-between relative">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-1">
                    {/* Primary Actions: Favorite & Refresh */}
                    {onToggleFavorite && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onToggleFavorite(channel.id, !channel.isFavorite);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${channel.isFavorite
                                ? "bg-pink-50 dark:bg-pink-900/20 text-pink-500 hover:bg-pink-100"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-pink-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                }`}
                            title={channel.isFavorite ? "取消收藏" : "收藏频道"}
                        >
                            <Heart size={14} fill={channel.isFavorite ? "currentColor" : "none"} />
                        </button>
                    )}

                    {onRefresh && (
                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className={`p-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors ${isRefreshing ? "animate-spin" : ""}`}
                            title="刷新数据"
                        >
                            <RefreshCw size={14} />
                        </button>
                    )}

                    {/* Secondary Actions Menu */}
                    <div className="relative group/menu">
                        <button
                            onClick={(e) => e.preventDefault()}
                            className="p-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                            title="更多操作"
                        >
                            <MoreHorizontal size={14} />
                        </button>

                        {/* Dropdown Content */}
                        <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl overflow-hidden hidden group-hover/menu:block z-20">
                            <div className="flex flex-col p-1">
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(channel.url);
                                        setIsCopied(true);
                                        setTimeout(() => setIsCopied(false), 2000);
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-left w-full"
                                >
                                    {isCopied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                    {isCopied ? "已复制" : "复制链接"}
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        window.open(channel.url, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-left w-full"
                                >
                                    <ExternalLink size={12} />
                                    打开主页
                                </button>
                                <button
                                    onClick={handleDownloadAll}
                                    disabled={isDownloadingAll}
                                    className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-left w-full"
                                >
                                    <DownloadCloud size={12} />
                                    下载全部
                                </button>
                                {onMove && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onMove(channel.id, channel.name, channel.groupId);
                                        }}
                                        className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-left w-full"
                                    >
                                        <FolderInput size={12} />
                                        移动分组
                                    </button>
                                )}
                                {onDelete && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onDelete(channel.id, channel.name);
                                        }}
                                        className="flex items-center gap-2 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-left w-full"
                                    >
                                        <Trash2 size={12} />
                                        删除频道
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-start justify-between mb-4 mt-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0 overflow-hidden relative">
                            {/* Thumbnail placeholder */}
                            {channel.thumbnail ? (
                                <img src={channel.thumbnail} alt={channel.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="flex items-center justify-center w-full h-full text-zinc-400 text-xs">IMG</div>
                            )}
                        </div>
                        <div>
                            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1 break-all" title={channel.name}>
                                {channel.name}
                            </h3>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                {channel.group?.name || "未分类"}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-3 border-t border-zinc-100 dark:border-zinc-800 mt-2">
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-xs text-zinc-500 mb-1">
                            <Users size={12} /> 订阅
                        </div>
                        <div className="font-mono text-sm font-medium">
                            {new Intl.NumberFormat('en-US', { notation: "compact" }).format(channel.subscriberCount)}
                        </div>
                    </div>
                    <div className="text-center border-l border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center justify-center gap-1 text-xs text-zinc-500 mb-1">
                            <Eye size={12} /> 观看
                        </div>
                        <div className="font-mono text-sm font-medium">
                            {new Intl.NumberFormat('en-US', { notation: "compact" }).format(parseInt(channel.viewCount))}
                        </div>
                    </div>
                    <div className="text-center border-l border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center justify-center gap-1 text-xs text-zinc-500 mb-1">
                            <Video size={12} /> 视频
                        </div>
                        <div className="font-mono text-sm font-medium">
                            {channel.videoCount}
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}
