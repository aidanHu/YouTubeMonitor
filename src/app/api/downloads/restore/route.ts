import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const videos = await prisma.video.findMany({
            where: {
                localPath: {
                    not: null
                }
            },
            include: {
                channel: true
            },
            orderBy: {
                updatedAt: "desc"
            }
        });

        const restoredItems = videos.map(v => ({
            id: v.id,
            title: v.title,
            thumbnail: v.thumbnail,
            channelName: v.channel.name,
            channelId: v.channelId,
            status: 'completed',
            progress: 100,
            path: v.localPath,
            startTime: v.updatedAt, // Use last update time as approximate download time
        }));

        return NextResponse.json(restoredItems);
    } catch (e) {
        console.error("Failed to fetch download history", e);
        return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
    }
}
