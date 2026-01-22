/**
 * 下载进度事件负载
 */
export interface DownloadProgressPayload {
    videoId: string;
    progress: number;
    speed: string;
    eta: string;
}

/**
 * 下载完成事件负载
 */
export interface DownloadCompletePayload {
    videoId: string;
    path: string;
}

/**
 * 下载错误事件负载
 */
export interface DownloadErrorPayload {
    videoId: string;
    error: string;
}

/**
 * 下载项状态
 */
export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'error' | 'cancelled';

/**
 * 下载项接口（从 DownloadContext 导出供其他组件使用）
 */
export interface DownloadItem {
    id: string;
    title: string;
    thumbnail: string | null;
    status: DownloadStatus;
    progress: number;
    start_time: Date;
    error?: string;
    channel_name?: string;
    channel_id?: string;
    path?: string;
    speed?: string;
    eta?: string;
}
