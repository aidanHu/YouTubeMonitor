import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMachineId, validateActivation } from "@/lib/activation";

export async function GET() {
    // 1. Get Machine ID (Safe, from Env)
    const machineId = getMachineId() || "UNKNOWN_ID_FALLBACK";

    try {
        let settings = null;
        try {
            settings = await prisma.settings.findFirst();
        } catch (dbError) {
            console.error("Database connection failed:", dbError);
            // Fallback to in-memory defaults if DB is down
        }

        if (!settings) {
            // If DB is working but empty, create defaults
            try {
                if (!settings) {
                    // Check connection before create? No, just try catch
                    // Actually, if findFirst threw, create will likely throw too.
                    // We should only create if the previous error wasn't fatal.
                }
                // Let's simplified: If we have no settings and no error, create.
                // If we have error, use default object.
            } catch (e) {
                console.error("Failed to init settings", e);
            }
        }

        // Use settings or defaults
        const currentCode = settings?.activationCode || "";
        const validation = currentCode
            ? validateActivation(currentCode, machineId)
            : { valid: false };

        return NextResponse.json({
            id: settings?.id || "default",
            downloadPath: settings?.downloadPath || "",
            proxyUrl: settings?.proxyUrl || "",
            cookieSource: settings?.cookieSource || "none",
            activationCode: currentCode,
            machineId,
            isActivated: validation.valid,
            expiresAt: validation.expiresAt,
            dbStatus: settings ? "ok" : "error"
        });

    } catch (e) {
        console.error("Critical error in settings API", e);
        // Even in critical error, try to return machineId
        return NextResponse.json({
            machineId,
            error: "Critical API Error",
            isActivated: false
        });
    }
}

export async function POST(request: Request) {
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const performUpdate = async () => {
        const { downloadPath, proxyUrl, cookieSource, activationCode } = body;
        let settings = await prisma.settings.findFirst();

        const dataToUpdate: any = {};
        if (downloadPath !== undefined) dataToUpdate.downloadPath = downloadPath;
        if (proxyUrl !== undefined) dataToUpdate.proxyUrl = proxyUrl;
        if (cookieSource !== undefined) dataToUpdate.cookieSource = cookieSource;

        // Handle Activation Code
        if (activationCode !== undefined) {
            const machineId = getMachineId();
            const validation = validateActivation(activationCode, machineId);

            // Allow saving even if invalid? 
            // Better to only save/allow if valid, OR save it but return status.
            // Let's save it regardless so user can 'try', but the UI will show invalid.
            dataToUpdate.activationCode = activationCode;

            // We'll return validation status in the final response if we could, 
            // but here we just update data. 
            // Ideally we should return specific feedback.
        }

        if (settings) {
            await prisma.settings.update({
                where: { id: settings.id },
                data: dataToUpdate
            });
        } else {
            await prisma.settings.create({
                data: {
                    downloadPath: downloadPath || "",
                    proxyUrl: proxyUrl || null,
                    cookieSource: cookieSource || "none",
                    activationCode: activationCode || null
                }
            });
        }
    };

    try {
        await performUpdate();

        // Check activation status to return immediate feedback
        const machineId = getMachineId();
        // Re-read settings or use input? 
        // Let's assume input for feedback if present
        let validation: { valid: boolean, message?: string, expiresAt?: Date } = { valid: false };
        if (body && body.activationCode) {
            validation = validateActivation(body.activationCode, machineId);
        }

        return NextResponse.json({
            success: true,
            activationValid: validation.valid,
            activationMessage: validation.message,
            expiresAt: validation.expiresAt
        });
    } catch (e: any) {
        console.error("Failed to update settings", e);

        // Auto-migration: If column missing, add it and retry
        // SQLite error: "no such column: cookieSource"
        // Prisma error: "The column `main.Settings.cookieSource` does not exist in the current database"
        const isColumnMissing = e.message && (
            e.message.includes('no such column') ||
            e.message.includes('does not exist in the current database') ||
            e.code === 'P2025'
        );

        if (isColumnMissing) {
            try {
                // Check missing columns and add them
                if (e.message.includes('activationCode')) {
                    console.log("Auto-migrating DB: Adding activationCode column...");
                    await prisma.$executeRawUnsafe(`ALTER TABLE Settings ADD COLUMN activationCode TEXT`);
                } else if (e.message.includes('cookieSource')) {
                    console.log("Auto-migrating DB: Adding cookieSource column...");
                    await prisma.$executeRawUnsafe(`ALTER TABLE Settings ADD COLUMN cookieSource TEXT DEFAULT 'none'`);
                }

                // Retry logic: Attempt to run the update again after fixing the schema
                console.log("Auto-migration applied. Retrying update...");
                await performUpdate();

                // If performUpdate succeeded, return success response
                const machineId = getMachineId();
                let validation: { valid: boolean, message?: string, expiresAt?: Date } = { valid: false };
                if (body && body.activationCode) {
                    validation = validateActivation(body.activationCode, machineId);
                }

                return NextResponse.json({
                    success: true,
                    activationValid: validation.valid,
                    activationMessage: validation.message,
                    expiresAt: validation.expiresAt,
                    migrated: true
                });

            } catch (retryError: any) {
                console.error("Retry failed:", retryError);
                return NextResponse.json({
                    error: `Auto-migration failed: ${retryError.message}`,
                }, { status: 500 });
            }
        }

        return NextResponse.json({
            error: `Update failed: ${e.message}`,
            code: e.code,
            details: e.stack
        }, { status: 500 });
    }
}
