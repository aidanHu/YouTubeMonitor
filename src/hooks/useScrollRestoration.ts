import { useEffect, useRef, useState } from "react";
import { useData } from "@/context/DataContext";

export function useScrollRestoration() {
    const {
        scroll_positions,
        set_scroll_position,
        current_tab,
        selected_group_id
    } = useData();

    const scrollRef = useRef<HTMLElement>(null);
    const positionRef = useRef(0);
    const [show_back_to_top, set_show_back_to_top] = useState(false);

    // 1. Handle Scroll Event
    const handle_scroll = (e: React.UIEvent<HTMLElement>) => {
        const scrollTop = e.currentTarget.scrollTop;
        positionRef.current = scrollTop;

        // Show/Hide Back to Top
        if (scrollTop > 300) {
            if (!show_back_to_top) set_show_back_to_top(true);
        } else {
            if (show_back_to_top) set_show_back_to_top(false);
        }
    };

    // 2. Scroll to Top Helper
    const scrollToTop = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // 3. Mount Restore Effect
    useEffect(() => {
        const restoreScroll = () => {
            const saved = scroll_positions[current_tab];
            if (saved && saved > 0) {
                const container = scrollRef.current;
                if (!container) return;

                if (container.scrollHeight >= saved) {
                    container.scrollTop = saved;
                } else {
                    // Retry short loop for dynamic content
                    let attempts = 0;
                    const retry = () => {
                        if (scrollRef.current && scrollRef.current.scrollHeight >= saved) {
                            scrollRef.current.scrollTop = saved;
                        } else if (attempts < 10) {
                            attempts++;
                            setTimeout(retry, 50);
                        }
                    };
                    retry();
                }
            }
        };
        restoreScroll();
    }, []); // Run once on mount

    // 4. Tab/Group Change Effect - Reset to top
    const isFirstRun = useRef(true);
    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
        scrollToTop();
    }, [current_tab, selected_group_id]);

    // 5. Save on Unmount/Change
    useEffect(() => {
        return () => {
            if (positionRef.current > 0) {
                set_scroll_position(current_tab, positionRef.current);
            }
        };
    }, [current_tab, set_scroll_position]);

    return {
        scrollRef,
        handle_scroll,
        scrollToTop,
        show_back_to_top
    };
}
