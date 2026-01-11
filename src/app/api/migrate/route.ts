import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from 'fs';
import path from 'path';

export const dynamic = "force-dynamic";

// GET: DB Schema Migration (Add localPath column)
export async function GET() {
    try {
        // Attempt to add 'localPath' column to Video table
        try {
            await prisma.$executeRawUnsafe(`ALTER TABLE "Video" ADD COLUMN "localPath" TEXT;`);
            console.log("[Migrate] Added localPath column to Video table.");
            return NextResponse.json({ success: true, message: "Added localPath column" });
        } catch (e: any) {
            const msg = e.message.toLowerCase();
            if (msg.includes("duplicate column") || msg.includes("already exists")) {
                // Component already exists, which is fine
                return NextResponse.json({ success: true, message: "Column already exists" });
            }
            // If it's another error, we might log it but usually for SQLite it's just "duplicate column"
            console.warn("[Migrate] Add column warning:", e.message);
            return NextResponse.json({ success: true, message: "Checked schema" });
        }
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
