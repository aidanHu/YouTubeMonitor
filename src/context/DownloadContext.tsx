"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useData } from './DataContext';
import { show_alert, show_confirm } from '@/lib/dialogs';

export interface DownloadItem {
    id: string; // Video ID
    title: string;
    thumbnail: string | null;
    status: 'queued' | 'downloading' | 'completed' | 'error' | 'cancelled';
    progress: number; // 0-100
    start_time: Date;
    error?: string;
    channel_name?: string;
    channel_id?: string;
    path?: string;
    speed?: string;
    eta?: string;
}

interface DownloadContextType {
    downloads: DownloadItem[];
    start_download: (video: { id: string; title: string; thumbnail: string | null; channel_name: string; channel_id?: string }) => Promise<void>;
    retry_download: (id: string) => Promise<void>;
    retry_all_failed: () => void;
    remove_download: (id: string) => void;
    queue_downloads: (videos: { id: string; title: string; thumbnail: string | null; channel_name: string; channel_id?: string }[]) => void;
    clear_history: () => void;
    cancel_download: (id: string) => Promise<void>;
    cookie_status: 'checking' | 'valid' | 'expired' | 'unknown';
    check_cookie: () => Promise<void>;
    cancel_all_downloads: () => Promise<void>;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: ReactNode }) {
    const [downloads, set_downloads] = useState<DownloadItem[]>([]);
    const [loaded, set_loaded] = useState(false);
    const [cookie_status, set_cookie_status] = useState<'checking' | 'valid' | 'expired' | 'unknown'>('unknown');
    const MAX_CONCURRENT = 3;
    const { settings, is_activated } = useData();

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('download_history');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    // Restore Date objects and reset 'downloading' status to 'queued'
                    const restored = parsed.map((item: any) => ({
                        ...item,
                        start_time: new Date(item.start_time),
                        status: (item.status === 'downloading' || item.status === 'queued') ? 'queued' : item.status,
                        progress: item.status === 'downloading' ? item.progress : (item.progress || 0)
                    }));
                    set_downloads(restored);
                }
            } catch (e) {
                console.error("Failed to load history", e);
            }
        }
        set_loaded(true);
    }, []);

    // Save to localStorage
    useEffect(() => {
        if (loaded) {
            localStorage.setItem('download_history', JSON.stringify(downloads));
        }
    }, [downloads, loaded]);

    // Setup Event Listeners
    useEffect(() => {
        let unlisten_progress: (() => void) | undefined;
        let unlisten_complete: (() => void) | undefined;
        let unlisten_error: (() => void) | undefined;

        const setup_listeners = async () => {
            unlisten_progress = await listen<any>('download-progress', (event) => {
                const { videoId, progress, speed, eta } = event.payload;
                set_downloads(prev => prev.map(d =>
                    d.id === videoId ? { ...d, status: 'downloading', progress, speed, eta } : d
                ));
            });

            unlisten_complete = await listen<any>('download-complete', (event) => {
                let video_id = "";
                let path = "";

                if (typeof event.payload === 'string') {
                    video_id = event.payload;
                } else {
                    video_id = event.payload.videoId || event.payload.video_id; // Support both just in case
                    path = event.payload.path;
                }

                set_downloads(prev => prev.map(d =>
                    d.id === video_id ? { ...d, status: 'completed', progress: 100, error: undefined, path: path } : d
                ));
            });

            unlisten_error = await listen<any>('download-error', (event) => {
                const videoId = event.payload.videoId || event.payload.video_id;
                const error = event.payload.error;

                set_downloads(prev => prev.map(d => {
                    if (d.id === videoId) {
                        // If already cancelled, don't overwrite with error
                        if (d.status === 'cancelled') return d;
                        return { ...d, status: 'error', error: error || "Download Failed" };
                    }
                    return d;
                }));
            });
        };

        setup_listeners();

        return () => {
            if (unlisten_progress) unlisten_progress();
            if (unlisten_complete) unlisten_complete();
            if (unlisten_error) unlisten_error();
        };
    }, []);

    // Queue Processing
    useEffect(() => {
        if (!loaded) return;

        const active_count = downloads.filter(d => d.status === 'downloading').length;
        if (active_count >= MAX_CONCURRENT) return;

        const next_item = downloads
            .filter(d => d.status === 'queued')
            .sort((a, b) => a.start_time.getTime() - b.start_time.getTime())[0];

        if (next_item) {
            process_download(next_item);
        }
    }, [downloads, loaded]);

    const process_download = useCallback(async (item: DownloadItem) => {
        set_downloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'downloading' } : d));

        try {
            await invoke('download_video', {
                video_id: item.id,
                title: item.title,
                channel_name: item.channel_name,
                thumbnail: item.thumbnail
            });
        } catch (e: any) {
            set_downloads(prev => prev.map(d =>
                d.id === item.id ? { ...d, status: 'error', error: e.toString() } : d
            ));
        }
    }, []);

    const check_cookie = useCallback(async () => {
        if (!settings?.cookie_source) {
            set_cookie_status('unknown');
            return;
        }
        set_cookie_status('checking');
        try {
            const valid = await invoke<boolean>('check_cookie_status', { path: settings.cookie_source });
            set_cookie_status(valid ? 'valid' : 'expired');
        } catch (e) {
            console.error("Cookie check failed", e);
            set_cookie_status('unknown');
        }
    }, [settings?.cookie_source]);

    useEffect(() => {
        check_cookie();
    }, [check_cookie]);

    const start_download = useCallback(async (video: { id: string; title: string; thumbnail: string | null; channel_name: string; channel_id?: string }) => {
        if (!is_activated) {
            await show_alert("软件未激活，无法下载视频。\n请前往 [设置 -> 软件激活] 进行激活。", "提示", "warning");
            return;
        }
        if (!settings?.download_path) {
            await show_alert("检测到未配置下载地址。\n\n请前往 [系统设置 -> 常规设置] 配置视频下载路径。", "配置错误", "error");
            return;
        }

        if (cookie_status === 'expired') {
            const confirm = await show_confirm("检测到 Cookie 可能已失效，下载极有可能会失败或卡住。\n\n建议更新 Cookie 后再试。是否仍要强制下载？", "Cookie 已过期");
            if (!confirm) return;
        }

        set_downloads(prev => {
            if (prev.some(d => d.id === video.id && (d.status === 'downloading' || d.status === 'queued'))) {
                return prev;
            }
            const filtered = prev.filter(d => d.id !== video.id);
            const newItem: DownloadItem = {
                id: video.id,
                title: video.title,
                thumbnail: video.thumbnail,
                status: 'queued',
                progress: 0,
                start_time: new Date(),
                channel_name: video.channel_name,
                channel_id: video.channel_id
            };
            return [newItem, ...filtered];
        });
    }, [is_activated, settings?.download_path]);

    const queue_downloads = useCallback(async (videos: { id: string; title: string; thumbnail: string | null; channel_name: string; channel_id?: string }[]) => {
        if (!is_activated) {
            await show_alert("软件未激活，无法下载视频。\n请前往 [设置 -> 软件激活] 进行激活。", "提示", "warning");
            return;
        }
        if (!settings?.download_path) {
            await show_alert("检测到未配置下载地址。\n\n请前往 [系统设置 -> 常规设置] 配置视频下载路径。", "配置错误", "error");
            return;
        }

        if (cookie_status === 'expired') {
            const confirm = await show_confirm("检测到 Cookie 可能已失效，批量下载极有可能会失败。\n\n建议更新 Cookie 后再试。是否仍要强制下载？", "Cookie 已过期");
            if (!confirm) return;
        }

        set_downloads(prev => {
            const new_items: DownloadItem[] = [];
            for (const v of videos) {
                if (prev.some(d => d.id === v.id && (d.status === 'downloading' || d.status === 'queued'))) continue;
                if (new_items.some(d => d.id === v.id)) continue;

                new_items.push({
                    id: v.id,
                    title: v.title,
                    thumbnail: v.thumbnail,
                    status: 'queued',
                    progress: 0,
                    start_time: new Date(),
                    channel_name: v.channel_name,
                    channel_id: v.channel_id
                });
            }
            const new_ids = new Set(new_items.map(i => i.id));
            const filtered = prev.filter(d => !new_ids.has(d.id));
            return [...new_items, ...filtered];
        });
    }, [is_activated, settings?.download_path, cookie_status]);

    const retry_download = useCallback(async (id: string) => {
        if (!settings?.download_path) {
            await show_alert("检测到未配置下载地址。\n\n请前往 [系统设置 -> 常规设置] 配置视频下载路径。", "配置错误", "error");
            return;
        }
        set_downloads(prev => prev.map(d => d.id === id ? { ...d, status: 'queued', progress: 0, error: undefined } : d));
    }, [settings?.download_path]);

    const retry_all_failed = useCallback(() => {
        set_downloads(prev => prev.map(d =>
            d.status === 'error'
                ? { ...d, status: 'queued', progress: 0, error: undefined, start_time: new Date() }
                : d
        ));
    }, []);

    const cancel_download = useCallback(async (id: string) => {
        try {
            await invoke('cancel_download', { video_id: id });
        } catch (e: any) {
            // Silently ignore "not found" errors as they just mean the backend is already clean
            if (!e.toString().includes("Download not found")) {
                console.error("Cancel failed", e);
            }
        }
        set_downloads(prev => prev.map(d => d.id === id ? { ...d, status: 'cancelled', error: "Cancelled by user" } : d));
    }, []);

    const remove_download = useCallback(async (id: string) => {
        const item = downloads.find(d => d.id === id);
        if (item && item.status === 'downloading') {
            await cancel_download(id);
        }
        set_downloads(prev => prev.filter(d => d.id !== id));
    }, [cancel_download, downloads]);

    const clear_history = useCallback(() => {
        set_downloads(prev => {
            const filtered = prev.filter(d => d.status === 'downloading' || d.status === 'queued');
            return [...filtered];
        });
    }, []);

    const cancel_all_downloads = useCallback(async () => {
        const active_downloads = downloads.filter(d => d.status === 'downloading' || d.status === 'queued');

        // 1. Mark all as cancelled in UI immediately
        set_downloads(prev => prev.map(d =>
            (d.status === 'downloading' || d.status === 'queued')
                ? { ...d, status: 'cancelled', error: "Cancelled by user" }
                : d
        ));

        // 2. Call backend to cancel each
        // We run these in parallel
        await Promise.all(active_downloads.map(d =>
            invoke('cancel_download', { video_id: d.id }).catch(() => { }) // Ignore backend errors during batch cancel
        ));

    }, [downloads]);

    const value = useMemo(() => ({
        downloads, start_download, retry_download, retry_all_failed,
        remove_download, queue_downloads, clear_history,
        cancel_download, cookie_status, check_cookie, cancel_all_downloads
    }), [downloads, start_download, retry_download, retry_all_failed, remove_download, queue_downloads, clear_history, cancel_download, cookie_status, check_cookie, cancel_all_downloads]);

    return (
        <DownloadContext.Provider value={value}>
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
