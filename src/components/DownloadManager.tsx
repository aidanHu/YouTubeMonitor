"use client";

import { useDownloads } from "@/context/DownloadContext";
import { useData } from "@/context/DataContext";
import { Download, AlertCircle, CheckCircle2, X, FolderOpen, RotateCcw, Trash2, Filter } from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";

export function DownloadManager() {
    const { downloads, retryDownload, removeDownload, retryAllFailed, clearHistory } = useDownloads();
    const { groups, channels, isActivated } = useData();
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

    const filteredDownloads = useMemo(() => {
        if (!selectedGroupId && selectedGroupId !== -1) return downloads; // All

        return downloads.filter(item => {
            // Find channel for this download
            let channel = null;
            if (item.channelId) {
                channel = channels.find(c => c.id === item.channelId);
            } else if (item.channelName) {
                channel = channels.find(c => c.name === item.channelName);
            }

            if (selectedGroupId === -1) {
                // Uncategorized: channel exists but has no group, OR channel not found (unknown)
                return !channel || channel.groupId === null;
            } else {
                // Specific Group
                return channel && channel.groupId === selectedGroupId;
            }
        });
    }, [downloads, channels, selectedGroupId]);

    const failedCount = downloads.filter(d => d.status === 'error').length;

    if (downloads.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                <Download size={48} className="mb-4 opacity-20" />
                <p>暂无下载任务</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                {/* Filter */}
                <div className="flex items-center gap-2">
                    <Filter size={16} className="text-zinc-400" />
                    <select
                        className="bg-transparent text-sm font-medium outline-none text-zinc-700 dark:text-zinc-300"
                        value={selectedGroupId === null ? "" : selectedGroupId}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") setSelectedGroupId(null);
                            else setSelectedGroupId(Number(val));
                        }}
                    >
                        <option value="">全部下载</option>
                        {groups.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                        <option value="-1">未分组</option>
                    </select>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    {failedCount > 0 && (
                        <button
                            onClick={() => {
                                if (!isActivated) {
                                    alert("软件未激活，无法使用此功能。\n请前往 [设置 -> 软件激活] 进行激活。");
                                    return;
                                }
                                retryAllFailed();
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm transition-colors"
                        >
                            <RefreshCwIcon size={14} />
                            重试所有失败 ({failedCount})
                        </button>
                    )}
                    <button
                        onClick={() => {
                            // Optional: Clear history might not need activation, but consistency is key OR maybe allow clearing? 
                            // Let's protect it too as it's a management action.
                            // Actually, clearing history is local, maybe allow it?
                            // User asked for "using functionalities". Let's restrict core actions. 
                            // Retry is core. Clear is maintenance. Let's restrict both for strong enforcement.
                            if (!isActivated) {
                                alert("软件未激活，无法管理记录。\n请前往 [设置 -> 软件激活] 进行激活。");
                                return;
                            }
                            clearHistory();
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                        title="清空已完成/失败记录"
                    >
                        <Trash2 size={14} />
                        清空记录
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredDownloads.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400 text-sm">此分组下没有下载记录</div>
                ) : filteredDownloads.map(item => {
                    // Resolve links
                    const channel = item.channelId
                        ? channels.find(c => c.id === item.channelId)
                        : (item.channelName ? channels.find(c => c.name === item.channelName) : null);

                    const channelUrl = channel ? `/channel/${channel.id}` : null;
                    const videoUrl = `/watch/${item.id}`;

                    return (
                        <div key={item.id} className="p-4 flex items-center gap-4 group">
                            {/* Thumbnail */}
                            <div className="w-32 aspect-video bg-zinc-100 rounded-lg overflow-hidden shrink-0 relative">
                                {item.thumbnail ? (
                                    <Link href={videoUrl}>
                                        <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover hover:opacity-90 transition-opacity cursor-pointer" />
                                    </Link>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-300">
                                        <Download size={20} />
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <Link href={videoUrl} className="block group/title">
                                    <h3 className="font-medium text-sm line-clamp-2 mb-1 group-hover/title:text-blue-600 transition-colors" title={item.title}>
                                        {item.title}
                                    </h3>
                                </Link>

                                <div className="text-xs text-zinc-500 space-y-1">
                                    {/* Channel Name Link */}
                                    {item.channelName && (
                                        <div className="mb-2">
                                            {channelUrl ? (
                                                <Link href={channelUrl} className="hover:text-blue-500 transition-colors flex items-center gap-1 w-fit">
                                                    {item.channelName}
                                                </Link>
                                            ) : (
                                                <span>{item.channelName}</span>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2">
                                        {item.status === 'downloading' && (
                                            <div className="flex flex-col gap-1 w-full max-w-[200px]">
                                                <span className="text-blue-600 flex items-center gap-1">
                                                    <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                                                    下载中 {Math.round(item.progress || 0)}%
                                                </span>
                                                <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                                                        style={{ width: `${Math.round(item.progress || 0)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        {item.status === 'completed' && (
                                            <span className="text-green-600 flex items-center gap-1">
                                                <CheckCircle2 size={12} />
                                                已完成
                                            </span>
                                        )}
                                        {item.status === 'error' && (
                                            <span className="text-red-500 flex items-center gap-1">
                                                <AlertCircle size={12} />
                                                失败: {item.error}
                                            </span>
                                        )}
                                        <span className="text-zinc-400 ml-auto">
                                            {item.startTime.toLocaleTimeString()}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {item.status === 'completed' && item.path && (
                                    <>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch('/api/open', {
                                                        method: 'POST',
                                                        body: JSON.stringify({
                                                            filePath: item.path,
                                                            videoId: item.id
                                                        })
                                                    });
                                                    if (!res.ok) {
                                                        const data = await res.json();
                                                        alert(data.error || "打开文件夹失败");
                                                    }
                                                } catch (e) {
                                                    alert("请求失败，请检查网络或控制台");
                                                }
                                            }}
                                            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-blue-500 transition-colors"
                                            title="打开文件夹"
                                        >
                                            <FolderOpen size={18} />
                                        </button>
                                        <button
                                            onClick={() => retryDownload(item.id)}
                                            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-blue-500 transition-colors"
                                            title="重新下载"
                                        >
                                            <RotateCcw size={18} />
                                        </button>
                                    </>
                                )}
                                {item.status === 'error' && (
                                    <button
                                        onClick={() => retryDownload(item.id)}
                                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-600 dark:text-zinc-400"
                                        title="重试"
                                    >
                                        <RefreshCwIcon size={18} />
                                    </button>
                                )}
                                <button
                                    onClick={() => removeDownload(item.id)}
                                    className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-red-500 transition-colors"
                                    title="移除记录"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function RefreshCwIcon({ size, className }: { size?: number, className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
        </svg>
    )
}
