# YouTubeMonitor

YouTube 频道监控和视频下载工具

## 📦 下载

前往 [Releases](https://github.com/aidanHu/YouTubeMonitor/releases) 页面下载最新版本：

- **macOS (M1/M2/M3)**: `YouTubeMonitor_x.x.x_aarch64.dmg`
- **Windows (x64)**: `YouTubeMonitor-Portable-Windows-x64.zip`（绿色免安装版）

## ✨ 功能特点

- 📺 监控多个 YouTube 频道
- 📊 数据分析和可视化
- ⬇️ 视频下载（支持批量）
- 🔔 新视频提醒
- 📁 自动分类管理

## 🚀 快速开始

### macOS
1. 下载 `.dmg` 文件
2. 拖拽到 Applications 文件夹
3. 右键点击应用，选择"打开"

### Windows
1. 下载 `.zip` 绿色版压缩包
2. 解压到任意文件夹
3. 双击 `YouTubeMonitor.exe` 运行


### 3. 启动开发环境

#### 第一步：配置密钥 (必要)
为了安全，必须在本地配置一个密钥文件（该文件已被 `.gitignore` 忽略，**不要**上传到 GitHub）：

1. 在项目根目录新建文件 `.env`
2. 写入以下内容（`ACTIVATION_SALT` 建议使用无需记忆的随机长字符串）：
   ```bash
   ACTIVATION_SALT=my_secret_key_123456
   ```

#### 第二步：启动应用
```bash
# 1. 安装依赖
npm install

# 2. 启动 (必须使用此命令加载环境变量)
export $(cat .env | xargs) && npm run tauri dev
```

#### 第三步：如何激活开发版？
1. 启动应用后，会进入激活页面。
2. 随便找个地方把你的 `Machine ID` 复制下来。
3. 把你的 `ACTIVATION_SALT` (如 `my_secret_key_123456`) 和 `Machine ID` 拼接。
4. 自己写个小脚本算一下 HMAC-SHA256，或者暂时为了开发方便，你可以修改 `src-tauri/src/modules/settings.rs` 里的逻辑，临时打印出需要的签名。
   *(注：作为开发者，你拥有源码，这一步完全由你掌控)*


## ✨ 功能特点

- 📺 **监控管理**: 批量监控多个 YouTube 频道
- 📊 **智能看板**: VPH (Views Per Hour) 分析与爆款指数
- ⬇️ **高速下载**: 多线程下载队列，支持断点续传
- ⚡ **性能优化**: 全局 HTTP 长连接复用，极速同步
- 🛡️ **智能风控**: API 配额自动熔断保护，防止封号
- 🧱 **安全沙箱**: 严格的文件路径访问控制

## 🛠️ 开发指南

### 1. 环境准备
确保已安装 [Node.js](https://nodejs.org/) (v20+) 和 [Rust](https://www.rust-lang.org/)。

### 2. 配置密钥
本项目为了安全，激活码盐值 (Salt) 不会存储在代码中。
你需要创建一个 `.env` 文件在项目根目录（该文件已被 `.gitignore` 忽略，不会上传到 GitHub），内容如下：

```bash
# 生成一个随机的高强度密钥
ACTIVATION_SALT=你的随机密钥字符串(例如openssl rand -hex 32生成的)
```

### 3. 启动开发环境
```bash
# 安装依赖
npm install

# 启动 (需加载环境变量)
export $(cat .env | xargs) && npm run tauri dev
```

## 📝 许可证

本项目采用 **GPL-3.0** 开源协议。
源代码完全开放，但请遵守开源协议规定。

---

**版本**: 0.1.0
**更新日期**: 2026-01-24 (<a href="https://github.com/aidanHu/YouTubeMonitor/commits/main">查看变更日志</a>)
