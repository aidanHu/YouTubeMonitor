"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Channel, Group } from "@/types";

export interface AppSettings {
    id: number;
    proxy_url: string | null;
    theme: string | null;
    cookie_source: string | null;
    download_path: string | null;
    activation_code?: string | null;
    created_at: string;
    activated_at?: string | null;
    license_days?: number | null;
}

export interface LicenseStatus {
    type: 'trial' | 'active' | 'expired_trial' | 'expired_license';
    remaining_days: number; // For trial or license
    expiry_date: Date | null;
}

interface DataContextType {
    groups: Group[];
    channels: Channel[];
    loading: boolean;
    is_activated: boolean;
    license_status: LicenseStatus | null; // Add detailed status
    settings: AppSettings | null;
    refreshData: (silent?: boolean) => Promise<void>;
    last_updated: number; // Add timestamp to track data freshness

    // Scroll Persistence
    scroll_positions: Record<string, number>;
    set_scroll_position: (key: string, pos: number) => void;

    set_groups: React.Dispatch<React.SetStateAction<Group[]>>;
    set_channels: React.Dispatch<React.SetStateAction<Channel[]>>;
    current_view: 'dashboard' | 'downloads';
    set_current_view: (view: 'dashboard' | 'downloads') => void;
    current_tab: "channels" | "videos" | "favoriteChannels" | "favoriteVideos" | "analysis";
    set_current_tab: (tab: "channels" | "videos" | "favoriteChannels" | "favoriteVideos" | "analysis") => void;
    // Persisted Dashboard State
    selected_group_id: number | null;
    set_selected_group_id: (id: number | null) => void;
    sort_order: "view_count" | "published_at" | "viral" | "vph" | "z_score" | "created_at" | "last_upload_at" | "subscriber_count" | "video_count" | "average_views";
    set_sort_order: (order: "view_count" | "published_at" | "viral" | "vph" | "z_score" | "created_at" | "last_upload_at" | "subscriber_count" | "video_count" | "average_views") => void;
    filter_type: "all" | "video" | "short";
    set_filter_type: (type: "all" | "video" | "short") => void;
    date_range: "all" | "3d" | "7d" | "30d";
    set_date_range: (range: "all" | "3d" | "7d" | "30d") => void;
    search_query: string;
    set_search_query: (query: string) => void;
    inactivityFilter: "all" | "1m" | "3m" | "6m" | "1y";
    set_inactivity_filter: (filter: "all" | "1m" | "3m" | "6m" | "1y") => void;

    // Analysis State
    analysisDateRange: "3d" | "7d" | "30d";
    set_analysis_date_range: (range: "3d" | "7d" | "30d") => void;
    analysisFilterType: "all" | "video" | "short";
    set_analysis_filter_type: (type: "all" | "video" | "short") => void;

    video_cache: {
        key: string;
        videos: any[];
        page: number;
        has_more: boolean;
    };
    set_video_cache: React.Dispatch<React.SetStateAction<{
        key: string;
        videos: any[];
        page: number;
        has_more: boolean;
    }>>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
    const [groups, set_groups] = useState<Group[]>([]);
    const [channels, set_channels] = useState<Channel[]>([]);
    const [loading, set_loading] = useState(true);

    // Scroll state map
    const [scroll_positions, set_scroll_positions] = useState<Record<string, number>>({});



    const [current_view, set_current_view] = useState<'dashboard' | 'downloads'>('dashboard');
    const [current_tab, set_current_tab] = useState<"channels" | "videos" | "favoriteChannels" | "favoriteVideos" | "analysis">("analysis");

    // Persisted Filters
    const [selected_group_id, set_selected_group_id] = useState<number | null>(null);
    const [sort_order, set_sort_order] = useState<"view_count" | "published_at" | "viral" | "vph" | "z_score" | "created_at" | "last_upload_at" | "subscriber_count" | "video_count" | "average_views">("published_at");
    const [filter_type, set_filter_type] = useState<"all" | "video" | "short">("all");
    const [date_range, set_date_range] = useState<"all" | "3d" | "7d" | "30d">("all");
    const [search_query, set_search_query] = useState("");
    const [inactivityFilter, set_inactivity_filter] = useState<"all" | "1m" | "3m" | "6m" | "1y">("all");

    const [analysisDateRange, set_analysis_date_range] = useState<"3d" | "7d" | "30d">("3d");
    const [analysisFilterType, set_analysis_filter_type] = useState<"all" | "video" | "short">("all");

    // Load persisted filters on mount
    useEffect(() => {
        // Disable logs in production for performance
        if (process.env.NODE_ENV === 'production') {
            (window as any).console.log = () => { };
            (window as any).console.debug = () => { };
        }

        const saved = localStorage.getItem('user_preferences');
        if (saved) {
            try {
                const p = JSON.parse(saved);
                if (p.selected_group_id !== undefined) set_selected_group_id(p.selected_group_id);
                if (p.sort_order) set_sort_order(p.sort_order);
                if (p.filter_type) set_filter_type(p.filter_type);
                if (p.date_range) set_date_range(p.date_range);
                // search_query is usually not persisted
                if (p.inactivityFilter) set_inactivity_filter(p.inactivityFilter);
                if (p.analysisDateRange) set_analysis_date_range(p.analysisDateRange);
                if (p.analysisFilterType) set_analysis_filter_type(p.analysisFilterType);
            } catch (e) {
                console.error("Failed to load user preferences", e);
            }
        }
    }, []);

