
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const [groups, channels, videos, apiKeys, settings] = await Promise.all([
            prisma.group.findMany(),
            prisma.channel.findMany(),
            prisma.video.findMany(),
            prisma.apiKey.findMany(),
            prisma.settings.findMany(),
        ]);

        const backupData = {
            version: 1,
            timestamp: new Date().toISOString(),
            groups,
            channels,
            videos,
            apiKeys,
            settings,
        };

        return NextResponse.json(backupData);
    } catch (error) {
        console.error("Export backup failed:", error);
        return NextResponse.json({ error: "Failed to export backup" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const data = await req.json();

        // Validation
        if (!data.version || !data.groups || !data.channels) {
            return NextResponse.json({ error: "Invalid backup file format" }, { status: 400 });
        }

        // Transactional Restore: Wipe and Replace
        // Order is important for Foreign Keys: Delete Children -> Parents. Create Parents -> Children.
        await prisma.$transaction(async (tx) => {
            // 1. Delete All Data
            await tx.video.deleteMany();
            await tx.channel.deleteMany();
            await tx.group.deleteMany();
            await tx.apiKey.deleteMany();
            await tx.settings.deleteMany();

            // 2. Restore Data (CreateMany is generally faster)
            // Restore Groups
            if (data.groups.length > 0) {
                await tx.group.createMany({ data: data.groups });
            }

            // Restore Channels
            if (data.channels.length > 0) {
                await tx.channel.createMany({ data: data.channels });
            }

            // Restore Videos
            if (data.videos.length > 0) {
                // Large datasets might need chunking, but for a personal tool, single batch might suffice for < 5000 items.
                // SQLite has a limit on variables in a query. createMany handles this in Prisma usually.
                await tx.video.createMany({ data: data.videos });
            }

            // Restore API Keys
            if (data.apiKeys.length > 0) {
                await tx.apiKey.createMany({ data: data.apiKeys });
            }

            // Restore Settings
            if (data.settings.length > 0) {
                await tx.settings.createMany({ data: data.settings });
            }
        });

        return NextResponse.json({
            success: true, count: {
                groups: data.groups.length,
                channels: data.channels.length,
                videos: data.videos.length
            }
        });
    } catch (error) {
        console.error("Import backup failed:", error);
        return NextResponse.json({ error: "Failed to import backup: " + (error as Error).message }, { status: 500 });
    }
}
