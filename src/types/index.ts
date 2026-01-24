export interface Group {
    id: number;
    name: string;
    is_pinned: boolean;
    created_at: string;
    updated_at: string;
}

export interface Channel {
    id: string;
    url: string;
    name: string;
    thumbnail: string | null;
    subscriber_count: number;
    view_count: string; // Serialized BigInt
    video_count: number;
    group_id: number | null;
    group?: Group;
    is_favorite: boolean;
    is_pinned: boolean;
    created_at: string | Date;
    last_upload_at?: string | Date; // Optional as older channels might not have it yet
}

export interface ApiKey {
    id: number;
    key: string;
    name: string | null;
    is_active: boolean;
    usage_today: number;
    last_used: string;
    created_at: string;
}

export interface Video {
    id: string;
    title: string;
    url: string;
    thumbnail: string | null;
    published_at: string | Date;
    view_count: string;
    like_count: number | null;
    comment_count: number | null;
    is_short: boolean;
    is_favorite: boolean;
    channel_id: string;
    channel?: Channel;
    // Analysis fields
    engagement_rate?: number;
    ratio?: number;
    sub_count?: number;
    local_path?: string | null;
}
