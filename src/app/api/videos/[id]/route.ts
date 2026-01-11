import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const video = await prisma.video.findUnique({
        where: { id },
        include: {
            channel: true,
        },
    });

    if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Serialize BigInt and format data
    const serialized = {
        ...video,
        viewCount: video.viewCount.toString(),
        likeCount: video.likeCount, // keeping numbers as numbers
        commentCount: video.commentCount,
        channel: {
            ...video.channel,
            viewCount: video.channel.viewCount.toString(),
        }
    };

    return NextResponse.json(serialized);
}
