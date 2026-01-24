"use client";
import { useEffect } from "react";

export function DragRegionHandler() {
    useEffect(() => {
        const handleMouseDown = (e: MouseEvent) => {
            // Check if left mouse button
            if (e.button !== 0) return;

            const target = e.target as HTMLElement;
            // Find closest parent with data-tauri-drag-region attribute
            const dragRegion = target.closest("[data-tauri-drag-region]");

            if (dragRegion) {
                // Dynamically import Tauri API to avoid SSR issues
                import("@tauri-apps/api/window").then((module) => {
                    module.getCurrentWindow().startDragging();
                }).catch(err => console.error("Failed to start dragging:", err));
            }
        };

        window.addEventListener("mousedown", handleMouseDown);
        return () => window.removeEventListener("mousedown", handleMouseDown);
    }, []);

    return null;
}
