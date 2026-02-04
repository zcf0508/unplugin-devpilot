import { beforeEach, describe, expect, it } from 'vitest';
import { getLayout } from '../../src/client/getLayout';

describe('getLayout', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should return layout for single visual layer (all covering children)', async () => {
    // Structure: body > e1 > e2 > e3 (all cover parent)
    // This forms ONE visual layer: e1+e2+e3 together
    // Use viewport units to ensure elements cover the body
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">Content</div>
          </div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.targetId).toBe('body');
    // Only 1 visual layer (e1+e2+e3 form one layer)
    expect(result.depth).toBe(1);
    expect(result.layout).toBeDefined();
    expect(result.layout!.level1).toBeDefined();
    // Should not have level2
    expect(result.layout!.level2).toBeUndefined();
  });

  it('should return layout for multiple visual layers (modal scenario)', async () => {
    // Structure: body > e1 > e2 (covers) + e5 (positioned absolute)
    // e2 > e3 + e4 (together cover e2)
    // This forms TWO visual layers:
    // - level1: e1+e2+e3+e4 (main content, e3 and e4 are boundary elements)
    // - level2: e5 (modal, independent layer)
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 50%;">Content 1</div>
            <div data-devpilot-id="e4" style="width: 100%; height: 50%;">Content 2</div>
          </div>
          <div data-devpilot-id="e5" style="width: 100vw; height: 100vh; position: absolute; top: 0; left: 0;">Modal</div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.targetId).toBe('body');
    // Two visual layers: main content + modal
    expect(result.depth).toBe(2);
    expect(result.layout).toBeDefined();
    expect(result.layout!.level1).toBeDefined();
    expect(result.layout!.level2).toBeDefined();
    // level1 should contain e3 and e4 (deepest boundary elements of main content)
    expect(result.layout!.level1).toContain('@e3');
    expect(result.layout!.level1).toContain('@e4');
    // level2 should contain e5 (modal)
    expect(result.layout!.level2).toContain('@e5');
  });

  it('should return null layout when body has no covering children', async () => {
    document.body.innerHTML = '<div data-devpilot-id="e1" style="width: 50px; height: 50px;">Small element</div>';

    const result = await getLayout({});

    expect(result.success).toBe(true);
    expect(result.layout).toBeNull();
    expect(result.depth).toBe(0);
  });

  it('should use body as default target when no id provided', async () => {
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2">Content</div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.targetId).toBe('body');
  });

  it('should return error when element not found', async () => {
    const result = await getLayout({ id: 'nonexistent' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should respect maxDepth limit', async () => {
    // Create structure with multiple visual layers
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100px; height: 100px;">
          <div data-devpilot-id="e2" style="width: 100px; height: 100px; position: absolute;">
            <div data-devpilot-id="e3" style="width: 100px; height: 100px; position: absolute;">
              <div data-devpilot-id="e4" style="width: 100px; height: 100px; position: absolute;">
                <div data-devpilot-id="e5" style="width: 100px; height: 100px; position: absolute;">Deep</div>
              </div>
            </div>
          </div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 3 });

    expect(result.success).toBe(true);
    // Should be limited by maxDepth
    expect(result.depth).toBeLessThanOrEqual(3);
  });

  it('should include targetRect in result', async () => {
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100px; height: 100px;">
          <div data-devpilot-id="e2" style="width: 100px; height: 100px;">Child</div>
        </div>
      `;

    const result = await getLayout({});

    expect(result.success).toBe(true);
    expect(result.targetRect).toBeDefined();
    expect(result.targetRect.width).toBeGreaterThan(0);
    expect(result.targetRect.height).toBeGreaterThan(0);
  });

  it('should handle empty body gracefully', async () => {
    document.body.innerHTML = '';

    const result = await getLayout({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.layout).toBeNull();
    expect(result.depth).toBe(0);
  });

  it('should skip script elements', async () => {
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100px; height: 100px;">
          <script>alert('test')</script>
          <div data-devpilot-id="e2" style="width: 100px; height: 100px;">Content</div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.layout).toBeDefined();
    // Should not include script in the layout
    if (result.layout) {
      const layoutText = Object.values(result.layout).join('\n');
      expect(layoutText).not.toContain('script');
    }
  });

  it('should handle positioned elements as independent layers', async () => {
    // Multiple absolutely positioned elements = multiple visual layers
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100px; height: 100px; position: absolute; top: 0; left: 0;">
          Layer 1
        </div>
        <div data-devpilot-id="e2" style="width: 100px; height: 100px; position: absolute; top: 0; left: 0;">
          Layer 2
        </div>
      `;

    const result = await getLayout({ maxDepth: 5 });

    expect(result.success).toBe(true);
    // Two positioned elements = two visual layers
    expect(result.depth).toBe(2);
    expect(result.layout!.level1).toBeDefined();
    expect(result.layout!.level2).toBeDefined();
  });

  it('should find deepest boundary elements for snapshot depth', async () => {
    // Structure: body > e1 > e2 > e3 (all cover)
    // e3 is the deepest boundary element
    // Snapshot should include up to e3's depth
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">Deep Content</div>
          </div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.depth).toBe(1);
    // level1 should include e3 (deepest boundary)
    expect(result.layout!.level1).toContain('@e3');
  });

  it('should handle deep nesting with positioned element', async () => {
    // Simulate real-world scenario with deep nesting
    // body > app > provider > ant-app > app-content > layout > ... > help-center(fixed)
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">
              <div data-devpilot-id="e4" style="width: 100%; height: 100%;">
                <div data-devpilot-id="e5" style="width: 100%; height: 100%;">
                  <div data-devpilot-id="e6" style="width: 100%; height: 100%;">
                    <div data-devpilot-id="e7" style="width: 100%; height: 100%;">
                      <div data-devpilot-id="e8" style="width: 100%; height: 100%;">Deep Content</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div data-devpilot-id="e9" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;">Help Center</div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 15 });

    expect(result.success).toBe(true);
    // Should have exactly 2 levels: main content + help center
    expect(result.depth).toBe(2);
    expect(result.layout!.level1).toBeDefined();
    expect(result.layout!.level2).toBeDefined();
    // level1 should contain the deepest element e8
    expect(result.layout!.level1).toContain('@e8');
    // level2 should contain help center e9
    expect(result.layout!.level2).toContain('@e9');
    // Should NOT have level3
    expect(result.layout!.level3).toBeUndefined();
  });

  it('should handle sidebar + main content layout (real-world ant-design)', async () => {
    // Simulate ant-design layout: sidebar + main content side by side
    // Both together cover the parent, forming ONE visual layer
    // Plus a positioned help-center as SECOND visual layer
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">
              <div data-devpilot-id="e4" style="width: 100%; height: 100%;">
                <div data-devpilot-id="e5" style="width: 100%; height: 100%;">
                  <div data-devpilot-id="e6" style="width: 100%; height: 100%;">
                    <div data-devpilot-id="e7" style="width: 100%; height: 100%;">
                      <div data-devpilot-id="e8" style="width: 100%; height: 100%;">
                        <div data-devpilot-id="e9" style="width: 100%; height: 100%; display: flex;">
                          <div data-devpilot-id="e10" style="width: 200px; height: 100%;">Sidebar</div>
                          <div data-devpilot-id="e50" style="flex: 1; height: 100%;">Main Content</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div data-devpilot-id="e66" style="position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px;">Help</div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 15 });

    expect(result.success).toBe(true);
    // Should have exactly 2 levels: main content (e10+e50) + help center (e66)
    expect(result.depth).toBe(2);
    expect(result.layout!.level1).toBeDefined();
    expect(result.layout!.level2).toBeDefined();

    // level1 should contain e10 and e50 (boundary elements), but NOT deeper elements
    expect(result.layout!.level1).toContain('@e10');
    expect(result.layout!.level1).toContain('@e50');

    // level2 should contain help center e66
    expect(result.layout!.level2).toContain('@e66');

    // Should NOT have level3
    expect(result.layout!.level3).toBeUndefined();

    // level1 and level2 should have different content (not duplicates)
    // level1 should have deep content (e10, e50 and their children)
    expect(result.layout!.level1).toContain('Sidebar');
    expect(result.layout!.level1).toContain('Main Content');

    // level2 should only have help center, not the full tree again
    expect(result.layout!.level2).toContain('@e66');
    expect(result.layout!.level2).toContain('Help');

    // Verify no duplicate levels are created
    const levelKeys = Object.keys(result.layout!).filter(k => k.startsWith('level'));
    expect(levelKeys).toHaveLength(2);
    expect(levelKeys).toEqual(['level1', 'level2']);
  });

  it('should NOT create duplicate levels for same positioned element', async () => {
    // This test ensures buildLayoutTree is not called recursively creating duplicate levels
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3">Content</div>
          </div>
          <div data-devpilot-id="e4" style="position: fixed; top: 0; left: 0; width: 100px; height: 100px;">Fixed</div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 10 });

    expect(result.success).toBe(true);
    // Should have exactly 2 levels, not more
    expect(result.depth).toBe(2);

    // Verify no level3-level10 are created
    for (let i = 3; i <= 10; i++) {
      expect(result.layout![`level${i}` as keyof typeof result.layout]).toBeUndefined();
    }
  });

  it('should NOT create multiple levels for nested positioned elements', async () => {
    // Nested positioned elements should only create ONE level for the outermost one
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3">Content</div>
          </div>
          <div data-devpilot-id="e4" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;">
            Outer Modal
            <div data-devpilot-id="e5" style="position: absolute; top: 10px; left: 10px; width: 50px; height: 50px;">
              Inner Button
            </div>
          </div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 10 });

    expect(result.success).toBe(true);
    // Should have exactly 2 levels: main content + outer modal (not 3 levels)
    expect(result.depth).toBe(2);
    expect(result.layout!.level1).toBeDefined();
    expect(result.layout!.level2).toBeDefined();
    expect(result.layout!.level3).toBeUndefined();

    // level2 should contain e4 (outer modal) but NOT e5 (inner button)
    expect(result.layout!.level2).toContain('@e4');
    expect(result.layout!.level2).toContain('Outer Modal');
    // e5 is inside e4, so it should not create its own level
    expect(result.layout!.level2).not.toContain('@e5');
  });

  it('should handle multiple sibling positioned elements', async () => {
    // Multiple sibling positioned elements should each create their own level
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3">Content</div>
          </div>
          <div data-devpilot-id="e4" style="position: fixed; top: 0; left: 0; width: 100px; height: 100px;">Modal 1</div>
          <div data-devpilot-id="e5" style="position: fixed; top: 0; left: 0; width: 100px; height: 100px;">Modal 2</div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 10 });

    expect(result.success).toBe(true);
    // Should have 3 levels: main content + 2 modals
    expect(result.depth).toBe(3);
    expect(result.layout!.level1).toBeDefined();
    expect(result.layout!.level2).toBeDefined();
    expect(result.layout!.level3).toBeDefined();
    expect(result.layout!.level4).toBeUndefined();

    // level2 and level3 should contain the modals
    expect(result.layout!.level2).toContain('@e4');
    expect(result.layout!.level3).toContain('@e5');
  });

  it('should create exactly 2 levels when only one positioned element exists', async () => {
    // Only one positioned element should create exactly 2 levels
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3">Content</div>
          </div>
          <div data-devpilot-id="e4" style="position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px;">Help</div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 10 });

    expect(result.success).toBe(true);
    // Should have exactly 2 levels: main content + help button
    expect(result.depth).toBe(2);
    expect(result.layout!.level1).toBeDefined();
    expect(result.layout!.level2).toBeDefined();
    expect(result.layout!.level3).toBeUndefined();

    // level2 should contain the positioned element
    expect(result.layout!.level2).toContain('@e4');
    expect(result.layout!.level2).toContain('Help');
  });

  it('should prune snapshot to only include elements on path to target (sibling branches should be excluded)', async () => {
    // Structure: body > e1 > e2 > e3 > (e4 + e5 together cover) + e6 (sibling branch)
    // level1 should only include e1, e2, e3, e4, e5 (path to covering elements)
    // e6 should be pruned because it's not on the path to e4+e5
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">
              <div data-devpilot-id="e4" style="width: 100%; height: 50%;">Top Content</div>
              <div data-devpilot-id="e5" style="width: 100%; height: 50%;">Bottom Content</div>
            </div>
            <div data-devpilot-id="e6" style="width: 100%; height: 100%;">Sibling Branch</div>
          </div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 10 });

    expect(result.success).toBe(true);
    expect(result.depth).toBe(1);
    expect(result.layout!.level1).toBeDefined();

    // level1 should contain e4 and e5 (boundary elements)
    expect(result.layout!.level1).toContain('@e4');
    expect(result.layout!.level1).toContain('@e5');
    expect(result.layout!.level1).toContain('Top Content');
    expect(result.layout!.level1).toContain('Bottom Content');

    // e6 should be pruned - it's not on the path to e4+e5
    expect(result.layout!.level1).not.toContain('@e6');
    expect(result.layout!.level1).not.toContain('Sibling Branch');
  });

  it('should prune positioned element snapshot to only include path from body to target', async () => {
    // Structure: body > e1 > e2 > e3 + e6(fixed)
    // level1: path to e3 (main content)
    // level2: path to e6 (fixed element), should NOT include e3
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">Main Content</div>
          </div>
          <div data-devpilot-id="e6" style="position: fixed; top: 0; left: 0; width: 100px; height: 100px;">Fixed</div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 10 });

    expect(result.success).toBe(true);
    expect(result.depth).toBe(2);
    expect(result.layout!.level1).toBeDefined();
    expect(result.layout!.level2).toBeDefined();

    // level1 should contain e3
    expect(result.layout!.level1).toContain('@e3');
    expect(result.layout!.level1).toContain('Main Content');

    // level2 should contain e6 (fixed element)
    expect(result.layout!.level2).toContain('@e6');
    expect(result.layout!.level2).toContain('Fixed');

    // level2 should NOT contain e3 (not on path to e6)
    expect(result.layout!.level2).not.toContain('@e3');
    expect(result.layout!.level2).not.toContain('Main Content');
  });

  it('should respect id parameter and analyze sub-tree layout', async () => {
    // Structure: body > container > (e1 + e2)
    // When calling getLayout({id: 'container'}), should analyze container's children
    // Use flex layout to ensure e1 and e2 together cover the container
    document.body.innerHTML = `
        <div data-devpilot-id="container" style="width: 100vw; height: 100vh; display: flex;">
          <div data-devpilot-id="e1" style="width: 50%; height: 100%;">Left</div>
          <div data-devpilot-id="e2" style="width: 50%; height: 100%;">Right</div>
        </div>
      `;

    const result = await getLayout({ id: 'container', maxDepth: 10 });

    expect(result.success).toBe(true);
    expect(result.targetId).toBe('container');
    // Should analyze from container, finding e1 and e2 as covering children
    expect(result.depth).toBe(1);
    expect(result.layout!.level1).toBeDefined();

    // Should contain e1 and e2
    expect(result.layout!.level1).toContain('@e1');
    expect(result.layout!.level1).toContain('@e2');
    expect(result.layout!.level1).toContain('Left');
    expect(result.layout!.level1).toContain('Right');
  });

  it('should stop expanding at boundary elements (no deep subtree)', async () => {
    // Structure: body > e1 > e2 > (e3 with deep subtree)
    // e3 is the boundary element, its children should NOT be expanded
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2" style="width: 100%; height: 100%;">
            <div data-devpilot-id="e3" style="width: 100%; height: 100%;">
              <div data-devpilot-id="e4">
                <div data-devpilot-id="e5">Deep Content</div>
              </div>
            </div>
          </div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 10 });

    expect(result.success).toBe(true);
    expect(result.depth).toBe(1);
    expect(result.layout!.level1).toBeDefined();

    // Should contain e3 (boundary element)
    expect(result.layout!.level1).toContain('@e3');

    // Should NOT contain e4 and e5 (children of boundary element)
    expect(result.layout!.level1).not.toContain('@e4');
    expect(result.layout!.level1).not.toContain('@e5');
    expect(result.layout!.level1).not.toContain('Deep Content');
  });

  it('should detect interactive elements and include in formatted layout', async () => {
    // Structure with various interactive elements
    // Use flex layout to ensure elements together cover the parent
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh; display: flex; flex-direction: column;">
          <div style="flex: 1; display: flex;">
            <button data-devpilot-id="e2" style="flex: 1;">Click Me</button>
            <input data-devpilot-id="e3" type="text" placeholder="Enter text" style="flex: 1;">
            <a data-devpilot-id="e4" href="#" style="flex: 1;">Link</a>
          </div>
          <div data-devpilot-id="e5" style="position: absolute; top: 0; left: 0; width: 100px; height: 100px;">
            <button data-devpilot-id="e6">Modal Button</button>
          </div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.formattedLayout).toBeDefined();

    // Should contain Interactive Elements section
    expect(result.formattedLayout).toContain('## Interactive Elements');
    expect(result.formattedLayout).toContain('💡 **Interactive elements detected in this layout:**');

    // Should detect clickable elements
    expect(result.formattedLayout).toContain('**Clickable elements (buttons, links):**');
    expect(result.formattedLayout).toContain('@e2');
    expect(result.formattedLayout).toContain('Click Me');
    expect(result.formattedLayout).toContain('@e4');
    expect(result.formattedLayout).toContain('Link');

    // Should detect inputable elements
    expect(result.formattedLayout).toContain('**Inputable elements (text fields, search):**');
    expect(result.formattedLayout).toContain('@e3');
    expect(result.formattedLayout).toContain('Enter text');
  });

  it('should include recommended next actions in formatted layout', async () => {
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh; display: flex; flex-direction: column;">
          <div style="flex: 1; display: flex;">
            <button data-devpilot-id="e2" style="flex: 1;">Submit</button>
            <input data-devpilot-id="e3" type="text" placeholder="Search" style="flex: 1;">
            <a data-devpilot-id="e4" href="#" style="flex: 1;">Link</a>
          </div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.formattedLayout).toBeDefined();

    // Should contain Recommended Next Actions section
    expect(result.formattedLayout).toContain('## Recommended Next Actions');

    // Should have priority 1 (base layer actions)
    expect(result.formattedLayout).toContain('**Priority 1 - Direct actions in the base layer:**');
    expect(result.formattedLayout).toContain('Click "@e2" (Submit)');
    expect(result.formattedLayout).toContain('click_element_by_id({ id: "e2" })');
    expect(result.formattedLayout).toContain('Click "@e4" (Link)');

    // Should have priority 2 (input operations)
    expect(result.formattedLayout).toContain('**Priority 2 - Input operations:**');
    expect(result.formattedLayout).toContain('Input to "@e3" (Search)');
    expect(result.formattedLayout).toContain('input_text_by_id({ id: "e3", text: "your_value" })');

    // Should have deep dive suggestion
    expect(result.formattedLayout).toContain('**Deep dive suggestion:**');
    expect(result.formattedLayout).toContain('get_compact_snapshot({ startNodeId: "e123" })');
  });

  it('should NOT include interactive elements section when no interactive elements found', async () => {
    // Structure with only non-interactive elements
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh;">
          <div data-devpilot-id="e2">Static Content</div>
          <span data-devpilot-id="e3">Text</span>
        </div>
      `;

    const result = await getLayout({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.formattedLayout).toBeDefined();

    // Should NOT contain Interactive Elements section
    expect(result.formattedLayout).not.toContain('## Interactive Elements');
    expect(result.formattedLayout).not.toContain('## Recommended Next Actions');
  });

  it('should detect different interaction types correctly', async () => {
    document.body.innerHTML = `
        <div data-devpilot-id="e1" style="width: 100vw; height: 100vh; display: flex; flex-direction: column;">
          <div style="flex: 1; display: flex; flex-wrap: wrap;">
            <button data-devpilot-id="e2" style="flex: 1;">Button</button>
            <a data-devpilot-id="e3" style="flex: 1;">Link</a>
            <input data-devpilot-id="e4" type="text" style="flex: 1;">
            <input data-devpilot-id="e5" type="search" style="flex: 1;">
            <input data-devpilot-id="e6" type="checkbox" style="flex: 1;">
            <input data-devpilot-id="e7" type="radio" style="flex: 1;">
            <select data-devpilot-id="e8" style="flex: 1;"></select>
          </div>
        </div>
      `;

    const result = await getLayout({ maxDepth: 5 });

    expect(result.success).toBe(true);
    expect(result.formattedLayout).toBeDefined();

    // Verify clickable elements (button, link)
    expect(result.formattedLayout).toContain('**Clickable elements (buttons, links):**');
    expect(result.formattedLayout).toContain('@e2');
    expect(result.formattedLayout).toContain('@e3');

    // Verify inputable elements (text, search)
    expect(result.formattedLayout).toContain('**Inputable elements (text fields, search):**');
    expect(result.formattedLayout).toContain('@e4');
    expect(result.formattedLayout).toContain('@e5');

    // Verify selectable elements (checkbox, radio, select)
    expect(result.formattedLayout).toContain('**Selectable elements (checkboxes, radios, dropdowns):**');
    expect(result.formattedLayout).toContain('@e6');
    expect(result.formattedLayout).toContain('@e7');
    expect(result.formattedLayout).toContain('@e8');
  });
});
