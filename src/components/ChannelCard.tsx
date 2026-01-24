import { Channel } from "@/types";
import { MoreVertical, Trash2, FolderInput, RefreshCw, Heart, Pin, Users, Copy, ExternalLink, Download, Clock } from "lucide-react";
import { useState, memo } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import Link from "next/link";
import { useDownloads } from "@/context/DownloadContext";
import { useData } from "@/context/DataContext";

import { invoke } from "@tauri-apps/api/core";
import { show_alert, show_confirm } from "@/lib/dialogs";

interface ChannelCardProps {
    channel: Channel;
    on_delete: (id: string, name: string) => Promise<void>;
    on_move: (id: string, name: string, currentGroupId: number | null) => void;
    on_toggle_favorite: (id: string, is_favorite: boolean) => Promise<void>;
    on_toggle_pin: (id: string, is_pinned: boolean) => Promise<void>;
    on_refresh: () => Promise<void>;
}

export const ChannelCard = memo(function ChannelCard({
    channel,
    on_delete,
    on_move,
    on_toggle_favorite,
    on_toggle_pin,
    on_refresh
}: ChannelCardProps) {
    const [is_menu_open, set_is_menu_open] = useState(false);
    const [refreshing, set_refreshing] = useState(false);
    const [downloadingAll, set_downloading_all] = useState(false);
    const { queue_downloads } = useDownloads();
    const { set_scroll_position } = useData();


    const handle_refresh = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        set_refreshing(true);
        await on_refresh();
        set_refreshing(false);
    };

    const handle_copy_link = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(channel.url);
        set_is_menu_open(false);
    };

    const handle_open_home = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        await invoke('open_url', { url: channel.url });
        set_is_menu_open(false);
    };

    const handle_download_all = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        set_is_menu_open(false);

        if (await show_confirm(`确定要将 "${channel.name}" 的所有视频加入下载队列吗？`)) {
            set_downloading_all(true);
            try {
                // Fetch full channel details including videos
                const details: any = await invoke('get_channel_details', { id: channel.id });
                if (details && details.videos && details.videos.length > 0) {
                    const downloadItems = details.videos.map((v: any) => ({
                        id: v.id,
                        title: v.title,
                        thumbnail: v.thumbnail,
                        channel_name: channel.name,
                        channel_id: channel.id
                    }));
                    queue_downloads(downloadItems);
                    await show_alert(`已将 ${details.videos.length} 个视频加入下载队列。`);
                } else {
                    await show_alert("该频道包含的视频数量为 0。");
                }
            } catch (error: any) {
                console.error("Failed to fetch channel details for download", error);
                await show_alert("获取频道视频失败: " + error.toString());
            } finally {
                set_downloading_all(false);
            }
        }
    };

    const formatNumber = (num: number | string | bigint) => {
        const n = Number(num);
        if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
        if (n >= 10000) return (n / 10000).toFixed(1) + '万';
        return n.toLocaleString();
    };

    return (
        <div className="group relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full">
            {/* Top Action Bar (Absolute) */}
            <div className={`absolute top-2 right-2 z-20 flex items-center gap-1 transition-opacity ${is_menu_open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        on_toggle_pin(channel.id, !channel.is_pinned);
                    }}
                    className={`p-1.5 rounded-lg backdrop-blur-sm transition-colors ${channel.is_pinned
                        ? "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
                        : "bg-white/80 dark:bg-black/50 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                        }`}
                    title={channel.is_pinned ? "取消置顶" : "置顶频道"}
                >
                    <Pin size={14} className={channel.is_pinned ? "fill-current" : ""} />
                </button>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        on_toggle_favorite(channel.id, !channel.is_favorite);
                    }}
                    className={`p-1.5 rounded-lg backdrop-blur-sm transition-colors ${channel.is_favorite
                        ? "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400"
                        : "bg-white/80 dark:bg-black/50 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                        }`}
                    title={channel.is_favorite ? "取消收藏" : "收藏频道"}
                >
                    <Heart size={14} className={channel.is_favorite ? "fill-current" : ""} />
                </button>
                <button
                    onClick={handle_refresh}
                    className="p-1.5 rounded-lg bg-white/80 dark:bg-black/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 backdrop-blur-sm transition-colors"
                    title="刷新数据"
                >
                    <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                </button>

                <div className="relative">
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            set_is_menu_open(!is_menu_open);
                        }}
                        className={`p-1.5 rounded-lg backdrop-blur-sm transition-colors ${is_menu_open
                            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                            : "bg-white/80 dark:bg-black/50 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            }`}
                    >
                        <MoreVertical size={14} />
                    </button>

                    {/* Dropdown Menu */}
                    {is_menu_open && (
                        <>
                            <div
                                className="fixed inset-0 z-10"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    set_is_menu_open(false);
                                }}
                            />
                            <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-30 py-1 flex flex-col text-xs font-medium overflow-hidden">
                                <button
                                    onClick={handle_copy_link}
                                    className="px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center gap-2 text-zinc-700 dark:text-zinc-300"
                                >
                                    <Copy size={14} />
                                    复制链接
                                </button>
                                <button
                                    onClick={handle_open_home}
                                    className="px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center gap-2 text-zinc-700 dark:text-zinc-300"
                                >
                                    <ExternalLink size={14} />
                                    打开主页
                                </button>
                                <div className="h-px bg-zinc-100 dark:bg-zinc-700 my-1" />
                                <button
                                    onClick={handle_download_all}
                                    className="px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center gap-2 text-zinc-700 dark:text-zinc-300"
                                >
                                    <Download size={14} className={downloadingAll ? "animate-pulse" : ""} />
                                    {downloadingAll ? "添加中..." : "下载全部"}
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        set_is_menu_open(false);
                                        on_move(channel.id, channel.name, channel.group_id || null);
                                    }}
                                    className="px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center gap-2 text-zinc-700 dark:text-zinc-300"
                                >
                                    <FolderInput size={14} />
                                    移动分组
                                </button>
                                <div className="h-px bg-zinc-100 dark:bg-zinc-700 my-1" />
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        set_is_menu_open(false);
                                        on_delete(channel.id, channel.name);
                                    }}
                                    className="px-3 py-2 text-left hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-red-600 dark:text-red-400"
                                >
                                    <Trash2 size={14} />
                                    删除频道
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Pinned/Favorite Indicators (Always Visible if true) */}
            {(channel.is_pinned || channel.is_favorite) && (
                <div className="absolute top-2 left-2 z-10 flex gap-1">
                    {channel.is_pinned && (
                        <div className="bg-blue-500 text-white p-1 rounded-md shadow-sm">
                            <Pin size={10} fill="currentColor" />
                        </div>
                    )}
                    {channel.is_favorite && (
                        <div className="bg-red-500 text-white p-1 rounded-md shadow-sm">
                            <Heart size={10} fill="currentColor" />
                        </div>
                    )}
                </div>
            )}

            {/* Content Link */}
            <Link
                href={`/channel?id=${channel.id}`}
                className="flex flex-col h-full p-4"
                onClick={() => {
                    set_scroll_position(`channel_${channel.id}`, 0);
                }}
            >
                {/* Header: Avatar & Name */}
                <div className="flex flex-col items-center text-center mb-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 border-2 border-white dark:border-zinc-700 shadow-sm mb-3 shrink-0">
                        {channel.thumbnail ? (
                            <img src={channel.thumbnail} alt={channel.name} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-300">
                                <Users size={24} />
                            </div>
                        )}
                    </div>
                    <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100 line-clamp-1 w-full" title={channel.name}>
                        {channel.name}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-zinc-500 mt-1">
                        <Users size={12} />
                        <span>{formatNumber(channel.subscriber_count)} 订阅</span>
                    </div>
                    {channel.last_upload_at && (
                        <div className="flex items-center gap-1 text-xs text-zinc-400 mt-1">
                            <Clock size={12} />
                            <span>更新于 {formatDistanceToNow(new Date(channel.last_upload_at), { addSuffix: true, locale: zhCN })}</span>
                        </div>
                    )}
                </div>

                {/* Stats Grid */}
                <div className="mt-auto grid grid-cols-2 gap-2">
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold mb-0.5">视频</span>
                        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 font-mono">
                            {formatNumber(channel.video_count)}
                        </span>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold mb-0.5">播放</span>
                        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 font-mono">
                            {formatNumber(channel.view_count)}
                        </span>
                    </div>
                </div>
            </Link>
        </div>
    );
});
