#!/bin/bash

# Exit on error
set -e

# Target directory
TARGET_DIR="src-tauri/bin"
mkdir -p "$TARGET_DIR"

# Detected Architecture
ARCH=$(uname -m)
if [ "$ARCH" == "arm64" ]; then
    TRIPLE="aarch64-apple-darwin"
else
    TRIPLE="x86_64-apple-darwin"
fi

echo "Detected architecture: $ARCH"
echo "Target triple: $TRIPLE"

# 1. Download yt-dlp
echo "Downloading yt-dlp..."
curl -L -o "$TARGET_DIR/yt-dlp-$TRIPLE" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"

# 2. Download ffmpeg
echo "Downloading ffmpeg..."
curl -L -o ffmpeg.zip "https://evermeet.cx/ffmpeg/getrelease/zip"
unzip -o ffmpeg.zip
mv ffmpeg "$TARGET_DIR/ffmpeg-$TRIPLE"
rm ffmpeg.zip

# 3. Download ffprobe
echo "Downloading ffprobe..."
curl -L -o ffprobe.zip "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip"
unzip -o ffprobe.zip
mv ffprobe "$TARGET_DIR/ffprobe-$TRIPLE"
rm ffprobe.zip

# 4. Make executable
echo "Setting permissions..."
chmod +x "$TARGET_DIR/yt-dlp-$TRIPLE"
chmod +x "$TARGET_DIR/ffmpeg-$TRIPLE"
chmod +x "$TARGET_DIR/ffprobe-$TRIPLE"

echo "Done! Binaries are in $TARGET_DIR"
ls -l "$TARGET_DIR"
