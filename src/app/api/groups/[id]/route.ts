import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const id = parseInt(params.id);

    try {
        // Disconnect channels from this group first (set groupId to null)
        await prisma.channel.updateMany({
            where: { groupId: id },
            data: { groupId: null }
        });

        // Delete the group
        await prisma.group.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    const id = parseInt(params.id);
    const body = await request.json();
    const { name, isPinned } = body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (isPinned !== undefined) data.isPinned = isPinned;

    try {
        const group = await prisma.group.update({
            where: { id },
            data
        });
        return NextResponse.json(group);
    } catch (e) {
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}
