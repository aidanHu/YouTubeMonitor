"use client";

import { Group } from "@/types";
import { Folder, Plus, Trash2, Settings, LayoutGrid, PlaySquare, Star, Download } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { SettingsModal } from "./SettingsModal";

interface SidebarProps {
    groups: Group[];
    selectedGroupId: number | null;
    activeView?: 'dashboard' | 'downloads';
    onSelectView?: (view: 'dashboard' | 'downloads') => void;
    onSelectGroup: (id: number | null) => void;
    onCreateGroup: (name: string) => void;
    onUpdateGroup: (id: number, name: string) => void;
    onDeleteGroup: (id: number) => void;
    onToggleGroupPin?: (id: number, isPinned: boolean) => void;
}

export function Sidebar({
    groups,
    selectedGroupId,
    activeView,
    onSelectView,
    onSelectGroup,
    onCreateGroup,
    onUpdateGroup,
    onDeleteGroup,
    onToggleGroupPin
}: SidebarProps) {
    const [newGroupName, setNewGroupName] = useState("");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");

    // Resize State
    const [width, setWidth] = useState(256);
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    const handleCreate = () => {
        if (newGroupName.trim()) {
            onCreateGroup(newGroupName);
            setNewGroupName("");
        }
    };

    const handleStartEdit = (group: Group) => {
        setEditingGroupId(group.id);
        setEditName(group.name);
    };

    const handleSaveEdit = () => {
        if (editingGroupId && editName.trim() && onUpdateGroup) {
            onUpdateGroup(editingGroupId, editName);
            setEditingGroupId(null);
        }
    };

    // Resize Logic
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = e.clientX;
            if (newWidth > 180 && newWidth < 600) {
                setWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto'; // Restore selection
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none'; // Prevent selection
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };
    }, [isResizing]);

    return (
        <div
            ref={sidebarRef}
            className="border-r border-zinc-200 dark:border-zinc-800 h-screen flex flex-col bg-zinc-50 dark:bg-zinc-900 relative shrink-0"
            style={{ width: width }}
        >
            {/* Header Section (Fixed) */}
            <div className="p-4 pb-2 shrink-0">
                <h2 className="font-bold text-xl mb-4 px-2 flex justify-between items-center">
                    YouTube 监控
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        title="设置"
                    >
                        <Settings size={18} />
                    </button>
                </h2>

                <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

                <div className="space-y-1">
                    <button
                        onClick={() => {
                            if (onSelectView) onSelectView('dashboard');
                            if (onSelectGroup) onSelectGroup(null);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${activeView === 'dashboard' && selectedGroupId === null
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium"
                            : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
                            }`}
                    >
                        <LayoutGrid size={18} />
                        仪表盘
                    </button>

                    <button
                        onClick={() => onSelectView && onSelectView('downloads')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${activeView === 'downloads'
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium"
                            : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
                            }`}
                    >
                        <Download size={18} />
                        下载管理
                    </button>
                </div>
            </div>

            {/* Groups Header (Fixed) */}
            <div className="px-6 py-2 text-xs font-semibold text-zinc-500 uppercase shrink-0">
                分组
            </div>

            {/* Scrollable Groups List */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-1 px-4 custom-scrollbar">
                <button
                    onClick={() => {
                        if (onSelectView) onSelectView('dashboard');
                        onSelectGroup(-1);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${activeView === 'dashboard' && selectedGroupId === -1
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium"
                        : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        }`}
                >
                    <Folder size={16} className={selectedGroupId === -1 ? "text-blue-500" : "text-zinc-400"} />
                    未分组
                </button>

                {groups.map((group) => (
                    <div key={group.id} className="group/item relative">
                        {editingGroupId === group.id ? (
                            <div className="px-1 py-1">
                                <input
                                    className="w-full bg-white dark:bg-zinc-800 border border-blue-500 rounded-lg px-2 py-1 text-sm outline-none shadow-sm"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    autoFocus
                                    onBlur={handleSaveEdit}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveEdit();
                                        if (e.key === "Escape") setEditingGroupId(null);
                                    }}
                                />
                            </div>
                        ) : (
                            <>
                                <button
                                    onClick={() => {
                                        if (onSelectView) onSelectView('dashboard');
                                        onSelectGroup(group.id);
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors pr-8 overflow-hidden ${activeView === 'dashboard' && selectedGroupId === group.id
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium"
                                        : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
                                        }`}
                                    title={group.name}
                                >
                                    <div className="relative shrink-0">
                                        <Folder size={16} />
                                        {group.isPinned && (
                                            <div className="absolute -top-1 -right-1">
                                                <div className="w-2 h-2 bg-blue-500 rounded-full border-2 border-white dark:border-zinc-900"></div>
                                            </div>
                                        )}
                                    </div>
                                    <span className="truncate">{group.name}</span>
                                </button>

                                {/* Group Actions */}
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity bg-zinc-50 dark:bg-zinc-900 shadow-sm rounded-md border border-zinc-200 dark:border-zinc-800 z-10">
                                    {onToggleGroupPin && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleGroupPin(group.id, !group.isPinned);
                                            }}
                                            className={`p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-l ${group.isPinned ? "text-blue-500" : "text-zinc-400"}`}
                                            title={group.isPinned ? "取消置顶" : "置顶分组"}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill={group.isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleStartEdit(group);
                                        }}
                                        className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400"
                                        title="重命名"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`确定删除分组 "${group.name}" 吗？`) && onDeleteGroup) {
                                                onDeleteGroup(group.id);
                                            }
                                        }}
                                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-r text-zinc-400 hover:text-red-500"
                                        title="删除"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer Input (Fixed) */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
                <div className="flex gap-2">
                    <input
                        className="flex-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="新建分组"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    />
                    <button
                        onClick={handleCreate}
                        className="p-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md hover:opacity-90 transition-opacity"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {/* Resize Handle - Increased hit area */}
            <div
                className="absolute right-0 top-0 w-2 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-50 transform translate-x-1/2"
                onMouseDown={(e) => {
                    e.preventDefault(); // Prevent text selection
                    setIsResizing(true);
                }}
            />
        </div>
    );
}
