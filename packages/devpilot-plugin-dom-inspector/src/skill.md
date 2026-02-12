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

Navigate, understand, and interact with web pages in DevPilot.

## ⚠️ CRITICAL: Use Snapshots, Not Screenshots

**ALWAYS use `get_page_snapshot` as your PRIMARY tool.** Do NOT default to `capture_screenshot`.

Why snapshots win:
- **Actionable**: Provides `devpilot-id` (e.g., `@e123`) for interactions
- **Token-efficient**: 10-20x fewer tokens than screenshots
- **Reliable**: No cross-origin issues, structured data

Only use screenshots when:
- User explicitly requests a visual image
- Verifying visual styling/colors after changes
- Debugging visual rendering issues

## Workflow

1. **Snapshot First**: Call `get_page_snapshot` to get DOM with `@e123` IDs
2. **Interact**: Use `click_element`, `input_text` with the IDs from snapshot
3. **Verify**: Re-run `get_page_snapshot` or check `get_console_logs`
4. **Screenshot** (last resort): Only for visual verification

Optional tools:
- `get_visual_hierarchy`: Understand high-level layout
- `get_element_details`: Get detailed info about specific element
- `scroll_to_element`: Ensure element is visible

## Best Practices

- **Never screenshot for discovery**: Screenshots have no IDs, waste tokens, can't interact
- **Use devpilot-id**: More stable than CSS selectors during session
- **Check clientId**: Use `list_clients` to find active client
- **Missing elements**: Increase `maxDepth` or use `startNodeId` in snapshot

## Example: Login Flow

```
1. get_page_snapshot(clientId) → find @e10 (username), @e11 (password), @e12 (button)
2. input_text(clientId, id="e10", text="user")
3. input_text(clientId, id="e11", text="pass")
4. click_element(clientId, id="e12")
5. get_page_snapshot(clientId) → verify dashboard loaded
```

## Performance Debugging

Add monitoring code (console.time, console.log, PerformanceObserver) to source files, then use `get_console_logs` to collect data.

**Render performance**: Add useEffect logging → trigger renders → `get_console_logs(clientId, keyword="[PERF]")`

**Interaction latency**: Add console.time/timeEnd → perform action → `get_console_logs(clientId)`

**Memory leaks**: Log performance.memory → repeat operation → `get_console_logs(clientId, keyword="[MEMORY]")`

**Long tasks**: Add PerformanceObserver('longtask') → perform operation → `get_console_logs(clientId, level="warn")`

Use log prefixes ([PERF], [MEMORY]) for filtering. Focus on runtime performance, not dev server loading.
