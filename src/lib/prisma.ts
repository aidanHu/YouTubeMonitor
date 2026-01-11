import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        // log: ["query"], // Uncomment for debugging
    });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// BigInt serialization patch
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};
