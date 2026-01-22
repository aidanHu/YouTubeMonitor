"use client";

import { Check, Copy, Download, FolderOpen, RotateCcw, Heart } from "lucide-react";
import { useState } from "react";
import { useDownloads } from "@/context/DownloadContext";
import { useData } from "@/context/DataContext";
import { show_alert, show_confirm, show_error } from "@/lib/dialogs";
import { invoke } from "@tauri-apps/api/core";

interface VideoCardOverlayProps {
    video: {
        id: string;
        title: string;
        url: string;
        thumbnail: string | null;
        channel?: {
            id: string;
            name: string;
        };
        local_path?: string | null;
        is_favorite?: boolean;
    };
    on_toggle_favorite?: (id: string, is_favorite: boolean) => void;
}

export function VideoCardOverlay({ video, on_toggle_favorite }: VideoCardOverlayProps) {
    const [is_copied, set_is_copied] = useState(false);
    const { start_download, downloads } = useDownloads();
    const { is_activated, settings } = useData();

    // Check if this video is currently downloading or queued
    // This hook will trigger re-renders only for this small component
    const downloadItem = downloads.find(d => d.id === video.id);
    const downloadStatus = downloadItem?.status;
    const is_downloading = downloadStatus === 'downloading' || downloadStatus === 'queued';

    // Determine if we can open the folder
    // FIX: Rely primarily on persistent local_path from DB, or current download path
    const effectivePath = video.local_path || downloadItem?.path;
    // FIX: If we have a path, we can try to open it. Don't rely on 'completed' status from history which might be cleared.
    const canOpen = !!effectivePath;

    // Show Redownload only if we have explicit history saying it's completed/error, OR if we have the file but want to allow redownload contextually?
    // Actually, if canOpen is true (file exists), we usually show FolderOpen.
    // If user wants to redownload a completed file, they can delete it first or we add a specific option.
    // For now, let's keep redownload button distinct but maybe only show if there's an error or if explicitly in history as completed (to allow retry/fresh download).
    // If history is cleared, downloadStatus is undefined. We shouldn't show redownload button unless we know it failed?
    // Let's stick to: Show redownload if status is 'completed' or 'error' (from history). 
    // If history cleared, user can click "Download" again (which replaces FolderOpen if we didn't check canOpen).
    // Wait, if canOpen is true, we show FolderOpen. So user can't redownload easily?
    // User can just click Download on main card if we didn't hide it.
    // Here we swap Download/FolderOpen button.
    // If canOpen is true, we show FolderOpen.
    // If user REALLY wants to redownload a present file? Maybe context menu?
    // For this fix, we just want to ensure FolderOpen appears.

    // Local favorite state for immediate UI feedback, 
    // initialized from prop but managed locally for the button interaction
    const [is_favorite, set_is_favorite] = useState(video.is_favorite || false);

    const handle_copy_link = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(video.url);
        set_is_copied(true);
        setTimeout(() => set_is_copied(false), 2000);
    };

    const handle_download = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!is_activated) {
            await show_alert("软件未激活，无法下载视频。\n请前往 [设置 -> 软件激活] 进行激活。", "提示", "warning");
            return;
        }

        if (!settings?.download_path) {
            await show_alert("检测到未配置下载地址。\n\n请前往 [系统设置 -> 常规设置] 配置视频下载路径。", "配置错误", "error");
            return;
        }

        start_download({
            id: video.id,
            title: video.title,
            thumbnail: video.thumbnail,
            channel_name: video.channel?.name || "Unknown",
            channel_id: video.channel?.id
        });
    };

    const handle_open_folder = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            if (effectivePath) {
                await invoke('open_video_folder', { path: effectivePath });
            } else {
                await show_error("未找到文件路径");
            }
        } catch (err: any) {
            const errStr = err.toString();
            const errLower = errStr.toLowerCase();

            if (errLower.includes("err_file_not_found") || errLower.includes("does not exist") || errLower.includes("no such file")) {
                const confirm = await show_confirm(
                    "检测到本地文件不存在,可能已被删除。\n\n是否重新下载?",
                    "文件不存在"
                );
                if (confirm) {
                    start_download({
                        id: video.id,
                        title: video.title,
                        thumbnail: video.thumbnail,
                        channel_name: video.channel?.name || "Unknown",
                        channel_id: video.channel?.id
                    });
                }
            } else {
                await show_error("打开文件夹失败: " + errStr);
            }
        }
    };

    const handle_toggle_favorite = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await invoke('toggle_video_favorite', { id: video.id });
            const newFav = !is_favorite;
            set_is_favorite(newFav);
            if (on_toggle_favorite) {
                on_toggle_favorite(video.id, newFav);
            }
        } catch (error) {
            console.error("Failed to toggle favorite", error);
        }
    };

    // Re-download handler
    const handle_redownload = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!await show_confirm("确定要重新下载此视频吗？")) return;
        start_download({
            id: video.id,
            title: video.title,
            thumbnail: video.thumbnail,
            channel_name: video.channel?.name || "Unknown",
            channel_id: video.channel?.id
        });
    };

    return (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2 z-20 pointer-events-none">
            <button
                onClick={handle_copy_link}
                className="p-2 bg-white/90 text-zinc-800 rounded-full hover:bg-white transition-colors shadow-lg transform translate-y-2 group-hover:translate-y-0 duration-200 pointer-events-auto"
                title={is_copied ? "已复制" : "复制链接"}
            >
                {is_copied ? <Check size={20} className="text-green-600" /> : <Copy size={20} />}
            </button>
            <button
                onClick={canOpen ? handle_open_folder : handle_download}
                disabled={is_downloading}
                className={`p-2 rounded-full transition-colors shadow-lg transform translate-y-2 group-hover:translate-y-0 duration-200 delay-75 pointer-events-auto ${canOpen
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-white/90 text-zinc-800 hover:bg-white'
                    }`}
                title={canOpen ? "打开文件位置" : "下载视频"}
            >
                {is_downloading ? (
                    <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
                ) : canOpen ? (
                    <FolderOpen size={20} />
                ) : (
                    <Download size={20} />
                )}
            </button>
            {/* Can show Redownload if status explicitly says so (history present) OR if we canOpen (file exists) but user wants to re-download? 
                Actually redundant if canOpen is true. If file is gone but DB thinks it's there, opening folder will fail (or open parent).
                If history is cleared, we don't show redownload button. That's acceptable.
            */}
            {(downloadStatus === 'completed' || downloadStatus === 'error') && (
                <button
                    onClick={handle_redownload}
                    className="p-2 bg-white/90 text-zinc-800 rounded-full hover:bg-white transition-colors shadow-lg transform translate-y-2 group-hover:translate-y-0 duration-200 delay-100 pointer-events-auto"
                    title="重新下载"
                >
                    <RotateCcw size={20} />
                </button>
            )}
            <button
                onClick={handle_toggle_favorite}
                className="p-2 bg-white/90 text-zinc-800 rounded-full hover:bg-white transition-colors shadow-lg transform translate-y-2 group-hover:translate-y-0 duration-200 delay-100 pointer-events-auto"
                title={is_favorite ? "取消收藏" : "收藏视频"}
            >
                <Heart size={20} className={is_favorite ? "fill-red-500 text-red-500" : ""} />
            </button>
        </div>
    );
}

