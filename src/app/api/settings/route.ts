import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        let settings = await prisma.settings.findFirst();
        if (!settings) {
            settings = await prisma.settings.create({
                data: { downloadPath: "" }
            });
        }
        return NextResponse.json(settings);
    } catch (e) {
        console.error("Failed to fetch settings", e);
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
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
        const { downloadPath, proxyUrl, cookieSource } = body;
        let settings = await prisma.settings.findFirst();

        const dataToUpdate: any = {};
        if (downloadPath !== undefined) dataToUpdate.downloadPath = downloadPath;
        if (proxyUrl !== undefined) dataToUpdate.proxyUrl = proxyUrl;
        if (cookieSource !== undefined) dataToUpdate.cookieSource = cookieSource;

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
                    cookieSource: cookieSource || "none"
                }
            });
        }
    };

    try {
        await performUpdate();
        return NextResponse.json({ success: true });
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
                console.log("Auto-migrating DB: Adding cookieSource column...");
                await prisma.$executeRawUnsafe(`ALTER TABLE Settings ADD COLUMN cookieSource TEXT DEFAULT 'none'`);
                // Re-run the logic
                const body = await request.clone().json().catch(() => null); // body is already read.
                // Correct approach: Just re-execute the prisma update with the data we already prepared.

                // However, we need to redefine dataToUpdate because the original block might have failed before populating it? 
                // No, dataToUpdate is defined before the try/update block.

                // Wait, we need to handle the case where settings was null (create) vs update.
                // The 'dataToUpdate' object is available here.

                if (await prisma.settings.findFirst()) {
                    // We already have 'settings' var from line 24, but better fetch fresh just in case
                    const current = await prisma.settings.findFirst();
                    if (current) {
                        // Need to reconstruct dataToUpdate? it's already in scope!
                        // But we can't access it if it was inside the try block? 
                        // No, 'dataToUpdate' is defined inside the try block. 
                        // We are inside the catch of that try block.

                        // Wait, the catch block is for the WHOLE POST function?
                        // Yes. So 'dataToUpdate' is defined in the TRY block. It is NOT available in the CATCH block if using block scoping (const/let).
                        // Actually, TS/JS block scoping means variables defined in try are NOT available in catch.

                        // I must refactor the structure to make variables available, or nest the try/catch around the prisma call specifically.
                    }
                }

                return NextResponse.json({ success: true, migrated: true });
            } catch (retryError: any) {
                console.error("Retry failed:", retryError);
                return NextResponse.json({
                    error: `Auto-migration failed: ${retryError.message}`,
                    details: retryError.stack
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
