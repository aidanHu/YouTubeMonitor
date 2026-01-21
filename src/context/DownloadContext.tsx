"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface DownloadItem {
    id: string; // Video ID
    title: string;
    thumbnail: string | null;
    status: 'queued' | 'downloading' | 'completed' | 'error';
    progress: number; // 0-100
    startTime: Date;
    error?: string;
    channelName?: string;
    channelId?: string;
    path?: string;
}

interface DownloadContextType {
    downloads: DownloadItem[];
    startDownload: (video: { id: string; title: string; thumbnail: string | null; channelName: string; channelId?: string }) => Promise<void>;
    retryDownload: (id: string) => Promise<void>;
    retryAllFailed: () => void;
    removeDownload: (id: string) => void;
    queueDownloads: (videos: { id: string; title: string; thumbnail: string | null; channelName: string; channelId?: string }[]) => void;
    clearHistory: () => void;
    restoreHistory: (items: any[]) => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: ReactNode }) {
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [loaded, setLoaded] = useState(false);
    const MAX_CONCURRENT = 3;

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('download_history');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);

                if (Array.isArray(parsed)) {
                    // Restore Date objects
                    const restored = parsed.map((item: any) => ({
                        ...item,
                        startTime: new Date(item.startTime)
                    }));
                    setDownloads(restored);
                } else {
                    console.warn("Invalid download history format in localStorage, resetting.");
                    localStorage.removeItem('download_history');
                }
            } catch (e) {
                console.error("Failed to load history", e);
            }
        }
        setLoaded(true);
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        if (loaded) {
            localStorage.setItem('download_history', JSON.stringify(downloads));
        }
    }, [downloads, loaded]);

    const updateDownload = (id: string, updates: Partial<DownloadItem>) => {
        setDownloads(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    };

    // Queue Processing Logic
    useEffect(() => {
        if (!loaded) return;

        const activeCount = downloads.filter(d => d.status === 'downloading').length;
        if (activeCount >= MAX_CONCURRENT) return;

        // Find next queued item
        // We pick the 'queued' item with the earliest startTime (FIFO)
        // Wait, startTime created when added to queue.
        const nextItem = downloads
            .filter(d => d.status === 'queued')
            .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0];

        if (nextItem) {
            startActualDownload(nextItem);
        }
    }, [downloads, loaded]);

    // Poll for progress of ACTIVE items only
    useEffect(() => {
        const interval = setInterval(async () => {
            const downloadingItems = downloads.filter(d => d.status === 'downloading');
            if (downloadingItems.length === 0) return;

            for (const item of downloadingItems) {
                try {
                    const res = await fetch(`/api/download?id=${item.id}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.status === 'active' && data.progress !== undefined) {
                            setDownloads(prev => prev.map(d =>
                                d.id === item.id ? { ...d, progress: data.progress } : d
                            ));
                        } else if (data.status === 'completed') {
                            setDownloads(prev => prev.map(d =>
                                d.id === item.id ? { ...d, status: 'completed', progress: 100, error: undefined } : d
                            ));
                        } else if (data.status === 'error') {
                            setDownloads(prev => prev.map(d =>
                                d.id === item.id ? { ...d, status: 'error', error: data.error || "下载失败" } : d
                            ));
                        } else if (data.status === 'inactive') {
                            // If backend lost it, mark error
                            // But maybe give it a grace period? For now simplified.
                            setDownloads(prev => prev.map(d =>
                                d.id === item.id ? { ...d, status: 'error', error: "任务连接中断" } : d
                            ));
                        }
                    }
                } catch (e) {
                    console.error("Poll failed", e);
                }
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [downloads]);

    const startActualDownload = async (item: DownloadItem) => {
        // Mark as downloading IMMEDIATELY to prevent double-pick by effect
        updateDownload(item.id, { status: 'downloading' });

        try {
            const res = await fetch("/api/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    videoId: item.id,
                    title: item.title,
                    channelName: item.channelName,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                updateDownload(item.id, { status: 'error', error: data.error || `Download failed: ${res.status}` });
                return;
            }

            const data = await res.json();
            // Store the file path
            // Note: status might still be downloading until poll confirms 'completed' or we set it here if synchronous (it's not)
            // Actually the API returns success=true immediately upon Spawn.
            // So we just keep it as 'downloading'. status update will come from Poll.
            updateDownload(item.id, { path: data.path });

        } catch (error: any) {
            updateDownload(item.id, { status: 'error', error: error.message || "Unknown error" });
        }
    };

    const startDownload = async (video: { id: string; title: string; thumbnail: string | null; channelName: string; channelId?: string }) => {
        setDownloads(prev => {
            if (prev.some(d => d.id === video.id && (d.status === 'downloading' || d.status === 'queued'))) {
                return prev;
            }
            // Remove old completed/error of same ID
            const filtered = prev.filter(d => d.id !== video.id);
            const newItem: DownloadItem = {
                id: video.id,
                title: video.title,
                thumbnail: video.thumbnail,
                status: 'queued',
                progress: 0,
                startTime: new Date(),
                channelName: video.channelName,
                channelId: video.channelId
            };
            return [newItem, ...filtered];
        });
    };

    const queueDownloads = (videos: { id: string; title: string; thumbnail: string | null; channelName: string; channelId?: string }[]) => {
        setDownloads(prev => {
            const newItems: DownloadItem[] = [];
            for (const v of videos) {
                if (prev.some(d => d.id === v.id && (d.status === 'downloading' || d.status === 'queued'))) {
                    continue;
                }
                // Check if already in newItems to avoid duplicates in same batch
                if (newItems.some(d => d.id === v.id)) continue;

                newItems.push({
                    id: v.id,
                    title: v.title,
                    thumbnail: v.thumbnail,
                    status: 'queued',
                    progress: 0,
                    startTime: new Date(),
                    channelName: v.channelName,
                    channelId: v.channelId
                });
            }

            // Remove old completed/errors for these IDs
            const newIds = new Set(newItems.map(i => i.id));
            const filtered = prev.filter(d => !newIds.has(d.id));

            return [...newItems, ...filtered];
        });
    };

    const retryDownload = async (id: string) => {
        const item = downloads.find(d => d.id === id);
        if (item) {
            setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'queued', progress: 0, error: undefined } : d));
        }
    };

    const retryAllFailed = () => {
        setDownloads(prev => prev.map(d =>
            d.status === 'error'
                ? { ...d, status: 'queued', progress: 0, error: undefined, startTime: new Date() }
                : d
        ));
    };

    const removeDownload = (id: string) => {
        setDownloads(prev => prev.filter(d => d.id !== id));
    };

    const clearHistory = () => {
        if (!confirm("确定要清空所有已完成和失败的下载记录吗？\n(正在进行的任务不会被清除)")) return;
        setDownloads(prev => prev.filter(d => d.status === 'downloading' || d.status === 'queued'));
    };

    const restoreHistory = (items: any[]) => {
        setDownloads(prev => {
            // Merge restored items, avoiding duplicates
            const existingIds = new Set(prev.map(d => d.id));
            const newItems = items
                .filter(item => !existingIds.has(item.id))
                .map(item => ({
                    ...item,
                    startTime: new Date(item.startTime || Date.now())
                }));

            return [...prev, ...newItems].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
        });
    };

    return (
        <DownloadContext.Provider value={{ downloads, startDownload, retryDownload, retryAllFailed, removeDownload, queueDownloads, clearHistory, restoreHistory }}>
            {children}
        </DownloadContext.Provider>
    );
}

export function useDownloads() {
    const context = useContext(DownloadContext);
    if (context === undefined) {
        throw new Error("useDownloads must be used within a DownloadProvider");
    }
    return context;
}

