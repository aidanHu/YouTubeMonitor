"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen } from '@tauri-apps/api/event';
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
import { VirtuosoGrid } from "react-virtuoso";
import React, { useEffect, useState, forwardRef, useCallback, useMemo } from "react";
import { useData } from "@/context/DataContext";
import { calculateVPH } from "@/utils/analytics";
import { useRef, useLayoutEffect } from "react";
import { show_alert, show_confirm, show_error, show_success } from "@/lib/dialogs";

export default function Home() {
    const {
        groups,
        channels,
        loading,
        refreshData,
        // Scroll map
        scroll_positions,
        set_scroll_position,
        set_channels,
        current_view,
        set_current_view,
        current_tab,
        set_current_tab,
        // Persisted State
        selected_group_id, set_selected_group_id,
        sort_order, set_sort_order,
        filter_type, set_filter_type,
        date_range, set_date_range,
        search_query, set_search_query,
        inactivityFilter, set_inactivity_filter,
        analysisDateRange, set_analysis_date_range,
        analysisFilterType, set_analysis_filter_type
    } = useData();
    const scrollRef = useRef<HTMLElement>(null);
    const positionRef = useRef(0);
    const [show_back_to_top, set_show_back_to_top] = useState(false);
    const [scrollElement, set_scroll_element] = useState<HTMLElement | null>(null);

    useEffect(() => {
        set_scroll_element(scrollRef.current);
    }, []);

    // Track previous tab to save scroll position before switching
    const prevTabRef = useRef(current_tab);

    // Update local ref on scroll (no re-renders)
    const handle_scroll = (e: React.UIEvent<HTMLElement>) => {
        const scrollTop = e.currentTarget.scrollTop;
        positionRef.current = scrollTop;

        // Show/Hide Back to Top
        if (scrollTop > 300) {
            if (!show_back_to_top) set_show_back_to_top(true);
        } else {
            if (show_back_to_top) set_show_back_to_top(false);
        }
    };

    // Handle Scroll Persistence on Tab Switch & Navigation Return
    // Use ResizeObserver to restore scroll position once content is actually loaded/rendered
    useEffect(() => {
        const savedPos = scroll_positions[current_tab] || 0;
        if (savedPos === 0) return;

        const container = scrollRef.current;
        if (!container) return;

        // Flags to control restoration attempts
        let attempts = 0;
        const maxAttempts = 5; // Prevent infinite fighting if user scrolls
        let is_restored = false;

        const restoreScroll = () => {
            if (is_restored || attempts >= maxAttempts) return;

            // Check if we can scroll to that position
            // We allow a small margin of error or if content is large enough
            if (container.scrollHeight >= savedPos + container.clientHeight) {
                container.scrollTop = savedPos;
                // Verify
                if (Math.abs(container.scrollTop - savedPos) < 10) {
                    is_restored = true;
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
            if (!is_restored) {
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
    }, [current_tab, scroll_positions]); // Re-run when tab changes

    // 2. Update prevTabRef for next switch (Moved to separate effect)
    useEffect(() => {
        prevTabRef.current = current_tab;
    }, [current_tab]);
    // Instead, we use an effect that runs when current_tab changes, but we need the OLD tab.
    // We use a ref to track the OLD tab.

    // Actually, useLayoutEffect runs after the update. 
    // So we need to save the position of 'prevTabRef.current' BEFORE we update the ref.
    // But 'positionRef.current' holds the scroll val of the PREVIOUS tab right before the switch?
    // Yes, because handle_scroll updates it. 
    // So:
    useLayoutEffect(() => {
        const oldTab = prevTabRef.current;
        if (oldTab !== current_tab) {
            // Save the position of the old tab
            // Note: positionRef.current might be 0 if the DOM unmounted/remounted?
            // No, standard React state update keeps component mounted.
            set_scroll_position(oldTab, positionRef.current);
        }
    }, [current_tab]); // Runs after change.

    // Save on unmount (e.g. going to Downloads view)
    useEffect(() => {
        return () => {
            set_scroll_position(current_tab, positionRef.current);
        };
    }, []);

    const scrollToTop = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Legacy cleanup removed

    const [is_modal_open, set_is_modal_open] = useState(false);
    const [is_download_modal_open, set_is_download_modal_open] = useState(false);
    const [refreshing, set_refreshing] = useState(false);

    // View State (Synced with Global)
    const activeView = current_view;
    const set_active_view = set_current_view;

    // Tab State (Synced with Global)
    const active_tab = current_tab;
    const set_active_tab = set_current_tab;

    // Favorites Sub-tab State for Dashboard View - REMOVED
    // const [favSubTab, set_fav_sub_tab] = useState<"channels" | "videos">("channels");

    // Analysis Filters (Lifted State - Optional, currently local is fine or move too? Keep local for now as user asked for Dashboard Persistence)


    // State for videos managed by VideoList component
    // const [videos, set_videos] = useState<any[]>([]); // Removed redundancy
    // const [videosLoading, set_videos_loading] = useState(false);
    // const [videoPage, set_video_page] = useState(1);
    // const [has_more_videos, set_has_more_videos] = useState(true);

    // fetch_data removed
    const fetch_data = refreshData; // Align naming

    const fetch_groups = async () => {
        await refreshData(true); // Partial refresh not supported yet, just refresh all
    }

    // fetch_videos removed - logic moved to VideoList component

    // Initial Fetch handled by Context
    // Also trigger migration check
    const [is_initializing, set_is_initializing] = useState(true);

    useEffect(() => {
        const init = async () => {
            try {
                // Rust DB init handles migration.
            } catch (e) {
                console.error("Auto-migrate failed", e);
            } finally {
                set_is_initializing(false);
            }
        };
        init();
    }, []);


    const { is_activated } = useData();

    // Listen for refresh progress
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let unlisten_complete: (() => void) | undefined;

        listen('refresh-all-progress', (event: any) => {
            // Handled internally by RefreshMenu now to avoid whole-page flickering
        }).then(u => unlisten = u);

        listen('refresh-all-complete', () => {
            set_refreshing(false);
            fetch_data(false);
            show_success("批量刷新完成！");
        }).then(u => unlisten_complete = u);

        return () => {
            if (unlisten) unlisten();
            if (unlisten_complete) unlisten_complete();
        };
    }, []);

    const handle_refresh = async (range: '3d' | '7d' | '30d' | '3m' | '6m' | '1y' | 'all') => {
        // Map range to Rust format
        const dateMap: Record<string, string> = {
            '3d': 'now-3days',
            '7d': 'now-7days',
            '30d': 'now-30days',
            '3m': 'now-3months',
            '6m': 'now-6months',
            '1y': 'now-1year',
            'all': 'all'
        };

        const range_arg = dateMap[range] || 'now-7days';

        if (!is_activated) {
            await show_alert("软件未激活，无法使用刷新功能。\n请前往 [设置 -> 软件激活] 进行激活。", "提示", "warning");
            return;
        }

        const confirmMessage = selected_group_id
            ? (selected_group_id === -1 ? `确定要刷新所有 "未分组" 的频道吗？` : `确定要刷新该分组下的所有频道吗？`)
            : `确定要刷新所有频道吗？`;

        if (await show_confirm(`${confirmMessage}\n时间范围: ${range}`)) {
            set_refreshing(true);
            try {
                await invoke('refresh_all_channels', { date_range: range_arg, group_id: selected_group_id });
            } catch (error) {
                console.error("Refresh failed", error);
                await show_error("启动刷新失败");
                set_refreshing(false);
            }
        }
    };

    const handle_delete_channel = async (id: string, name: string) => {
        try {
            const { ask } = await import('@tauri-apps/plugin-dialog');
            const confirmed = await ask(`确定要删除频道 "${name}" 吗？`, {
                title: '确认删除',
                kind: 'warning',
            });

            if (!confirmed) {
                return;
            }

            await invoke('delete_channel', { id });
            fetch_data(false);
        } catch (e: any) {
            console.error("Delete channel error:", e);
            const { message } = await import('@tauri-apps/plugin-dialog');
            await message("删除失败: " + (e.message || e), {
                title: '错误',
                kind: 'error',
            });
        }
    };

    const handle_create_group = async (name: string) => {
        if (!is_activated) {
            await show_alert("软件未激活，无法创建分组。", "提示", "warning");
            return;
        }
        try {
            await invoke('create_group', { name });
            fetch_data(false);
        } catch (e: any) {
            const msg = e.toString();
            if (msg.includes("UNIQUE constraint failed")) {
                await show_alert("创建分组失败，分组名已存在，请修改后重新创建", "提示", "warning");
            } else {
                console.error("Create group error:", e);
                await show_error("创建分组失败");
            }
        }
    };

    const handle_create_group_and_return = async (name: string) => {
        try {
            const newGroup = await invoke<Group>('create_group', { name });
            await fetch_groups();
            return newGroup; // { id, name }
        } catch (e: any) {
            const msg = e.toString();
            if (msg.includes("UNIQUE constraint failed")) {
                throw new Error("创建分组失败，分组名已存在，请修改后重新创建");
            }
            console.error("Create group and return error:", e);
            throw new Error("创建分组失败: " + msg);
        }
    };

    const handle_update_group = async (id: number, name: string) => {
        if (!is_activated) {
            await show_alert("软件未激活，无法更新分组。", "提示", "warning");
            return;
        }
        try {
            await invoke('update_group', { id, name, is_pinned: null });
            fetch_data(false);
        } catch (e) {
            console.error("Update group error:", e);
        }
    };

    const handle_delete_group = async (id: number) => {
        if (!is_activated) {
            await show_alert("软件未激活，无法删除分组。", "提示", "warning");
            return;
        }
        try {
            await invoke('delete_group', { id });
            if (selected_group_id === id) set_selected_group_id(null);
            await fetch_groups();
        } catch (error) {
            console.error("Failed to delete group", error);
        }
    };

    const handle_toggle_group_pin = async (id: number, is_pinned: boolean) => {
        try {
            await invoke('update_group', { id, name: null, is_pinned });
            fetch_data(false);
        } catch (e) {
            console.error("Toggle group pin error:", e);
        }
    };

    const handle_toggle_channel_pin = async (id: string, is_pinned: boolean) => {
        try {
            await invoke('toggle_channel_pin', { id, is_pinned });
            // Optimistic update locally with sorting
            set_channels(prev => {
                const updated = prev.map(c => c.id === id ? { ...c, is_pinned } : c);
                // Sort: Pinned first, then by created_at desc
                return updated.sort((a, b) => {
                    if (a.is_pinned !== b.is_pinned) {
                        return a.is_pinned ? -1 : 1;
                    }
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                });
            });
        } catch (error) {
            console.error("Failed to toggle channel pin", error);
        }
    };

    const handle_add_channels = async (urls: string[], group_id: number | null) => {
        if (!is_activated) {
            await show_alert("软件未激活，无法添加频道。\n请前往 [设置 -> 软件激活] 进行激活。", "提示", "warning");
            return;
        }


        try {
            interface AddResult {
                url: string;
                status: string;
                message: string;
                channel_name?: string;
            }

            // Tauri invoke arguments should match Rust function argument names (snake_case conversion is automatic usually, but explicit is safer)
            // Rust: add_channels(pool, urls, group_id)
            const results = await invoke<AddResult[]>('add_channels', {
                urls,
                group_id: group_id || null
            });

            if (results && Array.isArray(results)) {
                const succeeded = results.filter((r) => r.status === 'success');
                // Rust might return "error" status even for existing channels if configured that way
                const existing = results.filter((r) => r.status === 'error' && (r.message.includes('exists') || r.message.includes('已存在')));
                const failed = results.filter((r) => r.status === 'error' && !r.message.includes('exists') && !r.message.includes('已存在'));

                let msg = `处理完成: ${results.length} 个请求\n`;

                if (succeeded.length > 0) {
                    msg += `\n✅ 成功添加: ${succeeded.length} 个`;
                }

                if (existing.length > 0) {
                    msg += `\n⚠️ 已存在: ${existing.length} 个`;
                }

                if (failed.length > 0) {
                    msg += `\n❌ 失败: ${failed.length} 个\n`;
                    failed.forEach((r) => msg += `   - ${r.url}: ${r.message}\n`);
                }

                await show_alert(msg);
            }
        } catch (e: any) {
            console.error("Add channels error:", e);
            await show_error(`添加频道失败: ${e.message || e}`);
        } finally {
            fetch_data(false);
        }
    };

    // Move Channel State
    const [is_move_modal_open, set_is_move_modal_open] = useState(false);
    const [moveTarget, set_move_target] = useState<{ id: string; name: string; currentGroupId: number | null } | null>(null);

    const handle_open_move_modal = (id: string, name: string, currentGroupId: number | null) => {
        set_move_target({ id, name, currentGroupId });
        set_is_move_modal_open(true);
    };

    const handle_toggle_channel_favorite = async (id: string, is_favorite: boolean) => {
        // Optimistic update
        set_channels(prev => prev.map(c => c.id === id ? { ...c, is_favorite } : c));

        try {
            await invoke('toggle_channel_favorite', { id, is_favorite });
            fetch_data(false);
        } catch (e) {
            console.error("Toggle favorite error:", e);
            // Revert on error
            set_channels(prev => prev.map(c => c.id === id ? { ...c, is_favorite: !is_favorite } : c));
        }
    };

    const handle_move_channel = async (group_id: number | null) => {
        if (!moveTarget) return;

        try {
            const result = await invoke<{ moved: boolean; message: string }>('move_channel', {
                id: moveTarget.id,
                group_id
            });

            // Show success message with file movement info
            if (result.moved) {
                await show_success(result.message);
            }

            await fetch_data(false);
        } catch (e) {
            console.error("Move channel error:", e);
            await show_error("移动失败");
        } finally {
            set_is_move_modal_open(false); // Close modal after attempt
        }
    };



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

    // ... existing code

    const get_header_title = () => {
        if (activeView === 'downloads') return "下载管理";
        if (selected_group_id === -1) return "未分组";
        if (selected_group_id) return groups.find(g => g.id === selected_group_id)?.name || "分组";
        return "仪表盘";
    };

    const get_header_subtitle = () => {
        if (activeView === 'downloads') return "管理视频下载任务";
        if (active_tab === "favoriteChannels") return "我收藏的所有频道";
        if (active_tab === "favoriteVideos") return "我收藏的所有视频";
        return active_tab === "channels" ? `正在监控 ${filteredChannels.length} 个频道` : "最新视频动态";
    };

    return (
        <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans">
            <Sidebar
                groups={groups}
                selected_group_id={selected_group_id}
                activeView={activeView}
                on_select_view={(view) => {
                    set_active_view(view);
                }}
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
                                        已监控 <span className="font-bold text-zinc-900 dark:text-zinc-100">{channels.length}</span> 个频道
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
                                            onClick={() => set_active_tab("channels")}
                                            className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${active_tab === "channels"
                                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                }`}
                                        >
                                            <LayoutGrid size={18} />
                                            频道列表
                                        </button>
                                        <button
                                            onClick={() => set_active_tab("videos")}
                                            className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${active_tab === "videos"
                                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                }`}
                                        >
                                            <PlaySquare size={18} />
                                            最新视频
                                        </button>
                                        <button
                                            onClick={() => set_active_tab("favoriteChannels")}
                                            className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors border-b-2 ${active_tab === "favoriteChannels"
                                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                }`}
                                        >
                                            <Heart size={18} fill={active_tab === "favoriteChannels" ? "currentColor" : "none"} />
                                            收藏频道
                                        </button>
                                        <button
                                            onClick={() => set_active_tab("favoriteVideos")}
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
                    <div className="max-w-[2000px] mx-auto">

                        {/* View Content */}
                        {activeView === 'downloads' && <DownloadManager />}


                        {activeView === 'dashboard' && (
                            <>
                                {/* Tabs & Sorting */}


                                {/* Content Area */}
                                {active_tab === "channels" ? (
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
                                            <div className="h-full">
                                                <VirtuosoGrid
                                                    style={{ height: '100%' }}
                                                    data={filteredChannels}
                                                    customScrollParent={scrollElement || undefined}
                                                    overscan={200}
                                                    computeItemKey={(index, item) => item.id}
                                                    components={{
                                                        List: forwardRef<HTMLDivElement, React.ComponentPropsWithRef<'div'>>(({ style, children, ...props }, ref) => (
                                                            <div
                                                                ref={ref}
                                                                {...props}
                                                                style={style}
                                                                className="grid grid-cols-[repeat(auto-fill,220px)] gap-4 items-stretch pb-20"
                                                            >
                                                                {children}
                                                            </div>
                                                        ))
                                                    }}
                                                    itemContent={(index, channel) => (
                                                        <div className="h-full">
                                                            <ChannelCard
                                                                key={channel.id}
                                                                channel={channel}
                                                                on_delete={handle_delete_channel}
                                                                on_move={handle_open_move_modal}
                                                                on_toggle_favorite={handle_toggle_channel_favorite}
                                                                on_toggle_pin={handle_toggle_channel_pin}
                                                                on_refresh={async () => {
                                                                    try {
                                                                        await invoke('refresh_channel', { channel_id: channel.id });
                                                                        fetch_data();
                                                                        await show_success("刷新成功");
                                                                    } catch (e: any) {
                                                                        await show_error("刷新失败: " + e);
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                />
                                            </div>
                                        )}
                                    </>
                                ) : active_tab === "favoriteChannels" ? (
                                    <div className="h-full">
                                        {filteredChannels.filter((c: Channel) => c.is_favorite).length === 0 ? (
                                            <div className="text-center py-20 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                                                <h3 className="text-zinc-500 font-medium">暂无收藏频道</h3>
                                            </div>
                                        ) : (
                                            <VirtuosoGrid
                                                style={{ height: '100%' }}
                                                data={filteredChannels.filter((c: Channel) => c.is_favorite)}
                                                customScrollParent={scrollElement || undefined}
                                                overscan={200}
                                                computeItemKey={(index, item) => item.id}
                                                components={{
                                                    List: forwardRef<HTMLDivElement, React.ComponentPropsWithRef<'div'>>(({ style, children, ...props }, ref) => (
                                                        <div
                                                            ref={ref}
                                                            {...props}
                                                            style={style}
                                                            className="grid grid-cols-[repeat(auto-fill,220px)] gap-4 items-stretch pb-20"
                                                        >
                                                            {children}
                                                        </div>
                                                    ))
                                                }}
                                                itemContent={(index, channel) => (
                                                    <div className="h-full">
                                                        <ChannelCard
                                                            key={channel.id}
                                                            channel={channel}
                                                            on_delete={handle_delete_channel}
                                                            on_move={handle_open_move_modal}
                                                            on_toggle_favorite={handle_toggle_channel_favorite}
                                                            on_toggle_pin={handle_toggle_channel_pin}
                                                            on_refresh={async () => {
                                                                try {
                                                                    await invoke('refresh_channel', { channel_id: channel.id });
                                                                    fetch_data();
                                                                    await show_success("刷新成功");
                                                                } catch (e: any) {
                                                                    await show_error("刷新失败: " + e);
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            />
                                        )}
                                    </div>
                                ) : active_tab === "favoriteVideos" ? (
                                    <VideoList
                                        group_id={selected_group_id}
                                        filter="favorites"
                                        sort_order={sort_order as any}
                                        filter_type={filter_type}
                                        search_query={search_query}
                                        date_range={date_range}
                                        scrollParent={scrollElement}
                                    />
                                ) : active_tab === "analysis" ? (
                                    <AnalysisDashboard
                                        group_id={selected_group_id === -1 ? null : selected_group_id}
                                        date_range={analysisDateRange}
                                        filter_type={analysisFilterType}
                                    />
                                ) : (
                                    <VideoList
                                        group_id={selected_group_id}
                                        sort_order={sort_order as any}
                                        filter_type={filter_type}
                                        search_query={search_query}
                                        date_range={date_range}
                                        scrollParent={scrollElement}
                                    />
                                )}
                            </>
                        )}
                    </div>

                    {/* Back to Top Button */}
                    <button
                        onClick={scrollToTop}
                        className={`fixed bottom-8 right-8 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 transform ${show_back_to_top ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'
                            }`}
                        title="回到顶部"
                    >
                        <ArrowUp size={20} />
                    </button>
                    {/* Explicitly passing ref to main to ensure it's captured */}
                </main>
            </div>

            <AddChannelModal
                groups={groups}
                is_open={is_modal_open}
                on_close={() => set_is_modal_open(false)}
                on_add={handle_add_channels}
                on_group_create={handle_create_group_and_return}
            />

            <DownloadSingleVideoModal
                is_open={is_download_modal_open}
                on_close={() => set_is_download_modal_open(false)}
            />

            <MoveChannelModal
                is_open={is_move_modal_open}
                on_close={() => set_is_move_modal_open(false)}
                groups={groups}
                on_move={handle_move_channel}
                on_group_create={handle_create_group_and_return}
                channel_name={moveTarget?.name || ""}
                currentGroupId={moveTarget?.currentGroupId || null}
            />
        </div>
    );
}
