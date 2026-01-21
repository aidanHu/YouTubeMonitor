import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const groups = await prisma.group.findMany({
        orderBy: [
            { isPinned: "desc" },
            { createdAt: "asc" }
        ]
    });
    return NextResponse.json(groups);
}

export async function POST(request: Request) {
    const body = await request.json();
    const { name } = body;

    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    try {
        const group = await prisma.group.create({
            data: { name }
        });
        return NextResponse.json(group);
    } catch (e) {
        return NextResponse.json({ error: "Group exists or error" }, { status: 400 });
    }
}
