import { useEffect, useRef, useState, useCallback } from "react";
import { useData } from "@/context/DataContext";

export function useScrollRestoration() {
    const {
        scroll_positions,
        set_scroll_position,
        current_tab,
        selected_group_id
    } = useData();

    // Use callback ref to know exactly when DOM is ready
    const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
    const positionRef = useRef(0);
    const [show_back_to_top, set_show_back_to_top] = useState(false);

    // 1. Handle Scroll Event
    const handle_scroll = (e: React.UIEvent<HTMLElement>) => {
        const scrollTop = e.currentTarget.scrollTop;
        positionRef.current = scrollTop;

        if (scrollTop > 300) {
            if (!show_back_to_top) set_show_back_to_top(true);
        } else {
            if (show_back_to_top) set_show_back_to_top(false);
        }
    };

    // 2. Scroll to Top Helper
    const scrollToTop = () => {
        if (scrollEl) {
            scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // 3. Unified Restore/Reset Logic
    useEffect(() => {
        if (!scrollEl) return;

        const saved = scroll_positions[current_tab];

        // Use a small timeout to allow layout (Virtuoso) to settle
        const timer = setTimeout(() => {
            if (saved && saved > 0) {
                // Check if scroll is possible
                if (scrollEl.scrollHeight >= saved) {
                    scrollEl.scrollTop = saved;
                } else {
                    // One minimal retry for async data
                    setTimeout(() => {
                        if (scrollEl.scrollHeight >= saved) {
                            scrollEl.scrollTop = saved;
                        }
                    }, 100);
                }
            } else {
                // No saved position? Go to top (for new tab switch)
                scrollEl.scrollTop = 0;
            }
        }, 0);

        return () => clearTimeout(timer);
    }, [current_tab, selected_group_id, scrollEl]); // Run when tab changes or element mounts

    // 4. Save on Unmount/Change
    useEffect(() => {
        return () => {
            if (positionRef.current > 0) {
                set_scroll_position(current_tab, positionRef.current);
            }
        };
    }, [current_tab, set_scroll_position]);

    return {
        scrollRef: setScrollEl, // Pass this to ref={}
        scrollEl, // Pass this to scrollParent={} (replacing .current)
        handle_scroll,
        scrollToTop,
        show_back_to_top
    };
}
