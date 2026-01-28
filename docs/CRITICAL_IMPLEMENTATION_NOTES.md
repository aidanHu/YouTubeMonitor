# 关键实现说明文档 (Critical Implementation Notes)

本文档记录了修复特定 Bug 时的关键实现细节和逻辑决策。**在修改相关功能之前，请务必阅读本文档，以防止再次出现回归问题 (Regression)。**

## 1. 滚动条位置恢复逻辑 (Scroll Restoration)
**功能**：当从详情页返回列表（频道列表、视频列表）时，恢复之前的滚动位置。

- **相关文件**：`src/hooks/useScrollRestoration.ts`, `src/app/page.tsx`
- **已知问题**：早期使用 `useRef` 引用滚动容器时，存在竞态条件 (Race Condition)。即恢复逻辑运行时，Ref 可能还没绑定到 DOM 元素上，导致滚动失败（一直停留在顶部）。
- **正确实现**：
    1.  **使用 State 而非 Ref**：我们使用 `useState` 回调 (`const [scrollEl, setScrollEl] = useState(...)`) 来代替 `useRef`。这能确保当 DOM 元素真正挂载完成后，Effect 才会触发。
    2.  **统一的 Effect**：恢复逻辑应该在同一个 `useEffect` 依赖链中同时处理“初始恢复”和“重置回顶部”的操作，避免逻辑冲突。
    3.  **持久化**：位置数据保存在 `DataContext` 的 `scroll_positions` 中。
- **反模式 (绝对禁止)**：
    - 不要改回 `useRef<HTMLElement>(null)`。
    - 不要依赖长时间的 `setTimeout` 来“等待”数据加载。基于 State 的方法可以自然地处理时序问题。

## 2. 清空下载历史逻辑 (Download History Clearing)
**功能**：下载管理页面的“清空历史”按钮。

- **相关文件**：`src-tauri/src/modules/common.rs` (命令：`clear_download_history`)
- **已知问题**：之前的实现重置了 `is_downloaded = 0` 和 `local_path = NULL`。这导致了 **数据丢失 (Data Loss)**：即虽然物理文件还在硬盘上，但界面显示为“未下载”，移除了“打开文件夹”按钮，强迫用户重新下载。
- **正确实现**：
    - SQL 更新语句 **只能** 重置界面相关的状态：`download_status = 'idle'`, `download_error = NULL`。
    - **关键点**：在该命令中 **绝对不要** 修改 `is_downloaded` 或 `local_path`。这些字段代表物理文件的存在状态，而物理文件并没有被删除。
- **原则**：只有在执行“删除 (Delete)”操作时，才可以将 `is_downloaded` 设为 `0`。

## 3. 视频列表 API 签名 (Video List API Signature)
**功能**：从后端获取视频列表。

- **相关文件**：`src/components/VideoList.tsx` -> `src-tauri/src/modules/video.rs`
- **已知问题**：后端 `get_videos` 增加了一个 `min_views` 参数，但前端并未同步更新。这导致前端调用命令时静默失败（或报错），从而导致视频列表为空。
- **要求**：必须始终确保 `VideoList.tsx` 中的 `invoke('get_videos', ...)` 参数与 `video.rs` 中的 `get_videos` 函数签名 **完全匹配**。
