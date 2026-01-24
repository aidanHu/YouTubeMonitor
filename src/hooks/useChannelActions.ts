import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from '@tauri-apps/api/event';
import { useData } from "@/context/DataContext";
import { show_alert, show_confirm, show_error, show_success } from "@/lib/dialogs";
import { Group } from "@/types";

export function useChannelActions() {
    const {
        is_activated,
        selected_group_id,
        groups,
        refreshData,
        set_channels
    } = useData();

    const [refreshing, set_refreshing] = useState(false);
    const quotaErrorShownRef = useRef(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Listeners for refresh progress
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let unlisten_complete: (() => void) | undefined;
        let isMounted = true;

        listen('refresh-all-progress', async (event: any) => {
            const payload = event.payload;
            if (payload.status === 'error') {
                const errorMsg = payload.error || "";
                if (errorMsg.includes("403") || errorMsg.includes("quota") || errorMsg.includes("配额")) {
                    if (!quotaErrorShownRef.current) {
                        quotaErrorShownRef.current = true;
                        set_refreshing(false);
                        await show_alert(
                            `YouTube API 配额已耗尽 (Error 403)。\n\n已自动停止后续刷新任务。\n您可以使用备用 API Key，或等待明天配额重置。`,
                            "API 配额超限",
                            "error"
                        );
                    }
                }
            }
        }).then(u => {
            if (!isMounted) u();
            else unlisten = u;
        });

        listen('refresh-all-complete', () => {
            set_refreshing(false);
            refreshData(false);
            setToastMessage("批量刷新完成！");
            setTimeout(() => setToastMessage(null), 3000);
        }).then(u => {
            if (!isMounted) u();
            else unlisten_complete = u;
        });

        return () => {
            isMounted = false;
            if (unlisten) unlisten();
            if (unlisten_complete) unlisten_complete();
        };
    }, [refreshData]);

    const handle_refresh = async (range: '3d' | '7d' | '30d' | '3m' | '6m' | '1y' | 'all') => {
        const dateMap: Record<string, string> = {
            '3d': 'now-3days',
            '7d': 'now-7days',
            '30d': 'now-30days',
            '3m': 'now-3months',
            '6m': 'now-6months',
            '1y': 'now-1year',
            'all': 'all'
        };

        const range_arg = dateMap[range] || 'now-7days';

        if (!is_activated) {
            await show_alert("软件未激活，无法使用刷新功能。\n请前往 [设置 -> 软件激活] 进行激活。", "提示", "warning");
            return;
        }

        const confirmMessage = selected_group_id
            ? (selected_group_id === -1 ? `确定要刷新所有 "未分组" 的频道吗？` : `确定要刷新该分组下的所有频道吗？`)
            : `确定要刷新所有频道吗？`;

        if (await show_confirm(`${confirmMessage}\n时间范围: ${range}`)) {
            set_refreshing(true);
            quotaErrorShownRef.current = false;
            try {
                await invoke('refresh_all_channels', { date_range: range_arg, group_id: selected_group_id });
            } catch (error) {
                console.error("Refresh failed", error);
                await show_error("启动刷新失败");
                set_refreshing(false);
            }
        }
    };

    const handle_delete_channel = async (id: string, name: string) => {
        try {
            const { ask } = await import('@tauri-apps/plugin-dialog');
            const confirmed = await ask(`确定要删除频道 "${name}" 吗？`, {
                title: '确认删除',
                kind: 'warning',
            });

            if (!confirmed) return;

            await invoke('delete_channel', { id });
            refreshData(false);
        } catch (e: any) {
            console.error("Delete channel error:", e);
            const { message } = await import('@tauri-apps/plugin-dialog');
            await message("删除失败: " + (e.message || e), { title: '错误', kind: 'error' });
        }
    };

    const handle_toggle_channel_pin = async (id: string, is_pinned: boolean) => {
        try {
            await invoke('toggle_channel_pin', { id, is_pinned });
            set_channels(prev => {
                const updated = prev.map(c => c.id === id ? { ...c, is_pinned } : c);
                return updated.sort((a, b) => {
                    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                });
            });
        } catch (error) {
            console.error("Failed to toggle channel pin", error);
        }
    };

    const handle_toggle_channel_favorite = async (id: string, is_favorite: boolean) => {
        set_channels(prev => prev.map(c => c.id === id ? { ...c, is_favorite } : c));
        try {
            await invoke('toggle_channel_favorite', { id, is_favorite });
            refreshData(false);
        } catch (e) {
            console.error("Toggle favorite error:", e);
            set_channels(prev => prev.map(c => c.id === id ? { ...c, is_favorite: !is_favorite } : c));
        }
    };

    const handle_add_channels = async (urls: string[], group_id: number | null) => {
        if (!is_activated) {
            await show_alert("软件未激活，无法添加频道。\n请前往 [设置 -> 软件激活] 进行激活。", "提示", "warning");
            return false;
        }

        try {
            interface AddResult {
                url: string;
                status: string;
                message: string;
                channel_name?: string;
            }

            const results = await invoke<AddResult[]>('add_channels', {
                urls,
                group_id: group_id || null
            });

            if (results && Array.isArray(results)) {
                // Logic kept same as page.tsx
                const succeeded = results.filter((r) => r.status === 'success');
                const existing = results.filter((r) => r.status === 'error' && (r.message.includes('exists') || r.message.includes('已存在')));
                const failed = results.filter((r) => r.status === 'error' && !r.message.includes('exists') && !r.message.includes('已存在'));

                let msg = `处理完成: ${results.length} 个请求\n`;
                if (succeeded.length > 0) msg += `\n✅ 成功添加: ${succeeded.length} 个`;
                if (existing.length > 0) msg += `\n⚠️ 已存在: ${existing.length} 个`;
                if (failed.length > 0) msg += `\n❌ 失败: ${failed.length} 个\n`;

                if (failed.length === 0) {
                    await show_success(msg);
                    return true; // Should close modal
                } else {
                    await show_alert(msg, "添加完成 (部分失败)");
                    return false; // Don't close modal so user can retry
                }
            }
            return true;
        } catch (e: any) {
            console.error("Add channels error:", e);
            await show_error(`添加频道失败: ${e.message || e}`);
            return false;
        } finally {
            refreshData(false);
        }
    };

    const handle_move_channel = async (target: { id: string }, group_id: number | null) => {
        try {
            const result = await invoke<{ moved: boolean; message: string }>('move_channel', {
                id: target.id,
                group_id
            });
            if (result.moved) await show_success(result.message);
            await refreshData(false);
            return true;
        } catch (e) {
            console.error("Move channel error:", e);
            await show_error("移动失败");
            return false;
        }
    };

    // Group Actions
    const handle_create_group = async (name: string) => {
        if (!is_activated) {
            await show_alert("软件未激活，无法创建分组。", "提示", "warning");
            return;
        }
        try {
            await invoke('create_group', { name });
            refreshData(false);
        } catch (e: any) {
            const msg = e.toString();
            if (msg.includes("UNIQUE constraint failed")) {
                await show_alert("创建分组失败，分组名已存在，请修改后重新创建", "提示", "warning");
            } else {
                await show_error("创建分组失败");
            }
        }
    };

    const handle_update_group = async (id: number, name: string) => {
        if (!is_activated) {
            await show_alert("软件未激活，无法更新分组。", "提示", "warning");
            return;
        }
        try {
            await invoke('update_group', { id, name, is_pinned: null });
            refreshData(false);
        } catch (e) {
            console.error("Update group error:", e);
        }
    };

    const handle_delete_group = async (id: number) => {
        if (!is_activated) {
            await show_alert("软件未激活，无法删除分组。", "提示", "warning");
            return;
        }
        try {
            await invoke('delete_group', { id });
            // Should be handled by caller to reset selection if needed, 
            // but we can return success status
            refreshData(true);
        } catch (error) {
            console.error("Failed to delete group", error);
        }
    };

    const handle_toggle_group_pin = async (id: number, is_pinned: boolean) => {
        try {
            await invoke('update_group', { id, name: null, is_pinned });
            refreshData(false);
        } catch (e) {
            console.error("Toggle group pin error:", e);
        }
    };

    return {
        refreshing,
        toastMessage,
        setToastMessage,
        handle_refresh,
        handle_delete_channel,
        handle_toggle_channel_pin,
        handle_toggle_channel_favorite,
        handle_add_channels,
        handle_move_channel,
        handle_create_group,
        handle_update_group,
        handle_delete_group,
        handle_toggle_group_pin
    };
}
