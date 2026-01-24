import { VideoMetrics } from "@/utils/analytics";
import { Flame, Calendar, Eye, TrendingUp, ThumbsUp, Check, Copy } from "lucide-react";
import { useState, memo } from "react";
import Link from "next/link";
import { VideoCardOverlay } from "./VideoCardOverlay";

export interface VideoCardProps {
    video: {
        id: string;
        title: string;
        url: string;
        thumbnail: string | null;
        published_at: string | Date;
        view_count: string | number | bigint;
        like_count?: number | null;
        comment_count?: number | null;
        is_short: boolean;
        is_favorite?: boolean;
        channel?: {
            id: string;
            name: string;
            thumbnail: string | null;
            url: string;
        };
        local_path?: string | null;
    };
    metrics?: VideoMetrics;
    show_channel?: boolean;
    on_toggle_favorite?: (id: string, is_favorite: boolean) => void;
}

export const VideoCard = memo(function VideoCard({ video, metrics, show_channel = false, on_toggle_favorite }: VideoCardProps) {
    const views = Number(video.view_count);
    const published_at = new Date(video.published_at);
    const [is_channel_copied, set_is_channel_copied] = useState(false);

    // Visual thresholds based on metrics
    const is_viral = metrics?.label === "Viral";
    const is_high = metrics?.label === "High";

    // Dynamic border color
    const borderColor = is_viral
        ? "border-red-500/50 dark:border-red-500/50 shadow-red-500/10"
        : is_high
            ? "border-orange-400/50 dark:border-orange-400/50 shadow-orange-500/10"
            : "border-zinc-200 dark:border-zinc-800";

    const bgClass = is_viral ? "bg-red-50/30 dark:bg-red-950/10" : "bg-white dark:bg-zinc-900";

    const handle_copy_channel_link = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (video.channel?.url) {
            navigator.clipboard.writeText(video.channel.url);
            set_is_channel_copied(true);
            setTimeout(() => set_is_channel_copied(false), 2000);
        }
    };

    return (
        <div className={`group relative ${bgClass} border ${borderColor} rounded-xl overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col h-full`}>
            {/* Thumbnail Section */}
            <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 relative shrink-0">
                {video.thumbnail && (
                    <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                )}

                {/* Overlays - Extracted to separate component to prevent re-renders on download progress */}
                <VideoCardOverlay video={video} on_toggle_favorite={on_toggle_favorite} />

                {/* Badges */}
                {is_viral && (
                    <div className="absolute top-2 right-2 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-lg animate-pulse z-10 pointer-events-none">
                        <Flame size={12} fill="currentColor" /> EXPLOSIVE
                    </div>
                )}
                {!is_viral && is_high && (
                    <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg z-10 pointer-events-none">
                        <TrendingUp size={12} /> RISING
                    </div>
                )}

                {video.is_short && (
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded flex items-center gap-1 z-10 pointer-events-none">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M17.77 10.32l-1.2-.5L18 9.06a3.74 3.74 0 00-3.5-6.62L6 6.94a3.74 3.74 0 00.36 7.4h.07l1.2.5L6.4 15.6a3.74 3.74 0 003.5 6.62l8.5-4.5a3.74 3.74 0 00-.36-7.4h-.07zm-6.14-6a2.54 2.54 0 012.38 4.49l-6.8 3.58a1.35 1.35 0 00-.6-1.8 1.35 1.35 0 00-1.8.6l1.2-.5 6.8-3.58a1.35 1.35 0 011.8-.6 1.35 1.35 0 01.6 1.8l-1.2.5a2.54 2.54 0 01-2.38-4.49zM9.5 20.6l-1.2.5a2.54 2.54 0 01-2.38-4.49l6.8-3.58a1.35 1.35 0 00.6 1.8 1.35 1.35 0 001.8-.6l-1.2.5-6.8 3.58a1.35 1.35 0 01-1.8.6 1.35 1.35 0 01-.6-1.8l1.2-.5a2.54 2.54 0 012.38 4.49z"></path><path d="M10 9.5v6l5-3-5-3z"></path></svg>
                        SHORTS
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="p-4 flex flex-col flex-1 gap-3">
                {/* Channel Info (Optional) */}
                {show_channel && video.channel && (
                    <div className="flex items-center gap-2 relative z-10">
                        {video.channel.thumbnail && (
                            <Link href={`/channel?id=${video.channel.id}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                <img src={video.channel.thumbnail} className="w-5 h-5 rounded-full hover:opacity-80 transition-opacity" loading="lazy" />
                            </Link>
                        )}
                        <span className="text-xs text-zinc-500 font-medium truncate group/channel flex items-center gap-1">
                            <Link
                                href={`/channel?id=${video.channel.id}`}
                                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {video.channel.name}
                            </Link>
                            <button
                                onClick={handle_copy_channel_link}
                                title={is_channel_copied ? "已复制" : "复制频道链接"}
                                className="transition-colors"
                            >
                                {is_channel_copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
                            </button>
                        </span>
                    </div>
                )}

                {/* Title */}
                <h3 className="font-semibold line-clamp-2 h-12 text-sm leading-normal text-zinc-800 dark:text-zinc-100 relative z-10" title={video.title}>
                    <Link href={`/watch?id=${video.id}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
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
                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                            {/* VPH Box */}
                            <div className={`p-1.5 rounded-lg border flex flex-col items-center justify-center ${is_viral ? 'bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-900/50' : 'bg-zinc-50 border-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-700'}`}>
                                <div className="text-[9px] text-zinc-500 uppercase font-bold flex items-center gap-1 mb-0.5">
                                    <TrendingUp size={10} /> VPH
                                </div>
                                <div className={`font-mono text-sm font-black tracking-tight ${is_viral ? 'text-red-600 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                    {Math.round(metrics.vph).toLocaleString()}
                                </div>
                            </div>

                            {/* Viral/Explosive Index Box */}
                            <div className={`p-1.5 rounded-lg border flex flex-col items-center justify-center ${is_viral ? 'bg-orange-50 border-orange-100 dark:bg-orange-900/20 dark:border-orange-900/50' : 'bg-zinc-50 border-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-700'}`}>
                                <div className="text-[9px] text-zinc-500 uppercase font-bold flex items-center gap-1 mb-0.5">
                                    <Flame size={10} /> 爆款
                                </div>
                                <div className="flex flex-col items-center">
                                    <div className={`font-mono text-sm font-black tracking-tight ${is_viral ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                        {metrics.multiplier > 0 ? metrics.multiplier.toFixed(1) + "x" : "-"}
                                    </div>
                                    <div className="text-[8px] text-zinc-400 font-mono">
                                        Z:{metrics.z_score !== 0 ? metrics.z_score.toFixed(1) : "-"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer Date & ER */}
                    <div className="flex flex-row items-center justify-between text-xs text-zinc-400">
                        {metrics && (
                            <div className="flex items-center gap-1 font-medium text-zinc-500">
                                <ThumbsUp size={12} /> ER {metrics.er.toFixed(1)}%
                            </div>
                        )}
                        <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            {published_at.toLocaleDateString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Click Overlay - Links to internal watch page */}
            <Link href={`/watch?id=${video.id}`} className="absolute inset-0 z-0" />
        </div>
    );
});
