"use client";

import { Group } from "@/types";
import { Folder, Plus, Trash2, Settings, LayoutGrid, PlaySquare, Star, Download, Pin } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { SettingsModal } from "./SettingsModal";
import { show_confirm } from "@/lib/dialogs";

interface SidebarProps {
    groups: Group[];
    selected_group_id: number | null;
    activeView?: 'dashboard' | 'downloads';
    on_select_view?: (view: 'dashboard' | 'downloads') => void;
    on_select_group: (id: number | null) => void;
    on_create_group: (name: string) => void;
    on_update_group: (id: number, name: string) => void;
    on_delete_group: (id: number) => void;
    on_toggle_group_pin?: (id: number, is_pinned: boolean) => void;
}

export function Sidebar({
    groups,
    selected_group_id,
    activeView,
    on_select_view,
    on_select_group,
    on_create_group,
    on_update_group,
    on_delete_group,
    on_toggle_group_pin
}: SidebarProps) {
    const [newGroupName, set_new_group_name] = useState("");
    const [is_settings_open, set_is_settings_open] = useState(false);
    const [editingGroupId, set_editing_group_id] = useState<number | null>(null);
    const [editName, set_edit_name] = useState("");

    // Resize State
    const [width, set_width] = useState(260);
    const [is_resizing, set_is_resizing] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);

    const handle_create = () => {
        if (newGroupName.trim()) {
            on_create_group(newGroupName);
            set_new_group_name("");
        }
    };

    const handle_start_edit = (group: Group) => {
        set_editing_group_id(group.id);
        set_edit_name(group.name);
    };

    const handle_save_edit = () => {
        if (editingGroupId && editName.trim() && on_update_group) {
            on_update_group(editingGroupId, editName);
            set_editing_group_id(null);
        }
    };

    // Resize Logic
    useEffect(() => {
        const handle_mouse_move = (e: MouseEvent) => {
            if (!is_resizing) return;
            const newWidth = e.clientX;
            if (newWidth > 260 && newWidth < 600) {
                set_width(newWidth);
            }
        };

        const handle_mouse_up = () => {
            set_is_resizing(false);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto'; // Restore selection
        };

        if (is_resizing) {
            window.addEventListener('mousemove', handle_mouse_move);
            window.addEventListener('mouseup', handle_mouse_up);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none'; // Prevent selection
        }

        return () => {
            window.removeEventListener('mousemove', handle_mouse_move);
            window.removeEventListener('mouseup', handle_mouse_up);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };
    }, [is_resizing]);

    return (
        <div
            ref={sidebarRef}
            className="border-r border-zinc-200 dark:border-zinc-800 h-screen flex flex-col bg-zinc-50 dark:bg-zinc-900 relative shrink-0"
            style={{ width: width, minWidth: 260 }}
        >
            <div className="p-4 pt-12 pb-2 shrink-0" data-tauri-drag-region>
                <h2 className="font-bold text-lg mb-4 px-2 flex justify-between items-center min-w-0">
                    <span className="truncate mr-2">YouTube 订阅管理</span>
                    <button
                        onClick={() => set_is_settings_open(true)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        title="设置"
                    >
                        <Settings size={18} />
                    </button>
                </h2>

                <SettingsModal is_open={is_settings_open} on_close={() => set_is_settings_open(false)} />

                <div className="space-y-1">
                    <button
                        onClick={() => {
                            if (on_select_view) on_select_view('dashboard');
                            if (on_select_group) on_select_group(null);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${activeView === 'dashboard' && selected_group_id === null
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium"
                            : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
                            }`}
                    >
                        <LayoutGrid size={18} />
                        仪表盘
                    </button>

                    <button
                        onClick={() => {
                            if (on_select_view) on_select_view('downloads');
                            if (on_select_group) on_select_group(null);
                        }}
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
                        if (on_select_view) on_select_view('dashboard');
                        on_select_group(-1);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${activeView === 'dashboard' && selected_group_id === -1
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium"
                        : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
                        }`}
                >
                    <Folder size={16} className={selected_group_id === -1 ? "text-blue-500" : "text-zinc-400"} />
                    未分组
                </button>

                {groups.map((group) => (
                    <div key={group.id} className="group/item relative">
                        {editingGroupId === group.id ? (
                            <div className="px-1 py-1">
                                <input
                                    className="w-full bg-white dark:bg-zinc-800 border border-blue-500 rounded-lg px-2 py-1 text-sm outline-none shadow-sm"
                                    value={editName}
                                    onChange={(e) => set_edit_name(e.target.value)}
                                    autoFocus
                                    onBlur={handle_save_edit}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handle_save_edit();
                                        if (e.key === "Escape") set_editing_group_id(null);
                                    }}
                                />
                            </div>
                        ) : (
                            <>
                                <button
                                    onClick={() => {
                                        if (on_select_view) on_select_view('dashboard');
                                        on_select_group(group.id);
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors pr-8 overflow-hidden ${activeView === 'dashboard' && selected_group_id === group.id
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium"
                                        : "hover:bg-zinc-200 dark:hover:bg-zinc-800"
                                        }`}
                                    title={group.name}
                                >
                                    <div className="relative shrink-0">
                                        <Folder size={16} />
                                        {group.is_pinned && (
                                            <div className="absolute -top-1.5 -right-1.5 z-10">
                                                <div className="bg-blue-500 text-white p-0.5 rounded shadow-sm ring-1 ring-white dark:ring-zinc-900">
                                                    <Pin size={8} fill="currentColor" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <span className="truncate">{group.name}</span>
                                </button>

                                {/* Group Actions */}
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity z-10">
                                    {on_toggle_group_pin && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                on_toggle_group_pin(group.id, !group.is_pinned);
                                            }}
                                            className={`p-1.5 rounded-md transition-colors shadow-sm border ${group.is_pinned
                                                ? "bg-blue-500/10 text-blue-600 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-900/50"
                                                : "bg-white dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-blue-500 hover:border-blue-300"
                                                }`}
                                            title={group.is_pinned ? "取消置顶" : "置顶分组"}
                                        >
                                            <Pin size={12} className={group.is_pinned ? "fill-current" : ""} />
                                        </button>
                                    )}

                                    <div className="flex items-center gap-0.5 bg-zinc-50 dark:bg-zinc-900 shadow-sm rounded-md border border-zinc-200 dark:border-zinc-800">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handle_start_edit(group);
                                            }}
                                            className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 rounded-l"
                                            title="重命名"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        </button>
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (await show_confirm(`确定删除分组 "${group.name}" 吗？`) && on_delete_group) {
                                                    on_delete_group(group.id);
                                                }
                                            }}
                                            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-r text-zinc-400 hover:text-red-500"
                                            title="删除"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer Input (Fixed) */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0 overflow-hidden">
                <div className="flex items-center gap-2">
                    <input
                        className="min-w-0 flex-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="新建分组"
                        value={newGroupName}
                        onChange={(e) => set_new_group_name(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handle_create()}
                    />
                    <button
                        onClick={handle_create}
                        className="shrink-0 p-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md hover:opacity-90 transition-opacity"
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
                    set_is_resizing(true);
                }}
            />
        </div>
    );
}
