
import { useState, useRef, useEffect } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";

interface RefreshMenuProps {
    onRefresh: (range: '3d' | '7d' | '30d' | 'all') => Promise<void>;
    refreshing: boolean;
    groupId: number | null; // Just for display/context if needed
    groupName?: string;
}

export function RefreshMenu({ onRefresh, refreshing, groupId, groupName }: RefreshMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

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

    const handleSelect = (range: '3d' | '7d' | '30d' | 'all') => {
        setIsOpen(false);
        onRefresh(range);
    };

    return (
        <div className="relative" ref={menuRef}>
            <div className="flex rounded-xl overflow-hidden shadow-sm">
                <button
                    onClick={() => onRefresh('3d')} // Default action
                    disabled={refreshing}
                    className="flex items-center gap-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50 border-r border-zinc-700 dark:border-zinc-300"
                >
                    <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                    {refreshing ? "更新中..." : (groupName ? `更新 ${groupName}` : "更新全部")}
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
                            className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex justify-between"
                        >
                            <span>最近 3 天</span>
                            <span className="text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">快速</span>
                        </button>
                        <button
                            onClick={() => handleSelect('7d')}
                            className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                            最近 7 天
                        </button>
                        <button
                            onClick={() => handleSelect('30d')}
                            className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                            最近 30 天
                        </button>
                        <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
                        <button
                            onClick={() => handleSelect('all')}
                            className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex justify-between group"
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
