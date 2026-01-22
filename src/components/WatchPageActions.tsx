"use client";

import { Check, Copy, Download, ExternalLink, FolderOpen, Heart, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useDownloads } from "@/context/DownloadContext";
import { invoke } from "@tauri-apps/api/core";
import { show_confirm, show_error } from "@/lib/dialogs";

interface WatchPageActionsProps {
    video: {
        id: string;
        title: string;
        channel: {
            id: string;
            name: string;
            thumbnail: string;
        };
        local_path?: string | null;
        is_favorite?: boolean;
    };
}

export function WatchPageActions({ video }: WatchPageActionsProps) {
    const { downloads, start_download } = useDownloads();
    const [is_copied, set_is_copied] = useState(false);
    const [is_channel_copied, set_is_channel_copied] = useState(false);
    const [is_favorite, set_is_favorite] = useState(video.is_favorite || false);

    const downloadItem = downloads.find(d => d.id === video.id);
    const downloadStatus = downloadItem?.status;
    const is_downloading = downloadStatus === 'downloading' || downloadStatus === 'queued';
    const effectivePath = video.local_path || downloadItem?.path;
    const canOpen = !!effectivePath || downloadStatus === 'completed';

    const handle_download = () => {
        start_download({
            id: video.id,
            title: video.title,
            thumbnail: video.channel.thumbnail,
            channel_name: video.channel.name,
            channel_id: video.channel.id
        });
    };

    const handle_redownload = async () => {
        if (!await show_confirm("确定要重新下载此视频吗？")) return;
        start_download({
            id: video.id,
            title: video.title,
            thumbnail: video.channel.thumbnail,
            channel_name: video.channel.name,
            channel_id: video.channel.id
        });
    };

    const handle_open_folder = async () => {
        try {
            if (effectivePath) {
                await invoke('open_video_folder', { path: effectivePath });
            } else {
                await show_error("未找到文件路径");
            }
        } catch (e) {
            console.error("Open folder failed", e);
            await show_error("打开文件夹失败");
        }
    };

    const copyLink = (text: string, type: 'video' | 'channel') => {
        navigator.clipboard.writeText(text);
        if (type === 'video') {
            set_is_copied(true);
            setTimeout(() => set_is_copied(false), 2000);
        } else {
            set_is_channel_copied(true);
            setTimeout(() => set_is_channel_copied(false), 2000);
        }
    };

    const handle_toggle_favorite = async () => {
        try {
            await invoke('toggle_video_favorite', { id: video.id });
            set_is_favorite(!is_favorite);
        } catch (error) {
            console.error("Failed to toggle favorite", error);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-3 py-4 border-y border-zinc-100 dark:border-zinc-800">
            {/* Download / Redownload Actions */}
            {canOpen ? (
                <>
                    <button onClick={handle_open_folder} className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full font-medium transition-colors">
                        <FolderOpen size={18} /> 打开文件夹
                    </button>
                    <button onClick={handle_redownload} className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full font-medium transition-colors text-zinc-600 dark:text-zinc-400">
                        <RotateCcw size={18} /> 重新下载
                    </button>
                </>
            ) : (
                <button
                    onClick={handle_download}
                    disabled={is_downloading}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {is_downloading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download size={18} />}
                    {is_downloading ? "下载中..." : "下载视频"}
                </button>
            )}

            <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800 mx-2" />

            <button onClick={() => copyLink(`https://www.youtube.com/watch?v=${video.id}`, 'video')} className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-sm">
                {is_copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                {is_copied ? "链接已复制" : "复制视频链接"}
            </button>
            <button onClick={() => copyLink(`https://www.youtube.com/channel/${video.channel.id}`, 'channel')} className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-sm">
                {is_channel_copied ? <Check size={16} className="text-green-500" /> : <ExternalLink size={16} />}
                {is_channel_copied ? "链接已复制" : "复制频道链接"}
            </button>
            <button onClick={() => invoke('open_url', { url: `https://www.youtube.com/watch?v=${video.id}` })} className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-sm">
                <ExternalLink size={16} />
                浏览器打开
            </button>

            <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800 mx-2" />

            <button
                onClick={handle_toggle_favorite}
                className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors text-sm font-medium ${is_favorite
                    ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-500 dark:hover:bg-red-900/40"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    }`}
            >
                <Heart size={18} className={is_favorite ? "fill-current" : ""} />
                {is_favorite ? "已收藏" : "收藏视频"}
            </button>
        </div>
    );
}
