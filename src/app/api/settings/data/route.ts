import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
    try {
        // Use transaction to ensure atomicity
        await prisma.$transaction([
            prisma.video.deleteMany(),
            prisma.channel.deleteMany(),
            prisma.group.deleteMany(),
            // We consciously DO NOT delete Settings or ApiKeys
        ]);

        return NextResponse.json({ success: true, message: "All content data cleared" });
    } catch (e: any) {
        console.error("Failed to clear data", e);
        return NextResponse.json({ error: e.message || "Failed to clear data" }, { status: 500 });
    }
}
