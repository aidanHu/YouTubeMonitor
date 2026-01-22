export function ChannelPageSkeleton() {
    return (
        <div className="h-screen bg-white dark:bg-zinc-950 flex flex-col overflow-hidden">
            <div className="h-8 w-full shrink-0" data-tauri-drag-region />
            <div className="flex-none px-8 pt-8 pb-0 max-w-[2000px] mx-auto w-full">
                {/* Back button skeleton - Matches pill size */}
                <div className="h-10 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-lg mb-6 animate-pulse" />

                {/* Header skeleton */}
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
                        <div className="space-y-2">
                            <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                            <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="h-10 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
                        <div className="h-10 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
                    </div>
                </div>

                {/* Stats skeleton */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="bg-zinc-100 dark:bg-zinc-900 p-4 rounded-xl">
                            <div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded mb-2 animate-pulse" />
                            <div className="h-6 w-20 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                        </div>
                    ))}
                </div>

                {/* Tabs skeleton */}
                <div className="flex gap-4 mb-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-10 w-20 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                    ))}
                </div>
            </div>

            {/* Content skeleton */}
            <div className="flex-1 overflow-hidden p-8 pt-4">
                <div className="grid grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="bg-zinc-100 dark:bg-zinc-900 rounded-xl p-4 space-y-3">
                            <div className="aspect-video bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
                            <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                            <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
