import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const keys = await prisma.apiKey.findMany({
        orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(keys);
}

export async function POST(request: Request) {
    const body = await request.json();
    const { key, name } = body;

    if (!key) return NextResponse.json({ error: "Key required" }, { status: 400 });

    try {
        const newKey = await prisma.apiKey.create({
            data: {
                key,
                name,
                isActive: true,
            },
        });
        return NextResponse.json(newKey);
    } catch (e: any) {
        console.error("API Error detailed:", e);
        return NextResponse.json({
            error: "Key already exists or error",
            details: e.message,
            stack: e.stack
        }, { status: 400 });
    }
}

export async function PATCH(request: Request) {
    const body = await request.json();
    const { id, isActive } = body;

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const updated = await prisma.apiKey.update({
        where: { id: parseInt(id) },
        data: { isActive: Boolean(isActive) },
    });

    return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    await prisma.apiKey.delete({
        where: { id: parseInt(id) },
    });

    return NextResponse.json({ success: true });
}
