import { NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
    try {
        const { path: filePath, videoId } = await request.json();
        let targetPath = filePath;

        // Check if primary path is valid
        let fileExists = targetPath && fs.existsSync(targetPath);

        // If not found and videoId provided, attempt DB lookup
        if (!fileExists && videoId) {
            console.log(`[Open API] Path ${targetPath} not found, checking DB for video ${videoId}...`);
            const video = await prisma.video.findUnique({
                where: { id: videoId },
                select: { localPath: true }
            });

            if (video?.localPath) {
                if (fs.existsSync(video.localPath)) {
                    console.log(`[Open API] Found new path in DB: ${video.localPath}`);
                    targetPath = video.localPath;
                    fileExists = true;
                } else {
                    console.warn(`[Open API] DB path also not found: ${video.localPath}`);
                }
            }
        }

        if (!targetPath || !fileExists) {
            console.error(`[Open API] Failed to find file. Path: ${filePath}, VideoId: ${videoId}`);

            // LAST RESORT: Try to find the directory of the (old or new) path and open that
            let dirToOpen = null;

            // Try directory from valid specific path if we had one but file missing
            if (targetPath) {
                const dir = path.dirname(targetPath);
                if (fs.existsSync(dir)) dirToOpen = dir;
            }

            // If that failed, try to construct likely path from DB info
            if (!dirToOpen && videoId) {
                const video = await prisma.video.findUnique({
                    where: { id: videoId },
                    include: { channel: { include: { group: true } } }
                });
                if (video?.channel) {
                    const settings = await prisma.settings.findFirst();
                    if (settings?.downloadPath) {
                        // Construct likely Channel Path
                        const safeChannel = (video.channel.name || "Unknown").replace(/[<>:"/\\|?*`$]/g, "");
                        const groupName = video.channel.group?.name || "未分组";
                        const safeGroup = groupName.replace(/[<>:"/\\|?*`$]/g, "");

                        const likelyPath = path.join(settings.downloadPath, safeGroup, safeChannel);
                        if (fs.existsSync(likelyPath)) {
                            dirToOpen = likelyPath;
                        } else {
                            // Try old structure (just channel)
                            const oldStylePath = path.join(settings.downloadPath, safeChannel);
                            if (fs.existsSync(oldStylePath)) dirToOpen = oldStylePath;
                        }
                    }
                }
            }

            if (dirToOpen) {
                console.log(`[Open API] File not found, but folder exists. Opening: ${dirToOpen}`);
                targetPath = dirToOpen;
                // Don't select, just open dir
                const platform = process.platform;
                if (platform === "darwin") {
                    exec(`open "${targetPath}"`);
                } else if (platform === "win32") {
                    const winPath = targetPath.replace(/\//g, "\\");
                    exec(`explorer "${winPath}"`);
                } else {
                    exec(`xdg-open "${targetPath}"`);
                }
                return NextResponse.json({ success: true, message: "Opened folder (file not found)" });
            }

            return NextResponse.json({ error: "无法找到文件或所在文件夹 (File/Folder not found)" }, { status: 404 });
        }

        // Platform specific open command
        let command = "";
        const platform = process.platform;

        if (platform === "darwin") {
            // macOS: open -R selects the file in Finder
            command = `open -R "${targetPath}"`;
        } else if (platform === "win32") {
            // Windows: explorer /select,path selects the file
            // ensure backslashes
            const winPath = targetPath.replace(/\//g, "\\");
            command = `explorer /select,"${winPath}"`;
        } else {
            // Linux/Other: xdg-open (opens file, doesn't select usually) or just open dir
            const dir = path.dirname(targetPath);
            command = `xdg-open "${dir}"`;
        }

        exec(command, (error) => {
            if (error) {
                console.error("[Open API] Exec error:", error);
            }
        });

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error("[Open API] Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
