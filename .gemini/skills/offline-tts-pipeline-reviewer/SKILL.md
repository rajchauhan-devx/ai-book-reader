---
name: offline-tts-pipeline-reviewer
description: Architecture standards, latency optimization, text normalization, and expressiveness for on-device Kokoro-82M TTS in React Native & Android.
---

# Offline TTS Pipeline Reviewer

This skill governs the on-device Kokoro-82M ONNX TTS pipeline, phonemization, audio streaming, buffering, and prosody/emotion tuning.

## Core Rules
1. **Language & Phonemization**: Kokoro-82M requires English phonemes for English text. Ensure language code defaults to 'a' (American English) or 'b' (British English), with appropriate voice embeddings (`af_heart`, `am_adam`, etc.). Never misroute English text to non-English tokenizers/phonemizers.
2. **Zero-Perceived Latency (Pre-buffering & Chunking)**:
   - Break chapters/pages into natural sentence chunks ($50-150$ characters).
   - Synthesize Chunk 0 immediately and play it.
   - Concurrently synthesize Chunk 1, Chunk 2 in background worker threads so audio seamlessly streams with 0ms interruption.
3. **Emotional & Human Prosody**:
   - Normalize quotes, dialogue markers, ellipses, and em-dashes to insert natural breathing pauses.
   - Select expressive voice embeddings (e.g., `af_heart` / `af_bella` / `am_michael`) calibrated for storytelling.
   - Avoid robotic cadence by balancing punctuation and pause durations.