    // Save filters on change
    useEffect(() => {
        const prefs = {
            selected_group_id,
            sort_order,
            filter_type,
            date_range,
            inactivityFilter,
            analysisDateRange,
            analysisFilterType
        };
        localStorage.setItem('user_preferences', JSON.stringify(prefs));
    }, [selected_group_id, sort_order, filter_type, date_range, inactivityFilter, analysisDateRange, analysisFilterType]);

    const [is_activated, set_is_activated] = useState(false);
    const [license_status, set_license_status] = useState<LicenseStatus | null>(null);
    const [settings, set_settings] = useState<AppSettings | null>(null);
    const [video_cache, set_video_cache] = useState<{
        key: string;
        videos: any[];
        page: number;
        has_more: boolean;
    }>({ key: "", videos: [], page: 1, has_more: true });

    const [last_updated, set_last_updated] = useState<number>(Date.now());
    const [last_refresh_trigger, set_last_refresh_trigger] = useState(0);

    const set_scroll_position = useCallback((key: string, pos: number) => {
        set_scroll_positions(prev => ({ ...prev, [key]: pos }));
    }, []);

    const refreshData = useCallback(async (silent = false) => {
        if (!silent) set_loading(true);
        try {
            // Fetch Tauri settings
            try {
                const s = await invoke<AppSettings>('get_settings');
                set_settings(s);

                // Check activation / Trial Logic
                const now = Date.now();
                const oneDay = 24 * 60 * 60 * 1000;

                let active = false;
                let status: LicenseStatus | null = null;

                if (s && s.activation_code) {
                    const activated_at = s.activated_at ? new Date(s.activated_at.replace(' ', 'T')).getTime() : now;
                    const durationDays = s.license_days || 365;
                    const expiryTime = activated_at + (durationDays * oneDay);
                    const remaining = Math.ceil((expiryTime - now) / oneDay);

                    if (now < expiryTime) {
                        active = true;
                        status = { type: 'active', remaining_days: remaining, expiry_date: new Date(expiryTime) };
                    } else {
                        active = false;
                        status = { type: 'expired_license', remaining_days: 0, expiry_date: new Date(expiryTime) };
                    }
                } else if (s) {
                    // Normalize date string for better cross-browser compatibility (SQLite uses "YYYY-MM-DD HH:MM:SS")
                    const createdStr = s.created_at.replace(' ', 'T');
                    const created_at = new Date(createdStr).getTime();
                    const trialExpiry = created_at + (3 * oneDay); // 3 days
                    const remaining = Math.ceil((trialExpiry - now) / oneDay);

                    if (now < trialExpiry) {
                        active = true;
                        status = { type: 'trial', remaining_days: remaining, expiry_date: new Date(trialExpiry) };
                    } else {
                        active = false;
                        status = { type: 'expired_trial', remaining_days: 0, expiry_date: new Date(trialExpiry) };
                    }
                }

                set_is_activated(active);
                set_license_status(status);

            } catch (e) {
                console.warn("Failed to init settings from Rust", e);
                set_license_status(null);
            }

            try {
                const [groupsData, channelsData] = await Promise.all([
                    invoke<Group[]>('get_groups'),
                    invoke<Channel[]>('get_channels')
                ]);

                set_groups(groupsData);
                set_channels(channelsData);
                set_last_updated(Date.now());
            } catch (err) {
                console.error("Failed to invoke Tauri commands", err);
            }
        } catch (e) {
            console.error("Failed to fetch data", e);
        } finally {
            if (!silent) set_loading(false);
        }
    }, []);

    // Initial fetch
    useEffect(() => {
        refreshData();
    }, []);

    // Re-fetch when sort_order changes (only for channels sort context)
    // Re-fetch when sort_order changes (only for channels sort context)
    // REMOVED: Client-side sorting is now used for channels.
    // useEffect(() => {
    //     if (sort_order === 'created_at' || sort_order === 'last_upload_at' || sort_order === 'view_count' || sort_order === 'subscriber_count' || sort_order === 'video_count' || sort_order === 'average_views') {
    //         refreshData(true);
    //     }
    // }, [sort_order]);

    const value = useMemo(() => ({
        groups,
        channels,
        loading,
        refreshData,
        last_updated,

        // Scroll Persistence Maps
        scroll_positions,
        set_scroll_position,

        set_groups,
        set_channels,
        current_view,
        set_current_view,
        current_tab,
        set_current_tab,
        selected_group_id, set_selected_group_id,
        sort_order, set_sort_order,
        filter_type, set_filter_type,
        date_range, set_date_range,

        search_query, set_search_query,
        inactivityFilter, set_inactivity_filter,
        analysisDateRange, set_analysis_date_range,
        analysisFilterType, set_analysis_filter_type,
        video_cache,
        set_video_cache,
        is_activated,
        license_status,
        settings,
    }), [
        groups, channels, loading, refreshData, last_updated, scroll_positions,
        set_scroll_position, current_view, current_tab, selected_group_id,
        sort_order, filter_type, date_range, search_query, video_cache,
        is_activated, license_status, settings,
        inactivityFilter, analysisDateRange, analysisFilterType
    ]);

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error("useData must be used within a DataProvider");
    }
    return context;
}
