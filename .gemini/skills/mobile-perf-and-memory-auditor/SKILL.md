---
name: mobile-perf-and-memory-auditor
description: Performance, memory safety, Room DB non-destructive migrations, WorkManager jobs, and battery/CPU efficiency for on-device AI.
---

# Mobile Performance and Memory Auditor

This skill audits Android & React Native performance, memory, and persistence.

## Core Checks
1. **Memory & OOM Prevention**: Large EPUB/PDF extractions must be streamed or bounded. Release bitmap covers and audio ByteBuffers promptly.
2. **Room DB Concurrency**: Background queries and migrations must never block UI thread. WorkManager jobs must handle app sleep/wake gracefully.
3. **Battery & Thermals**: ONNX inference threads should match device capabilities (e.g., 2-4 threads on ARM64) to prevent thermal throttling.
