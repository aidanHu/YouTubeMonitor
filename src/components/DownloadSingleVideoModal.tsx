import { useState } from "react";
import { X, Download, Loader2, AlertCircle } from "lucide-react";
import { useDownloads } from "@/context/DownloadContext";

interface DownloadSingleVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function DownloadSingleVideoModal({ isOpen, onClose }: DownloadSingleVideoModalProps) {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { startDownload } = useDownloads();

    if (!isOpen) return null;

    const handleProcess = async () => {
        if (!url.trim()) return;
        setLoading(true);
        setError(null);

        try {
            // 1. Resolve
            const res = await fetch("/api/resolve-video", {
                method: "POST",
                body: JSON.stringify({ url }),
                headers: { "Content-Type": "application/json" }
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "无法解析视频信息");
            }

            const videoInfo = await res.json();

            // 2. Start Download
            await startDownload({
                id: videoInfo.id,
                title: videoInfo.title,
                thumbnail: videoInfo.thumbnail,
                channelName: videoInfo.channelName,
                channelId: undefined
            });

            // 3. Close & Reset
            onClose();
            setUrl("");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-lg shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-zinc-100 dark:border-zinc-800">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">下载视频</h2>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-500">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">YouTube 链接</label>
                        <input
                            type="text"
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleProcess()}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                            autoFocus
                        />
                        {error && (
                            <div className="text-red-500 text-sm flex items-center gap-1.5 mt-2 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
                                <AlertCircle size={14} />
                                {error}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleProcess}
                        disabled={loading || !url}
                        className="bg-blue-600 text-white hover:bg-blue-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm shadow-blue-600/20"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        {loading ? "解析中..." : "开始下载"}
                    </button>
                </div>
            </div>
        </div>
    );
}
