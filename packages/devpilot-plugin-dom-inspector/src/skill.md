---
name: dom-inspector
description: Advanced DOM inspection and interaction capabilities. Allows analyzing page layout, extracting compact DOM snapshots, manipulating elements, and debugging browser logs.
allowed-tools: [
  "get_page_snapshot",
  "get_visual_hierarchy",
  "get_element_details",
  "click_element",
  "input_text",
  "get_console_logs",
  "scroll_to_element",
  "capture_screenshot"
]
---

# DOM Inspector Skill

> **Core Principle: Minimize token cost.** Always choose the cheapest tool that gets the job done.

## Tool Cost Reference

| Cost | Tools | Use For |
|---|---|---|
| Low | `get_visual_hierarchy`, `click_element`, `input_text`, `scroll_to_element` | Layout overview, trigger interactions |
| Mid | `get_page_snapshot`, `get_element_details`, `get_console_logs` | DOM with `@eID`, element deep dive, logs |
| High | `capture_screenshot` | Visual comparison with design mockups only |

## Workflows

### 1. Fix UI Against Design Mockup

```
capture_screenshot → compare with design → edit styles → capture_screenshot → verify
```

Screenshot is justified here — pixel-level visual comparison requires images.

### 2. Verify Interaction Flows

```
get_page_snapshot → find @eID → click_element/input_text → get_page_snapshot → verify DOM changes
```

Example: `snapshot → @e42 [button] "Settings" → click_element(e42) → snapshot → confirm dialog appeared`

### 3. Debug Bugs via Logs

```
get_console_logs(level="error") → add console.info("[BUG]",...) to code
→ click_element to reproduce → get_console_logs(keyword="[BUG]")
→ fix code → re-trigger → get_console_logs → confirm fix
```

**Important: `console.log` is NOT captured.** Use `console.info` or higher (`warn`/`error`) for debugging.
Use prefixes (`[BUG]`, `[PERF]`) + `keyword`/`level` filter to avoid log noise.

### 4. Explore Page Structure

```
get_visual_hierarchy → understand layout (cheap)
→ get_page_snapshot(startNodeId="eX") → targeted DOM of area of interest
→ get_element_details("eY") → deep dive if needed
```

**Always start with `get_visual_hierarchy`** — cheapest way to understand the page.

### 5. Performance Debugging

```
Add console.time/PerformanceObserver → click_element to trigger
→ get_console_logs(keyword="[PERF]") → fix → re-trigger → verify
```

## Decision Guide

- **Understand layout?** → `get_visual_hierarchy` first
- **Need element IDs?** → `get_page_snapshot` (use `startNodeId` to narrow scope)
- **Click / type?** → `click_element` / `input_text` with `@eID`
- **Compare with design?** → `capture_screenshot`
- **Runtime data?** → `get_console_logs` with `keyword` / `level`
- **Element off-screen?** → `scroll_to_element` before snapshot
- **Computed styles / position?** → `get_element_details`

## Anti-Patterns

- ✗ `capture_screenshot` to discover structure (use `get_visual_hierarchy`)
- ✗ Full-page snapshot when only one section needed (use `startNodeId`)
- ✗ `get_console_logs` without `keyword`/`level` filter (token waste)
- ✗ Skipping `get_visual_hierarchy` and jumping straight to detailed snapshot
