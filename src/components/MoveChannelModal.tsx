import { useState, useEffect } from "react";
import { X, Check, Plus } from "lucide-react";
import { Group } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { show_error, show_alert } from "@/lib/dialogs";

interface MoveChannelModalProps {
    is_open: boolean;
    on_close: () => void;
    groups: Group[];
    on_move: (group_id: number | null) => Promise<void>;
    on_group_create?: (name: string) => Promise<Group>;
    channel_name: string; // "Channel Name" or "3 Channels"
    currentGroupId: number | null;
}

export function MoveChannelModal({
    is_open,
    on_close,
    groups,
    on_move,
    on_group_create,
    channel_name,
    currentGroupId,
}: MoveChannelModalProps) {
    const [selectedGroup, set_selected_group] = useState<number | null>(null);
    const [loading, set_loading] = useState(false);
    const [is_creating_group, set_is_creating_group] = useState(false);
    const [newGroupName, set_new_group_name] = useState("");
    const [creatingGroup, set_creating_group] = useState(false);

    useEffect(() => {
        if (is_open) {
            set_selected_group(currentGroupId);
            set_is_creating_group(false);
            set_new_group_name("");
        }
    }, [is_open, currentGroupId]);

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

    const handle_move = async () => {
        // Can move to "All" (null) even if it's already there? No, UI should handle this.
        // If selectedGroup is null, it means "All" (no group).
        if (loading) return;
        set_loading(true);
        await on_move(selectedGroup);
        // Note: The on_move signature in page.tsx might be different, we will adjust props.
        // Actually, let's keep it simple: we pass back the selected Group ID.
        set_loading(false);
        on_close();
    };

    if (!is_open) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-sm max-h-[85vh] flex flex-col overflow-hidden shadow-xl border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                    <h3 className="font-semibold text-lg text-zinc-900 dark:text-zinc-50">
                        移动频道
                    </h3>
                    <button
                        onClick={on_close}
                        className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col p-4 min-h-[300px]">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 flex-none">
                        将 <span className="text-zinc-900 dark:text-zinc-50 font-medium">{channel_name}</span> 移动到:
                    </p>

                    <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1">
                        <button
                            onClick={() => set_selected_group(null)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${selectedGroup === null
                                ? "bg-blue-500 text-white shadow-md shadow-blue-500/20"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                }`}
                        >
                            <span>默认列表 (无分组)</span>
                            {selectedGroup === null && <Check size={16} />}
                        </button>
                        {groups.map((group) => (
                            <button
                                key={group.id}
                                onClick={() => set_selected_group(group.id)}
                                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${selectedGroup === group.id
                                    ? "bg-blue-500 text-white shadow-md shadow-blue-500/20"
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                    }`}
                            >
                                <span>{group.name}</span>
                                {selectedGroup === group.id && <Check size={16} />}
                            </button>
                        ))}
                    </div>

                    <div className="flex-none pt-3 mt-2 border-t border-zinc-100 dark:border-zinc-800/50">
                        {is_creating_group ? (
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                <label className="block text-xs font-medium text-zinc-500 mb-2">新建分组名称</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="flex-1 p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                        value={newGroupName}
                                        onChange={(e) => set_new_group_name(e.target.value)}
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handle_create_group();
                                        }}
                                    />
                                </div>
                                <div className="flex justify-end gap-2 mt-2">
                                    <button
                                        onClick={() => set_is_creating_group(false)}
                                        className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={handle_create_group}
                                        disabled={creatingGroup || !newGroupName.trim()}
                                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                                    >
                                        创建
                                    </button>
                                </div>
                            </div>
                        ) : (
                            on_group_create && (
                                <button
                                    onClick={() => {
                                        set_is_creating_group(true);
                                        set_new_group_name("");
                                    }}
                                    className="w-full flex items-center gap-2 p-3 rounded-xl border-dashed border-2 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-blue-600 hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all justify-center text-sm font-medium"
                                >
                                    <Plus size={16} />
                                    创建新分组
                                </button>
                            )
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
                    <button
                        onClick={on_close}
                        className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handle_move}
                        disabled={loading}
                        className="bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 px-6 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {loading ? "移动中..." : "确定"}
                    </button>
                </div>
            </div>
        </div>
    );
}
