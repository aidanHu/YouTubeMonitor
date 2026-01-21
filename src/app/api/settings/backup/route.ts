
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

        // Helper to serialize BigInt
        const serialize = (obj: any) => {
            return JSON.parse(JSON.stringify(obj, (key, value) =>
                typeof value === 'bigint'
                    ? value.toString()
                    : value // return everything else unchanged
            ));
        };

        const backupData = {
            version: 1,
            timestamp: new Date().toISOString(),
            groups: serialize(groups),
            channels: serialize(channels),
            videos: serialize(videos),
            apiKeys: serialize(apiKeys),
            settings: serialize(settings),
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


        // Helper to deserialize BigInt (safe for 0)
        const restoreBigInt = (items: any[], fields: string[]) => {
            return items.map(item => {
                const newItem = { ...item };
                fields.forEach(field => {
                    if (newItem[field] !== undefined && newItem[field] !== null) {
                        newItem[field] = BigInt(newItem[field]);
                    }
                });
                return newItem;
            });
        };

        // Helper to restore Dates
        const restoreDates = (items: any[], fields: string[]) => {
            return items.map(item => {
                const newItem = { ...item };
                fields.forEach(field => {
                    if (newItem[field]) {
                        newItem[field] = new Date(newItem[field]);
                    }
                });
                return newItem;
            });
        };

        // Process Types
        let groups = restoreDates(data.groups, ['createdAt', 'updatedAt']);
        let channels = restoreBigInt(data.channels, ['viewCount']);
        channels = restoreDates(channels, ['createdAt', 'updatedAt']);

        let videos = restoreBigInt(data.videos, ['viewCount']);
        videos = restoreDates(videos, ['publishedAt', 'createdAt', 'updatedAt', 'lastUsed']); // lastUsed belongs to key but checked later

        // Fix ApiKey dates
        let apiKeys = restoreDates(data.apiKeys, ['createdAt', 'lastUsed']);

        // Fix Settings dates
        let settings = restoreDates(data.settings, ['createdAt', 'updatedAt']);


        console.log(`[Restore] Prepared data: Groups=${groups.length}, Channels=${channels.length}, Videos=${videos.length}`);

        // Transactional Restore
        await prisma.$transaction(async (tx) => {
            // 0. PRESERVE ACTIVATION: Fetch current settings before wipe
            const currentSettings = await tx.settings.findFirst();
            const currentActivation = (currentSettings as any)?.activationCode;

            // 1. Delete All Data
            await tx.video.deleteMany();
            await tx.channel.deleteMany();
            await tx.group.deleteMany();
            await tx.apiKey.deleteMany();
            await tx.settings.deleteMany();

            // 2. Restore Data
            // Groups (Preserve ID)
            if (groups.length > 0) {
                await tx.group.createMany({ data: groups });
            }

            // Channels
            if (channels.length > 0) {
                await tx.channel.createMany({ data: channels });
            }

            // Videos
            if (videos.length > 0) {
                await tx.video.createMany({ data: videos });
            }

            // API Keys
            if (apiKeys.length > 0) {
                await tx.apiKey.createMany({ data: apiKeys });
            }

            // Settings
            if (settings.length > 0) {
                // Check if restored settings have activation code
                // If provided settings have NO activation code, but we HAD one, inject it.
                // Assuming only 1 settings row usually.
                const newSettings = settings.map((s: any) => {
                    if (!s.activationCode && currentActivation) {
                        return { ...s, activationCode: currentActivation };
                    }
                    return s;
                });
                await tx.settings.createMany({ data: newSettings });
            } else if (currentActivation) {
                // If backup has NO settings at all, but we had activation, create a default one with activation
                await tx.settings.create({
                    data: {
                        downloadPath: currentSettings?.downloadPath || "",
                        // @ts-ignore: Dynamic field
                        activationCode: currentActivation
                    }
                });
            }
        });

        console.log(`[Restore] Completed successfully.`);

        return NextResponse.json({
            success: true, count: {
                groups: groups.length,
                channels: channels.length,
                videos: videos.length
            }
        });
    } catch (error: any) {
        console.error("Import backup failed:", error);
        return NextResponse.json({ error: "Failed to import backup: " + error.message }, { status: 500 });
    }
}
