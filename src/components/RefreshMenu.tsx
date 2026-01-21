
import { useState, useRef, useEffect } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";

interface RefreshMenuProps {
    onRefresh: (range: '3d' | '7d' | '30d' | '3m' | '6m' | '1y' | 'all') => Promise<void>;
    refreshing: boolean;
    groupId: number | null; // Just for display/context if needed
    groupName?: string;
}

export function RefreshMenu({ onRefresh, refreshing, groupId, groupName }: RefreshMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [lastRange, setLastRange] = useState<'3d' | '7d' | '30d' | '3m' | '6m' | '1y' | 'all'>('3d');
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

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleSelect = (range: '3d' | '7d' | '30d' | '3m' | '6m' | '1y' | 'all') => {
        setIsOpen(false);
        setLastRange(range);
        onRefresh(range);
    };

    const handleMainClick = () => {
        onRefresh(lastRange);
    };

    return (
        <div className="relative" ref={menuRef}>
            <div className="flex rounded-xl overflow-hidden shadow-sm">
                <button
                    onClick={handleMainClick}
                    disabled={refreshing}
                    className="flex items-center gap-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50 border-r border-zinc-700 dark:border-zinc-300"
                >
                    <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                    {refreshing
                        ? "更新中..."
                        : (
                            <span>
                                {groupName ? `更新 ${groupName}` : "更新全部"}
                                <span className="opacity-70 ml-1 text-xs font-normal">
                                    ({RANGE_LABELS[lastRange]})
                                </span>
                            </span>
                        )
                    }
                </button>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    disabled={refreshing}
                    className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 px-2 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
                >
                    <ChevronDown size={14} />
                </button>
            </div>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
                    <div className="p-2 space-y-1">
                        <button
                            onClick={() => handleSelect('3d')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex justify-between ${lastRange === '3d'
                                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            <span>最近 3 天</span>
                            <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">快速</span>
                        </button>
                        <button
                            onClick={() => handleSelect('7d')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${lastRange === '7d'
                                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            最近 7 天
                        </button>
                        <button
                            onClick={() => handleSelect('30d')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${lastRange === '30d'
                                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            最近 30 天
                        </button>
                        <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
                        <button
                            onClick={() => handleSelect('3m')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${lastRange === '3m'
                                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            最近 3 个月
                        </button>
                        <button
                            onClick={() => handleSelect('6m')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${lastRange === '6m'
                                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            最近半年
                        </button>
                        <button
                            onClick={() => handleSelect('1y')}
                            className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${lastRange === '1y'
                                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                }`}
                        >
                            最近一年
                        </button>
                        <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
                        <button
                            onClick={() => handleSelect('all')}
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
