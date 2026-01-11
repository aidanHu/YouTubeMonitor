import { VideoMetrics } from "@/utils/analytics";
import { Flame, Calendar, Eye, TrendingUp, ThumbsUp, MessageSquare, Star, Copy, Download, Check, FolderOpen, Link2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useDownloads } from "@/context/DownloadContext";
import Link from "next/link";

export interface VideoCardProps {
    video: {
        id: string;
        title: string;
        url: string;
        thumbnail: string | null;
        publishedAt: string | Date;
        viewCount: string | number | bigint;
        likeCount?: number | null;
        commentCount?: number | null;
        isShort: boolean;
        isFavorite?: boolean;
        channel?: {
            id: string; // Add id to channel interface
            name: string;
            thumbnail: string | null;
            url: string; // Add url to channel interface
        };
        localPath?: string | null; // Add localPath
    };
    metrics?: VideoMetrics;
    showChannel?: boolean;
}

export function VideoCard({ video, metrics, showChannel = false }: VideoCardProps) {
    const views = Number(video.viewCount);
    const publishedAt = new Date(video.publishedAt);
    const [isFavorite, setIsFavorite] = useState(video.isFavorite || false);
    const [isCopied, setIsCopied] = useState(false);
    const { startDownload, downloads } = useDownloads();

    // Check if this video is currently downloading or queued
    // Check if this video is currently downloading or queued
    const downloadItem = downloads.find(d => d.id === video.id);
    const downloadStatus = downloadItem?.status;
    const isDownloading = downloadStatus === 'downloading' || downloadStatus === 'queued';

    // Determine if we can open the folder
    const effectivePath = video.localPath || downloadItem?.path;
    const canOpen = !!effectivePath || downloadStatus === 'completed';

    // Visual thresholds based on metrics or raw views if metrics missing
    const isViral = metrics?.label === "Viral";
    const isHigh = metrics?.label === "High";

    // Dynamic border color
    const borderColor = isViral
        ? "border-red-500/50 dark:border-red-500/50 shadow-red-500/10"
        : isHigh
            ? "border-orange-400/50 dark:border-orange-400/50 shadow-orange-500/10"
            : "border-zinc-200 dark:border-zinc-800";

    const bgClass = isViral ? "bg-red-50/30 dark:bg-red-950/10" : "bg-white dark:bg-zinc-900";

    const handleToggleFavorite = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            const res = await fetch(`/api/videos/${video.id}/favorite`, { method: "POST" });
            if (res.ok) setIsFavorite(!isFavorite);
        } catch (error) {
            console.error("Failed to toggle favorite", error);
        }
    };

    const handleCopyLink = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(video.url);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleDownload = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Direct download without confirmation
        startDownload({
            id: video.id,
            title: video.title,
            thumbnail: video.thumbnail,
            channelName: video.channel?.name || "Unknown",
            channelId: video.channel?.id
        });
    };

    const handleOpenFolder = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            const body: any = { videoId: video.id };
            if (effectivePath) body.path = effectivePath;

            const res = await fetch('/api/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const data = await res.json();
                alert(data.error || "打开文件夹失败");
            }
        } catch (e) {
            alert("请求失败，请检查网络");
        }
    };

    const handleCopyChannelLink = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (video.channel?.url) {
            navigator.clipboard.writeText(video.channel.url);
            // Could add a toast here, but simple is fine for now
        }
    };

    return (
        <div className={`group relative ${bgClass} border ${borderColor} rounded-xl overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col h-full`}>
            {/* Thumbnail Section */}
            <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 relative shrink-0">
                {video.thumbnail && (
                    <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                )}

                {/* Overlays - Fixed z-index and interaction */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2 z-20 pointer-events-none">
                    <button
                        onClick={handleCopyLink}
                        className="p-2 bg-white/90 text-zinc-800 rounded-full hover:bg-white transition-colors shadow-lg transform translate-y-2 group-hover:translate-y-0 duration-200 pointer-events-auto"
                        title="复制链接"
                    >
                        {isCopied ? <Check size={20} className="text-green-600" /> : <Copy size={20} />}
                    </button>
                    <button
                        onClick={canOpen ? handleOpenFolder : handleDownload}
                        disabled={isDownloading}
                        className={`p-2 rounded-full transition-colors shadow-lg transform translate-y-2 group-hover:translate-y-0 duration-200 delay-75 pointer-events-auto ${canOpen
                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                            : 'bg-white/90 text-zinc-800 hover:bg-white'
                            }`}
                        title={canOpen ? "打开文件位置" : "下载视频"}
                    >
                        {isDownloading ? (
                            <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
                        ) : canOpen ? (
                            <FolderOpen size={20} />
                        ) : (
                            <Download size={20} />
                        )}
                    </button>
                    {(downloadStatus === 'completed' || downloadStatus === 'error') && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!confirm("确定要重新下载此视频吗？")) return;
                                startDownload({
                                    id: video.id,
                                    title: video.title,
                                    thumbnail: video.thumbnail,
                                    channelName: video.channel?.name || "Unknown",
                                    channelId: video.channel?.id
                                });
                            }}
                            className="p-2 bg-white/90 text-zinc-800 rounded-full hover:bg-white transition-colors shadow-lg transform translate-y-2 group-hover:translate-y-0 duration-200 delay-100 pointer-events-auto"
                            title="重新下载"
                        >
                            <RotateCcw size={20} />
                        </button>
                    )}
                    <button
                        onClick={handleToggleFavorite}
                        className="p-2 bg-white/90 text-zinc-800 rounded-full hover:bg-white transition-colors shadow-lg transform translate-y-2 group-hover:translate-y-0 duration-200 delay-100 pointer-events-auto"
                        title={isFavorite ? "取消收藏" : "收藏视频"}
                    >
                        <Star size={20} className={isFavorite ? "fill-yellow-400 text-yellow-400" : ""} />
                    </button>
                </div>

                {/* Badges */}
                {isViral && (
                    <div className="absolute top-2 right-2 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-lg animate-pulse z-10 pointer-events-none">
                        <Flame size={12} fill="currentColor" /> EXPLOSIVE
                    </div>
                )}
                {!isViral && isHigh && (
                    <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg z-10 pointer-events-none">
                        <TrendingUp size={12} /> RISING
                    </div>
                )}

                {video.isShort && (
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded flex items-center gap-1 z-10 pointer-events-none">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M17.77 10.32l-1.2-.5L18 9.06a3.74 3.74 0 00-3.5-6.62L6 6.94a3.74 3.74 0 00.36 7.4h.07l1.2.5L6.4 15.6a3.74 3.74 0 003.5 6.62l8.5-4.5a3.74 3.74 0 00-.36-7.4h-.07zm-6.14-6a2.54 2.54 0 012.38 4.49l-6.8 3.58a1.35 1.35 0 00-.6-1.8 1.35 1.35 0 00-1.8.6l1.2-.5 6.8-3.58a1.35 1.35 0 011.8-.6 1.35 1.35 0 01.6 1.8l-1.2.5a2.54 2.54 0 01-2.38-4.49zM9.5 20.6l-1.2.5a2.54 2.54 0 01-2.38-4.49l6.8-3.58a1.35 1.35 0 00.6 1.8 1.35 1.35 0 001.8-.6l-1.2.5-6.8 3.58a1.35 1.35 0 01-1.8.6 1.35 1.35 0 01-.6-1.8l1.2-.5a2.54 2.54 0 012.38 4.49z"></path><path d="M10 9.5v6l5-3-5-3z"></path></svg>
                        SHORTS
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="p-4 flex flex-col flex-1">
                {/* Channel Info (Optional) */}
                {showChannel && video.channel && (
                    <div className="flex items-center gap-2 mb-2 relative z-10">
                        {video.channel.thumbnail && (
                            <Link href={`/channel/${video.channel.id}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                <img src={video.channel.thumbnail} className="w-5 h-5 rounded-full hover:opacity-80 transition-opacity" />
                            </Link>
                        )}
                        <span className="text-xs text-zinc-500 font-medium truncate group/channel flex items-center gap-1">
                            <Link
                                href={`/channel/${video.channel.id}`}
                                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {video.channel.name}
                            </Link>
                            <button
                                onClick={handleCopyChannelLink}
                                className="opacity-0 group-hover/channel:opacity-100 p-0.5 hover:bg-zinc-200 rounded transition-all"
                                title="复制频道链接"
                            >
                                <Copy size={10} />
                            </button>
                        </span>
                    </div>
                )}

                {/* Title */}
                <h3 className="font-semibold line-clamp-2 mb-3 text-sm leading-relaxed text-zinc-800 dark:text-zinc-100 relative z-10" title={video.title}>
                    <Link href={`/watch/${video.id}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        {video.title}
                    </Link>
                </h3>

                {/* Key Metrics - Views Highlighted */}
                <div className="mt-auto">
                    <div className="flex items-baseline gap-1.5 mb-2 text-zinc-900 dark:text-zinc-50 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                        <Eye size={18} className="text-zinc-400 translate-y-[2px]" />
                        <span className={`font-extrabold tracking-tighter font-mono ${views > 99999999 ? 'text-lg' :
                            views > 999999 ? 'text-xl' :
                                'text-2xl'
                            }`}>
                            {views.toLocaleString()}
                        </span>
                    </div>

                    {/* Stats Grid */}
                    {metrics && (
                        <div className="grid grid-cols-2 xl:grid-cols-1 3xl:grid-cols-2 gap-1.5 mb-2">
                            {/* VPH Box */}
                            <div className={`p-1.5 rounded-lg border flex flex-col items-center justify-center ${isViral ? 'bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-900/50' : 'bg-zinc-50 border-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-700'}`}>
                                <div className="text-[9px] text-zinc-500 uppercase font-bold flex items-center gap-1 mb-0.5">
                                    <TrendingUp size={10} /> VPH
                                </div>
                                <div className={`font-mono text-sm font-black tracking-tight ${isViral ? 'text-red-600 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                    {Math.round(metrics.vph).toLocaleString()}
                                </div>
                            </div>

                            {/* Viral/Explosive Index Box */}
                            <div className={`p-1.5 rounded-lg border flex flex-col items-center justify-center ${isViral ? 'bg-orange-50 border-orange-100 dark:bg-orange-900/20 dark:border-orange-900/50' : 'bg-zinc-50 border-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-700'}`}>
                                <div className="text-[9px] text-zinc-500 uppercase font-bold flex items-center gap-1 mb-0.5">
                                    <Flame size={10} /> 爆款
                                </div>
                                <div className="flex flex-col items-center">
                                    <div className={`font-mono text-sm font-black tracking-tight ${isViral ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                        {metrics.multiplier > 0 ? metrics.multiplier.toFixed(1) + "x" : "-"}
                                    </div>
                                    <div className="text-[8px] text-zinc-400 font-mono">
                                        Z:{metrics.zScore !== 0 ? metrics.zScore.toFixed(1) : "-"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer Date & ER */}
                    <div className="flex flex-col xl:gap-0.5 3xl:flex-row 3xl:items-center 3xl:justify-between text-xs text-zinc-400">
                        {metrics && (
                            <div className="flex items-center gap-1 font-medium text-zinc-500">
                                <ThumbsUp size={12} /> ER {metrics.er.toFixed(1)}%
                            </div>
                        )}
                        <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            {publishedAt.toLocaleDateString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Click Overlay - Links to internal watch page */}
            <Link href={`/watch/${video.id}`} className="absolute inset-0 z-0" />
        </div>
    );
}
