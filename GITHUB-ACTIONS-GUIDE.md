# GitHub Actions 自动构建说明

## 📦 自动构建配置

已配置 GitHub Actions 自动构建以下版本：

### 构建平台
- ✅ **macOS (M1/M2/M3)**: `.dmg` 安装包
- ✅ **Windows (x64)**: `.msi` 安装包 + 绿色便携版 `.zip`

### 触发方式

#### 方式 1：创建 Git Tag（推荐）
```bash
# 创建并推送版本标签
git tag v0.1.0
git push origin v0.1.0
```

#### 方式 2：手动触发
1. 进入 GitHub 仓库
2. 点击 `Actions` 标签
3. 选择 `Build and Release` workflow
4. 点击 `Run workflow`

### 构建产物

构建完成后，会生成以下文件：

**macOS**:
- `YouTubeMonitor_0.1.0_aarch64.dmg` - M1/M2/M3 Mac 安装包

**Windows**:
- `YouTubeMonitor_0.1.0_x64_en-US.msi` - Windows 安装程序
- `YouTubeMonitor-Portable-Windows-x64.zip` - 绿色便携版（无需安装）

### 下载构建产物

#### 从 Actions 下载（开发版本）
1. 进入 `Actions` 标签
2. 选择最新的成功构建
3. 在 `Artifacts` 部分下载对应平台的文件

#### 从 Releases 下载（正式版本）
如果推送了 tag，会自动创建 GitHub Release：
1. 进入 `Releases` 标签
2. 下载对应平台的安装包

## 🚀 首次使用步骤

### 1. 推送代码到 GitHub
```bash
git add .
git commit -m "Add GitHub Actions build workflow"
git push origin main
```

### 2. 创建第一个版本
```bash
git tag v0.1.0
git push origin v0.1.0
```

### 3. 等待构建完成
- 进入 GitHub Actions 查看构建进度
- 通常需要 5-10 分钟

### 4. 下载构建产物
- 从 Releases 页面下载
- 或从 Actions 页面的 Artifacts 下载

## 📝 注意事项

### Windows 便携版说明
- 解压即用，无需安装
- 数据存储在 `%APPDATA%\YouTubeMonitor`
- 首次运行可能有 Windows 安全警告，点击"更多信息"→"仍要运行"

### macOS 版本说明
- 仅支持 Apple Silicon (M1/M2/M3)
- 如需 Intel Mac 版本，需添加 `x86_64-apple-darwin` 目标

### 版本号管理
- 使用语义化版本：`v主版本.次版本.修订号`
- 例如：`v0.1.0`, `v1.0.0`, `v1.2.3`

## 🔧 自定义构建

### 添加 Intel Mac 支持
在 `.github/workflows/build-release.yml` 的 matrix 中添加：
```yaml
- platform: 'macos-latest'
  target: 'x86_64-apple-darwin'
  name: 'macOS (Intel)'
```

### 修改版本号
在 `src-tauri/tauri.conf.json` 中修改 `version` 字段

## ❓ 常见问题

**Q: 构建失败怎么办？**
A: 查看 Actions 日志，通常是依赖问题或配置错误

**Q: 如何删除旧的构建产物？**
A: Artifacts 会在 7 天后自动删除

**Q: 可以构建 Linux 版本吗？**
A: 可以，在 matrix 中添加 `ubuntu-latest` 平台

**Q: Windows 便携版在哪里？**
A: 在 Windows 构建的 Artifacts 中，文件名为 `YouTubeMonitor-Portable-Windows-x64.zip`
