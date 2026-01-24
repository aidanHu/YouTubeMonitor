
import { useState, useRef, useEffect } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface RefreshMenuProps {
    on_refresh: (range: '3d' | '7d' | '30d' | '3m' | '6m' | '1y' | 'all') => Promise<void>;
    refreshing: boolean;
    group_id: number | null; // Just for display/context if needed
    groupName?: string;
}

export function RefreshMenu({ on_refresh, refreshing, group_id, groupName }: RefreshMenuProps) {
    const [progress, set_progress] = useState<{ current: number; total: number; channel: string } | null>(null);
    const [is_open, set_is_open] = useState(false);
    const [lastRange, set_last_range] = useState<'3d' | '7d' | '30d' | '3m' | '6m' | '1y' | 'all'>('3d');
    const menuRef = useRef<HTMLDivElement>(null);

    const RANGE_LABELS: Record<string, string> = {
        '3d': '近3天',
        '7d': '近7天',
        '30d': '近30天',
        '3m': '近3个月',
        '6m': '近半年',
        '1y': '近1年',
        'all': '全部日期'
    };

    // Listen for progress events
    useEffect(() => {
        let unlistenProgress: (() => void) | undefined;
        let unlistenComplete: (() => void) | undefined;

        listen('refresh-all-progress', (event: any) => {
            const { current, total, channel } = event.payload;
            set_progress({ current, total, channel });
        }).then(u => unlistenProgress = u);

        listen('refresh-all-complete', () => {
            set_progress(null);
        }).then(u => unlistenComplete = u);

        return () => {
            if (unlistenProgress) unlistenProgress();
            if (unlistenComplete) unlistenComplete();
        };
    }, []);

    // Close on click outside
    useEffect(() => {
        const handle_click_outside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                set_is_open(false);
            }
        };

        document.addEventListener("mousedown", handle_click_outside);
        return () => {
            document.removeEventListener("mousedown", handle_click_outside);
        };
    }, []);

    const handle_select = (range: '3d' | '7d' | '30d' | '3m' | '6m' | '1y' | 'all') => {
        set_is_open(false);
        set_last_range(range);
        on_refresh(range);
    };

    const handle_main_click = () => {
        on_refresh(lastRange);
    };

    return (
        <div className="relative" ref={menuRef}>
            <div className="flex rounded-xl overflow-hidden shadow-sm">
                <button
                    onClick={handle_main_click}
                    disabled={refreshing}
                    className="flex items-center gap-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50 border-r border-zinc-700 dark:border-zinc-300 whitespace-nowrap"
                >
                    <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                    <span className="hidden sm:inline">
                        {refreshing
                            ? (progress
                                ? `更新中 ${progress.current}/${progress.total}`
                                : "更新中...")
                            : (
                                <span>
                                    {groupName ? "更新分组" : "更新全部"}
                                    <span className="opacity-70 ml-1 text-xs font-normal">
                                        ({RANGE_LABELS[lastRange]})
                                    </span>
                                </span>
                            )
                        }
                    </span>
                </button>
                <button
                    onClick={() => set_is_open(!is_open)}
                    disabled={refreshing}
                    className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 px-2 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
                >
                    <ChevronDown size={14} />
                </button>
            </div>

            {is_open && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
                    <div className="p-2 space-y-1">
                        <button
                            onClick={() => handle_select('3d')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex justify-between ${lastRange === '3d'
                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            <span>最近 3 天</span>
                            <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">快速</span>
                        </button>
                        <button
                            onClick={() => handle_select('7d')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${lastRange === '7d'
                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            最近 7 天
                        </button>
                        <button
                            onClick={() => handle_select('30d')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${lastRange === '30d'
                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            最近 30 天
                        </button>
                        <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
                        <button
                            onClick={() => handle_select('3m')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${lastRange === '3m'
                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            最近 3 个月
                        </button>
                        <button
                            onClick={() => handle_select('6m')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${lastRange === '6m'
                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            最近半年
                        </button>
                        <button
                            onClick={() => handle_select('1y')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${lastRange === '1y'
                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            最近一年
                        </button>
                        <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
                        <button
                            onClick={() => handle_select('all')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex justify-between group ${lastRange === 'all'
                                ? 'bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium'
                                : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                }`}
                        >
                            <span>全部视频</span>
                            <span className="text-xs text-red-100 dark:text-red-900 bg-red-600 dark:bg-red-400 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">耗时</span>
                        </button>

                    </div>
                </div>
            )}
        </div>
    );
}
