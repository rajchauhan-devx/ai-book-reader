---
name: rn-design-system-reviewer
description: Guidelines and design standards for modern React Native book reader UI/UX, tokens, typography, dark/light themes, and component hierarchy.
---

# React Native Design System Reviewer

This skill guides the design, layout, styling, and visual hierarchy of the AI Book Reader mobile application.

## Principles
1. **Reader-First Aesthetic**: Calm, elegant, bookish, warm paper tones and dark reading modes (never harsh pure white or blinding neon).
2. **Typography Hierarchy**: Clear distinction between Display, PageTitle, SectionTitle, Body, ReadingText, and Captions. Generous line-height ($1.4-1.6\times$) for reading readability.
3. **Consistent Tokens**: Always use theme tokens from `src/theme/tokens.ts` (canvas, surface, surfaceMuted, ink, inkMuted, brand, border, radius, spacing).
4. **Intuitive Controls**: Touch targets $\ge 44 \times 44$ pt. Floating player / mini player should feel non-intrusive and effortlessly swipeable or collapsable.
5. **No Clutter**: Remove developer jargon, raw hashes, or confusing technical metrics from primary consumer reading screens.
