"use client";

import { Group } from "@/types";
import { Plus, Check, X, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { show_error, show_alert } from "@/lib/dialogs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface ProgressEvent {
    current: number;
    total: number;
    url: string;
    status: string;
    message: string;
}

interface AddChannelModalProps {
    groups: Group[];
    is_open: boolean;
    on_close: () => void;
    on_add: (urls: string[], group_id: number | null) => Promise<void>;
    on_group_create?: (name: string) => Promise<Group>;
}

export function AddChannelModal({
    groups,
    is_open,
    on_close,
    on_add,
    on_group_create,
}: AddChannelModalProps) {
    const [text, set_text] = useState("");
    const [selectedGroup, set_selected_group] = useState<number | "">("");
    const [loading, set_loading] = useState(false);
    const [is_creating_group, set_is_creating_group] = useState(false);
    const [newGroupName, set_new_group_name] = useState("");

    const [creatingGroup, set_creating_group] = useState(false);
    const [progress, set_progress] = useState<ProgressEvent | null>(null);

    useEffect(() => {
        let unlisten: (() => void) | undefined;

        async function setup() {
            unlisten = await listen<ProgressEvent>("add-channel-progress", (event) => {
                set_progress(event.payload);
            });
        }

        if (is_open) {
            setup();
        }

        return () => {
            if (unlisten) unlisten();
        };
    }, [is_open]);

    const handle_cancel = async () => {
        try {
            await invoke("cancel_add_channels");
        } catch (error) {
            console.error("Failed to cancel:", error);
        }
    };

    const handle_modal_close = () => {
        if (loading) {
            handle_cancel();
        }
        on_close();
    };

    const handle_create_group = async () => {
        if (!newGroupName.trim() || !on_group_create) return;
        set_creating_group(true);
        try {
            const newGroup = await on_group_create(newGroupName);
            set_selected_group(newGroup.id);
            set_is_creating_group(false);
        } catch (e: any) {
            const msg = e.message || "创建分组失败";
            if (msg.includes("分组名已存在")) {
                await show_alert(msg, "提示", "warning");
            } else {
                console.error(e);
                await show_error(msg);
            }
        } finally {
            set_creating_group(false);
        }
    };

    if (!is_open) return null;

    const handle_submit = async () => {
        const urls = text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (urls.length === 0) return;

        set_loading(true);
        set_progress(null);
        try {
            await on_add(urls, selectedGroup === "" ? null : (selectedGroup as number));
        } finally {
            set_loading(false);
            set_progress(null);
            set_text("");
            on_close();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center p-4 border-b border-zinc-100 dark:border-zinc-800">
                    <h3 className="text-lg font-bold">添加频道</h3>
                    <button
                        onClick={on_close}
                        className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                        <X size={20} />
                    </button>
                </div>



                <div className="p-4 space-y-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-8 space-y-4">
                            {progress ? (
                                <>
                                    <div className="w-full max-w-sm space-y-2">
                                        <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
                                            <span>添加中... ({progress.current}/{progress.total})</span>
                                            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                                        </div>
                                        <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-600 transition-all duration-300 ease-out"
                                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="text-center space-y-1">
                                        <p className="text-sm font-medium truncate max-w-sm px-4">
                                            {progress.url}
                                        </p>
                                        <p className={`text-xs ${progress.status === 'error' ? 'text-red-500' : 'text-zinc-500'}`}>
                                            {progress.message}
                                        </p>
                                    </div>

                                    {/* Cancel button removed as per request, using footer cancel instead */}
                                </>
                            ) : (
                                <div className="flex flex-col items-center text-zinc-500">
                                    <Loader2 className="animate-spin mb-2" size={24} />
                                    <span className="text-sm">准备中...</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-xs font-semibold uppercase text-zinc-500 mb-1">
                                    频道链接 (每行一个)
                                </label>
                                <textarea
                                    className="w-full h-32 p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                                    placeholder="https://www.youtube.com/@channel1&#10;https://www.youtube.com/channel/..."
                                    value={text}
                                    onChange={(e) => set_text(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold uppercase text-zinc-500 mb-1">
                                    分配分组
                                </label>
                                <div className="space-y-2">
                                    {is_creating_group ? (
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="输入新分组名称"
                                                className="flex-1 p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                                value={newGroupName}
                                                onChange={(e) => set_new_group_name(e.target.value)}
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handle_create_group();
                                                }}
                                            />
                                            <button
                                                onClick={handle_create_group}
                                                disabled={creatingGroup || !newGroupName.trim()}
                                                className="px-3 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 text-sm font-medium"
                                            >
                                                确定
                                            </button>
                                            <button
                                                onClick={() => set_is_creating_group(false)}
                                                className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg text-sm font-medium"
                                            >
                                                取消
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <select
                                                className="flex-1 p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none"
                                                value={selectedGroup}
                                                onChange={(e) =>
                                                    set_selected_group(
                                                        e.target.value === "" ? "" : parseInt(e.target.value)
                                                    )
                                                }
                                            >
                                                <option value="">无分组 (未分类)</option>
                                                {groups.map((g) => (
                                                    <option key={g.id} value={g.id}>
                                                        {g.name}
                                                    </option>
                                                ))}
                                            </select>
                                            {on_group_create && (
                                                <button
                                                    onClick={() => {
                                                        set_is_creating_group(true);
                                                        set_new_group_name("");
                                                    }}
                                                    className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                                    title="创建新分组"
                                                >
                                                    <Plus size={18} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-4 flex justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                        onClick={handle_modal_close}
                        className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                    >
                        取消
                    </button>
                    <button
                        onClick={handle_submit}
                        disabled={loading || text.trim().length === 0}
                        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                    >
                        {loading ? "添加中..." : "添加频道"}
                    </button>
                </div>
            </div>
        </div >
    );
}
