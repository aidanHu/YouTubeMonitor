"use client";

import { AddChannelModal } from "@/components/AddChannelModal";
import { MoveChannelModal } from "@/components/MoveChannelModal";
import { ChannelCard } from "@/components/ChannelCard";
import { Sidebar } from "@/components/Sidebar";
import { VideoCard } from "@/components/VideoCard";
import { VideoList } from "@/components/VideoList";
import { DownloadSingleVideoModal } from "@/components/DownloadSingleVideoModal";
import { DownloadManager } from "@/components/DownloadManager";
import { Channel, Group } from "@/types";
import { AnalysisDashboard } from "@/components/AnalysisDashboard";
import { Plus, RefreshCw, LayoutGrid, PlaySquare, Heart, Search, BarChart2, Download, ArrowUp } from "lucide-react";
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
        // Scroll map
        scrollPositions,
        setScrollPosition,
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
    const positionRef = useRef(0);
    const [showBackToTop, setShowBackToTop] = useState(false);

    // Track previous tab to save scroll position before switching
    const prevTabRef = useRef(currentTab);

    // Update local ref on scroll (no re-renders)
    const handleScroll = (e: React.UIEvent<HTMLElement>) => {
        const scrollTop = e.currentTarget.scrollTop;
        positionRef.current = scrollTop;

        // Show/Hide Back to Top
        if (scrollTop > 300) {
            if (!showBackToTop) setShowBackToTop(true);
        } else {
            if (showBackToTop) setShowBackToTop(false);
        }
    };

    // Handle Scroll Persistence on Tab Switch & Navigation Return
    // Use ResizeObserver to restore scroll position once content is actually loaded/rendered
    useEffect(() => {
        const savedPos = scrollPositions[currentTab] || 0;
        if (savedPos === 0) return;

        const container = scrollRef.current;
        if (!container) return;

        // Flags to control restoration attempts
        let attempts = 0;
        const maxAttempts = 5; // Prevent infinite fighting if user scrolls
        let isRestored = false;

        const restoreScroll = () => {
            if (isRestored || attempts >= maxAttempts) return;

            // Check if we can scroll to that position
            // We allow a small margin of error or if content is large enough
            if (container.scrollHeight >= savedPos + container.clientHeight) {
                container.scrollTop = savedPos;
                // Verify
                if (Math.abs(container.scrollTop - savedPos) < 10) {
                    isRestored = true;
                    positionRef.current = savedPos; // Sync ref
                }
            } else {
                // Content too short, try max possible
                // But don't mark as restored if it's way off, maybe content is still loading
                // Unless it's confirmed fully loaded... which we don't know completely.
                // We just try again on next resize.
            }
            attempts++;
        };

        // Attempt immediately
        restoreScroll();

        // Observer for content changes (e.g. video list loading)
        const observer = new ResizeObserver(() => {
            if (!isRestored) {
                restoreScroll();
            }
        });

        // Observe the first child (wrapper) or the main itself (scrollHeight changes)
        // Observing main gives us size changes, but mostly we care about scrollHeight.
        // Observing children is better for scrollHeight detection.
        if (container.firstElementChild) {
            observer.observe(container.firstElementChild);
        } else {
            observer.observe(container);
        }

        return () => {
            observer.disconnect();
        };
    }, [currentTab, scrollPositions]); // Re-run when tab changes

    // 2. Update prevTabRef for next switch (Moved to separate effect)
    useEffect(() => {
        prevTabRef.current = currentTab;
    }, [currentTab]);
    // Instead, we use an effect that runs when currentTab changes, but we need the OLD tab.
    // We use a ref to track the OLD tab.

    // Actually, useLayoutEffect runs after the update. 
    // So we need to save the position of 'prevTabRef.current' BEFORE we update the ref.
    // But 'positionRef.current' holds the scroll val of the PREVIOUS tab right before the switch?
    // Yes, because handleScroll updates it. 
    // So:
    useLayoutEffect(() => {
        const oldTab = prevTabRef.current;
        if (oldTab !== currentTab) {
            // Save the position of the old tab
            // Note: positionRef.current might be 0 if the DOM unmounted/remounted?
            // No, standard React state update keeps component mounted.
            setScrollPosition(oldTab, positionRef.current);
        }
    }, [currentTab]); // Runs after change.

    // Save on unmount (e.g. going to Downloads view)
    useEffect(() => {
        return () => {
            setScrollPosition(currentTab, positionRef.current);
        };
    }, []);

    const scrollToTop = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Legacy cleanup removed

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // View State (Synced with Global)
    const activeView = currentView;
    const setActiveView = setCurrentView;

    // Tab State (Synced with Global)
    const activeTab = currentTab;
    const setActiveTab = setCurrentTab;

    // Favorites Sub-tab State for Dashboard View - REMOVED
    // const [favSubTab, setFavSubTab] = useState<"channels" | "videos">("channels");

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
            if (activeTab === 'favoriteVideos') {
                url += `&filter=favorites`;
            }
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

            if (data.pagination) {
                setHasMoreVideos(data.pagination.page < data.pagination.totalPages);
                setVideoPage(page + 1);
            } else {
                setHasMoreVideos(false);
            }
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
        if (activeTab === "videos" || activeTab === "favoriteVideos") {
            setVideoPage(1);
            fetchVideos(true);
        }
    }, [sortOrder, selectedGroupId, activeTab, filterType, dateRange]);

    const { isActivated } = useData();

    const handleRefresh = async (range: '3d' | '7d' | '30d' | '3m' | '6m' | '1y' | 'all') => {
        if (!isActivated) {
            alert("软件未激活，无法使用刷新功能。\n请前往 [设置 -> 软件激活] 进行激活。");
            return;
        }
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
            if (activeTab === "channels" || activeTab === 'favoriteChannels') {
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

    const handleToggleGroupPin = async (id: number, isPinned: boolean) => {
        try {
            await fetch(`/api/groups/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ isPinned }),
            });
            await fetchGroups();
        } catch (error) {
            console.error("Failed to toggle group pin", error);
        }
    };

    const handleToggleChannelPin = async (id: string, isPinned: boolean) => {
        try {
            await fetch(`/api/channels/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ isPinned }),
            });
            // Optimistic update locally with sorting
            setChannels(prev => {
                const updated = prev.map(c => c.id === id ? { ...c, isPinned } : c);
                // Sort: Pinned first, then by createdAt desc
                return updated.sort((a, b) => {
                    if (a.isPinned !== b.isPinned) {
                        return a.isPinned ? -1 : 1;
                    }
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                });
            });
        } catch (error) {
            console.error("Failed to toggle channel pin", error);
        }
    };

    const handleAddChannels = async (urls: string[], groupId: number | null) => {
        if (!isActivated) {
            alert("软件未激活，无法添加频道。\n请前往 [设置 -> 软件激活] 进行激活。");
            return;
        }
        try {
            const res = await fetch("/api/channels", {
                method: "POST",
                body: JSON.stringify({ urls, groupId }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || `Server error: ${res.status}`);
            }

            const results = data.results;

            if (results && Array.isArray(results)) {
                const succeeded = results.filter((r: any) => r.status === 'success');
                const existing = results.filter((r: any) => r.status === 'exists');
                const failed = results.filter((r: any) => r.status === 'error');

                let msg = `处理完成: ${results.length} 个请求\n`;

                if (succeeded.length > 0) {
                    msg += `\n✅ 成功添加: ${succeeded.length} 个`;
                }

                if (existing.length > 0) {
                    msg += `\n⚠️ 已存在: ${existing.length} 个\n`;
                    existing.slice(0, 5).forEach((r: any) => msg += `   - ${r.channelName || r.url}\n`);
                    if (existing.length > 5) msg += `   ...等 ${existing.length} 个\n`;
                }

                if (failed.length > 0) {
                    msg += `\n❌ 失败: ${failed.length} 个\n`;
                    failed.forEach((r: any) => msg += `   - ${r.url}: ${r.message}\n`);
                }

                alert(msg);
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

    const [inactivityFilter, setInactivityFilter] = useState<'all' | '1m' | '3m' | '6m' | '1y'>('all');

    const filteredChannels = (selectedGroupId
        ? (selectedGroupId === -1
            ? channels.filter((c) => c.groupId === null)
            : channels.filter((c) => c.groupId === selectedGroupId))
        : channels)
        .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .filter(c => {
            if (inactivityFilter === 'all') return true;
            if (!c.lastUploadAt) return false; // treating no upload as active or inactive? Let's say we only show those we KNOW are inactive. Or maybe show all?
            // "Inactive > 1mo" means last upload was BEFORE 1 month ago.
            const lastUpload = new Date(c.lastUploadAt);
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - lastUpload.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (inactivityFilter === '1m') return diffDays > 30;
            if (inactivityFilter === '3m') return diffDays > 90;
            if (inactivityFilter === '6m') return diffDays > 180;
            if (inactivityFilter === '1y') return diffDays > 365;
            return true;
        });

    // ... existing code

    const getHeaderTitle = () => {
        if (activeView === 'downloads') return "下载管理";
        if (selectedGroupId === -1) return "未分组";
        if (selectedGroupId) return groups.find(g => g.id === selectedGroupId)?.name || "分组";
        return "仪表盘";
    };

    const getHeaderSubtitle = () => {
        if (activeView === 'downloads') return "管理视频下载任务";
        if (activeTab === "favoriteChannels") return "我收藏的所有频道";
        if (activeTab === "favoriteVideos") return "我收藏的所有视频";
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
                }}
                onSelectGroup={(id) => {
                    setSelectedGroupId(id);
                    if (id !== null) setActiveView('dashboard');
                }}
                onCreateGroup={handleCreateGroup}
                onUpdateGroup={handleUpdateGroup}
                onDeleteGroup={handleDeleteGroup}
                onToggleGroupPin={handleToggleGroupPin}
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
                                <button
                                    onClick={() => setIsDownloadModalOpen(true)}
                                    className="flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 p-2 sm:px-4 sm:py-2 rounded-xl text-sm font-medium transition-colors"
                                    title="下载视频"
                                >
                                    <Download size={16} />
                                    <span className="hidden sm:inline">下载视频</span>
                                </button>
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
                                        onClick={() => setActiveTab("favoriteChannels")}
                                        className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${activeTab === "favoriteChannels"
                                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                            : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                            }`}
                                    >
                                        <Heart size={18} fill={activeTab === "favoriteChannels" ? "currentColor" : "none"} />
                                        收藏频道
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("favoriteVideos")}
                                        className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${activeTab === "favoriteVideos"
                                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                            : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                            }`}
                                    >
                                        <Heart size={18} fill={activeTab === "favoriteVideos" ? "currentColor" : "none"} />
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
                                    {(activeTab === "channels" || activeTab === "favoriteChannels") && (
                                        <>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium"
                                                value={sortOrder}
                                                onChange={(e) => setSortOrder(e.target.value as any)}
                                            >
                                                <option value="createdAt">创建时间</option>
                                                <option value="lastUploadAt">最近更新</option>
                                                <option value="viewCount">播放量</option>
                                                <option value="subscriberCount">订阅数</option>
                                                <option value="videoCount">视频数</option>
                                                <option value="averageViews">平均播放</option>
                                            </select>
                                            <select
                                                value={inactivityFilter}
                                                onChange={(e) => setInactivityFilter(e.target.value as any)}
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium"
                                            >
                                                <option value="all">全部活跃度</option>
                                                <option value="1m">停更 &gt; 1个月</option>
                                                <option value="3m">停更 &gt; 3个月</option>
                                                <option value="6m">停更 &gt; 6个月</option>
                                                <option value="1y">停更 &gt; 1年</option>
                                            </select>
                                        </>
                                    )}
                                    {(activeTab === "videos" || activeTab === "favoriteVideos") && (
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
                                                    onTogglePin={handleToggleChannelPin}
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
                            ) : activeTab === "favoriteChannels" ? (
                                <div className="space-y-6">
                                    {filteredChannels.filter(c => c.isFavorite).length === 0 ? (
                                        <div className="text-center py-20 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                                            <h3 className="text-zinc-500 font-medium">暂无收藏频道</h3>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                                            {filteredChannels.filter(c => c.isFavorite).map((channel) => (
                                                <ChannelCard
                                                    key={channel.id}
                                                    channel={channel}
                                                    onDelete={handleDeleteChannel}
                                                    onMove={handleOpenMoveModal}
                                                    onToggleFavorite={handleToggleChannelFavorite}
                                                    onTogglePin={handleToggleChannelPin}
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
                                </div>
                            ) : activeTab === "favoriteVideos" ? (
                                <VideoList groupId={selectedGroupId} filter="favorites" sortOrder={sortOrder as any} filterType={filterType} searchQuery={searchQuery} dateRange={dateRange} />
                            ) : activeTab === "analysis" ? (
                                <AnalysisDashboard
                                    groupId={selectedGroupId === -1 ? null : selectedGroupId}
                                    dateRange={analysisDateRange}
                                    filterType={analysisFilterType}
                                />
                            ) : (
                                <VideoList groupId={selectedGroupId} sortOrder={sortOrder as any} filterType={filterType} searchQuery={searchQuery} dateRange={dateRange} />
                            )}
                        </>
                    )}
                </div>

                {/* Back to Top Button */}
                <button
                    onClick={scrollToTop}
                    className={`fixed bottom-8 right-8 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 transform ${showBackToTop ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'
                        }`}
                    title="回到顶部"
                >
                    <ArrowUp size={20} />
                </button>
            </main>

            <AddChannelModal
                groups={groups}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={handleAddChannels}
                onGroupCreate={handleCreateGroupAndReturn}
            />

            <DownloadSingleVideoModal
                isOpen={isDownloadModalOpen}
                onClose={() => setIsDownloadModalOpen(false)}
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
