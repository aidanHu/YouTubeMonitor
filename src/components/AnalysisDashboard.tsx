"use client";

import { useEffect, useState } from "react";
import { Video } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ExternalLink, Flame, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";

interface AnalysisDashboardProps {
    groupId: number | null;
    dateRange: "3d" | "7d" | "30d";
    filterType: "all" | "video" | "short";
}

export function AnalysisDashboard({ groupId, dateRange, filterType }: AnalysisDashboardProps) {
    const [viralVideos, setViralVideos] = useState<any[]>([]);
    const [outliers, setOutliers] = useState<any[]>([]);
    const [stats, setStats] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);



    // Sorts
    const [viralSort, setViralSort] = useState<"viewCount" | "vph" | "er">("vph");
    const [outlierSort, setOutlierSort] = useState<"viral" | "zScore">("viral");

    const fetchData = async () => {
        setLoading(true);
        try {
            const groupParam = groupId === null ? "" : `&groupId=${groupId}`;
            const params = `${groupParam}&dateRange=${dateRange}&filterType=${filterType}`;

            const statsType = groupId === null ? "group_stats" : "channel_stats";

            const [viralRes, outlierRes, statsRes] = await Promise.all([
                fetch(`/api/analysis?type=viral&sort=${viralSort}${params}`),
                fetch(`/api/analysis?type=outlier&sort=${outlierSort}${params}`),
                fetch(`/api/analysis?type=${statsType}${params}`)
            ]);

            const viralData = await viralRes.json();
            const outlierData = await outlierRes.json();
            const statsData = await statsRes.json();

            if (Array.isArray(viralData)) setViralVideos(viralData);
            if (Array.isArray(outlierData)) setOutliers(outlierData);
            if (Array.isArray(statsData)) setStats(statsData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [groupId, dateRange, filterType, viralSort, outlierSort]);

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
                                <span className={type === "total" ? "text-blue-600 font-bold" : ""}>{formatNumber(c.totalViews)} 总播放</span>
                                <span className="text-zinc-400 mx-1">({c.count}个)</span>
                                <span className="mx-1">·</span>
                                <span className={type === "avg" ? "text-green-600 font-bold" : ""}>{formatNumber(c.avgViews)} 平均</span>
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
                        <Link href={`/watch/${v.id}`}>
                            <img src={v.thumbnail} className="w-28 h-16 object-cover rounded-lg bg-zinc-100 hover:opacity-90 transition-opacity" />
                        </Link>
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
                            {formatDistanceToNow(new Date(v.publishedAt), { addSuffix: true, locale: zhCN })}
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <Link href={`/watch/${v.id}`} className="font-medium text-sm line-clamp-2 hover:text-blue-500 transition-colors leading-snug">
                            {v.title}
                        </Link>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-zinc-500">
                            <div className="flex items-center gap-1">
                                <Link href={`/channel/${v.channelId || v.channel?.id}`} className="flex items-center gap-1 hover:text-blue-500">
                                    <img src={v.channel.thumbnail || ""} className="w-3.5 h-3.5 rounded-full" />
                                    <span className="truncate max-w-[80px] text-zinc-600 dark:text-zinc-400">{v.channel.name}</span>
                                </Link>
                            </div>
                            {(sort === "vph" || sort === "viewCount") && <span className="text-orange-500 font-bold">{formatNumber(v.vph)}/h</span>}
                            {sort === "viral" && <span className="text-purple-500 font-bold">{v.ratio.toFixed(1)}x</span>}
                            {sort === "zScore" && <span className="text-pink-500 font-bold">Z:{v.zScore.toFixed(1)}</span>}
                            {sort === "er" && <span className="text-green-500 font-bold">ER:{(v.engagementRate * 100).toFixed(1)}%</span>}
                        </div>
                        <div className="flex gap-2 mt-0.5 text-[10px] text-zinc-400">
                            <span>{formatNumber(v.viewCount)} 观看</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">


            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Viral Radar */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 h-[650px] flex flex-col">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
                        <div className="flex items-center gap-2 text-red-500">
                            <Flame size={20} />
                            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">爆款雷达</h3>
                        </div>
                        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                            <button onClick={() => setViralSort("vph")} className={`text-xs px-2.5 py-1 rounded-md transition-all ${viralSort === "vph" ? "bg-white dark:bg-zinc-700 shadow-sm font-bold" : "text-zinc-500"}`}>VPH</button>
                            <button onClick={() => setViralSort("viewCount")} className={`text-xs px-2.5 py-1 rounded-md transition-all ${viralSort === "viewCount" ? "bg-white dark:bg-zinc-700 shadow-sm font-bold" : "text-zinc-500"}`}>总播放</button>
                            <button onClick={() => setViralSort("er")} className={`text-xs px-2.5 py-1 rounded-md transition-all ${viralSort === "er" ? "bg-white dark:bg-zinc-700 shadow-sm font-bold" : "text-zinc-500"}`}>互动率</button>
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
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 h-[650px] flex flex-col">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
                        <div className="flex items-center gap-2 text-purple-500">
                            <Zap size={20} />
                            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">黑马视频</h3>
                        </div>
                        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                            <button onClick={() => setOutlierSort("viral")} className={`text-xs px-2.5 py-1 rounded-md transition-all ${outlierSort === "viral" ? "bg-white dark:bg-zinc-700 shadow-sm font-bold" : "text-zinc-500"}`}>倍率(Viral)</button>
                            <button onClick={() => setOutlierSort("zScore")} className={`text-xs px-2.5 py-1 rounded-md transition-all ${outlierSort === "zScore" ? "bg-white dark:bg-zinc-700 shadow-sm font-bold" : "text-zinc-500"}`}>Z-Score</button>
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

            {/* 3. Stats Section */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-6 text-blue-500">
                    <TrendingUp size={20} />
                    <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">
                        {groupId === null ? "各分组平均表现" : "频道排行榜"}
                    </h3>
                </div>

                <div className="w-full">
                    {loading ? (
                        <div className="h-48 flex items-center justify-center text-zinc-400">加载中...</div>
                    ) : groupId === null ? (
                        // Group View: Bar Chart
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats}>
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} height={30} />
                                    <YAxis tickFormatter={formatNumber} fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }}
                                        itemStyle={{ color: '#fff' }}
                                        formatter={(val: number | undefined) => formatNumber(val || 0)}
                                        cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                                    />
                                    <Bar dataKey="avgViewCount" name="平均播放量" radius={[4, 4, 0, 0]} barSize={40}>
                                        {stats.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'][index % 5]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        // Channel View: Top 10 Grid
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h4 className="font-semibold text-zinc-700 dark:text-zinc-300 mb-4 flex items-center gap-2">
                                    <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                                    总播放量 Top 10
                                </h4>
                                {renderChannelList(stats.slice(0, 10), "total")}
                            </div>
                            <div>
                                <h4 className="font-semibold text-zinc-700 dark:text-zinc-300 mb-4 flex items-center gap-2">
                                    <span className="w-1 h-4 bg-green-500 rounded-full"></span>
                                    平均播放量 Top 10
                                </h4>
                                {renderChannelList([...stats].sort((a, b) => b.avgViews - a.avgViews).slice(0, 10), "avg")}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
