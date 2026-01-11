"use client";

import { AddChannelModal } from "@/components/AddChannelModal";
import { MoveChannelModal } from "@/components/MoveChannelModal";
import { ChannelCard } from "@/components/ChannelCard";
import { Sidebar } from "@/components/Sidebar";
import { VideoCard } from "@/components/VideoCard";
import { VideoList } from "@/components/VideoList";
import { DownloadManager } from "@/components/DownloadManager";
import { Channel, Group } from "@/types";
import { AnalysisDashboard } from "@/components/AnalysisDashboard";
import { Plus, RefreshCw, LayoutGrid, PlaySquare, Heart, Search, BarChart2 } from "lucide-react";
import { RefreshMenu } from "@/components/RefreshMenu";
import { useEffect, useState } from "react";
import { useData } from "@/context/DataContext";
import { calculateVPH } from "@/utils/analytics";
import { useRef, useLayoutEffect } from "react";
// import debounce from "lodash/debounce"; 

export default function Home() {
    const {
        groups,
        channels,
        loading,
        refreshData,
        dashboardScrollPosition,
        setDashboardScrollPosition,
        setChannels,
        currentView,
        setCurrentView,
        currentTab,
        setCurrentTab,
        // Persisted State
        selectedGroupId, setSelectedGroupId,
        sortOrder, setSortOrder,
        filterType, setFilterType,
        dateRange, setDateRange,
        searchQuery, setSearchQuery
    } = useData();
    const scrollRef = useRef<HTMLElement>(null);
    const positionRef = useRef(dashboardScrollPosition);

    // Update local ref on scroll (no re-renders)
    const handleScroll = (e: React.UIEvent<HTMLElement>) => {
        positionRef.current = e.currentTarget.scrollTop;
    };

    // Restore on mount
    useLayoutEffect(() => {
        if (dashboardScrollPosition > 0 && scrollRef.current) {
            // Use RAF to ensure render is complete
            requestAnimationFrame(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = dashboardScrollPosition;
                }
            });
        }
    }, [loading, channels.length, currentTab]);

    // Save on unmount
    useEffect(() => {
        return () => {
            setDashboardScrollPosition(positionRef.current);
        };
    }, []);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // View State (Synced with Global)
    const activeView = currentView;
    const setActiveView = setCurrentView;

    // Tab State (Synced with Global)
    const activeTab = currentTab;
    const setActiveTab = setCurrentTab;

    // Analysis Filters (Lifted State - Optional, currently local is fine or move too? Keep local for now as user asked for Dashboard Persistence)
    const [analysisDateRange, setAnalysisDateRange] = useState<"3d" | "7d" | "30d">("3d");
    const [analysisFilterType, setAnalysisFilterType] = useState<"all" | "video" | "short">("all");

    const [videos, setVideos] = useState<any[]>([]);
    const [videosLoading, setVideosLoading] = useState(false);
    const [videoPage, setVideoPage] = useState(1);
    const [hasMoreVideos, setHasMoreVideos] = useState(true);

    // fetchData removed
    const fetchData = refreshData; // Align naming

    const fetchGroups = async () => {
        await refreshData(true); // Partial refresh not supported yet, just refresh all
    }

    const fetchVideos = async (reset = false) => {
        setVideosLoading(true);
        const page = reset ? 1 : videoPage;

        try {
            let url = `/api/videos?page=${page}&limit=50&sort=${sortOrder}&type=${filterType}`;
            if (selectedGroupId) {
                url += `&groupId=${selectedGroupId}`;
            }
            if (dateRange && dateRange !== "all") {
                url += `&dateRange=${dateRange}`;
            }

            const res = await fetch(url);
            const data = await res.json();

            const newVideos = data.data;

            if (reset) {
                setVideos(newVideos);
            } else {
                setVideos(prev => [...prev, ...newVideos]);
            }

            setHasMoreVideos(data.pagination.page < data.pagination.totalPages);
            setVideoPage(page + 1);
        } catch (e) {
            console.error(e);
        } finally {
            setVideosLoading(false);
        }
    };

    // Initial Fetch handled by Context
    // Also trigger migration check
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        const init = async () => {
            try {
                // Run light weight migration check
                await fetch('/api/migrate');
            } catch (e) {
                console.error("Auto-migrate failed", e);
            } finally {
                setIsInitializing(false);
            }
        };
        init();
    }, []);



    // Refresh videos when sort changes or group changes or tab changes or filter changes
    useEffect(() => {
        if (activeTab === "videos") {
            setVideoPage(1);
            fetchVideos(true);
        }
    }, [sortOrder, selectedGroupId, activeTab, filterType, dateRange]);

    const handleRefresh = async (range: '3d' | '7d' | '30d' | 'all') => {
        setRefreshing(true);
        try {
            // Determine Group ID
            let groupId: number | null | undefined = undefined;
            if (selectedGroupId === -1) {
                groupId = null; // Uncategorized
            } else if (selectedGroupId) {
                groupId = selectedGroupId;
            }

            // If selectedGroupId is null (All), we just don't send groupId, or send as undefined
            // But my API logic: if groupId is provided it filters. If not provided (undefined), it fetches all.

            const body: any = { range };
            if (groupId !== undefined) {
                body.groupId = groupId;
            }

            // Always trigger backend refresh
            await fetch('/api/refresh', {
                method: 'POST',
                body: JSON.stringify(body)
            });

            // Then refresh local view
            if (activeTab === "channels") {
                await fetchData(false);
            } else {
                await fetchVideos(true);
            }
        } catch (error) {
            console.error("Refresh failed", error);
            alert("刷新失败，请检查网络或 API Key");
        } finally {
            setRefreshing(false);
        }
    };

    const handleDeleteChannel = async (id: string, name: string) => {
        if (!confirm(`确定要删除频道 "${name}" 吗？`)) return;

        try {
            const res = await fetch(`/api/channels/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Delete failed");
            await fetchData(false);
        } catch (error) {
            console.error("Failed to delete", error);
            alert("删除失败");
        }
    };

    const handleCreateGroup = async (name: string) => {
        try {
            await fetch("/api/groups", {
                method: "POST",
                body: JSON.stringify({ name }),
            });
            await fetchGroups();
        } catch (error) {
            console.error("Failed to create group", error);
        }
    };

    const handleCreateGroupAndReturn = async (name: string) => {
        const res = await fetch("/api/groups", {
            method: "POST",
            body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error("Failed to create group");
        const newGroup = await res.json();
        await fetchGroups();
        return newGroup; // { id, name }
    };

    const handleUpdateGroup = async (id: number, name: string) => {
        try {
            await fetch(`/api/groups/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ name }),
            });
            await fetchGroups();
        } catch (error) {
            console.error("Failed to update group", error);
        }
    };

    const handleDeleteGroup = async (id: number) => {
        try {
            await fetch(`/api/groups/${id}`, {
                method: "DELETE",
            });
            if (selectedGroupId === id) setSelectedGroupId(null);
            await fetchGroups();
        } catch (error) {
            console.error("Failed to delete group", error);
        }
    };

    const handleAddChannels = async (urls: string[], groupId: number | null) => {
        try {
            const res = await fetch("/api/channels", {
                method: "POST",
                body: JSON.stringify({ urls, groupId }),
            });

            const rawText = await res.text();
            let data;
            try {
                data = rawText ? JSON.parse(rawText) : null;
            } catch (e) {
                throw new Error("Server returned invalid JSON");
            }

            if (!res.ok) {
                throw new Error(data?.error || `Server error: ${res.status}`);
            }

            const results = data;

            if (results && results.length < urls.length) {
                alert(`操作完成，但部分频道添加失败。成功: ${results.length} / ${urls.length}\n请检查控制台日志或确认频道链接是否正确。`);
            }
        } catch (e: any) {
            console.error("Add channels error:", e);
            alert(`添加频道失败: ${e.message}`);
        } finally {
            fetchData(false);
        }
    };

    // Move Channel State
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [moveTarget, setMoveTarget] = useState<{ id: string; name: string; currentGroupId: number | null } | null>(null);

    const handleOpenMoveModal = (id: string, name: string, currentGroupId: number | null) => {
        setMoveTarget({ id, name, currentGroupId });
        setIsMoveModalOpen(true);
    };

    const handleToggleChannelFavorite = async (id: string, isFavorite: boolean) => {
        try {
            await fetch(`/api/channels/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ isFavorite }),
            });
            // Optimistic update locally
            setChannels(prev => prev.map(c => c.id === id ? { ...c, isFavorite } : c));
        } catch (error) {
            console.error("Failed to toggle channel favorite", error);
        }
    };

    const handleMoveChannel = async (groupId: number | null) => {
        if (!moveTarget) return;

        try {
            const res = await fetch(`/api/channels/${moveTarget.id}`, {
                method: "PATCH",
                body: JSON.stringify({ groupId }),
            });
            if (!res.ok) throw new Error("Move failed");
            await fetchData(false);
        } catch (error) {
            console.error("Failed to move", error);
            alert("移动失败");
        } finally {
            setIsMoveModalOpen(false); // Close modal after attempt
        }
    };

    const filteredChannels = (selectedGroupId
        ? (selectedGroupId === -1
            ? channels.filter((c) => c.groupId === null)
            : channels.filter((c) => c.groupId === selectedGroupId))
        : channels).filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const getHeaderTitle = () => {
        if (activeView === 'downloads') return "下载管理";
        if (activeView === 'favorites') return "我的收藏";
        if (selectedGroupId === -1) return "未分组";
        if (selectedGroupId) return groups.find(g => g.id === selectedGroupId)?.name || "分组";
        return "仪表盘";
    };

    const getHeaderSubtitle = () => {
        if (activeView === 'downloads') return "管理视频下载任务";
        if (activeView === 'favorites') return "我收藏的所有视频";
        return activeTab === "channels" ? `正在监控 ${filteredChannels.length} 个频道` : "最新视频动态";
    };

    return (
        <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans">
            <Sidebar
                groups={groups}
                selectedGroupId={selectedGroupId}
                activeView={activeView}
                onSelectView={(view) => {
                    setActiveView(view);
                    if (view === 'favorites') setActiveTab('channels'); // Default tab for favorites
                }}
                onSelectGroup={(id) => {
                    setSelectedGroupId(id);
                    if (id !== null) setActiveView('dashboard');
                }}
                onCreateGroup={handleCreateGroup}
                onUpdateGroup={handleUpdateGroup}
                onDeleteGroup={handleDeleteGroup}
            />

            <main
                className="flex-1 overflow-auto p-6 md:p-8"
                ref={scrollRef}
                onScroll={handleScroll}
            >
                <div className="max-w-[1800px] mx-auto">
                    <header className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">
                                {getHeaderTitle()}
                            </h1>
                            <p className="text-zinc-500 mt-1">
                                {getHeaderSubtitle()}
                            </p>
                        </div>
                        {activeView !== 'downloads' && (
                            <div className="flex gap-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="搜索..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-sm outline-none focus:ring-2 ring-blue-500/20 w-48 transition-all focus:w-64"
                                    />
                                </div>
                                <RefreshMenu
                                    onRefresh={handleRefresh}
                                    refreshing={refreshing}
                                    groupId={selectedGroupId}
                                    groupName={groups.find(g => g.id === selectedGroupId)?.name || (selectedGroupId === -1 ? "未分组" : undefined)}
                                />
                                <button
                                    onClick={() => setIsModalOpen(true)}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors text-sm font-medium"
                                >
                                    <Plus size={16} />
                                    添加频道
                                </button>
                            </div>
                        )}
                    </header>

                    {/* View Content */}
                    {activeView === 'downloads' && <DownloadManager />}

                    {activeView === 'favorites' && (
                        <div className="space-y-6">
                            {/* Favorites Sub-tabs */}
                            <div className="flex border-b border-zinc-200 dark:border-zinc-800 mb-6">
                                <button
                                    onClick={() => setActiveTab("channels")}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "channels" ? "border-blue-500 text-blue-500" : "border-transparent text-zinc-500 hover:text-zinc-700"}`}
                                >
                                    收藏的频道
                                </button>
                                <button
                                    onClick={() => setActiveTab("videos")}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "videos" ? "border-blue-500 text-blue-500" : "border-transparent text-zinc-500 hover:text-zinc-700"}`}
                                >
                                    收藏的视频
                                </button>
                            </div>

                            {activeTab === "channels" ? (
                                channels.filter(c => c.isFavorite).length === 0 ? (
                                    <div className="text-center py-20 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                                        <h3 className="text-zinc-500 font-medium">暂无收藏频道</h3>
                                        <p className="text-zinc-400 text-sm mt-1">在频道卡片上点击爱心图标即可收藏</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                                        {channels.filter(c => c.isFavorite).map((channel) => (
                                            <ChannelCard
                                                key={channel.id}
                                                channel={channel}
                                                onDelete={handleDeleteChannel}
                                                onMove={handleOpenMoveModal}
                                                onToggleFavorite={handleToggleChannelFavorite}
                                                onRefresh={async () => {
                                                    await fetch(`/api/channels/${channel.id}`, {
                                                        method: "POST",
                                                        body: JSON.stringify({})
                                                    });
                                                    fetchData();
                                                }}
                                            />
                                        ))}
                                    </div>
                                )
                            ) : (
                                <>
                                    <div className="flex justify-end gap-3">
                                        <select
                                            className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium"
                                            value={dateRange}
                                            onChange={(e) => setDateRange(e.target.value as any)}
                                        >
                                            <option value="all">全部时间</option>
                                            <option value="3d">最近3天</option>
                                            <option value="7d">最近7天</option>
                                            <option value="30d">最近30天</option>
                                        </select>
                                        <select
                                            className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium"
                                            value={filterType}
                                            onChange={(e) => setFilterType(e.target.value as any)}
                                        >
                                            <option value="all">全部视频</option>
                                            <option value="video">长视频</option>
                                            <option value="short">Shorts</option>
                                        </select>
                                        <select
                                            className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium"
                                            value={sortOrder}
                                            onChange={(e) => setSortOrder(e.target.value as any)}
                                        >
                                            <option value="publishedAt">最新发布</option>
                                            <option value="viewCount">播放量</option>
                                            <option value="viral">播放倍率 (Viral)</option>
                                            <option value="zScore">Z-Score (Z值)</option>
                                            <option value="vph">VPH (流量速度)</option>
                                        </select>
                                    </div>
                                    <VideoList filter="favorites" sortOrder={sortOrder} filterType={filterType} dateRange={dateRange} />
                                </>
                            )}
                        </div>
                    )}

                    {activeView === 'dashboard' && (
                        <>
                            {/* Tabs & Sorting */}
                            <div className="flex items-center justify-between gap-6 mb-8 border-b border-zinc-200 dark:border-zinc-800">
                                <div className="flex items-center gap-6">
                                    <button
                                        onClick={() => setActiveTab("analysis")}
                                        className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${activeTab === "analysis"
                                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                            : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                            }`}
                                    >
                                        <BarChart2 size={18} />
                                        数据分析
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("channels")}
                                        className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${activeTab === "channels"
                                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                            : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                            }`}
                                    >
                                        <LayoutGrid size={18} />
                                        频道列表
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("videos")}
                                        className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${activeTab === "videos"
                                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                            : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                            }`}
                                    >
                                        <PlaySquare size={18} />
                                        最新视频
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("favorites")}
                                        className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${activeTab === "favorites"
                                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                            : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                            }`}
                                    >
                                        <Heart size={18} fill={activeTab === "favorites" ? "currentColor" : "none"} />
                                        收藏视频
                                    </button>
                                </div>

                                {/* Controls */}
                                <div className="flex gap-3 pb-2">
                                    {activeTab === "analysis" && (
                                        <>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium"
                                                value={analysisDateRange}
                                                onChange={(e) => setAnalysisDateRange(e.target.value as any)}
                                            >
                                                <option value="3d">最近3天</option>
                                                <option value="7d">最近7天</option>
                                                <option value="30d">最近30天</option>
                                            </select>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium"
                                                value={analysisFilterType}
                                                onChange={(e) => setAnalysisFilterType(e.target.value as any)}
                                            >
                                                <option value="all">全部类型</option>
                                                <option value="video">长视频</option>
                                                <option value="short">Shorts</option>
                                            </select>
                                        </>
                                    )}
                                    {(activeTab === "videos" || activeTab === "favorites") && (
                                        <>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium"
                                                value={dateRange}
                                                onChange={(e) => setDateRange(e.target.value as any)}
                                            >
                                                <option value="all">全部时间</option>
                                                <option value="3d">最近3天</option>
                                                <option value="7d">最近7天</option>
                                                <option value="30d">最近30天</option>
                                            </select>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium"
                                                value={filterType}
                                                onChange={(e) => setFilterType(e.target.value as any)}
                                            >
                                                <option value="all">全部视频</option>
                                                <option value="video">长视频</option>
                                                <option value="short">Shorts</option>
                                            </select>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium"
                                                value={sortOrder}
                                                onChange={(e) => setSortOrder(e.target.value as any)}
                                            >
                                                <option value="publishedAt">最新发布</option>
                                                <option value="viewCount">播放量</option>
                                                <option value="viral">播放倍率 (Viral)</option>
                                                <option value="zScore">Z-Score (Z值)</option>
                                                <option value="vph">VPH (流量速度)</option>
                                            </select>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Content Area */}
                            {activeTab === "channels" ? (
                                <>
                                    {loading ? (
                                        <div className="flex justify-center py-20">
                                            <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"></div>
                                        </div>
                                    ) : filteredChannels.length === 0 ? (
                                        <div className="text-center py-20 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                                            <h3 className="text-zinc-500 font-medium">未找到频道</h3>
                                            <p className="text-zinc-400 text-sm mt-1">请添加一些频道以开始使用</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                                            {filteredChannels.map((channel) => (
                                                <ChannelCard
                                                    key={channel.id}
                                                    channel={channel}
                                                    onDelete={handleDeleteChannel}
                                                    onMove={handleOpenMoveModal}
                                                    onToggleFavorite={handleToggleChannelFavorite}
                                                    onRefresh={async () => {
                                                        await fetch(`/api/channels/${channel.id}`, {
                                                            method: "POST",
                                                            body: JSON.stringify({})
                                                        });
                                                        fetchData();
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : activeTab === "favorites" ? (
                                <VideoList groupId={selectedGroupId} filter="favorites" sortOrder={sortOrder} filterType={filterType} searchQuery={searchQuery} dateRange={dateRange} />
                            ) : activeTab === "analysis" ? (
                                <AnalysisDashboard
                                    groupId={selectedGroupId === -1 ? null : selectedGroupId}
                                    dateRange={analysisDateRange}
                                    filterType={analysisFilterType}
                                />
                            ) : (
                                <VideoList groupId={selectedGroupId} sortOrder={sortOrder} filterType={filterType} searchQuery={searchQuery} dateRange={dateRange} />
                            )}
                        </>
                    )}
                </div>
            </main>

            <AddChannelModal
                groups={groups}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={handleAddChannels}
                onGroupCreate={handleCreateGroupAndReturn}
            />

            <MoveChannelModal
                isOpen={isMoveModalOpen}
                onClose={() => setIsMoveModalOpen(false)}
                groups={groups}
                onMove={handleMoveChannel}
                onGroupCreate={handleCreateGroupAndReturn}
                channelName={moveTarget?.name || ""}
                currentGroupId={moveTarget?.currentGroupId || null}
            />
        </div>
    );
}
