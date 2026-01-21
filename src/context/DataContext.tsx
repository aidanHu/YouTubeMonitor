"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Channel, Group } from "@/types";

interface DataContextType {
    groups: Group[];
    channels: Channel[];
    loading: boolean;
    isActivated: boolean; // Add type
    refreshData: (silent?: boolean) => Promise<void>;

    // Scroll Persistence
    scrollPositions: Record<string, number>;
    setScrollPosition: (key: string, pos: number) => void;

    setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
    setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
    currentView: 'dashboard' | 'downloads';
    setCurrentView: (view: 'dashboard' | 'downloads') => void;
    currentTab: "channels" | "videos" | "favoriteChannels" | "favoriteVideos" | "analysis";
    setCurrentTab: (tab: "channels" | "videos" | "favoriteChannels" | "favoriteVideos" | "analysis") => void;
    // Persisted Dashboard State
    selectedGroupId: number | null;
    setSelectedGroupId: (id: number | null) => void;
    sortOrder: "viewCount" | "publishedAt" | "viral" | "vph" | "zScore" | "createdAt" | "lastUploadAt" | "subscriberCount" | "videoCount" | "averageViews";
    setSortOrder: (order: "viewCount" | "publishedAt" | "viral" | "vph" | "zScore" | "createdAt" | "lastUploadAt" | "subscriberCount" | "videoCount" | "averageViews") => void;
    filterType: "all" | "video" | "short";
    setFilterType: (type: "all" | "video" | "short") => void;
    dateRange: "all" | "3d" | "7d" | "30d";
    setDateRange: (range: "all" | "3d" | "7d" | "30d") => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;

    videoCache: {
        key: string;
        videos: any[];
        page: number;
        hasMore: boolean;
    };
    setVideoCache: React.Dispatch<React.SetStateAction<{
        key: string;
        videos: any[];
        page: number;
        hasMore: boolean;
    }>>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);

    // Scroll state map
    const [scrollPositions, setScrollPositionsState] = useState<Record<string, number>>({});

    const setScrollPosition = (key: string, pos: number) => {
        setScrollPositionsState(prev => ({ ...prev, [key]: pos }));
    };

    const [currentView, setCurrentView] = useState<'dashboard' | 'downloads'>('dashboard');
    const [currentTab, setCurrentTab] = useState<"channels" | "videos" | "favoriteChannels" | "favoriteVideos" | "analysis">("analysis");

    // Persisted Filters
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
    const [sortOrder, setSortOrder] = useState<"viewCount" | "publishedAt" | "viral" | "vph" | "zScore" | "createdAt" | "lastUploadAt" | "subscriberCount" | "videoCount" | "averageViews">("publishedAt");
    const [filterType, setFilterType] = useState<"all" | "video" | "short">("all");
    const [dateRange, setDateRange] = useState<"all" | "3d" | "7d" | "30d">("all");
    const [searchQuery, setSearchQuery] = useState("");

    const [isActivated, setIsActivated] = useState(false); // Add this state
    const [videoCache, setVideoCache] = useState<{
        key: string;
        videos: any[];
        page: number;
        hasMore: boolean;
    }>({ key: "", videos: [], page: 1, hasMore: true });

    // ... refreshData code ...

    const refreshData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            console.log("[DataContext] Fetching /api/settings...");
            const sRes = await fetch("/api/settings");
            let activeStatus = false; // Renamed to avoid shadowing

            if (sRes.ok) {
                const settings = await sRes.json();
                console.log("[DataContext] Settings loaded. Activation status:", settings.isActivated);
                activeStatus = !!settings.isActivated;
            }

            setIsActivated(activeStatus); // Update state!

            if (!activeStatus) {
                console.warn("[DataContext] Not activated. Skipping content load.");
                setGroups([]);
                setChannels([]);
                // Optionally set a flag in state to show "Activation Needed" UI
            } else {
                console.log("[DataContext] Activated. Fetching content...");

                // CRITICAL: Run migration check BEFORE fetching data to ensure schema matches
                try {
                    await fetch("/api/migrate");
                } catch (migErr) {
                    console.error("[DataContext] Migration check failed:", migErr);
                }

                const [gRes, cRes] = await Promise.all([
                    fetch("/api/groups"),
                    fetch(`/api/channels?sort=${sortOrder}`)
                ]);

                if (gRes.ok) {
                    const groupsData = await gRes.json();
                    if (Array.isArray(groupsData)) {
                        setGroups(groupsData);
                    }
                }
                if (cRes.ok) {
                    const channelsData = await cRes.json();
                    if (Array.isArray(channelsData)) {
                        setChannels(channelsData);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to fetch data", e);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    // Initial fetch
    useEffect(() => {
        refreshData();
    }, []);

    // Re-fetch when sortOrder changes (only for channels sort context)
    useEffect(() => {
        if (sortOrder === 'createdAt' || sortOrder === 'lastUploadAt' || sortOrder === 'viewCount' || sortOrder === 'subscriberCount' || sortOrder === 'videoCount' || sortOrder === 'averageViews') {
            refreshData(true);
        }
    }, [sortOrder]);

    return (
        <DataContext.Provider value={{
            groups,
            channels,
            loading,
            refreshData,
            // Scroll Persistence Maps
            scrollPositions,
            setScrollPosition,

            setGroups,
            setChannels,
            currentView,
            setCurrentView,
            currentTab,
            setCurrentTab,
            selectedGroupId, setSelectedGroupId,
            sortOrder, setSortOrder,
            filterType, setFilterType,
            dateRange, setDateRange,
            searchQuery, setSearchQuery,
            videoCache,
            setVideoCache,
            isActivated, // Add to export
        }}>
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
