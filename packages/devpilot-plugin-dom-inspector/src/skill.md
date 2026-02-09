---
name: dom-inspector
description: Advanced DOM inspection and interaction capabilities. Allows analyzing page layout, extracting compact DOM snapshots, manipulating elements, and debugging browser logs.
allowed-tools: [
  "query_selector",
  "get_compact_snapshot",
  "click_element_by_id",
  "input_text_by_id",
  "get_element_info_by_id",
  "get_dom_tree",
  "get_logs",
  "get_layout",
  "scroll_to_element"
]
---

# DOM Inspector Skill

This skill empowers you to navigate, understand, and interact with web pages within the DevPilot environment. It provides tools to inspect the DOM structure, analyze visual layouts, and perform user actions like clicking or typing.

## Core Workflow

To efficiently use this skill, follow this strategic workflow:

1.  **Visual Discovery**: Start with `get_layout` to understand the high-level visual hierarchy. This helps identify major components (modals, sidebars, main content) without getting overwhelmed by raw DOM nodes.
2.  **Detailed Identification**: Use `get_compact_snapshot` to get a token-efficient view of the DOM. Look for elements prefixed with `@` (e.g., `@e123`), which are unique `devpilot-id`s.
3.  **Targeted Refinement**: If you need more details about a specific element, use `get_element_info_by_id` or `query_selector`.
4.  **Interaction**: Perform actions using `click_element_by_id`, `input_text_by_id`, or `scroll_to_element`. Always prefer using the `devpilot-id` obtained from snapshots.
5.  **Verification**: After an action, re-run `get_compact_snapshot` to see the updated state or check `get_logs` for any errors triggered in the browser console.

## Best Practices

-   **Token Efficiency**: Always prefer `get_compact_snapshot` over the legacy `get_dom_tree`. The compact format is specifically optimized for LLM context windows.
-   **Stability**: Prefer `devpilot-id` (e.g., "e123") over raw CSS selectors. These IDs are more stable during a session.
-   **Visibility**: If an action fails or an element isn't found in the snapshot, use `scroll_to_element` to ensure it's in the viewport.
-   **Context Awareness**: If multiple clients (tabs/windows) are connected, specify the `clientId`. Use `list_clients` (from the base system) if you are unsure which client to target.

## Troubleshooting

-   **Client Not Found**: If a `clientId` is invalid or disconnected, prompt the user to refresh the browser page or use `list_clients` to find the correct active session.
-   **Missing Elements**: If an element is missing from a snapshot, try increasing `maxDepth` or use `startNodeId` in `get_compact_snapshot` to focus on a specific sub-tree.

## Examples

### Scenario: Logging into a website
1.  Call `get_compact_snapshot()` to find login fields.
2.  Identify `@e10` for username and `@e11` for password.
3.  Call `input_text_by_id(id="e10", text="my_user")`.
4.  Call `input_text_by_id(id="e11", text="secret_pass")`.
5.  Call `click_element_by_id(id="e12")` (the Submit button).
6.  Call `get_compact_snapshot()` to verify the dashboard is loaded.

### Scenario: Debugging a broken layout
1.  Call `get_layout(id="main-container")`.
2.  Analyze the `formattedLayout` to see which elements are overlapping or covering the target.
3.  Check `get_logs(level="error")` to see if any script errors are affecting the rendering.
