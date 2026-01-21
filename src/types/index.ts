export interface Group {
    id: number;
    name: string;
    isPinned: boolean;
}

export interface Channel {
    id: string;
    url: string;
    name: string;
    thumbnail: string | null;
    subscriberCount: number;
    viewCount: string; // Serialized BigInt
    videoCount: number;
    groupId: number | null;
    group?: Group;
    isFavorite: boolean;
    isPinned: boolean;
    createdAt: string | Date;
    lastUploadAt?: string | Date; // Optional as older channels might not have it yet
}

export interface ApiKey {
    id: number;
    key: string;
    name: string | null;
    isActive: boolean;
    usageToday: number;
    lastUsed: string;
    createdAt: string;
}

export interface Video {
    id: string;
    title: string;
    url: string;
    thumbnail: string | null;
    publishedAt: string | Date;
    viewCount: string;
    likeCount: number | null;
    commentCount: number | null;
    isShort: boolean;
    isFavorite: boolean;
    channelId: string;
    channel?: Channel;
    // Analysis fields
    engagementRate?: number;
    ratio?: number;
    subCount?: number;
    localPath?: string | null;
}
