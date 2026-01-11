"use client";

import { Group } from "@/types";
import { Plus, Check, X } from "lucide-react";
import { useState } from "react";

interface AddChannelModalProps {
    groups: Group[];
    isOpen: boolean;
    onClose: () => void;
    onAdd: (urls: string[], groupId: number | null) => Promise<void>;
    onGroupCreate?: (name: string) => Promise<Group>;
}

export function AddChannelModal({
    groups,
    isOpen,
    onClose,
    onAdd,
    onGroupCreate,
}: AddChannelModalProps) {
    const [text, setText] = useState("");
    const [selectedGroup, setSelectedGroup] = useState<number | "">("");
    const [loading, setLoading] = useState(false);
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [creatingGroup, setCreatingGroup] = useState(false);

    const handleCreateGroup = async () => {
        if (!newGroupName.trim() || !onGroupCreate) return;
        setCreatingGroup(true);
        try {
            const newGroup = await onGroupCreate(newGroupName);
            setSelectedGroup(newGroup.id);
            setIsCreatingGroup(false);
        } catch (e) {
            console.error(e);
            alert("创建分组失败");
        } finally {
            setCreatingGroup(false);
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async () => {
        const urls = text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (urls.length === 0) return;

        setLoading(true);
        await onAdd(urls, selectedGroup === "" ? null : (selectedGroup as number));
        setLoading(false);
        setText("");
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center p-4 border-b border-zinc-100 dark:border-zinc-800">
                    <h3 className="text-lg font-bold">添加频道</h3>
                    <button
                        onClick={onClose}
                        className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase text-zinc-500 mb-1">
                            频道链接 (每行一个)
                        </label>
                        <textarea
                            className="w-full h-32 p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                            placeholder="https://www.youtube.com/@channel1&#10;https://www.youtube.com/channel/..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase text-zinc-500 mb-1">
                            分配分组
                        </label>
                        <div className="space-y-2">
                            {isCreatingGroup ? (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="输入新分组名称"
                                        className="flex-1 p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                        value={newGroupName}
                                        onChange={(e) => setNewGroupName(e.target.value)}
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleCreateGroup();
                                        }}
                                    />
                                    <button
                                        onClick={handleCreateGroup}
                                        disabled={creatingGroup || !newGroupName.trim()}
                                        className="px-3 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 text-sm font-medium"
                                    >
                                        确定
                                    </button>
                                    <button
                                        onClick={() => setIsCreatingGroup(false)}
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
                                            setSelectedGroup(
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
                                    {onGroupCreate && (
                                        <button
                                            onClick={() => {
                                                setIsCreatingGroup(true);
                                                setNewGroupName("");
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
                </div>

                <div className="p-4 flex justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || text.trim().length === 0}
                        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                    >
                        {loading ? "添加中..." : "添加频道"}
                    </button>
                </div>
            </div>
        </div>
    );
}
