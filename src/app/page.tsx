"use client";

import { AddChannelModal } from "@/components/AddChannelModal";
import { MoveChannelModal } from "@/components/MoveChannelModal";
import { Sidebar } from "@/components/Sidebar";
import { VideoList } from "@/components/VideoList";
import { DownloadSingleVideoModal } from "@/components/DownloadSingleVideoModal";
import { DownloadManager } from "@/components/DownloadManager";
import { AnalysisDashboard } from "@/components/AnalysisDashboard";
import { Plus, LayoutGrid, PlaySquare, Heart, Search, BarChart2, Download } from "lucide-react";
import { RefreshMenu } from "@/components/RefreshMenu";
import React, { useState, useMemo } from "react";
import { useData } from "@/context/DataContext";
import { show_alert } from "@/lib/dialogs";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useChannelActions } from "@/hooks/useChannelActions";
import { ChannelList } from "@/components/ChannelList";
import { Group } from "@/types";
import { invoke } from "@tauri-apps/api/core";

export default function Home() {
    const {
        groups,
        channels,
        loading,
        current_view,
        set_current_view,
        current_tab,
        set_current_tab,
        selected_group_id, set_selected_group_id,
        sort_order, set_sort_order,
        filter_type, set_filter_type,
        date_range, set_date_range, // For Videos
        search_query, set_search_query,
        inactivityFilter, set_inactivity_filter,
        analysisDateRange, set_analysis_date_range, // For Analysis
        analysisFilterType, set_analysis_filter_type, // For Analysis
        is_activated,
        refreshData
    } = useData();

    // 1. Scroll Restoration Hook
    const { scrollRef, scrollEl, handle_scroll, scrollToTop } = useScrollRestoration();

    // 2. Channel Actions Hook
    const {
        refreshing,
        toastMessage,
        setToastMessage,
        handle_refresh,
        handle_delete_channel,
        handle_toggle_channel_pin,
        handle_toggle_channel_favorite,
        handle_add_channels,
        handle_move_channel,
        handle_create_group,
        handle_update_group,
        handle_delete_group,
        handle_toggle_group_pin
    } = useChannelActions();

    // Local State
    const [is_modal_open, set_is_modal_open] = useState(false);
    const [is_download_modal_open, set_is_download_modal_open] = useState(false);

    // View State Aliases for compatibility with Sidebar props
    const activeView = current_view;
    const set_active_view = set_current_view;
    const active_tab = current_tab;
    const set_active_tab = set_current_tab;

    // Move Channel State
    const [is_move_modal_open, set_is_move_modal_open] = useState(false);
    const [moveTarget, set_move_target] = useState<{ id: string; name: string; currentGroupId: number | null } | null>(null);

    const handle_open_move_modal = (id: string, name: string, currentGroupId: number | null) => {
        set_move_target({ id, name, currentGroupId });
        set_is_move_modal_open(true);
    };

    // Helper for Group Creation in Modals (returns the group object)
    const handle_create_group_and_return = async (name: string): Promise<Group> => {
        try {
            const newGroup = await invoke<Group>('create_group', { name });
            await refreshData(true); // refresh groups
            return newGroup; // { id, name }
        } catch (e: any) {
            const msg = e.toString();
            if (msg.includes("UNIQUE constraint failed") || msg.includes("已存在")) {
                throw new Error("分组名已存在，请修改后重新创建");
            }
            console.error("Create group and return error:", e);
            throw new Error("创建分组失败: " + msg);
        }
    };

    // Filter Logic
    const filteredChannels = useMemo(() => {
        return (selected_group_id
            ? (selected_group_id === -1
                ? channels.filter((c) => !c.group_id)
                : channels.filter((c) => c.group_id === selected_group_id))
            : channels)
            .filter(c => c.name.toLowerCase().includes(search_query.toLowerCase()))
            .filter(c => {
                if (inactivityFilter === 'all') return true;
                if (!c.last_upload_at) return false;
                const lastUpload = new Date(c.last_upload_at);
                const now = new Date();
                const diffTime = Math.abs(now.getTime() - lastUpload.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (inactivityFilter === '1m') return diffDays > 30;
                if (inactivityFilter === '3m') return diffDays > 90;
                if (inactivityFilter === '6m') return diffDays > 180;
                if (inactivityFilter === '1y') return diffDays > 365;
                return true;
            });
    }, [channels, selected_group_id, search_query, inactivityFilter]);

    return (
        <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans">
            <Sidebar
                groups={groups}
                selected_group_id={selected_group_id}
                activeView={activeView}
                on_select_view={set_active_view}
                on_select_group={(id) => {
                    set_selected_group_id(id);
                    if (id !== null) set_active_view('dashboard');
                }}
                on_create_group={handle_create_group}
                on_update_group={handle_update_group}
                on_delete_group={handle_delete_group}
                on_toggle_group_pin={handle_toggle_group_pin}
            />

            <div className="flex-1 flex flex-col min-w-0 bg-zinc-50/50 dark:bg-zinc-950">
                <div className="h-8 w-full shrink-0" data-tauri-drag-region />

                {/* Fixed Top Header */}
                <div className="px-4 md:px-6 lg:px-8 shrink-0">
                    <div className="max-w-[2000px] mx-auto">
                        <header className="flex items-center justify-between py-4 gap-4 min-w-fit" data-tauri-drag-region>
                            <div className="min-w-0 flex items-center" data-tauri-drag-region>
                                {activeView === 'dashboard' && current_tab === 'channels' && (
                                    <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium ml-1">
                                        已监控 <span className="font-bold text-zinc-900 dark:text-zinc-100">{filteredChannels.length}</span> 个频道
                                    </span>
                                )}
                            </div>
                            {activeView !== 'downloads' && (
                                <div className="flex flex-wrap items-center gap-2 lg:gap-3">
                                    <div className="relative min-w-[200px] xl:min-w-[240px]">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                                        <input
                                            type="text"
                                            placeholder="搜索..."
                                            value={search_query}
                                            onChange={(e) => set_search_query(e.target.value)}
                                            className="pl-9 pr-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:ring-2 ring-blue-500/20 w-full transition-all"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                if (!is_activated) {
                                                    show_alert("软件未激活，无法下载视频。\n请前往 [设置 -> 软件激活] 进行激活。", "提示", "warning");
                                                    return;
                                                }
                                                set_is_download_modal_open(true);
                                            }}
                                            className="flex items-center justify-center gap-2 bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-3 lg:px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shadow-sm"
                                            title="下载视频"
                                        >
                                            <Download size={16} />
                                            <span className="hidden sm:inline">下载视频</span>
                                        </button>
                                        <RefreshMenu
                                            on_refresh={handle_refresh}
                                            refreshing={refreshing}
                                            group_id={selected_group_id}
                                            groupName={groups.find(g => g.id === selected_group_id)?.name || (selected_group_id === -1 ? "未分组" : undefined)}
                                        />
                                        <button
                                            onClick={() => {
                                                if (!is_activated) {
                                                    show_alert("软件未激活，无法添加频道。\n请前往 [设置 -> 软件激活] 进行激活。", "提示", "warning");
                                                    return;
                                                }
                                                set_is_modal_open(true);
                                            }}
                                            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 lg:px-4 py-2 rounded-xl transition-colors text-sm font-medium whitespace-nowrap shadow-md shadow-blue-500/20"
                                        >
                                            <Plus size={16} />
                                            <span className="hidden sm:inline">添加频道</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </header>
                        {activeView === 'dashboard' && (
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-6 mb-8 border-b border-zinc-200 dark:border-zinc-800 min-w-fit pt-2">
                                <div className="overflow-x-auto custom-scrollbar-hide pb-2 lg:pb-0">
                                    <div className="flex items-center gap-4 lg:gap-6 whitespace-nowrap min-w-max">
                                        <button
                                            onClick={() => set_active_tab("analysis")}
                                            className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${active_tab === "analysis"
                                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                }`}
                                        >
                                            <BarChart2 size={18} />
                                            数据分析
                                        </button>
                                        <button
                                            onClick={() => active_tab === "channels" ? scrollToTop() : set_active_tab("channels")}
                                            className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${active_tab === "channels"
                                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                }`}
                                        >
                                            <LayoutGrid size={18} />
                                            频道列表
                                        </button>
                                        <button
                                            onClick={() => active_tab === "videos" ? scrollToTop() : set_active_tab("videos")}
                                            className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${active_tab === "videos"
                                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                }`}
                                        >
                                            <PlaySquare size={18} />
                                            最新视频
                                        </button>
                                        <button
                                            onClick={() => active_tab === "favoriteChannels" ? scrollToTop() : set_active_tab("favoriteChannels")}
                                            className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${active_tab === "favoriteChannels"
                                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                }`}
                                        >
                                            <Heart size={18} fill={active_tab === "favoriteChannels" ? "currentColor" : "none"} />
                                            收藏频道
                                        </button>
                                        <button
                                            onClick={() => active_tab === "favoriteVideos" ? scrollToTop() : set_active_tab("favoriteVideos")}
                                            className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${active_tab === "favoriteVideos"
                                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                }`}
                                        >
                                            <Heart size={18} fill={active_tab === "favoriteVideos" ? "currentColor" : "none"} />
                                            收藏视频
                                        </button>
                                    </div>
                                </div>

                                {/* Controls */}
                                <div className="flex flex-wrap gap-3 pb-2 min-w-max">
                                    {active_tab === "analysis" && (
                                        <>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium cursor-pointer"
                                                value={analysisDateRange}
                                                onChange={(e) => set_analysis_date_range(e.target.value as any)}
                                            >
                                                <option value="3d">最近3天</option>
                                                <option value="7d">最近7天</option>
                                                <option value="30d">最近30天</option>
                                            </select>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium cursor-pointer"
                                                value={analysisFilterType}
                                                onChange={(e) => set_analysis_filter_type(e.target.value as any)}
                                            >
                                                <option value="all">全部类型</option>
                                                <option value="video">Video</option>
                                                <option value="short">Shorts</option>
                                            </select>
                                        </>
                                    )}
                                    {(active_tab === "channels" || active_tab === "favoriteChannels") && (
                                        <>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium cursor-pointer"
                                                value={sort_order}
                                                onChange={(e) => set_sort_order(e.target.value as any)}
                                            >
                                                <option value="created_at">创建时间</option>
                                                <option value="last_upload_at">最近更新</option>
                                                <option value="view_count">播放量</option>
                                                <option value="subscriber_count">订阅数</option>
                                                <option value="video_count">视频数</option>
                                                <option value="average_views">平均播放</option>
                                            </select>
                                            <select
                                                value={inactivityFilter}
                                                onChange={(e) => set_inactivity_filter(e.target.value as any)}
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium cursor-pointer"
                                            >
                                                <option value="all">全部活跃度</option>
                                                <option value="1m">停更 &gt; 1个月</option>
                                                <option value="3m">停更 &gt; 3个月</option>
                                                <option value="6m">停更 &gt; 6个月</option>
                                                <option value="1y">停更 &gt; 1年</option>
                                            </select>
                                        </>
                                    )}
                                    {(active_tab === "videos" || active_tab === "favoriteVideos") && (
                                        <>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium cursor-pointer"
                                                value={date_range}
                                                onChange={(e) => set_date_range(e.target.value as any)}
                                            >
                                                <option value="all">全部时间</option>
                                                <option value="3d">最近3天</option>
                                                <option value="7d">最近7天</option>
                                                <option value="30d">最近30天</option>
                                            </select>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium cursor-pointer"
                                                value={filter_type}
                                                onChange={(e) => set_filter_type(e.target.value as any)}
                                            >
                                                <option value="all">全部视频</option>
                                                <option value="video">Video</option>
                                                <option value="short">Shorts</option>
                                            </select>
                                            <select
                                                className="bg-zinc-100 dark:bg-zinc-800 border-none text-sm rounded-lg px-3 py-1.5 outline-none font-medium cursor-pointer"
                                                value={sort_order}
                                                onChange={(e) => set_sort_order(e.target.value as any)}
                                            >
                                                <option value="published_at">最新发布</option>
                                                <option value="view_count">播放量</option>
                                                <option value="viral">播放倍率 (Viral)</option>
                                                <option value="z_score">Z-Score (Z值)</option>
                                                <option value="vph">VPH (流量速度)</option>
                                            </select>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <main
                    className="flex-1 overflow-auto px-4 pb-4 md:px-6 md:pb-6 lg:px-8 lg:pb-8 pt-0 focus:outline-none"
                    style={{ scrollbarGutter: 'stable' }}
                    ref={scrollRef}
                    onScroll={handle_scroll}
                >
                    <div className="max-w-[2000px] mx-auto h-full">

                        {/* View Content */}
                        {activeView === 'downloads' && <DownloadManager />}

                        {activeView === 'dashboard' && (
                            <>
                                {/* Content Area */}
                                {active_tab === "channels" ? (
                                    <ChannelList
                                        channels={filteredChannels}
                                        loading={loading}
                                        scrollParent={scrollEl}
                                        onDelete={handle_delete_channel}
                                        onMove={handle_open_move_modal}
                                        onTogglePin={handle_toggle_channel_pin}
                                        onToggleFavorite={handle_toggle_channel_favorite}
                                        onRefresh={(id) => handle_refresh('3d')}
                                    />
                                ) : active_tab === "videos" ? (
                                    <VideoList
                                        group_id={selected_group_id}
                                        sort_order={sort_order as any}
                                        filter_type={filter_type}
                                        search_query={search_query}
                                        date_range={date_range}
                                        channel_id={undefined}
                                        scrollParent={scrollEl}
                                    />
                                ) : active_tab === "favoriteChannels" ? (
                                    <div className="h-full">
                                        <ChannelList
                                            channels={filteredChannels.filter(c => c.is_favorite)}
                                            loading={loading}
                                            scrollParent={scrollEl}
                                            onDelete={handle_delete_channel}
                                            onMove={handle_open_move_modal}
                                            onTogglePin={handle_toggle_channel_pin}
                                            onToggleFavorite={handle_toggle_channel_favorite}
                                            onRefresh={(id) => handle_refresh('3d')}
                                        />
                                    </div>
                                ) : active_tab === "favoriteVideos" ? (
                                    <VideoList
                                        filter="favorites"
                                        group_id={selected_group_id}
                                        sort_order={sort_order as any}
                                        filter_type={filter_type}
                                        search_query={search_query}
                                        date_range={date_range}
                                        scrollParent={scrollEl}
                                    />
                                ) : active_tab === "analysis" ? (
                                    <AnalysisDashboard
                                        group_id={selected_group_id}
                                        date_range={analysisDateRange}
                                        filter_type={analysisFilterType}
                                    />
                                ) : null}
                            </>
                        )}
                    </div>
                </main>

                {toastMessage && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-900/90 dark:bg-white/90 text-white dark:text-zinc-900 rounded-full shadow-lg backdrop-blur-sm text-sm font-medium z-50 animate-in fade-in slide-in-from-bottom-2">
                        {toastMessage}
                    </div>
                )}

                {/* Modals */}
                <AddChannelModal
                    groups={groups}
                    is_open={is_modal_open}
                    on_close={() => set_is_modal_open(false)}
                    on_add={(urls, gid) => handle_add_channels(urls, gid).then(success => {
                        if (success) set_is_modal_open(false);
                    })}
                    on_group_create={handle_create_group_and_return}
                />

                <MoveChannelModal
                    is_open={is_move_modal_open}
                    on_close={() => set_is_move_modal_open(false)}
                    groups={groups}
                    on_move={(gid) => {
                        if (moveTarget) handle_move_channel({ id: moveTarget.id }, gid);
                        // set_is_move_modal_open(false); // Handled inside logic
                    }}
                    channel_name={moveTarget?.name || ""}
                    currentGroupId={moveTarget?.currentGroupId || null}
                    on_group_create={handle_create_group_and_return}
                />

                <DownloadSingleVideoModal
                    is_open={is_download_modal_open}
                    on_close={() => set_is_download_modal_open(false)}
                    group_id={selected_group_id}
                    groups={groups}
                />
            </div>
        </div>
    );
}
