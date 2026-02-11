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

This skill empowers you to navigate, understand, and interact with web pages within the DevPilot environment. It provides tools to inspect the DOM structure, analyze visual layouts, and perform user actions like clicking or typing.

## Core Workflow

To efficiently use this skill, follow this strategic workflow:

1.  **Visual Discovery**: Start with `get_visual_hierarchy` to understand the high-level visual hierarchy. This helps identify major components (modals, sidebars, main content) without getting overwhelmed by raw DOM nodes.
2.  **Detailed Identification**: Use `get_page_snapshot` to get a token-efficient view of the DOM. Look for elements prefixed with `@` (e.g., `@e123`), which are unique `devpilot-id`s.
3.  **Targeted Refinement**: If you need more details about a specific element, use `get_element_details` to get comprehensive information including HTML attributes, accessibility info, and position.
4.  **Interaction**: Perform actions using `click_element`, `input_text`, or `scroll_to_element`. Always prefer using the `devpilot-id` obtained from snapshots.
5.  **Screenshot**: Use `capture_screenshot` to capture the page or a specific element as an image. Note: cross-origin images without CORS headers may appear blank.
6.  **Verification**: After an action, re-run `get_page_snapshot` to see the updated state, use `capture_screenshot` for visual verification, or check `get_console_logs` for any errors triggered in the browser console.

## Best Practices

-   **Token Efficiency**: Always use `get_page_snapshot` as your primary tool for understanding page structure. The compact format is specifically optimized for LLM context windows.
-   **Stability**: Prefer `devpilot-id` (e.g., "e123") over raw CSS selectors. These IDs are more stable during a session.
-   **Visibility**: If an action fails or an element isn't found in the snapshot, use `scroll_to_element` to ensure it's in the viewport.
-   **Context Awareness**: All tools require `clientId`. Use `list_clients` (from the base system) to find the correct active client.

## Troubleshooting

-   **Client Not Found**: If a `clientId` is invalid or disconnected, prompt the user to refresh the browser page or use `list_clients` to find the correct active session.
-   **Missing Elements**: If an element is missing from a snapshot, try increasing `maxDepth` or use `startNodeId` in `get_page_snapshot` to focus on a specific sub-tree.

## Examples

### Scenario: Logging into a website
1.  Call `get_page_snapshot(clientId)` to find login fields.
2.  Identify `@e10` for username and `@e11` for password.
3.  Call `input_text(clientId, id="e10", text="my_user")`.
4.  Call `input_text(clientId, id="e11", text="secret_pass")`.
5.  Call `click_element(clientId, id="e12")` (the Submit button).
6.  Call `get_page_snapshot(clientId)` to verify the dashboard is loaded.

### Scenario: Debugging a broken layout
1.  Call `get_visual_hierarchy(clientId, elementId="main-container")`.
2.  Analyze the `formattedLayout` to see which elements are overlapping or covering the target.
3.  Check `get_console_logs(clientId, level="error")` to see if any script errors are affecting the rendering.

## Performance Debugging

Use this skill for runtime performance debugging in development. The approach: add monitoring code to source files (console.time, console.log, PerformanceObserver), then use `get_console_logs` to collect and analyze data.

### Common Scenarios

#### Component Render Performance
1. Add render logging to component (useEffect with console.log)
2. Trigger renders through user interaction
3. Call `get_console_logs(clientId, keyword="[PERF]")` to collect logs
4. Analyze render frequency and causes

#### Interaction Latency
1. Add console.time/timeEnd around event handlers
2. Perform the interaction
3. Call `get_console_logs(clientId)` to see timings
4. Identify slow handlers or blocking tasks

#### Memory Leak Detection
1. Add interval logging of performance.memory
2. Perform suspected leaky operation multiple times
3. Call `get_console_logs(clientId, keyword="[MEMORY]")` to collect snapshots
4. Check if memory consistently increases

#### Long Task Detection
1. Add PerformanceObserver for 'longtask' entries with console.warn
2. Perform operation that causes freezing
3. Call `get_console_logs(clientId, level="warn")` to find long tasks
4. Identify and split blocking tasks

### Notes

- Use log prefixes ([PERF], [MEMORY]) for easy filtering
- Development resource loading (Vite/Webpack) doesn't reflect production - focus on runtime performance
- Some APIs (performance.memory) are Chromium-only
