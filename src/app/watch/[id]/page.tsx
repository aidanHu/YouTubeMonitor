"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, FolderOpen, RotateCcw, Copy, ExternalLink, ThumbsUp, MessageSquare, Calendar, Eye, Heart } from "lucide-react";
import Link from "next/link";
import { useDownloads } from "@/context/DownloadContext";

interface VideoDetail {
    id: string;
    title: string;
    description: string;
    publishedAt: string;
    viewCount: string;
    likeCount: string;
    commentCount: string;
    channel: {
        id: string;
        name: string;
        thumbnail: string;
    };
    url: string;
    localPath?: string | null;
    isFavorite?: boolean;
}

export default function WatchPage() {
    const params = useParams();
    const router = useRouter();
    const { id } = params as { id: string };
    const [video, setVideo] = useState<VideoDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const { downloads, startDownload } = useDownloads();

    useEffect(() => {
        if (id) {
            fetch(`/api/videos/${id}`)
                .then(async res => {
                    const contentType = res.headers.get("content-type");
                    if (contentType && contentType.indexOf("application/json") === -1) {
                        // Likely 404 HTML
                        throw new Error("API returned non-JSON response");
                    }
                    if (!res.ok) throw new Error("Video not found");
                    return res.json();
                })
                .then(data => {
                    setVideo(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error("WatchPage Error:", err);
                    setLoading(false);
                });
        }
    }, [id]);

    const downloadItem = downloads.find(d => d.id === id);
    const downloadStatus = downloadItem?.status;
    const isDownloading = downloadStatus === 'downloading' || downloadStatus === 'queued';
    const effectivePath = video?.localPath || downloadItem?.path;
    const canOpen = !!effectivePath || downloadStatus === 'completed';

    const handleDownload = () => {
        if (!video) return;
        startDownload({
            id: video.id,
            title: video.title,
            thumbnail: video.channel.thumbnail, // approximations
            channelName: video.channel.name,
            channelId: video.channel.id
        });
    };

    const handleRedownload = () => {
        if (!video) return;
        if (!confirm("确定要重新下载此视频吗？")) return;
        startDownload({
            id: video.id,
            title: video.title,
            thumbnail: video.channel.thumbnail,
            channelName: video.channel.name,
            channelId: video.channel.id
        });
    };

    const handleOpenFolder = async () => {
        try {
            const body: any = { videoId: id };
            if (effectivePath) body.path = effectivePath;

            const res = await fetch('/api/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) alert("打开文件夹失败");
        } catch (e) {
            alert("请求失败");
        }
    };

    const copyLink = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("已复制到剪贴板");
    };

    const [isFavorite, setIsFavorite] = useState(false);

    // Sync favorite state when video loads
    useEffect(() => {
        if (video) setIsFavorite(video.isFavorite || false);
    }, [video]);

    const handleToggleFavorite = async () => {
        if (!video) return;
        try {
            const res = await fetch(`/api/videos/${video.id}/favorite`, { method: "POST" });
            if (res.ok) setIsFavorite(!isFavorite);
        } catch (error) {
            console.error("Failed to toggle favorite", error);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950 text-zinc-500">加载中...</div>;
    if (!video) return <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950 text-zinc-500">视频未找到</div>;

    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
            <div className="max-w-7xl mx-auto px-4 py-6">
                <button onClick={() => router.back()} className="flex items-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6 transition-colors">
                    <ArrowLeft size={20} className="mr-2" /> 返回
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content: Player & Actions */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Player */}
                        <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl">
                            <iframe
                                src={`https://www.youtube.com/embed/${id}?autoplay=1`}
                                className="w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>

                        {/* Title */}
                        <div>
                            <h1 className="text-2xl font-bold leading-tight mb-2">{video.title}</h1>
                            <div className="flex items-center gap-4 text-sm text-zinc-500">
                                <span className="flex items-center gap-1"><Eye size={16} /> {Number(video.viewCount).toLocaleString()} 观看</span>
                                <span className="flex items-center gap-1"><Calendar size={16} /> {new Date(video.publishedAt).toLocaleDateString()}</span>
                            </div>
                        </div>

                        {/* Action Bar */}
                        <div className="flex flex-wrap items-center gap-3 py-4 border-y border-zinc-100 dark:border-zinc-800">
                            {/* Download / Redownload Actions */}
                            {canOpen ? (
                                <>
                                    <button onClick={handleOpenFolder} className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full font-medium transition-colors">
                                        <FolderOpen size={18} /> 打开文件夹
                                    </button>
                                    <button onClick={handleRedownload} className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full font-medium transition-colors text-zinc-600 dark:text-zinc-400">
                                        <RotateCcw size={18} /> 重新下载
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={handleDownload}
                                    disabled={isDownloading}
                                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isDownloading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download size={18} />}
                                    {isDownloading ? "下载中..." : "下载视频"}
                                </button>
                            )}

                            <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800 mx-2" />

                            <button onClick={() => copyLink(`https://www.youtube.com/watch?v=${id}`)} className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-sm">
                                <Copy size={16} /> 复制视频链接
                            </button>

                            <button onClick={() => copyLink(`https://www.youtube.com/channel/${video.channel.id}`)} className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-sm">
                                <ExternalLink size={16} /> 复制频道链接
                            </button>

                            <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800 mx-2" />

                            <button
                                onClick={handleToggleFavorite}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors text-sm font-medium ${isFavorite
                                    ? "bg-yellow-50 text-yellow-600 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-500 dark:hover:bg-yellow-900/40"
                                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                    }`}
                            >
                                <Heart size={18} className={isFavorite ? "fill-current" : ""} />
                                {isFavorite ? "已收藏" : "收藏视频"}
                            </button>
                        </div>

                        {/* Description */}
                        <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed">
                            {video.description}
                        </div>
                    </div>

                    {/* Sidebar: Channel Info & Stats */}
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                            <h3 className="font-bold text-lg mb-4">关于频道</h3>
                            <Link href={`/channel/${video.channel.id}`} className="flex items-center gap-3 mb-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 p-2 -mx-2 rounded-xl transition-colors group">
                                <img src={video.channel.thumbnail} className="w-12 h-12 rounded-full group-hover:opacity-90 transition-opacity" />
                                <div className="font-bold text-lg truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{video.channel.name}</div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
