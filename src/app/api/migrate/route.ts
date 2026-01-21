import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from 'fs';
import path from 'path';

export const dynamic = "force-dynamic";

// GET: DB Schema Migration
export async function GET() {
    try {
        const migrations = [];

        // 1. Check for 'localPath' in Video
        try {
            await prisma.$executeRawUnsafe(`ALTER TABLE "Video" ADD COLUMN "localPath" TEXT;`);
            migrations.push("Added localPath column to Video");
        } catch (e: any) { /* Ignore if exists */ }

        // 2. Check for 'isPinned' in Group
        try {
            // Try to select the column to see if it exists
            await prisma.$queryRaw`SELECT isPinned FROM "Group" LIMIT 1`;
        } catch (e) {
            // Column missing, add it
            try {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Group" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT 0`);
                migrations.push("Added isPinned column to Group");
            } catch (err) { console.error("Failed to add isPinned to Group", err); }
        }

        // 3. Check for 'isPinned' in Channel
        try {
            await prisma.$queryRaw`SELECT isPinned FROM "Channel" LIMIT 1`;
        } catch (e) {
            try {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Channel" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT 0`);
                migrations.push("Added isPinned column to Channel");
            } catch (err) { console.error("Failed to add isPinned to Channel", err); }
        }

        // 4. Check for 'createdAt' in Channel (Optional safeguard)
        try {
            await prisma.$queryRaw`SELECT createdAt FROM "Channel" LIMIT 1`;
        } catch (e) {
            try {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Channel" ADD COLUMN "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
                migrations.push("Added createdAt column to Channel");
            } catch (err) { console.error("Failed to add createdAt to Channel", err); }
        }

        // 5. Check for 'lastUploadAt' in Channel
        try {
            await prisma.$queryRaw`SELECT lastUploadAt FROM "Channel" LIMIT 1`;
        } catch (e) {
            try {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Channel" ADD COLUMN "lastUploadAt" DATETIME`);
                migrations.push("Added lastUploadAt column to Channel");
            } catch (err) { console.error("Failed to add lastUploadAt to Channel", err); }
        }

        // 6. Backfill lastUploadAt from existing videos (Improvement)
        try {
            // Only run if we have channels with null lastUploadAt
            const updateCount = await prisma.$executeRawUnsafe(`
                UPDATE "Channel"
                SET "lastUploadAt" = (
                    SELECT MAX("publishedAt")
                    FROM "Video"
                    WHERE "Video"."channelId" = "Channel"."id"
                )
                WHERE "lastUploadAt" IS NULL AND EXISTS (
                    SELECT 1 FROM "Video" WHERE "Video"."channelId" = "Channel"."id"
                );
            `);
            if (updateCount > 0) {
                migrations.push(`Backfilled lastUploadAt for ${updateCount} channels`);
            }
        } catch (err) {
            console.error("Failed to backfill lastUploadAt", err);
        }

        console.log("[Migration] Status:", migrations.length > 0 ? migrations : "Schema up to date");
        return NextResponse.json({ success: true, migrations });

    } catch (e: any) {
        console.error("[Migrate] Migration failed:", e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

// POST: File Organization (Move folders)
export async function POST(request: Request) {
    try {
        console.log("[Migration API] Starting file organization...");

        // Get settings for download path
        const settings = await prisma.settings.findFirst();
        if (!settings?.downloadPath) {
            return NextResponse.json({ error: "No download path configured." }, { status: 400 });
        }

        const downloadBase = settings.downloadPath;

        // Get all channels with groups
        const channels = await prisma.channel.findMany({
            include: {
                group: true,
                videos: true
            }
        });

        let stats = {
            movedFolders: 0,
            updatedVideos: 0,
            errors: 0
        };

        for (const channel of channels) {
            const safeChannel = (channel.name || "Unknown").replace(/[<>:"/\\|?*`$]/g, "");
            const groupName = channel.group?.name || "未分组";
            const safeGroup = groupName.replace(/[<>:"/\\|?*`$]/g, "");

            const oldChannelPath = path.join(downloadBase, safeChannel);
            const newGroupPath = path.join(downloadBase, safeGroup);
            const newChannelPath = path.join(newGroupPath, safeChannel);

            // 1. Move folders
            if (!fs.existsSync(newGroupPath)) {
                fs.mkdirSync(newGroupPath, { recursive: true });
            }

            if (fs.existsSync(oldChannelPath) && oldChannelPath !== newChannelPath) {
                try {
                    if (fs.existsSync(newChannelPath)) {
                        // Destination exists, just log
                    } else {
                        // Check if old path is a directory
                        if (fs.statSync(oldChannelPath).isDirectory()) {
                            fs.renameSync(oldChannelPath, newChannelPath);
                            stats.movedFolders++;
                        }
                    }
                } catch (e) {
                    console.error(`Failed to move ${oldChannelPath}:`, e);
                    stats.errors++;
                }
            }

            // 2. Update DB
            // We check both paths to see where the videos actually are
            const targetPathToCheck = fs.existsSync(newChannelPath) ? newChannelPath : (fs.existsSync(oldChannelPath) ? oldChannelPath : null);

            if (targetPathToCheck) {
                for (const video of channel.videos) {
                    const safeTitle = (video.title).replace(/[<>:"/\\|?*`$]/g, "");
                    const videoFileName = `${safeTitle}.mp4`;
                    const expectedFilePath = path.join(newChannelPath, videoFileName);
                    const oldFilePath = path.join(oldChannelPath, videoFileName);

                    let confirmedPath = null;
                    if (fs.existsSync(expectedFilePath)) confirmedPath = expectedFilePath;
                    else if (fs.existsSync(oldFilePath)) confirmedPath = oldFilePath;

                    // Update if we found the file AND it's different from what's in DB
                    if (confirmedPath && video.localPath !== confirmedPath) {
                        await prisma.video.update({
                            where: { id: video.id },
                            data: { localPath: confirmedPath }
                        });
                        stats.updatedVideos++;
                    }
                }
            }
        }

        console.log("[Migration API] Organization complete:", stats);
        return NextResponse.json({ success: true, stats });

    } catch (e: any) {
        console.error("[Migration API] POST Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
