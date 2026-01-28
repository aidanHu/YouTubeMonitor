# Critical Implementation Notes

This document records critical implementation details and logic decisions made to resolve specific bugs. **Please read this before modifying related features to prevent regressions.**

## 1. Scroll Restoration Logic
**Feature**: Restoring scroll position when navigating back to a list (Channel List, Video List) from a detail page.

- **File**: `src/hooks/useScrollRestoration.ts`, `src/app/page.tsx`
- **Issue**: Previous implementations using `useRef` for the scroll container caused race conditions where the restoration logic ran before the ref was attached to the DOM element, leading to scroll failure (stuck at top).
- **Correct Implementation**:
    1.  **Use State, Not Ref**: We use a `useState` callback (`const [scrollEl, setScrollEl] = useState(...)`) instead of `useRef`. This ensures the effect re-runs exactly when the DOM element is actually mounted.
    2.  **Unified Effect**: The restoration logic handles both "initial restore" and "reset to top" in a single `useEffect` dependency chain.
    3.  **Persistence**: Positions are saved in `DataContext` (`scroll_positions`).
- **Anti-Pattern (DO NOT DO)**:
    - Do NOT switch back to `useRef<HTMLElement>(null)`.
    - Do NOT rely on large `setTimeout` values to "wait" for data. The state-based approach handles the timing naturally.

## 2. Download History Clearing
**Feature**: The "Clear History" button in the Download Manager.

- **File**: `src-tauri/src/modules/common.rs` (Command: `clear_download_history`)
- **Issue**: Previously, this command reset `is_downloaded = 0` and `local_path = NULL`. This caused **Data Loss**: files existed on disk, but the UI treated them as "not downloaded", removing the "Open Folder" button and forcing users to re-download.
- **Correct Implementation**:
    - The SQL Update **MUST ONLY** reset UI-related status: `download_status = 'idle'`, `download_error = NULL`.
    - **CRITICAL**: **NEVER** modify `is_downloaded` or `local_path` in this command. These fields represent the physical file state, which hasn't changed.
- **Invariant**: `is_downloaded` should only be set to `0` if the file is actually deleted via the "Delete" action.

## 3. Video List API Signature
**Feature**: Fetching the video list from the backend.

- **File**: `src/components/VideoList.tsx` -> `src-tauri/src/modules/video.rs`
- **Issue**: Backend `get_videos` added a `min_views` argument, but frontend failed to update. this caused the command to fail silently (or return error), resulting in an empty video list.
- **Requirement**: Always ensure the `invoke('get_videos', ...)` arguments in `VideoList.tsx` exactly match the `get_videos` function signature in `video.rs`.
