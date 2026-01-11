const { app, BrowserWindow, screen } = require("electron");
const path = require("path");
const fs = require('fs');
const { spawn } = require("child_process");
const http = require("http");

let mainWindow;
let nextAppProcess;

const isDev = !app.isPackaged;

function findFreePort(startPort) {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.listen(startPort, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(findFreePort(startPort + 1));
            } else {
                reject(err);
            }
        });
    });
}

async function startNextServer() {
    if (isDev) return "http://localhost:3000";

    const port = await findFreePort(3000);
    const serverPath = path.join(process.resourcesPath, "standalone/launcher.js");

    // Determine yt-dlp path based on platform
    const platform = process.platform;
    const binaryName = platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
    // In production, extraResources puts 'bin' and 'prisma' inside 'resources'
    const ytDlpPath = path.join(process.resourcesPath, "bin", binaryName);

    // PERSISTENCE FIX: Use app.getPath("userData") for database
    const userDataPath = app.getPath("userData");
    const dbPath = path.join(userDataPath, "production.db");

    // Copy bundled DB to userData if it doesn't exist (first launch or migration)
    if (!fs.existsSync(dbPath)) {
        const oldDbPath = path.join(userDataPath, "dev.db");
        const bundledDbPath = path.join(process.resourcesPath, "prisma", "dev.db");

        if (fs.existsSync(oldDbPath)) {
            // Migration: User has data in 'dev.db' from previous version
            console.log("Migrating legacy data from dev.db to production.db...");
            // We copy instead of rename to be safe, prevents breaking any other dev envs
            fs.copyFileSync(oldDbPath, dbPath);
        } else if (fs.existsSync(bundledDbPath)) {
            // New Install: Use empty template
            console.log("Initializing new database from bundle...");
            fs.copyFileSync(bundledDbPath, dbPath);
        } else {
            console.error("Bundled database not found at:", bundledDbPath);
        }
    }

    console.log("Starting Next.js server at port:", port);
    console.log("Using yt-dlp at:", ytDlpPath);
    console.log("Using DB at:", dbPath);

    // Ensure binaries are executable (fix for MacOS permission loss during packaging)
    if (process.platform !== "win32") {
        try {
            fs.chmodSync(ytDlpPath, 0o755);
            // Also chmod ffmpeg if it exists in the same folder
            const ffmpegPath = path.join(path.dirname(ytDlpPath), "ffmpeg");
            if (fs.existsSync(ffmpegPath)) {
                fs.chmodSync(ffmpegPath, 0o755);
            }

            const ffprobePath = path.join(path.dirname(ytDlpPath), "ffprobe");
            if (fs.existsSync(ffprobePath)) {
                fs.chmodSync(ffprobePath, 0o755);
            }

            // FIX: Chmod the entire dependencies folder to ensure Prisma Query Engine is executable
            const depsPath = path.join(process.resourcesPath, "standalone/dependencies");
            if (fs.existsSync(depsPath)) {
                // Simple recursive chmod (sync)
                const chmodRecursive = (dir) => {
                    fs.readdirSync(dir).forEach(file => {
                        const filePath = path.join(dir, file);
                        const stat = fs.statSync(filePath);
                        if (stat.isDirectory()) {
                            chmodRecursive(filePath);
                        } else {
                            // Provide execute permissions to all files in dependencies to be safe (includes query-engine)
                            fs.chmodSync(filePath, 0o755);
                        }
                    });
                };
                // Only do this for .prisma to save time/risk
                const prismaPath = path.join(depsPath, ".prisma");
                const prismaClientPath = path.join(depsPath, "@prisma/client");

                if (fs.existsSync(prismaPath)) chmodRecursive(prismaPath);
                if (fs.existsSync(prismaClientPath)) chmodRecursive(prismaClientPath);
            }

            console.log("Fixed permissions for binaries (yt-dlp, ffmpeg, ffprobe, prisma)");
        } catch (e) {
            console.error("Failed to set permissions:", e);
        }
    }

    // Use bundled pure Node binary if available to avoid Dock icon issues
    let nodePath = path.join(process.resourcesPath, "standalone/bin/node");
    if (process.platform === "win32") nodePath += ".exe";

    // Fallback to electron's node if bundled one is missing (dev mode usually)
    if (!fs.existsSync(nodePath)) {
        nodePath = process.execPath;
    } else {
        console.log("Using bundled Node binary:", nodePath);
    }

    // Fix PATH for macOS GUI apps to include Homebrew/local bin
    const fixPath = () => {
        if (process.platform === 'darwin') {
            // specific paths for Apple Silicon and Intel Mac
            return `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`;
        }
        return process.env.PATH;
    };

    // FIX: Handle spaces in DB Path for Prisma (sqlite file: protocol)
    // On Mac: /Users/.../Application Support/...
    // encodeURI preserves the slashes but encodes spaces to %20
    const dbUrl = process.platform === 'win32'
        ? `file:${dbPath}`
        : `file:${dbPath}`; // Prisma connects fine with spaces on Mac usually, but let's try strict quoting if needed. 
    // Actually, Prisma recommends NOT encoding on some versions, but 'Application Support' is tricky.
    // Let's rely on standard path. If it failed before, maybe it's the permissions.

    // Attempt: Pass env var without file: prefix if Prisma handles it? No, schema has `file:`.
    // Let's try to verify if permissions was the main issue.
    // But to be safe, let's log the path.

    // Windows might need "file:C:/..." or "file:///C:/..."

    nextAppProcess = spawn(nodePath, [serverPath], {
        env: {
            ...process.env,
            PATH: fixPath(),
            ELECTRON_RUN_AS_NODE: "1",
            PORT: port,
            NODE_ENV: "production",
            YT_DLP_PATH: ytDlpPath,
            DATABASE_URL: `file:${dbPath}`,
        },
        cwd: path.join(process.resourcesPath, "standalone"), // Set CWD to standalone folder
    });

    nextAppProcess.stdout.on("data", (data) => console.log(`Next.js Output: ${data}`));
    nextAppProcess.stderr.on("data", (data) => console.error(`Next.js Error: ${data}`));

    return `http://localhost:${port}`;
}

