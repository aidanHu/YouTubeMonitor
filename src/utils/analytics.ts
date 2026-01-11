export interface VideoMetrics {
    vph: number;
    er: number;
    zScore: number;
    multiplier: number;
    label: "Viral" | "High" | "Normal" | "Low" | "Tanked";
}

export function calculateVPH(publishedAt: string | Date, viewCount: number | bigint): number {
    const published = new Date(publishedAt);
    const now = new Date();
    const hoursSincePublish = (now.getTime() - published.getTime()) / (1000 * 60 * 60);

    // Avoid division by zero or negative time
    if (hoursSincePublish < 1) return Number(viewCount);

    return Number(viewCount) / hoursSincePublish;
}

export function calculateER(likes: number | null, comments: number | null, views: number | bigint): number {
    const totalEngagements = (likes || 0) + (comments || 0);
    const viewCount = Number(views);

    if (viewCount === 0) return 0;

    return (totalEngagements / viewCount) * 100;
}

export function calculateChannelStats(videos: { viewCount: string | bigint | number }[]) {
    const views = videos.map(v => Number(v.viewCount));
    if (views.length === 0) return { mean: 0, stdDev: 0 };

    const sum = views.reduce((a, b) => a + b, 0);
    const mean = sum / views.length;

    const squareDiffs = views.map(v => Math.pow(v - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / views.length;
    const stdDev = Math.sqrt(avgSquareDiff);

    return { mean, stdDev };
}

export function analyzeVideo(
    video: { viewCount: string | bigint | number, likeCount: number | null, commentCount: number | null, publishedAt: string | Date },
    channelStats: { mean: number, stdDev: number }
): VideoMetrics {
    const views = Number(video.viewCount);
    const vph = calculateVPH(video.publishedAt, views);
    const er = calculateER(video.likeCount, video.commentCount, views);

    let zScore = 0;
    if (channelStats.stdDev > 0) {
        zScore = (views - channelStats.mean) / channelStats.stdDev;
    }

    const multiplier = channelStats.mean > 0 ? views / channelStats.mean : 0;

    let label: VideoMetrics["label"] = "Normal";
    if (zScore > 2 || multiplier > 2.5) label = "Viral";
    else if (zScore > 1) label = "High";
    else if (zScore < -1.5 || multiplier < 0.3) label = "Tanked";
    else if (zScore < -0.5) label = "Low";

    return { vph, er, zScore, multiplier, label };
}
