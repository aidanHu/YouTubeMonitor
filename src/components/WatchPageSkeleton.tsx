export function WatchPageSkeleton() {
    return (
        <div className="h-screen bg-black flex flex-col overflow-hidden">
            {/* Title Bar Skeleton */}
            <div className="h-10 w-full border-b border-zinc-800 flex items-center px-4 gap-4 shrink-0" data-tauri-drag-region>
                <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse" />
                <div className="w-48 h-5 bg-zinc-800 rounded animate-pulse" />
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Main Content (Player) */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Player Area Skeleton */}
                    <div className="relative w-full aspect-video bg-zinc-900 border-b border-zinc-800 shrink-0 animate-pulse">
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-zinc-800" />
                        </div>
                    </div>

                    {/* Video Info Skeleton */}
                    <div className="p-6 space-y-6 overflow-y-auto">
                        <div className="space-y-4">
                            <div className="h-8 w-3/4 bg-zinc-800 rounded animate-pulse" />
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-full bg-zinc-800 animate-pulse" />
                                <div className="space-y-2">
                                    <div className="h-5 w-32 bg-zinc-800 rounded animate-pulse" />
                                    <div className="h-4 w-24 bg-zinc-800 rounded animate-pulse" />
                                </div>
                            </div>
                        </div>

                        <div className="h-24 w-full bg-zinc-900 rounded-xl animate-pulse" />
                    </div>
                </div>

                {/* Sidebar (Comments/Related) Skeleton - Hidden on mobile */}
                <div className="w-[400px] border-l border-zinc-800 bg-zinc-950 flex-col hidden lg:flex">
                    <div className="p-4 border-b border-zinc-800">
                        <div className="h-8 w-32 bg-zinc-800 rounded animate-pulse" />
                    </div>
                    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex gap-3">
                                <div className="w-10 h-10 rounded-full bg-zinc-800 shrink-0 animate-pulse" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-24 bg-zinc-800 rounded animate-pulse" />
                                    <div className="h-16 w-full bg-zinc-900 rounded animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
