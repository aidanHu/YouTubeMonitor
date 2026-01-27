import { useState, useEffect, useMemo } from "react";
import { X, Download, Loader2, AlertCircle, Link as LinkIcon, Layers, ChevronDown, Search, Check } from "lucide-react";
import { useDownloads } from "@/context/DownloadContext";
import { invoke } from "@tauri-apps/api/core";
import { Video, Group } from "@/types";

interface DownloadSingleVideoModalProps {
    is_open: boolean;
    on_close: () => void;
    group_id?: number | null;
    groups: Group[];
}

interface RawVideo {
    id: string;
    title: string;
    thumbnail: string | null;
    channel_name: string;
    channel_id: string;
    is_downloaded: boolean;
}

interface VideoResponse {
    videos: RawVideo[];
    has_more: boolean;
    total: number;
}

export function DownloadSingleVideoModal({ is_open, on_close, group_id, groups }: DownloadSingleVideoModalProps) {
    const [activeTab, setActiveTab] = useState<"link" | "batch">("link");

    // Link State
    const [url, set_url] = useState("");

    // Batch State
    const [minViews, setMinViews] = useState<number>(1000000); // Default 1M
    const [dateRange, setDateRange] = useState<"all" | "3d" | "7d" | "30d">("all");
    const [selectedScope, setSelectedScope] = useState<number | "all">("all");
    const [previewCount, setPreviewCount] = useState<number | null>(null);
    const [isScanned, setIsScanned] = useState(false);

    // Dropdown state
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const filteredGroups = useMemo(() => {
        if (!searchQuery.trim()) return groups;
        return groups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [groups, searchQuery]);

    // Common State
    const [loading, set_loading] = useState(false);
    const [error, set_error] = useState<string | null>(null);

    const { start_download, queue_downloads } = useDownloads();

    useEffect(() => {
        if (is_open) {
            // Reset state on open
            set_url("");
            set_error(null);
            setPreviewCount(null);
            setIsScanned(false);
            set_loading(false);
            // Default batch settings
            setMinViews(1000000);
            setDateRange("all");
            // Set initial scope to current group ID if exists, effectively "current group"
            setSelectedScope(group_id || "all");
        } else {
            // Reset dropdown state on close
            setIsDropdownOpen(false);
            setSearchQuery("");
        }
    }, [is_open, group_id]);

    if (!is_open) return null;

    const handle_process_link = async () => {
        if (!url.trim()) return;
        set_loading(true);
        set_error(null);

        try {
            const videoInfo: any = await invoke('resolve_video_info', { url });
            await start_download({
                id: videoInfo.id,
                title: videoInfo.title,
                thumbnail: videoInfo.thumbnail,
                channel_name: videoInfo.channelName,
                channel_id: videoInfo.channelId || undefined
            });
            on_close();
        } catch (err: any) {
            set_error(err.toString());
        } finally {
            set_loading(false);
        }
    };

    const handle_scan_batch = async () => {
        set_loading(true);
        set_error(null);
        try {
            const targetGroupId = selectedScope === "all" ? null : selectedScope;

            const res = await invoke<VideoResponse>('get_videos', {
                page: 1,
                limit: 1, // We only care about total
                sort: "view_count",
                filter_type: "all",
                group_id: targetGroupId,
                favorites: false,
                search: null,
                date_range: dateRange,
                channel_id: null,
                min_views: minViews
            });
            setPreviewCount(res.total);
            setIsScanned(true);
        } catch (err: any) {
            set_error(err.toString());
        } finally {
            set_loading(false);
        }
    };

    const handle_process_batch = async () => {
        if (previewCount === 0) return;
        set_loading(true);
        set_error(null);

        try {
            // Fetch all matching videos
            // If count is huge, we might need pagination, but let's try fetching up to 2000 for now.
            // Or loop? Ideally we fetch enough.
            const limit = Math.max(previewCount || 100, 2000);

            const targetGroupId = selectedScope === "all" ? null : selectedScope;

            const res = await invoke<VideoResponse>('get_videos', {
                page: 1,
                limit: limit,
                sort: "view_count",
                filter_type: "all",
                group_id: targetGroupId,
                favorites: false,
                search: null,
                date_range: dateRange,
                channel_id: null,
                min_views: minViews
            });

            const videosToDownload = res.videos
                .filter(v => !v.is_downloaded)
                .map(v => ({
                    id: v.id,
                    title: v.title,
                    thumbnail: v.thumbnail,
                    channel_name: v.channel_name || "Unknown Channel",
                    channel_id: v.channel_id
                }));

            if (videosToDownload.length === 0) {
                // Nothing to download
                if (res.videos.length > 0) {
                    set_error("所选范围内的视频均已下载过，无需重复下载。");
                } else {
                    set_error("未找到符合条件的视频。");
                }
                set_loading(false);
                return;
            }

            queue_downloads(videosToDownload);
            on_close();

            // Show success message implicitly by closing or could trigger toast
            // For now, on_close is enough, maybe show alert in future or notify user via toast context if available
        } catch (err: any) {
            set_error(err.toString());
        } finally {
            set_loading(false);
        }
    };

    const formatNumber = (num: number) => {
        if (num >= 100000000) return (num / 100000000).toFixed(1) + "亿";
        if (num >= 10000) return (num / 10000).toFixed(0) + "万";
        return num.toLocaleString();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-lg shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-zinc-100 dark:border-zinc-800">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">下载视频</h2>
                    <button onClick={on_close} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-500">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-zinc-100 dark:border-zinc-800">
                    <button
                        onClick={() => setActiveTab("link")}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative
                            ${activeTab === "link" ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                    >
                        <LinkIcon size={16} />
                        链接下载
                        {activeTab === "link" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />}
                    </button>
                    <button
                        onClick={() => setActiveTab("batch")}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative
                            ${activeTab === "batch" ? "text-blue-600 dark:text-blue-400" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                    >
                        <Layers size={16} />
                        批量下载
                        {activeTab === "batch" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />}
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {activeTab === "link" ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">YouTube 链接</label>
                                <input
                                    type="text"
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    value={url}
                                    onChange={(e) => set_url(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handle_process_link()}
                                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                    autoFocus
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Scope Selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">下载范围</label>
                                <div className="relative">
                                    {/* Custom Dropdown Trigger */}
                                    <div
                                        className={`flex items-center justify-between w-full p-2.5 rounded-xl border cursor-pointer transition-all ${isDropdownOpen
                                            ? "border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-zinc-950"
                                            : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 hover:border-blue-500/50 hover:bg-white dark:hover:bg-zinc-900"}`}
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <span className={`text-sm truncate ${selectedScope === "all" ? "text-zinc-500" : "text-zinc-900 dark:text-zinc-100"}`}>
                                                {selectedScope === "all"
                                                    ? "所有频道"
                                                    : groups.find(g => g.id === selectedScope)?.name || "未知分组"}
                                            </span>
                                        </div>
                                        <ChevronDown size={16} className={`text-zinc-400 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
                                    </div>

                                    {/* Dropdown Menu */}
                                    {isDropdownOpen && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                                            <div className="absolute z-20 w-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top flex flex-col max-h-[300px]">
                                                {/* Search */}
                                                <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-sm sticky top-0">
                                                    <div className="relative">
                                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                                        <input
                                                            type="text"
                                                            placeholder="搜索分组..."
                                                            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-zinc-400"
                                                            value={searchQuery}
                                                            onChange={e => setSearchQuery(e.target.value)}
                                                            autoFocus
                                                            onClick={e => e.stopPropagation()}
                                                        />
                                                    </div>
                                                </div>

                                                {/* List */}
                                                <div className="overflow-y-auto p-1.5 flex-1 min-h-0">
                                                    <div
                                                        className={`px-3 py-2 rounded-lg text-sm cursor-pointer flex items-center justify-between transition-colors ${selectedScope === "all" ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 font-medium" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                                                        onClick={() => {
                                                            setSelectedScope("all");
                                                            setIsScanned(false);
                                                            setIsDropdownOpen(false);
                                                        }}
                                                    >
                                                        <span>所有频道</span>
                                                        {selectedScope === "all" && <Check size={14} />}
                                                    </div>

                                                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1 mx-2" />

                                                    {filteredGroups.map(g => (
                                                        <div
                                                            key={g.id}
                                                            className={`px-3 py-2 rounded-lg text-sm cursor-pointer flex items-center justify-between transition-colors ${selectedScope === g.id ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 font-medium" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                                                            onClick={() => {
                                                                setSelectedScope(g.id);
                                                                setIsScanned(false);
                                                                setIsDropdownOpen(false);
                                                            }}
                                                        >
                                                            <span className="truncate">{g.name}</span>
                                                            {selectedScope === g.id && <Check size={14} />}
                                                        </div>
                                                    ))}

                                                    {filteredGroups.length === 0 && (
                                                        <div className="px-3 py-8 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                                                            <Search size={20} className="text-zinc-300 dark:text-zinc-700" />
                                                            <p>未找到 "{searchQuery}"</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* View Threshold */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex justify-between">
                                    <span>最低播放量</span>
                                    <span className="text-blue-600 dark:text-blue-400">{formatNumber(minViews)}</span>
                                </label>
                                <input
                                    type="number"
                                    value={minViews}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setMinViews(val >= 0 ? val : 0);
                                        setIsScanned(false);
                                    }}
                                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                />
                                <div className="flex gap-2 text-xs">
                                    {[100000, 500000, 1000000, 5000000, 10000000].map(val => (
                                        <button
                                            key={val}
                                            onClick={() => { setMinViews(val); setIsScanned(false); }}
                                            className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
                                        >
                                            {formatNumber(val)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Date Range */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">发布时间</label>
                                <select
                                    value={dateRange}
                                    onChange={(e) => { setDateRange(e.target.value as any); setIsScanned(false); }}
                                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                                >
                                    <option value="all">全部时间</option>
                                    <option value="3d">最近3天</option>
                                    <option value="7d">最近7天</option>
                                    <option value="30d">最近30天</option>
                                </select>
                            </div>

                            {/* Preview Result */}
                            {isScanned && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                                    <AlertCircle size={16} />
                                    <span>共找到 <strong>{previewCount}</strong> 个符合条件的视频</span>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="text-red-500 text-sm flex items-center gap-1.5 mt-2 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-b-2xl">
                    <button
                        onClick={on_close}
                        className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                        取消
                    </button>
                    {activeTab === "link" ? (
                        <button
                            onClick={handle_process_link}
                            disabled={loading || !url}
                            className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm shadow-blue-600/20"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            {loading ? "解析中..." : "开始下载"}
                        </button>
                    ) : (
                        <div className="flex gap-3">
                            {!isScanned ? (
                                <button
                                    onClick={handle_scan_batch}
                                    disabled={loading}
                                    className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                                    扫描数量
                                </button>
                            ) : (
                                <button
                                    onClick={handle_process_batch}
                                    disabled={loading || previewCount === 0}
                                    className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm shadow-blue-600/20"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                    批量下载全部
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
