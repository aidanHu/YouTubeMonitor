import { Suspense } from "react";
import ClientPage from "./ClientPage";
import { ChannelPageSkeleton } from "@/components/ChannelPageSkeleton";

export default function Page() {
    return (
        <Suspense fallback={<ChannelPageSkeleton />}>
            <ClientPage />
        </Suspense>
    );
}
