# YouTubeMonitor Architecture

This document describes the high-level architecture and design decisions of the YouTubeMonitor application.

## Overview

YouTubeMonitor is a desktop application built with **Next.js** (Frontend) and **Tauri** (Backend/Rust). It allows users to monitor YouTube channels, analyze video performance (viral detection), and manage downloads.

## Technology Stack

- **Frontend**: Next.js, React, Tailwind CSS, Lucide React (Icons).
- **Backend**: Rust, Tauri, SQLite (Database), SQLx (ORM/Query builder).
- **Video Processing**: `yt-dlp` (via background processes) for video downloads and metadata.

## Design Decisions

### 1. Naming Conventions
The project follows a strict **unified naming convention**:
- **snake_case**: Used for all custom identifiers (variables, functions, properties) in both TypeScript (Frontend) and Rust (Backend). This ensures seamless data transfer between the two layers without complex remapping.
- **camelCase**: Reserved strictly for React's built-in props (e.g., `onMouseDown`, `className`), standard JavaScript/Web APIs (e.g., `localStorage.getItem`), and external library requirements.

### 2. Performance Optimizations
- **List Virtualization**: `react-virtuoso` is used to efficiently render large lists of videos and channels.
- **Memoization**: `React.memo`, `useMemo`, and `useCallback` are extensively applied to context providers and list items to minimize unnecessary re-renders during frequent state updates (e.g., download progress).
- **Database Transactions**: Intensive database write operations (like backup imports or batch video syncs) are wrapped in transactions to maximize SQLite performance.

### 3. State Management
- **Context API**: `DataContext` manages global application state (groups, channels, settings), while `DownloadContext` handles the transient state of active downloads.
- **Tauri Events**: Real-time updates from the Rust backend (e.g., download progress) are pushed to the frontend via Tauri's event system.

## Project Structure

- `src/`: Next.js frontend source code.
  - `app/`: Next.js App Router pages.
  - `components/`: Reusable UI components.
  - `context/`: React context providers.
  - `types/`: TypeScript interfaces and types.
- `src-tauri/`: Tauri backend source code.
  - `src/`: Rust source code.
    - `commands.rs`: Implementation of Tauri commands (API).
    - `youtube_api.rs`: YouTube API wrapper and data parsing.
  - `migrations/`: SQLite database migration scripts.
- `tools/`: Developer scripts and auxiliary tools (e.g., `keygen.mjs`).
- `brain/`: Project documentation and agent-related task trackers.
