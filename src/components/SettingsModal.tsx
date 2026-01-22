import { useState, useEffect, useRef } from "react";
import { save } from '@tauri-apps/plugin-dialog';
import { X, Folder, Save, Key, Trash2, Plus, Check, Info, RefreshCw, Database, Upload, Download as DownloadIcon, Globe, FolderInput, Copy, Lock, Youtube, Edit2, CheckCircle2, XCircle, Power, Loader2 } from "lucide-react";
import { useData } from "@/context/DataContext";
import { invoke } from "@tauri-apps/api/core";

interface SettingsModalProps {
    is_open: boolean;
    on_close: () => void;
}

import { useDownloads } from "@/context/DownloadContext";

import { get_machine_id } from "@/lib/activation";
import { show_alert, show_confirm, show_error, show_success } from "@/lib/dialogs";

export function SettingsModal({ is_open, on_close }: SettingsModalProps) {
    const { refreshData, is_activated, license_status } = useData();
    // const { restoreHistory } = useDownloads(); // Removed

    // Tabs configuration
    const tabs = [
        { id: "general", label: "常规设置", icon: Globe },
        { id: "api", label: "API 配置", icon: Youtube },
        { id: "data", label: "数据管理", icon: Database },
        { id: "activation", label: "软件激活", icon: Check }
    ] as const;

    const [active_tab, set_active_tab] = useState<string>("general");
    const [download_path, set_download_path] = useState("");
    const [proxy_url, set_proxy_url] = useState("");
    const [cookie_source, set_cookie_source] = useState("none");
    const [show_cookie_input, set_show_cookie_input] = useState(false);
    const [max_concurrent_downloads, set_max_concurrent_downloads] = useState(3);

    const [is_machine_id_copied, set_is_machine_id_copied] = useState(false);

    // Activation State
    const [activation_code, set_activation_code] = useState("");
    const [machineId, set_machine_id] = useState("loading...");
    // Local state removed, using Context




    const [loading, set_loading] = useState(false);
    const [saving, set_saving] = useState(false);
    const [migrating, set_migrating] = useState(false);
    const [activating, set_activating] = useState(false);


    // ... API Keys State ...
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface ApiKey {
        id: number;
        key: string;
        name: string | null;
        is_active: boolean;
        usage_today: number;
        last_used: string;
        created_at: string;
    }
    const [apiKeys, set_api_keys] = useState<ApiKey[]>([]);
    const [loadingKeys, set_loading_keys] = useState(false);
    const [newKey, set_new_key] = useState("");
    const [newName, set_new_name] = useState("");
    const [is_adding_key, set_is_adding_key] = useState(false);
    const [editingKeyId, set_editing_key_id] = useState<number | null>(null);
    const [editNameBuffer, set_edit_name_buffer] = useState("");

    const fetch_api_keys = async () => {
        set_loading_keys(true);
        try {
            const keys = await invoke<ApiKey[]>('get_api_keys');
            set_api_keys(keys);
        } catch (e: any) {
            await show_error("加载 API Key 失败: " + e);
        } finally {
            set_loading_keys(false);
        }
    };

    useEffect(() => {
        if (active_tab === 'api') fetch_api_keys();
    }, [active_tab]);

    const handle_add_api_key = async () => {
        if (!newKey.trim()) return;
        set_loading_keys(true);
        try {
            await invoke('add_api_key', { key: newKey.trim(), name: newName.trim() || null });
            await show_success("API Key 添加成功");
            set_new_key("");
            set_new_name("");
            set_is_adding_key(false);
            fetch_api_keys();
        } catch (e: any) {
            await show_error("添加失败: " + e);
        } finally {
            set_loading_keys(false);
        }
    };

    const handle_delete_api_key = async (id: number) => {
        if (!await show_confirm("确定要删除此 API Key 吗？", "删除确认")) return;
        set_loading_keys(true);
        try {
            await invoke('delete_api_key', { id });
            fetch_api_keys();
        } catch (e: any) {
            await show_error("删除失败: " + e);
        } finally {
            set_loading_keys(false);
        }
    };

    const handle_update_api_key = async (id: number, name: string | null, is_active: boolean | null) => {
        try {
            await invoke('update_api_key', { id, name, is_active });
            fetch_api_keys();
            set_editing_key_id(null);
        } catch (e: any) {
            await show_error("更新失败: " + e);
        }
    };

    useEffect(() => {
        if (is_open) {
            fetch_settings();
        }
    }, [is_open]);

    interface AppSettings {
        id: number;
        proxy_url: string | null;
        theme: string | null;
        cookie_source: string | null;
        download_path: string | null;
        max_concurrent_downloads?: number;
        activation_code?: string | null;
    }

    const fetch_settings = async () => {
        set_loading(true);
        try {
            // Fetch Machine ID
            const mid = await get_machine_id();
            set_machine_id(mid);

            // Fetch Settings from DB
            const data = await invoke<AppSettings | null>('get_settings');

            if (data) {
                if (data.proxy_url) set_proxy_url(data.proxy_url);
                if (data.cookie_source) set_cookie_source(data.cookie_source);
                if (data.download_path) set_download_path(data.download_path);
                if (data.max_concurrent_downloads) set_max_concurrent_downloads(data.max_concurrent_downloads);
                // Activation handled by Context
            }

        } catch (e) {
            console.error("Failed to load settings", e);
        } finally {
            set_loading(false);
        }
    };


    const handle_save_settings = async () => {
        set_saving(true);
        console.log("Saving Settings - State:", { proxy_url, cookie_source, download_path, max_concurrent_downloads });
        try {
            await invoke('save_settings', {
                proxy_url: proxy_url || null,
                theme: null,
                cookie_source: cookie_source,
                download_path: download_path || null,
                max_concurrent_downloads: max_concurrent_downloads
            });
            await show_success("设置已保存");

            fetch_settings();
            refreshData();
        } catch (e: any) {
            await show_error("保存失败: " + e);
        } finally {
            set_saving(false);
        }
    };

    const handle_activate = async () => {
        if (!activation_code.trim()) return;
        set_activating(true);
        try {
            await invoke('activate_software', { code: activation_code.trim() });
            await show_success("激活成功！感谢您的支持。");
            refreshData(); // Notify context
        } catch (e: any) {
            await show_error("激活失败: " + (typeof e === 'string' ? e : "激活码无效"));
        } finally {
            set_activating(false);
        }
    };


    // Data Backup Handlers
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handle_export = async () => {
        try {
            const date = new Date().toISOString().split("T")[0];
            const defaultFilename = `youtube-monitor-backup-${date}.json`;

            const path = await save({
                defaultPath: defaultFilename,
                filters: [{
                    name: 'JSON Backup',
                    extensions: ['json']
                }]
            });

            if (!path) return; // User cancelled

            await invoke('export_backup_to_file', { path });
            await show_success(`备份已成功导出到: ${path}`);
        } catch (e) {
            console.error(e);
            await show_error("导出失败: " + e);
        }
    };

    const handle_import = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!await show_confirm("警告：恢复备份将覆盖当前所有数据！\n确定要继续吗？", "警告")) {
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = event.target?.result;
                if (!json) return;

                set_loading(true);

                try {
                    const data = JSON.parse(json as string);
                    await invoke('import_backup', { data });
                    await show_success("恢复成功！应用将重新加载。");
                    window.location.reload();
                } catch (e: any) {
                    await show_error("恢复失败: " + e);
                }
            } catch (error) {
                console.error(error);
                await show_error("文件解析失败");
            } finally {
                set_loading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsText(file);
    };


    const handle_migrate = async () => {
        if (!await show_confirm("确定要整理现在的下载目录吗？\n这将把所有已下载的视频移动到 '分组/频道' 的文件夹结构中。")) return;

        set_migrating(true);
        try {
            const data: any = await invoke('migrate_files');

            await show_success(`整理完成！\n\n已移动文件夹: ${data.moved_folders || 0}\n错误: ${data.errors || 0}`);
        } catch (e: any) {
            await show_error("整理失败: " + e);
        } finally {
            set_migrating(false);
        }
    };

    // Force activation tab if not activated
    useEffect(() => {
        if (is_open && !is_activated && active_tab !== "activation") {
            set_active_tab("activation");
        }
    }, [is_open, is_activated]);

    const handle_clear_data = async () => {
        if (!await show_confirm("警告:此操作将清空所有数据!\n\n包括:\n• 所有视频、频道、分组\n• 所有 API 密钥\n• 所有设置(下载路径、代理、Cookie等)\n\n仅保留:激活信息\n\n此操作不可撤销,确定要继续吗?", "警告")) return;
        if (!await show_confirm("再次确认:真的要清空所有数据吗?", "最后确认")) return;

        set_loading(true);
        try {
            await invoke('clear_all_data');
            await show_success("数据已清空。应用将重新加载。");
            window.location.reload();
        } catch (e: any) {
            await show_error("清空数据失败: " + e);
        } finally {
            set_loading(false);
        }
    };

    if (!is_open) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-2xl shadow-2xl ring-1 ring-zinc-200 dark:ring-zinc-800 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                    <h2 className="text-xl font-bold">系统设置</h2>
                    <button onClick={on_close} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={20} className="text-zinc-500" />
                    </button>
                </div>

                <div className="flex border-b border-zinc-100 dark:border-zinc-800 px-6 shrink-0 space-x-2">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const is_active = active_tab === tab.id;
                        const is_disabled = !is_activated && tab.id !== "activation";

                        return (
                            <button
                                key={tab.id}
                                onClick={() => !is_disabled && set_active_tab(tab.id)}
                                disabled={is_disabled}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${is_active
                                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                    : is_disabled
                                        ? "border-transparent text-zinc-300 cursor-not-allowed"
                                        : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                    }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                                {is_disabled && <Lock size={12} className="opacity-50" />}
                            </button>
                        );
                    })}
                </div>


                <div className="p-6 overflow-y-auto flex-1">
                    {active_tab === "general" && (
                        <div className="space-y-6">
                            {/* Download Path */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                                    <Folder size={16} />
                                    视频下载路径
                                </label>
                                <input
                                    type="text"
                                    value={download_path}
                                    onChange={(e) => set_download_path(e.target.value)}
                                    placeholder="/Users/username/Downloads/YouTube"
                                    className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-zinc-400"
                                />
                                <p className="text-xs text-zinc-500">
                                    视频将按照 <code>路径/频道名/标题.mp4</code> 格式保存。
                                </p>
                            </div>

                            {/* Max Concurrent Downloads */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                                    <DownloadIcon size={16} />
                                    同时下载任务数
                                </label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="1"
                                        max="10"
                                        step="1"
                                        value={max_concurrent_downloads}
                                        onChange={(e) => set_max_concurrent_downloads(parseInt(e.target.value))}
                                        className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <span className="text-sm font-bold w-6">{max_concurrent_downloads}</span>
                                </div>
                                <p className="text-xs text-zinc-500">
                                    推荐设置为 3。设置过多可能导致系统卡顿或被 YouTube 封锁。
                                </p>
                            </div>

                            {/* Proxy Settings */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                                    <Globe size={16} />
                                    网络代理 (HTTP/HTTPS)
                                </label>
                                <input
                                    type="text"
                                    value={proxy_url}
                                    onChange={(e) => set_proxy_url(e.target.value)}
                                    placeholder="http://127.0.0.1:7890"
                                    className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-zinc-400"
                                />
                                <p className="text-xs text-zinc-500">
                                    如果无法连接 YouTube，请配置代理地址。留空则不使用代理。
                                </p>
                            </div>

                            {/* Cookie Settings */}
                            <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                <h3 className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                    <div className="p-1.5 bg-yellow-100 text-yellow-600 rounded-lg dark:bg-yellow-900/30">
                                        <Key size={14} />
                                    </div>
                                    Cookie 设置 (解决 "Sign in" 报错)
                                </h3>

                                <div className="space-y-3">
                                    <label className="text-sm text-zinc-600 dark:text-zinc-400">Cookie 来源</label>
                                    <select
                                        value={cookie_source.startsWith('/') || cookie_source.includes('\\') || (cookie_source !== 'none' && cookie_source !== '') ? 'file' : 'none'}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === 'file') {
                                                // If switching to file mode but no path set, clear it to show input
                                                if (cookie_source === 'none') set_cookie_source('');
                                            } else {
                                                set_cookie_source('none');
                                            }
                                            set_show_cookie_input(val === 'file');
                                        }}
                                        className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                                    >
                                        <option value="none">不使用 Cookie (默认)</option>
                                        <option value="file">使用 cookies.txt 文件...</option>
                                    </select>

                                    {(show_cookie_input || cookie_source.startsWith('/') || cookie_source.includes('\\')) && (
                                        <div className="animate-in fade-in slide-in-from-top-2">
                                            <input
                                                type="text"
                                                value={cookie_source}
                                                onChange={(e) => set_cookie_source(e.target.value)}
                                                placeholder="/path/to/cookies.txt"
                                                className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-zinc-400 font-mono text-sm"
                                            />
                                            <p className="text-xs text-zinc-500 mt-1">
                                                请使用 <a href="https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies" target="_blank" className="text-blue-500 hover:underline">Netscape 格式</a> 的 cookies 文件路径。
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* yt-dlp Guide */}
                            {/* yt-dlp Configuration - Hidden as it is now packaged */}
                            {/* 
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-sm text-blue-800 dark:text-blue-200 space-y-2">
                                <h3 className="font-bold flex items-center gap-2">
                                    <Info size={16} />
                                    Internal Components
                                </h3>
                                <p className="text-xs opacity-80">System dependencies are packaged internally.</p>
                            </div> 
                            */}

                            <div className="flex justify-end pt-4">
                                <button
                                    onClick={handle_save_settings}
                                    disabled={saving}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {saving ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Save size={16} />
                                    )}
                                    保存常规配置
                                </button>
                            </div>
                        </div>
                    )}

                    {active_tab === "api" && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200">API Keys 管理</h3>
                                <button
                                    onClick={() => set_is_adding_key(true)}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1 transition-colors"
                                >
                                    <Plus size={16} />
                                    添加 Key
                                </button>
                            </div>

                            {is_adding_key && (
                                <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            value={newKey}
                                            onChange={(e) => set_new_key(e.target.value)}
                                            placeholder="YouTube Data API Key (e.g. AIzaSy...)"
                                            className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={(e) => set_new_name(e.target.value)}
                                            placeholder="备注名称 (可选)"
                                            className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => set_is_adding_key(false)}
                                            className="px-3 py-1.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm"
                                        >
                                            取消
                                        </button>
                                        <button
                                            onClick={handle_add_api_key}
                                            disabled={!newKey.trim() || loadingKeys}
                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-1"
                                        >
                                            {loadingKeys ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                            保存
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                {apiKeys.map(key => (
                                    <div key={key.id} className={`p-4 rounded-xl border ${key.is_active ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900' : 'border-red-200 bg-red-50 dark:bg-red-900/10'} transition-all flex flex-col md:flex-row gap-4 items-start md:items-center justify-between group`}>
                                        <div className="flex-1 min-w-0 md:flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                {editingKeyId === key.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            value={editNameBuffer}
                                                            onChange={(e) => set_edit_name_buffer(e.target.value)}
                                                            className="px-2 py-1 rounded border border-blue-300 dark:border-blue-700 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-zinc-900"
                                                            autoFocus
                                                        />
                                                        <button onClick={() => handle_update_api_key(key.id, editNameBuffer, null)} className="p-1 hover:bg-green-100 text-green-600 rounded"><Check size={14} /></button>
                                                        <button onClick={() => set_editing_key_id(null)} className="p-1 hover:bg-zinc-100 text-zinc-500 rounded"><X size={14} /></button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                                                            {key.name || "未命名 Key"}
                                                        </span>
                                                        <button
                                                            onClick={() => { set_editing_key_id(key.id); set_edit_name_buffer(key.name || ""); }}
                                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-400 transition-opacity"
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                    </>
                                                )}
                                                {!key.is_active && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded uppercase">Disabled</span>}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                                                <Key size={12} />
                                                {key.key.length > 10 ? `${key.key.substring(0, 6)}...${key.key.substring(key.key.length - 4)}` : key.key}
                                                <button
                                                    onClick={() => navigator.clipboard.writeText(key.key)}
                                                    className="hover:text-blue-500"
                                                    title="复制完整 Key"
                                                >
                                                    <Copy size={10} />
                                                </button>
                                                <span className="mx-1">•</span>
                                                <span title="Last Used">最近使用: {new Date(key.last_used).toLocaleDateString()}</span>
                                                <span className="mx-1">•</span>
                                                <span className="text-blue-600 dark:text-blue-400 font-bold" title="Today's Usage">今日使用: {key.usage_today} 次</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-end md:self-auto">
                                            <button
                                                onClick={() => handle_update_api_key(key.id, null, !key.is_active)}
                                                title={key.is_active ? "禁用此 Key" : "启用此 Key"}
                                                className={`p-2 rounded-lg transition-colors ${key.is_active
                                                    ? "text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                    : "text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"}`}
                                            >
                                                <Power size={18} />
                                            </button>
                                            <button
                                                onClick={() => handle_delete_api_key(key.id)}
                                                className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                title="删除 Key"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {apiKeys.length === 0 && !loadingKeys && (
                                    <div className="text-center py-8 text-zinc-400 text-sm border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                                        暂无 API Key，请点击右上角添加
                                    </div>
                                )}
                            </div>
                        </div>
                    )}


                    {active_tab === "data" && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-sm text-blue-800 dark:text-blue-200">
                                <h3 className="font-bold flex items-center gap-2 mb-2">
                                    <Info size={16} />
                                    数据管理说明
                                </h3>
                                <p>您可以导出当前的所有数据（分组、频道、视频、设置）作为 JSON 文件进行备份。</p>
                                <p className="mt-1 font-bold text-red-600 dark:text-red-400">注意：导入备份将会覆盖当前的全部数据，请谨慎操作！</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Export */}
                                <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3 bg-white dark:bg-zinc-900">
                                    <div className="flex items-center gap-3 text-zinc-900 dark:text-zinc-100 font-medium">
                                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg">
                                            <DownloadIcon size={20} />
                                        </div>
                                        数据备份
                                    </div>
                                    <p className="text-xs text-zinc-500 min-h-[40px]">
                                        生成并下载包含所有应用数据的 JSON 备份文件。
                                    </p>
                                    <button
                                        onClick={handle_export}
                                        className="w-full py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                                    >
                                        导出备份
                                    </button>
                                </div>

                                {/* Import */}
                                <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3 bg-white dark:bg-zinc-900">
                                    <div className="flex items-center gap-3 text-zinc-900 dark:text-zinc-100 font-medium">
                                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-lg">
                                            <Upload size={20} />
                                        </div>
                                        数据恢复
                                    </div>
                                    <p className="text-xs text-zinc-500 min-h-[40px]">
                                        从 JSON 备份文件恢复数据 (将覆盖现有数据)。
                                    </p>
                                    <input
                                        type="file"
                                        accept=".json"
                                        ref={fileInputRef}
                                        onChange={handle_import}
                                        className="hidden"
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={loading}
                                        className="w-full py-2 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                    >
                                        {loading ? "恢复中..." : "选择备份文件"}
                                    </button>
                                </div>
                            </div>



                            {/* Migration */}
                            <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3 bg-white dark:bg-zinc-900">
                                <div className="flex items-center gap-3 text-zinc-900 dark:text-zinc-100 font-medium">
                                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded-lg">
                                        <FolderInput size={20} />
                                    </div>
                                    文件整理
                                </div>
                                <p className="text-xs text-zinc-500">
                                    将旧版下载的视频文件移动到新的 "分组/频道" 目录结构中。
                                </p>
                                <button
                                    onClick={handle_migrate}
                                    disabled={migrating}
                                    className="w-full py-2 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                >
                                    {migrating ? "正在整理..." : "格式化下载路径 & 归档文件"}
                                </button>
                            </div>

                            {/* Danger Zone */}
                            <div className="p-4 border border-red-200 dark:border-red-900/50 rounded-xl space-y-3 bg-red-50 dark:bg-red-900/10">
                                <div className="flex items-center gap-3 text-red-700 dark:text-red-400 font-medium">
                                    <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg">
                                        <Trash2 size={20} />
                                    </div>
                                    危险区域
                                </div>
                                <p className="text-xs text-red-600/80 dark:text-red-400/80">
                                    清空所有已抓取的视频、频道、分组数据、API 密钥和设置。<br />
                                    (仅保留激活信息)
                                </p>
                                <button
                                    onClick={handle_clear_data}
                                    disabled={loading}
                                    className="w-full py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                                >
                                    {loading ? "处理中..." : "清空所有历史数据"}
                                </button>
                            </div>
                        </div>
                    )}

                    {active_tab === "activation" && (
                        <div className="space-y-6">
                            {/* Activation Settings */}
                            <div className={`p-4 rounded-xl border ${is_activated ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-900' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900'} space-y-4`}>
                                <div className="flex items-center justify-between">
                                    <h3 className={`font-bold flex items-center gap-2 ${is_activated ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                        <Key size={18} />
                                        {is_activated ? "系统已激活" : "系统未激活"}
                                    </h3>
                                    <div className="text-right">
                                        {is_activated && <Check size={20} className="text-green-600 dark:text-green-400 inline-block mr-2" />}

                                        {license_status && (
                                            <div className={`text-xs font-mono mt-1 ${is_activated ? (license_status.type === 'trial' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400') : 'text-red-600'}`}>
                                                {license_status.type === 'trial' && `试用期剩余: ${license_status.remaining_days} 天`}
                                                {license_status.type === 'active' && `有效期剩余: ${license_status.remaining_days} 天`}
                                                {license_status.type === 'expired_trial' && `试用期已结束`}
                                                {license_status.type === 'expired_license' && `授权已过期`}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">机器码 (Machine ID)</label>
                                    <div className="flex gap-2">
                                        <code className="flex-1 bg-white dark:bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 font-mono text-sm break-all">
                                            {machineId}
                                        </code>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(machineId);
                                                set_is_machine_id_copied(true);
                                                setTimeout(() => set_is_machine_id_copied(false), 2000);
                                            }}
                                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${is_machine_id_copied
                                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                                : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                                                }`}
                                        >
                                            {is_machine_id_copied ? <Check size={14} /> : <Copy size={14} />}
                                            {is_machine_id_copied ? "已复制" : "复制"}
                                        </button>
                                    </div>
                                    {license_status?.type !== 'active' && (
                                        <p className="text-xs text-zinc-500">发送此机器码给管理员以获取激活码。</p>
                                    )}
                                </div>

                                {license_status?.type !== 'active' && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">激活码</label>
                                            <textarea
                                                value={activation_code}
                                                onChange={(e) => set_activation_code(e.target.value)}
                                                placeholder="输入激活码..."
                                                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
                                            />
                                        </div>

                                        <button
                                            onClick={handle_activate}
                                            disabled={activating || !activation_code.trim()}
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {activating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                            验证激活
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}



