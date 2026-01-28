# 技术架构文档 (Technical Architecture)

## 1. 系统概览 (Overview)
本项目是一个基于 Tauri v2 构建的跨平台桌面应用程序，旨在通过本地数据库管理和监控 YouTube 频道及视频数据。

- **应用类型**: 桌面客户端 (macOS / Windows)
- **核心框架**: [Tauri v2](https://v2.tauri.app/) (Rust + Webview)
- **前端框架**: Next.js (React 18) + TypeScript
- **UI 库**: TailwindCSS + Lucide Icons + Radix UI
- **后端语言**: Rust
- **数据库**: SQLite (通过 `sqlx` 访问)
- **核心外部依赖**: 
  - `yt-dlp`: 用于视频下载和元数据解析
  - `ffmpeg`: 用于视频流合并
  - YouTube Data API v3: 用于获取最新频道和视频数据

## 2. 架构分层 (Architecture Layers)

### 2.1 表现层 (Frontend - Next.js)
前端负责界面展示和用户交互，采用单页应用 (SPA) 模式。

- **`src/app`**: 页面路由。
  - `page.tsx`: 主页面，包含标签页切换逻辑。
  - `layout.tsx`: 全局布局，注入 Context Providers。
- **`src/components`**: 业务组件。
  - `VideoList.tsx`: 视频网格展示，集成了**虚拟滚动 (Virtuoso)** 以支持海量数据渲染。
  - `DownloadManager.tsx`: 下载任务管理，实时显示进度。
- **`src/hooks`**: 自定义 Hooks。
  - `useScrollRestoration.ts`: **关键组件**，实现了基于 State 的滚动位置记忆与恢复逻辑。
- **`src/context`**: 全局状态管理。
  - `DataContext`: 管理频道列表、分组、滚动位置快照。
  - `DownloadContext`: 管理下载队列、进度事件监听。

### 2.2 桥接层 (Tauri Invoke/Events)
前端与后端通过 Tauri 的 IPC 机制通信。

- **Commands (`invoke`)**: 前端主动调用后端函数（如 `get_videos`, `sync_channels`）。
- **Events (`emit/listen`)**: 后端主动推送消息给前端（如 `download-progress` 下载进度）。

### 2.3 业务逻辑层 (Backend - Rust)
后端逻辑位于 `src-tauri/src`，按功能模块划分。

- **`modules/channel.rs`**: 
  - 频道管理与同步。
  - **配额管理**: 智能计算 YouTube API 消耗，防止超额。
- **`modules/video.rs`**:
  - 视频查询与筛选。
  - **算法**: 实现了 Z-Score 和 VPH (Views Per Hour) 计算，用于识别"爆款"视频。
- **`modules/download.rs` & `common.rs`**:
  - 封装 `yt-dlp` 命令。
  - **关键逻辑**: `clear_download_history` 负责清理 UI 状态，但严格保留物理文件记录 (`is_downloaded`)。
- **`modules/settings.rs`**:
  - 系统设置管理（代理、下载路径、激活状态）。

### 2.4 数据持久层 (SQLite)
利用 `sqlx` 在本地运行 SQLite 数据库，保证数据隐私和离线可用。

- **主要表结构**:
  - `channels`: 频道信息。
  - `videos`: 视频元数据、统计数据、本地下载状态 (`local_path`, `is_downloaded`)。
  - `settings`:全局配置。

## 3. 关键工作流 (Key Workflows)

### 3.1 视频同步 (Sync Flow)
1.  用户点击"刷新"。
2.  后端读取 `channels` 表。
3.  调用 YouTube Data API 获取最新视频。
4.  比对数据库：新视频插入，旧视频更新数据。
5.  计算统计指标 (Avg Views, StdDev) 并更新。

### 3.2 视频下载 (Download Flow)
1.  用户点击"下载"。
2.  前端调用 `download_video`。
3.  后端 Spawn `yt-dlp` 子进程。
4.  后端解析 `yt-dlp` 的 stdout 进度，通过 `download-progress` 事件实时发回前端。
5.  下载完成：
    - 更新数据库：`is_downloaded = 1`, `local_path = /path/to/file`。
    - 发送 `download-complete` 事件。

### 3.3 滚动恢复 (Scroll Restoration)
1.  用户在列表页滚动，前端实时记录 `scrollTop` 到 Context。
2.  用户进入详情页，列表组件卸载 (Unmount)。
3.  用户返回，列表组件重新挂载 (Mount)。
4.  `useScrollRestoration` 检测到挂载，从 Context 读取上次位置。
5.  直接设置 DOM 元素的 `scrollTop` (无须等待 API，因为数据有缓存)。

### 3.4 视频播放 (Video Playback)
采用混合播放策略，区分在线流媒体与本地已下载文件。

- **在线播放 (Streaming)**:
  - **核心组件**: `src/app/watch/ClientPage.tsx`
  - **挑战**: 直接嵌入 YouTube IFrame 会遇到严格的 Origin/CORS 策略限制，且部分 Cookie 隐私设置会导致无法播放。
  - **解决方案**: **Localhost Proxy 模式**。
    1.  Tauri 后端 (`lib.rs`) 启动一个本地静态文件服务器，监听端口 `1430`。
    2.  前端 `<iframe />` 指向 `http://localhost:1430/youtube-player.html?id=...`。
    3.  `youtube-player.html` 作为一个纯净的容器，负责加载 YouTube SDK 并注入正确的 `origin` 和 `referrer` 参数。
  - **优势**: 绕过跨域限制，且能在生产环境中稳定运行。

- **本地播放 (Local File)**:
  - **策略**: **系统托管 (System Delegation)**。
  - **实现**: 不在应用内内置复杂的本地播放器，而是通过 `open_video_folder` 命令打开文件所在位置。
  - **理由**: 这种设计利用了操作系统原生的解码能力和用户习惯的播放器（如 PotPlayer, IINA, VLC），避免了在 WebView 中处理高性能视频解码的复杂性和兼容性问题。

## 4. 部署与发布 (Deployment)
- **CI/CD**: GitHub Actions
- **构建**: 自动编译 Rust 后端和 Next.js 前端，打包为 `.dmg` (macOS) 或 `.msi` (Windows)。
- **发布**: 自动创建 GitHub Release 并上传构建产物。

## 5. 关键实现说明 (Critical Implementation Notes)
本节记录了修复特定 Bug 时的关键实现细节和逻辑决策。**在修改相关功能之前，请务必阅读本文档，以防止再次出现回归问题 (Regression)。**

### 5.1 滚动条位置恢复 (Scroll Restoration)
- **相关文件**: `src/hooks/useScrollRestoration.ts`, `src/app/page.tsx`
- **机制**:
    - **State vs Ref**: 必须使用 `useState` 回调来获取滚动容器的引用，而非 `useRef`。这是因为 React 的 Ref 更新不会触发重新渲染，导致 Effect 可能在 DOM 挂载前执行。
    - **持久化**: 滚动位置保存在 `DataContext` 全局状态中，而非组件局部状态。
- **反模式**: 严禁改回 `useRef<HTMLElement>(null)`，这会导致竞态条件。

### 5.2 清空下载历史 (Download History Clearing)
- **相关文件**: `src-tauri/src/modules/common.rs` (`clear_download_history`)
- **逻辑**:
    - **UI 重置**: 仅重置 `download_status = 'idle'` 和 `download_error = NULL`。
    - **数据保留**: **绝对禁止** 修改 `is_downloaded` 和 `local_path` 字段。
- **原因**: 用户点击“清空历史”仅意在清除下载任务列表，而非删除物理文件。保留这些字段能确保“打开文件夹”功能继续可用。

### 5.3 视频列表 API 签名 (Video List API Signature)
- **相关文件**: `src/components/VideoList.tsx` <-> `src-tauri/src/modules/video.rs`
- **约束**: 前端 `invoke('get_videos', ...)` 的参数列表必须与后端 Rust 函数签名 **完全一致**。Rust 是强类型语言，参数缺失或类型不匹配会导致静默失败。
- **注意**: 新增参数时（如 `min_views`），必须同时更新前后端。

### 5.4 视频列表状态同步 (Video List State Sync)
- **相关文件**: `src/components/VideoList.tsx`
- **问题**: 下载完成后，如果不刷新列表，`video.local_path` 仍为 `null`。此时若用户“清空历史”，UI 会因为缺少路径而回退到“下载”按钮。
- **解决方案**:
    1.  **事件监听**: 组件挂载时监听 `download-complete` 事件。
    2.  **实时更新**: 收到事件后，立即更新本地 state (`videos`) 和缓存 (`video_cache`) 中的 `local_path` 和 `is_downloaded` 状态。
    3.  **性能优化**: `generateCacheKey` 函数必须使用 `useCallback` 包裹，防止因引用变化导致监听器在每次渲染时反复销毁重建。

### 5.5 外部依赖管理 (External Dependency Management)
- **机制**: 应用不内置 `yt-dlp` 二进制文件，而是通过 `src-tauri/src/modules/common.rs` 中的 `get_fixed_path` 获取系统环境变量 `PATH`，直接调用用户系统中安装的工具。
- **优势**:
    - **轻量化**: 显著减小安装包体积。
    - **维护性**: 应对 YouTube 反爬策略更新时，用户仅需在终端运行 `yt-dlp -U` 即可升级核心功能，无需等待应用发版。

### 5.6 文件一致性策略 (File Consistency Strategy)
- **相关文件**: `src/components/VideoCardOverlay.tsx`
- **机制**: 采用 "Lazy Check" (惰性检查) 策略。
    - 不在应用启动时进行全盘扫描（避免高 I/O 消耗）。
    - 仅在用户点击“打开文件夹”时进行检查。
    - 若捕获到 `ERR_FILE_NOT_FOUND` 错误，前端自动弹出确认框，引导用户一键重新下载。
- **设计哲学**: 相信数据库记录，但在交互时验证物理文件，并提供闭环的恢复路径。
