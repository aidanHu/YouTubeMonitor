import { Suspense } from "react";
import WatchClientPage from "./ClientPage";
import { WatchPageSkeleton } from "@/components/WatchPageSkeleton";

export default function Page() {
    return (
        <Suspense fallback={<WatchPageSkeleton />}>
            <WatchClientPage />
        </Suspense>
    );
}
