"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Channel, Group } from "@/types";

interface DataContextType {
    groups: Group[];
    channels: Channel[];
    loading: boolean;
    refreshData: (silent?: boolean) => Promise<void>;
    dashboardScrollPosition: number;
    setDashboardScrollPosition: (pos: number) => void;
    setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
    setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
    currentView: 'dashboard' | 'favorites' | 'downloads';
    setCurrentView: (view: 'dashboard' | 'favorites' | 'downloads') => void;
    currentTab: "channels" | "videos" | "favorites" | "analysis";
    setCurrentTab: (tab: "channels" | "videos" | "favorites" | "analysis") => void;
    // Persisted Dashboard State
    selectedGroupId: number | null;
    setSelectedGroupId: (id: number | null) => void;
    sortOrder: "viewCount" | "publishedAt" | "viral" | "vph" | "zScore";
    setSortOrder: (order: "viewCount" | "publishedAt" | "viral" | "vph" | "zScore") => void;
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
    const [dashboardScrollPosition, setDashboardScrollPosition] = useState(0);

    const [currentView, setCurrentView] = useState<'dashboard' | 'favorites' | 'downloads'>('dashboard');
    const [currentTab, setCurrentTab] = useState<"channels" | "videos" | "favorites" | "analysis">("analysis");

    // Persisted Filters
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
    const [sortOrder, setSortOrder] = useState<"viewCount" | "publishedAt" | "viral" | "vph" | "zScore">("publishedAt");
    const [filterType, setFilterType] = useState<"all" | "video" | "short">("all");
    const [dateRange, setDateRange] = useState<"all" | "3d" | "7d" | "30d">("all");
    const [searchQuery, setSearchQuery] = useState("");

    const [videoCache, setVideoCache] = useState<{
        key: string;
        videos: any[];
        page: number;
        hasMore: boolean;
    }>({ key: "", videos: [], page: 1, hasMore: true });

    const refreshData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            console.log("[DataContext] Fetching data...");
            const [gRes, cRes] = await Promise.all([
                fetch("/api/groups"),
                fetch("/api/channels")
            ]);

            if (gRes.ok) {
                const groupsData = await gRes.json();
                if (Array.isArray(groupsData)) {
                    console.log("[DataContext] Groups loaded:", groupsData.length);
                    setGroups(groupsData);
                } else {
                    console.error("[DataContext] Groups API returned non-array:", groupsData);
                }
            }
            if (cRes.ok) {
                const channelsData = await cRes.json();
                if (Array.isArray(channelsData)) {
                    console.log("[DataContext] Channels loaded:", channelsData.length);
                    setChannels(channelsData);
                } else {
                    console.error("[DataContext] Channels API returned non-array:", channelsData);
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

    return (
        <DataContext.Provider value={{
            groups,
            channels,
            loading,
            refreshData,
            dashboardScrollPosition,
            setDashboardScrollPosition,
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
            setVideoCache
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
