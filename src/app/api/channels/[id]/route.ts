import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const channel = await prisma.channel.findUnique({
        where: { id },
        include: {
            group: true,
            videos: {
                orderBy: {
                    publishedAt: "desc",
                },
            },
        },
    });

    if (!channel) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Serialize BigInt and format data
    const serialized = {
        ...channel,
        viewCount: channel.viewCount.toString(),
        videos: channel.videos.map((v) => ({
            ...v,
            viewCount: v.viewCount.toString(),
            likeCount: v.likeCount ? Number(v.likeCount) : null,
            commentCount: v.commentCount ? Number(v.commentCount) : null,
        })),
    };

    return NextResponse.json(serialized);
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await prisma.channel.delete({
            where: { id },
        });
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("Failed to delete channel", e);
        return NextResponse.json({ error: "Failed to delete channel" }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const body = await request.json();
        const { groupId, isFavorite, isPinned } = body;

        const data: any = {};
        if (groupId !== undefined) data.groupId = groupId === null ? null : parseInt(groupId);
        if (isFavorite !== undefined) data.isFavorite = isFavorite;
        if (isPinned !== undefined) data.isPinned = isPinned;

        await prisma.channel.update({
            where: { id },
            data,
        });
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("Failed to update channel", e);
        return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        let body = {};
        try {
            const text = await request.text();
            if (text) body = JSON.parse(text);
        } catch (e) {
            // Ignore JSON parse error for empty body
        }
        const { fromDate } = body as any;

        let minDate = undefined;
        if (fromDate) {
            minDate = new Date(fromDate);
        }

        const channel = await prisma.channel.findUnique({ where: { id } });
        if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

        await import("@/lib/youtube").then(async (mod) => {
            const videos = await mod.fetchChannelVideos(id, undefined, minDate);

            // Track the latest video date
            let maxPublishedAt = channel.lastUploadAt ? new Date(channel.lastUploadAt) : new Date(0);
            let hasNewerVideo = false;

            for (const video of videos) {
                const videoDate = new Date(video.publishedAt);
                if (videoDate > maxPublishedAt) {
                    maxPublishedAt = videoDate;
                    hasNewerVideo = true;
                }

                await prisma.video.upsert({
                    where: { id: video.id },
                    update: {
                        viewCount: video.viewCount,
                        likeCount: video.likeCount,
                        commentCount: video.commentCount,
                        updatedAt: new Date(),
                        isShort: video.isShort
                    },
                    create: {
                        id: video.id,
                        title: video.title,
                        url: video.url,
                        thumbnail: video.thumbnail,
                        publishedAt: video.publishedAt,
                        viewCount: video.viewCount,
                        likeCount: video.likeCount,
                        commentCount: video.commentCount,
                        channelId: id,
                        isShort: video.isShort
                    }
                });
            }

            // Update channel lastUploadAt if we found a newer video
            if (hasNewerVideo) {
                await prisma.channel.update({
                    where: { id },
                    data: { lastUploadAt: maxPublishedAt }
                });
            }
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("Failed to sync videos", e);
        return NextResponse.json({ error: "Failed to sync videos" }, { status: 500 });
    }
}
