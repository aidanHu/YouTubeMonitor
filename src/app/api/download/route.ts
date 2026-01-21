import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// In-memory store: Map<videoId, { status: 'active' | 'completed' | 'error', progress: number, error?: string }>
const downloadStates = new Map<string, { status: 'active' | 'completed' | 'error', progress: number, error?: string }>();

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ status: 'invalid' });

    // Return current state or inactive
    if (downloadStates.has(id)) {
        return NextResponse.json(downloadStates.get(id));
    }

    return NextResponse.json({ status: 'inactive' });
}

export async function POST(request: Request) {
    try {
        const { videoId, title, channelName } = await request.json();

        // Fetch full details from DB to get Group info
        const video = await prisma.video.findUnique({
            where: { id: videoId },
            include: {
                channel: {
                    include: { group: true }
                }
            }
        });

        const settings = await prisma.settings.findFirst();
        const downloadBase = settings?.downloadPath;

        if (!downloadBase) {
            return NextResponse.json({ error: "请先在设置中配置下载路径" }, { status: 400 });
        }

        // Sanitize paths
        const safeChannel = (video?.channel?.name || channelName || "Unknown").replace(/[<>:"/\\|?*`$]/g, "");
        const safeGroup = (video?.channel?.group?.name || "未分组").replace(/[<>:"/\\|?*`$]/g, "");
        const safeTitle = (video?.title || title || "video").replace(/[<>:"/\\|?*`$]/g, "");

        // Structure: Base / Group / Channel / Title.mp4
        const targetDir = path.join(downloadBase, safeGroup, safeChannel);
        const targetFile = path.join(targetDir, `${safeTitle}.mp4`);

        // Create directory
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Determine yt-dlp path
        let ytDlpPath = "yt-dlp";
        if (process.env.YT_DLP_PATH) {
            ytDlpPath = process.env.YT_DLP_PATH; // No quotes for spawn
        } else {
            const localBin = path.join(process.cwd(), "resources/bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
            if (fs.existsSync(localBin)) {
                ytDlpPath = localBin;
            }
        }

        // Determine ffmpeg path
        const binDir = path.dirname(ytDlpPath);
        const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
        const ffmpegPath = path.join(binDir, ffmpegName);
        let ffmpegArg: string[] = [];

        if (fs.existsSync(ffmpegPath)) {
            ffmpegArg = ["--ffmpeg-location", ffmpegPath];
        }

        // Determine Cookie Arguments
        const cookieSource = settings?.cookieSource;
        const cookieArgs: string[] = [];
        if (cookieSource && cookieSource !== 'none') {
            if (['chrome', 'firefox', 'safari', 'edge', 'opera', 'chromium'].includes(cookieSource.toLowerCase())) {
                cookieArgs.push('--cookies-from-browser', cookieSource);
            } else if (cookieSource.length > 0) {
                // Assume file path
                cookieArgs.push('--cookies', cookieSource);
            }
        }

        const url = `https://www.youtube.com/watch?v=${videoId}`;
        downloadStates.set(videoId, { status: 'active', progress: 0 });

        const args = [
            ...ffmpegArg,
            ...cookieArgs,
            "--user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "-f", "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--merge-output-format", "mp4",
            "--write-subs",
            "--write-auto-subs",
            "--convert-subs", "srt",
            "--ignore-errors",
            "-o", targetFile,
            url
        ];

        console.log("[Download] Spawning:", ytDlpPath, args.join(" "));

        const stderrLogs: string[] = [];

        await new Promise<void>((resolve, reject) => {
            const child = spawn(ytDlpPath, args);

            child.stdout.on('data', (data) => {
                const output = data.toString();
                const match = output.match(/(\d+\.\d+)%/);
                if (match) {
                    const percent = parseFloat(match[1]);
                    downloadStates.set(videoId, { status: 'active', progress: percent });
                }
            });

            child.stderr.on('data', (data) => {
                const log = data.toString();
                console.error(`[Download ${videoId}] stderr:`, log);
                stderrLogs.push(log);
                if (stderrLogs.length > 20) stderrLogs.shift();
            });

            child.on('close', async (code) => {
                if (code === 0) {
                    downloadStates.set(videoId, { status: 'completed', progress: 100 });

                    // Update DB with localPath
                    try {
                        await prisma.video.update({
                            where: { id: videoId },
                            data: { localPath: targetFile }
                        });
                    } catch (dbErr: any) {
                        // Ignore "Record to update not found" error for ad-hoc downloads
                        if (dbErr.code !== 'P2025') {
                            console.warn("Failed to update localPath in DB", dbErr.message);
                        }
                    }

                    setTimeout(() => downloadStates.delete(videoId), 60000);
                    resolve();
                } else {
                    const errorDetails = stderrLogs.join('\n').slice(-1000);
                    const errorMsg = `Download process exited with code ${code}.\nDetails: ${errorDetails}`;
                    downloadStates.set(videoId, { status: 'error', progress: 0, error: errorMsg });
                    setTimeout(() => downloadStates.delete(videoId), 60000);
                    reject(new Error(errorMsg));
                }
            });

            child.on('error', (err) => {
                downloadStates.set(videoId, { status: 'error', progress: 0, error: err.message });
                setTimeout(() => downloadStates.delete(videoId), 60000);
                reject(err);
            });
        });

        return NextResponse.json({ success: true, path: targetFile });

    } catch (e: any) {
        console.error("[Download API] Critical Error:", e);
        return NextResponse.json({
            error: `下载失败: ${e.message}`,
            stack: e.stack
        }, { status: 500 });
    }
}
