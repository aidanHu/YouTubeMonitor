export interface VideoMetrics {
    vph: number;
    er: number;
    z_score: number;
    multiplier: number;
    label: "Viral" | "High" | "Normal" | "Low" | "Tanked";
}

export function calculateVPH(published_at: string | Date, view_count: number | bigint): number {
    const published = new Date(published_at);
    const now = new Date();
    const hoursSincePublish = (now.getTime() - published.getTime()) / (1000 * 60 * 60);

    // Avoid division by zero or negative time
    if (hoursSincePublish < 1) return Number(view_count);

    return Number(view_count) / hoursSincePublish;
}

export function calculateER(likes: number | null, comments: number | null, views: number | bigint): number {
    const totalEngagements = (likes || 0) + (comments || 0);
    const view_count = Number(views);

    if (view_count === 0) return 0;

    return (totalEngagements / view_count) * 100;
}

export function calculateChannelStats(videos: { view_count: string | bigint | number }[]) {
    const views = videos.map(v => Number(v.view_count));
    if (views.length === 0) return { mean: 0, stdDev: 0 };

    const sum = views.reduce((a, b) => a + b, 0);
    const mean = sum / views.length;

    const squareDiffs = views.map(v => Math.pow(v - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / views.length;
    const stdDev = Math.sqrt(avgSquareDiff);

    return { mean, stdDev };
}

export function analyzeVideo(
    video: { view_count: string | bigint | number, like_count: number | null, comment_count: number | null, published_at: string | Date },
    channelStats: { mean: number, stdDev: number }
): VideoMetrics {
    const views = Number(video.view_count);
    const vph = calculateVPH(video.published_at, views);
    const er = calculateER(video.like_count, video.comment_count, views);

    let z_score = 0;
    if (channelStats.stdDev > 0) {
        z_score = (views - channelStats.mean) / channelStats.stdDev;
    }

    const multiplier = channelStats.mean > 0 ? views / channelStats.mean : 0;

    let label: VideoMetrics["label"] = "Normal";
    if (z_score > 2 || multiplier > 2.5) label = "Viral";
    else if (z_score > 1) label = "High";
    else if (z_score < -1.5 || multiplier < 0.3) label = "Tanked";
    else if (z_score < -0.5) label = "Low";

    return { vph, er, z_score, multiplier, label };
}