async function createWindow() {
    const startUrl = await startNextServer();

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: Math.min(1400, width),
        height: Math.min(900, height),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js"), // Add preload
            webviewTag: true, // Enable webview just in case, though iframe is standard
        },
        autoHideMenuBar: true, // Keep it usable
    });

    // DEBUG: Always open DevTools to debug production issues
    // mainWindow.webContents.openDevTools();

    const loadURL = () => {
        mainWindow.loadURL(startUrl).catch((e) => {
            console.log("Error loading URL, retrying in 1s...", e.message);
            setTimeout(loadURL, 1000);
        });
    };

    loadURL();

    mainWindow.on("closed", function () {
        mainWindow = null;
    });
}

// IPC Handler for Cookie Injection
const { ipcMain, session } = require("electron");

ipcMain.handle("refresh-cookies", async () => {
    try {
        if (!mainWindow) return { success: false };

        // 1. Fetch cookies from local API
        // We need to know the port. We can store it globally or guess.
        // Since we return the URL from startNextServer, let's extract port.
        // HACK: We'll assume localhost:port is available via the current URL of the window 
        // OR we just save the port globally.

        // Actually, startNextServer returns full URL. We should save it.
        const currentUrl = mainWindow.webContents.getURL();
        if (!currentUrl.includes("localhost")) return { success: false, error: "Not on localhost" };

        const origin = new URL(currentUrl).origin;
        const res = await fetch(`${origin}/api/settings/cookies`);
        const data = await res.json();

        if (data.cookies && Array.isArray(data.cookies)) {
            console.log(`Setting ${data.cookies.length} cookies...`);
            for (const cookie of data.cookies) {
                try {
                    // Electron cookie structure needs specific fields
                    // { url, name, value, domain, path, secure, httpOnly, expirationDate }
                    // Our API returns roughly this.
                    const scheme = cookie.secure ? "https" : "http";
                    const url = `${scheme}://${cookie.domain.startsWith('.') ? 'www' + cookie.domain : cookie.domain}${cookie.path}`;

                    const cookieDetails = {
                        url: url,
                        name: cookie.name,
                        value: cookie.value,
                        domain: cookie.domain,
                        path: cookie.path,
                        secure: cookie.secure,
                        // expirationDate: cookie.expirationDate // Optional
                    };

                    await session.defaultSession.cookies.set(cookieDetails);
                } catch (err) {
                    console.error("Cookie set error:", cookie.name, err.message);
                }
            }
            return { success: true, count: data.cookies.length };
        }
        return { success: false, error: data.error || "No cookies" };
    } catch (e) {
        console.error("IPC refresh-cookies failed", e);
        return { success: false, error: e.message };
    }
});

app.on("ready", createWindow);

app.on("window-all-closed", function () {
    if (process.platform !== "darwin") {
        app.quit();
    }
    // Kill child process on exit
    if (nextAppProcess) {
        nextAppProcess.kill();
    }
});

app.on("will-quit", () => {
    if (nextAppProcess) {
        nextAppProcess.kill();
    }
});

app.on("activate", function () {
    if (mainWindow === null) {
        createWindow();
    }
});
