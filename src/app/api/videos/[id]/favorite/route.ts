import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const video = await prisma.video.findUnique({ where: { id } });

        if (!video) {
            return NextResponse.json({ error: "Video not found" }, { status: 404 });
        }

        const updated = await prisma.video.update({
            where: { id },
            data: { isFavorite: !video.isFavorite }
        });

        return NextResponse.json({
            ...updated,
            viewCount: updated.viewCount.toString()
        });
    } catch (e) {
        console.error("Failed to toggle favorite", e);
        return NextResponse.json({ error: "Failed to toggle favorite" }, { status: 500 });
    }
}
