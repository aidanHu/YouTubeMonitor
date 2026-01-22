"use client";

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Video } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ExternalLink, Flame, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import { useData } from "@/context/DataContext";

interface AnalysisDashboardProps {
    group_id: number | null;
    date_range: "3d" | "7d" | "30d";
    filter_type: "all" | "video" | "short";
}

export function AnalysisDashboard({ group_id, date_range, filter_type }: AnalysisDashboardProps) {
    const [viralVideos, set_viral_videos] = useState<any[]>([]);
    const [outliers, set_outliers] = useState<any[]>([]);
    const [stats, set_stats] = useState<any[]>([]);
    const [loading, set_loading] = useState(false);

    // Sorts
    const [viralSort, set_viral_sort] = useState<"view_count" | "vph" | "er">("vph");
    const [outlierSort, set_outlier_sort] = useState<"viral" | "z_score">("viral");

    const fetch_data = async () => {
        set_loading(true);
        try {
            // Map group_id: null -> -1 (if needed by Rust logic, or handle null)
            // My Rust logic checks `if let Some(gid) = group_id`. 
            // In Rust `Option<i64>`: null/undefined -> None.
            // If I pass `group_id` which is `number | null`, it maps to `Option<i64>`.
            // But if `group_id` is -1 (from frontend "Uncategorized"), I handle it in Rust as `gid == -1`.
            // So direct passing is fine.

            // 1. Viral Videos
            const viralPromise = invoke<any[]>('get_viral_videos', {
                group_id: group_id,
                date_range,
                filter_type,
                sort_order: viralSort,
                limit: 10
            });

            // 2. Outliers
            const outlierPromise = invoke<any[]>('get_viral_videos', {
                group_id: group_id,
                date_range,
                filter_type,
                sort_order: outlierSort, // "viral" or "z_score"
                limit: 10
            });

            // 3. Stats
            let statsPromise;
            if (group_id === null) {
                // All groups comparison
                statsPromise = invoke<any[]>('get_group_stats', {
                    date_range,
                    filter_type
                });
            } else {
                // Channel stats for this group
                statsPromise = invoke<any[]>('get_channel_stats', {
                    group_id: group_id,
                    date_range,
                    filter_type
                });
            }

            const [viralData, outlierData, statsData] = await Promise.all([
                viralPromise,
                outlierPromise,
                statsPromise
            ]);

            if (Array.isArray(viralData)) set_viral_videos(viralData);
            if (Array.isArray(outlierData)) set_outliers(outlierData);
            if (Array.isArray(statsData)) set_stats(statsData);
        } catch (e) {
            console.error("Analysis data fetch failed:", e);
        } finally {
            set_loading(false);
        }
    };

    const { last_updated } = useData();

    useEffect(() => {
        fetch_data();
    }, [group_id, date_range, filter_type, viralSort, outlierSort, last_updated]);

    // Helpers
    const formatNumber = (val: number | string) => {
        const n = Number(val);
        if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
        if (n >= 1000) return (n / 1000).toFixed(1) + "K";
        return n.toFixed(0);
    };

    const renderChannelList = (channels: any[], type: "total" | "avg") => (
        <div className="space-y-3">
            {channels.map((c, i) => {
                if (!c.channel) return null;
                return (
                    <div key={c.channel.id} className="flex gap-3 items-center p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors">
                        <div className={`w-6 text-lg font-bold flex-shrink-0 ${i < 3 ? "text-yellow-500" : "text-zinc-300 dark:text-zinc-700"}`}>#{i + 1}</div>
                        <img src={c.channel.thumbnail} className="w-10 h-10 rounded-full bg-zinc-100" />
                        <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{c.channel.name}</div>
                            <div className="text-xs text-zinc-500 mt-0.5">
                                <span className={type === "total" ? "text-blue-600 font-bold" : ""}>{formatNumber(c.total_views)} 总播放</span>
                                <span className="text-zinc-400 mx-1">({c.count}个)</span>
                                <span className="mx-1">·</span>
                                <span className={type === "avg" ? "text-green-600 font-bold" : ""}>{formatNumber(c.avg_views)} 平均</span>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    );

    const renderVideoList = (videos: any[], sort: string) => (
        <div className="space-y-4">
            {videos.map((v, i) => (
                <div key={v.id} className="flex gap-4 items-start group p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors">
                    <div className={`w-6 text-lg font-bold flex-shrink-0 pt-0.5 ${i < 3 ? "text-red-500" : "text-zinc-300 dark:text-zinc-700"}`}>#{i + 1}</div>
                    <div className="relative flex-shrink-0">
                        <Link href={`/watch?id=${v.id}`}>
                            <img src={v.thumbnail} className="w-28 h-16 object-cover rounded-lg bg-zinc-100 hover:opacity-90 transition-opacity" />
                        </Link>
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
                            {formatDistanceToNow(new Date(v.published_at), { addSuffix: true, locale: zhCN })}
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <Link href={`/watch?id=${v.id}`} className="font-medium text-sm line-clamp-2 hover:text-blue-500 transition-colors leading-snug">
                            {v.title}
                        </Link>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-zinc-500">
                            <div className="flex items-center gap-1">
                                <Link href={`/channel?id=${v.channel_id || v.channel?.id}`} className="flex items-center gap-1 hover:text-blue-500">
                                    <img src={v.channel_thumbnail || v.channel?.thumbnail || ""} className="w-3.5 h-3.5 rounded-full" />
                                    <span className="truncate max-w-[80px] text-zinc-600 dark:text-zinc-400">{v.channel_name || v.channel?.name}</span>
                                </Link>
                            </div>
                            {(sort === "vph" || sort === "view_count") && <span className="text-red-500 font-bold">{formatNumber(v.vph)}M/h</span>}
                            {sort === "viral" && <span className="text-purple-500 font-bold">{v.ratio.toFixed(1)}x</span>}
                            {sort === "z_score" && <span className="text-pink-500 font-bold">Z:{v.z_score.toFixed(1)}</span>}
                            {sort === "er" && <span className="text-green-500 font-bold">ER:{(v.engagement_rate * 100).toFixed(1)}%</span>}
                        </div>
                        <div className="flex gap-2 mt-0.5 text-[10px] text-zinc-400">
                            <span>{formatNumber(v.view_count)}M 观看</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">


            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
                {/* 1. Viral Radar */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 h-[650px] flex flex-col min-w-0 shadow-sm">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
                        <div className="flex items-center gap-2 text-red-500">
                            <Flame size={20} />
                            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">爆款雷达</h3>
                        </div>
                        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                            <button onClick={() => set_viral_sort("vph")} className={`text-xs px-2.5 py-1 rounded-md transition-all ${viralSort === "vph" ? "bg-white dark:bg-zinc-700 shadow-sm font-bold" : "text-zinc-500"}`}>VPH</button>
                            <button onClick={() => set_viral_sort("view_count")} className={`text-xs px-2.5 py-1 rounded-md transition-all ${viralSort === "view_count" ? "bg-white dark:bg-zinc-700 shadow-sm font-bold" : "text-zinc-500"}`}>总播放</button>
                            <button onClick={() => set_viral_sort("er")} className={`text-xs px-2.5 py-1 rounded-md transition-all ${viralSort === "er" ? "bg-white dark:bg-zinc-700 shadow-sm font-bold" : "text-zinc-500"}`}>互动率</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                        {loading ? (
                            <div className="h-full flex items-center justify-center text-zinc-400">加载中...</div>
                        ) : viralVideos.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-zinc-400">无数据</div>
                        ) : renderVideoList(viralVideos, viralSort)}
                    </div>
                </div>

                {/* 2. Outliers */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 h-[650px] flex flex-col min-w-0 shadow-sm">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
                        <div className="flex items-center gap-2 text-purple-500">
                            <Zap size={20} />
                            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">黑马视频</h3>
                        </div>
                        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                            <button onClick={() => set_outlier_sort("viral")} className={`text-xs px-2.5 py-1 rounded-md transition-all ${outlierSort === "viral" ? "bg-white dark:bg-zinc-700 shadow-sm font-bold" : "text-zinc-500"}`}>倍率(Viral)</button>
                            <button onClick={() => set_outlier_sort("z_score")} className={`text-xs px-2.5 py-1 rounded-md transition-all ${outlierSort === "z_score" ? "bg-white dark:bg-zinc-700 shadow-sm font-bold" : "text-zinc-500"}`}>Z-Score</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                        {loading ? (
                            <div className="h-full flex items-center justify-center text-zinc-400">加载中...</div>
                        ) : outliers.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-zinc-400">未发现黑马</div>
                        ) : renderVideoList(outliers, outlierSort)}
                    </div>
                </div>
            </div>
        </div>
    );
}
