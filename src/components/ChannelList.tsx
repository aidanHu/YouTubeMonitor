"use client";

import React from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { ChannelCard } from "@/components/ChannelCard";
import { Channel } from "@/types";

interface ChannelListProps {
    channels: Channel[];
    loading: boolean;
    scrollParent?: HTMLElement | null;
    onDelete: (id: string, name: string) => void;
    onMove: (id: string, name: string, groupId: number | null) => void;
    onTogglePin: (id: string, isPinned: boolean) => void;
    onToggleFavorite: (id: string, isFavorite: boolean) => void;
    onRefresh: (id: string) => void;
}

export function ChannelList({
    channels,
    loading,
    scrollParent,
    onDelete,
    onMove,
    onTogglePin,
    onToggleFavorite,
    onRefresh
}: ChannelListProps) {
    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (channels.length === 0) {
        return (
            <div className="text-center py-20 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                <h3 className="text-zinc-500 font-medium">未找到频道</h3>
                <p className="text-zinc-400 text-sm mt-1">请添加一些频道以开始使用</p>
            </div>
        );
    }

    return (
        <div className="h-full">
            <VirtuosoGrid
                style={{ height: '100%' }}
                data={channels}
                customScrollParent={scrollParent || undefined}
                overscan={200}
                components={{
                    List: React.forwardRef<HTMLDivElement, React.ComponentPropsWithRef<'div'>>(({ style, children, ...props }, ref) => (
                        <div
                            ref={ref}
                            {...props}
                            style={style}
                            className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 md:gap-6 pb-20 items-stretch"
                        >
                            {children}
                        </div>
                    ))
                }}
                itemContent={(index, channel) => (
                    <div className="h-full">
                        <ChannelCard
                            channel={channel}
                            on_delete={(_, __) => onDelete(channel.id, channel.name)}
                            on_move={(_, __, gid) => onMove(channel.id, channel.name, gid)}
                            on_toggle_pin={(_, v) => onTogglePin(channel.id, v)}
                            on_toggle_favorite={(_, v) => onToggleFavorite(channel.id, v)}
                            on_refresh={() => onRefresh(channel.id)}
                        />
                    </div>
                )}
            />
        </div>
    );
}
