import { useState, useEffect, useRef } from "react";
import { X, Folder, Save, Key, Trash2, Plus, Check, Info, RefreshCw, Database, Upload, Download as DownloadIcon, Globe, FolderInput } from "lucide-react";

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ApiKey {
    id: number;
    key: string;
    name: string | null;
    isActive: boolean;
    usageToday: number;
    lastUsed: string;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<"general" | "keys" | "data">("general");
    const [downloadPath, setDownloadPath] = useState("");
    const [proxyUrl, setProxyUrl] = useState("");
    const [cookieSource, setCookieSource] = useState("none");
    const [showCookieInput, setShowCookieInput] = useState(false);

    // API Key State
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [newKey, setNewKey] = useState("");
    const [newKeyName, setNewKeyName] = useState("");
    const [showAddKey, setShowAddKey] = useState(false);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [migrating, setMigrating] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchSettings();
            fetchApiKeys();
        }
    }, [isOpen]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/settings");
            const data = await res.json();
            if (data.downloadPath) {
                setDownloadPath(data.downloadPath);
            }
            if (data.proxyUrl) {
                setProxyUrl(data.proxyUrl);
            }
            if (data.cookieSource) {
                setCookieSource(data.cookieSource);
                // Check if it's a file path to show input
                if (data.cookieSource.startsWith('/') || data.cookieSource.includes('\\')) {
                    setShowCookieInput(true);
                }
            }
        } catch (e) {
            console.error("Failed to load settings", e);
        } finally {
            setLoading(false);
        }
    };

    const fetchApiKeys = async () => {
        try {
            const res = await fetch("/api/settings/keys");
            if (res.ok) {
                const data = await res.json();
                setApiKeys(data);
            }
        } catch (e) {
            console.error("Failed to load keys", e);
            alert("加载 Key 列表失败: " + (e as Error).message);
        }
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                body: JSON.stringify({ downloadPath, proxyUrl, cookieSource }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || data.details || "Unknown error");
            }
            alert("设置已保存");
        } catch (e: any) {
            alert("保存失败: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    // API Key Handlers
    const handleAddKey = async () => {
        if (!newKey.trim()) return;
        try {
            const res = await fetch("/api/settings/keys", {
                method: "POST",
                body: JSON.stringify({ key: newKey.trim(), name: newKeyName.trim() }),
            });
            if (res.ok) {
                setNewKey("");
                setNewKeyName("");
                setShowAddKey(false);
                fetchApiKeys(); // Refresh
            } else {
                alert("添加失败，Key 可能已存在");
            }
        } catch (e) {
            console.error("Add key error", e);
        }
    };

    const handleDeleteKey = async (id: number) => {
        if (!confirm("确定删除此 Key 吗？")) return;
        try {
            await fetch(`/api/settings/keys?id=${id}`, { method: "DELETE" });
            fetchApiKeys();
        } catch (e) {
            console.error("Delete key error", e);
        }
    };

    // Data Backup Handlers
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        try {
            const res = await fetch("/api/settings/backup");
            if (!res.ok) throw new Error("Export failed");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const date = new Date().toISOString().split("T")[0];
            a.download = `youtube-monitor-backup-${date}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (e) {
            console.error(e);
            alert("导出失败");
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!confirm("警告：恢复备份将覆盖当前所有数据！\n确定要继续吗？")) {
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = event.target?.result;
                if (!json) return;

                setLoading(true);
                const res = await fetch("/api/settings/backup", {
                    method: "POST",
                    body: json,
                    headers: { 'Content-Type': 'application/json' }
                });

                if (res.ok) {
                    alert("恢复成功！应用将重新加载。");
                    window.location.reload();
                } else {
                    const err = await res.json();
                    alert("恢复失败: " + err.error);
                }
            } catch (error) {
                console.error(error);
                alert("文件解析失败");
            } finally {
                setLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };
        reader.readAsText(file);
    };

    const handleToggleKey = async (id: number, currentStatus: boolean) => {
        try {
            await fetch("/api/settings/keys", {
                method: "PATCH",
                body: JSON.stringify({ id, isActive: !currentStatus }),
            });
            fetchApiKeys();
        } catch (e) {
            console.error("Toggle key error", e);
        }
    };

    const handleMigrate = async () => {
        if (!confirm("确定要整理现在的下载目录吗？\n这将把所有已下载的视频移动到 '分组/频道' 的文件夹结构中。")) return;

        setMigrating(true);
        try {
            const res = await fetch("/api/migrate", { method: "POST" });
            const data = await res.json();

            if (res.ok) {
                alert(`整理完成！\n\n已移动文件夹: ${data.stats.movedFolders}\n已更新数据库: ${data.stats.updatedVideos}\n错误: ${data.stats.errors}`);
            } else {
                alert("整理失败: " + data.error);
            }
        } catch (e: any) {
            alert("请求失败: " + e.message);
        } finally {
            setMigrating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-2xl shadow-2xl ring-1 ring-zinc-200 dark:ring-zinc-800 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                    <h2 className="text-xl font-bold">系统设置</h2>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                        <X size={20} className="text-zinc-500" />
                    </button>
                </div>

                <div className="flex border-b border-zinc-100 dark:border-zinc-800 px-6 shrink-0">
                    <button
                        onClick={() => setActiveTab("general")}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "general"
                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                            : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            }`}
                    >
                        常规设置
                    </button>
                    <button
                        onClick={() => setActiveTab("keys")}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "keys"
                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                            : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            }`}
                    >
                        API Key 管理
                    </button>
                    <button
                        onClick={() => setActiveTab("data")}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "data"
                            ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                            : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            }`}
                    >
                        数据管理
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {activeTab === "general" && (
                        <div className="space-y-6">
                            {/* Download Path */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                                    <Folder size={16} />
                                    视频下载路径
                                </label>
                                <input
                                    type="text"
                                    value={downloadPath}
                                    onChange={(e) => setDownloadPath(e.target.value)}
                                    placeholder="/Users/username/Downloads/YouTube"
                                    className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-zinc-400"
                                />
                                <p className="text-xs text-zinc-500">
                                    视频将按照 <code>路径/频道名/标题.mp4</code> 格式保存。
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
                                    value={proxyUrl}
                                    onChange={(e) => setProxyUrl(e.target.value)}
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
                                        value={cookieSource.startsWith('/') || cookieSource.includes('\\') ? 'file' : (['chrome', 'firefox', 'edge', 'safari', 'opera'].includes(cookieSource) ? cookieSource : 'none')}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === 'file') {
                                                setCookieSource(''); // Clear to let user input path
                                            } else {
                                                setCookieSource(val);
                                            }
                                            setShowCookieInput(val === 'file');
                                        }}
                                        className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border-none outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                                    >
                                        <option value="none">不使用 Cookie (默认)</option>
                                        <option value="chrome">从 Google Chrome 获取</option>
                                        <option value="firefox">从 Firefox 获取</option>
                                        <option value="edge">从 Microsoft Edge 获取</option>
                                        <option value="safari">从 Safari 获取</option>
                                        <option value="file">使用 cookies.txt 文件...</option>
                                    </select>

                                    {(showCookieInput || cookieSource.startsWith('/') || cookieSource.includes('\\')) && (
                                        <div className="animate-in fade-in slide-in-from-top-2">
                                            <input
                                                type="text"
                                                value={cookieSource}
                                                onChange={(e) => setCookieSource(e.target.value)}
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
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-sm text-blue-800 dark:text-blue-200 space-y-2">
                                <h3 className="font-bold flex items-center gap-2">
                                    <Info size={16} />
                                    yt-dlp 配置指南
                                </h3>
                                <p>为了使用下载功能，您需要在电脑上安装开源工具 <code>yt-dlp</code>。</p>
                                <div className="bg-white/50 dark:bg-black/20 p-3 rounded-lg font-mono text-xs overflow-x-auto">
                                    <p className="mb-2 text-zinc-500">//主要通过 Homebrew 安装 (Mac):</p>
                                    <p className="select-all">brew install yt-dlp</p>
                                    <p className="mt-2 mb-2 text-zinc-500">// 或者使用 pip:</p>
                                    <p className="select-all">python3 -m pip install -U yt-dlp</p>
                                </div>
                                <p className="text-xs opacity-80">安装完成后，请重启本应用以确保环境变量生效。</p>
                            </div>

                            <div className="flex justify-end pt-4">
                                <button
                                    onClick={handleSaveSettings}
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

                    {activeTab === "keys" && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <p className="text-sm text-zinc-500">管理用于获取数据的 YouTube Data API Keys。</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={fetchApiKeys}
                                        className="p-1.5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                        title="刷新数据"
                                    >
                                        <RefreshCw size={16} />
                                    </button>
                                    <button
                                        onClick={() => setShowAddKey(true)}
                                        className="text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 rounded-lg font-medium hover:opacity-90 flex items-center gap-1.5"
                                    >
                                        <Plus size={16} /> 添加 Key
                                    </button>
                                </div>
                            </div>

                            {showAddKey && (
                                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <input
                                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm outline-none focus:border-blue-500"
                                        placeholder="API Key (AIza...)"
                                        value={newKey}
                                        onChange={(e) => setNewKey(e.target.value)}
                                    />
                                    <input
                                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm outline-none focus:border-blue-500"
                                        placeholder="备注名称 (可选)"
                                        value={newKeyName}
                                        onChange={(e) => setNewKeyName(e.target.value)}
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setShowAddKey(false)} className="text-xs text-zinc-500 px-3 py-1.5 hover:text-zinc-700">取消</button>
                                        <button onClick={handleAddKey} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">确认添加</button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                {apiKeys.map((key) => (
                                    <div key={key.id} className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={`p-2 rounded-lg ${key.isActive ? 'bg-green-100 text-green-600 dark:bg-green-900/30' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'}`}>
                                                <Key size={18} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-mono text-sm font-medium truncate">{key.key.substring(0, 8)}...{key.key.substring(key.key.length - 6)}</div>
                                                <div className="text-xs text-zinc-500 flex gap-2">
                                                    {key.name && <span>{key.name}</span>}
                                                    <span>今日调用: {key.usageToday}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => handleToggleKey(key.id, key.isActive)}
                                                className={`p-1.5 rounded-lg transition-colors ${key.isActive ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                                                title={key.isActive ? "禁用" : "启用"}
                                            >
                                                <Check size={16} className={!key.isActive ? "opacity-30" : ""} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteKey(key.id)}
                                                className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {apiKeys.length === 0 && (
                                    <div className="text-center py-8 text-zinc-400 text-sm">暂无 API Key</div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === "data" && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-sm text-blue-800 dark:text-blue-200">
                                <h3 className="font-bold flex items-center gap-2 mb-2">
                                    <Info size={16} />
                                    数据管理说明
                                </h3>
                                <p>您可以导出当前的所有数据（分组、频道、视频、设置、API Key）作为 JSON 文件进行备份。</p>
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
                                        onClick={handleExport}
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
                                        onChange={handleImport}
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
                                    onClick={handleMigrate}
                                    disabled={migrating}
                                    className="w-full py-2 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                >
                                    {migrating ? "正在整理..." : "格式化下载路径 & 归档文件"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


