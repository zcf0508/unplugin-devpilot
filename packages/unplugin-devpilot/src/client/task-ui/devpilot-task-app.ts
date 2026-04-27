import type { PropertyValues } from 'lit';
import type { DockPosition, DockSize, ViewportSize } from './dock-position.js';
import type { PendingTask, TaskHistory, TaskSubmitPayload } from '../../core/types';
import type { DevpilotClient } from '../types';
import { css, html, LitElement } from 'lit';
import { runTaskPayloadHooks } from '../index.js';
import {
  clampDockPoint,
  clampDockPosition,
  getDefaultDockPosition,
  getTaskPanelPosition,
  snapDockPosition,
} from './dock-position.js';
import {
  collectElementContext,
  shouldIgnorePickTarget,
} from './task-element-info.js';

interface Rect { top: number, left: number, width: number, height: number }

interface DockDragState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  moved: boolean
  dock: HTMLElement
}

function formatRelativeAge(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5) {
    return 'just now';
  }
  if (sec < 60) {
    return `${sec}s ago`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.floor(min / 60);
  if (hr < 48) {
    return `${hr}h ago`;
  }
  return new Date(ts).toLocaleString();
}

export class DevpilotTaskApp extends LitElement {
  static properties = {
    inspectMode: { type: Boolean },
    pendingCount: { type: Number },
    menuOpen: { type: Boolean },
    tasksPanelOpen: { type: Boolean },
    userNote: { type: String },
    submitting: { type: Boolean },
    _menuElement: { state: true },
    _highlight: { state: true },
    _taskList: { state: true },
    _inProgressList: { state: true },
    _tasksLoading: { state: true },
    _approvalToast: { state: true },
    _dockPosition: { state: true },
    _dockSize: { state: true },
    _draggingDock: { state: true },
  };

  declare inspectMode: boolean;
  declare pendingCount: number;
  declare menuOpen: boolean;
  declare tasksPanelOpen: boolean;
  declare userNote: string;
  declare submitting: boolean;
  declare _menuElement: PendingTask['element'] | null;
  declare _highlight: Rect | null;
  declare _taskList: PendingTask[];
  declare _inProgressList: TaskHistory[];
  declare _tasksLoading: boolean;
  declare _approvalToast: string;
  declare _dockPosition: DockPosition | null;
  declare _dockSize: DockSize;
  declare _draggingDock: boolean;

  devpilotClient: DevpilotClient | null = null;

  /** Raw DOM element kept across pick → submit so hooks can access it. */
  private _rawPickedElement: Element | null = null;
  private readonly sessionId: string;
  private readonly dockStorageKey: string = 'devpilot:dock-position';
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _resizeRaf: number | null = null;
  private _dockDragState: DockDragState | null = null;
  private _suppressNextDockClick: boolean = false;
  private _onTaskUpdate = () => {
    void this.loadDashboard();
  };

  private _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (this.menuOpen) {
        e.preventDefault();
        this.closeMenu();
        return;
      }
      if (this.tasksPanelOpen) {
        e.preventDefault();
        this.tasksPanelOpen = false;
        return;
      }
      if (this.inspectMode) {
        e.preventDefault();
        this.inspectMode = false;
        this._highlight = null;
        this._detachInspectListeners();
      }
      return;
    }
    if (!e.altKey || !e.shiftKey) {
      return;
    }
    const k = e.key.toLowerCase();
    if (k !== 'i') {
      return;
    }
    const t = e.target;
    if (t instanceof HTMLElement) {
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
        return;
      }
    }
    e.preventDefault();
    this.toggleInspect();
  };

  private _onPointerMove = (e: PointerEvent) => {
    if (!this.inspectMode) {
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || shouldIgnorePickTarget(el)) {
      this._highlight = null;
      return;
    }
    const r = el.getBoundingClientRect();
    this._highlight = {
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    };
  };

  private _onPointerDown = (e: PointerEvent) => {
    if (!this.inspectMode) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || shouldIgnorePickTarget(el)) {
      return;
    }
    const elementPayload = collectElementContext(el, this.sessionId);
    this._rawPickedElement = el;
    this.inspectMode = false;
    this._highlight = null;
    this._detachInspectListeners();
    this._menuElement = elementPayload;
    this.tasksPanelOpen = false;
    this.menuOpen = true;
    this.userNote = '';
  };

  private _onWindowResize = () => {
    if (this._resizeRaf !== null) {
      return;
    }
    this._resizeRaf = window.requestAnimationFrame(() => {
      this._resizeRaf = null;
      this.syncDockFromLayout({ preserveEdge: true, save: true });
    });
  };

  private _onDockPointerMove = (e: PointerEvent) => {
    const drag = this._dockDragState;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    const deltaX = e.clientX - drag.startX;
    const deltaY = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) {
      return;
    }
    drag.moved = true;
    this._draggingDock = true;
    e.preventDefault();
    e.stopPropagation();

    const viewport = this.getViewportSize();
    const point = clampDockPoint(
      {
        x: drag.originX + deltaX,
        y: drag.originY + deltaY,
      },
      this._dockSize,
      viewport,
    );
    this._dockPosition = snapDockPosition(point, this._dockSize, viewport);
  };

  private _onDockPointerUp = (e: PointerEvent) => {
    const drag = this._dockDragState;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    this.detachDockDragListeners();
    try {
      drag.dock.releasePointerCapture(e.pointerId);
    }
    catch {
      // Pointer capture is best-effort across browsers.
    }

    if (drag.moved) {
      e.preventDefault();
      e.stopPropagation();
      this._suppressNextDockClick = true;
      this._dockPosition = snapDockPosition(
        this._dockPosition ?? { x: drag.originX, y: drag.originY },
        this._dockSize,
        this.getViewportSize(),
      );
      this.saveDockPosition();
      window.setTimeout(() => {
        this._suppressNextDockClick = false;
      }, 0);
    }
    this._draggingDock = false;
    this._dockDragState = null;
  };

  constructor() {
    super();
    this.sessionId = globalThis.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.inspectMode = false;
    this.pendingCount = 0;
    this.menuOpen = false;
    this.tasksPanelOpen = false;
    this.userNote = '';
    this.submitting = false;
    this._menuElement = null;
    this._highlight = null;
    this._taskList = [];
    this._inProgressList = [];
    this._tasksLoading = false;
    this._approvalToast = '';
    this._dockPosition = null;
    this._dockSize = { width: 180, height: 42 };
    this._draggingDock = false;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('data-devpilot-task-ui', '');
    window.addEventListener('devpilot:taskUpdate', this._onTaskUpdate);
    window.addEventListener('keydown', this._onKeyDown, true);
    window.addEventListener('resize', this._onWindowResize);
    void this.loadDashboard({ showLoading: true });
    this._pollTimer = setInterval(() => {
      void this.loadDashboard();
    }, 1000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._pollTimer !== null) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    document.documentElement.style.cursor = '';
    window.removeEventListener('devpilot:taskUpdate', this._onTaskUpdate);
    window.removeEventListener('keydown', this._onKeyDown, true);
    window.removeEventListener('resize', this._onWindowResize);
    if (this._resizeRaf !== null) {
      window.cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = null;
    }
    this.detachDockDragListeners();
    this._detachInspectListeners();
  }

  protected firstUpdated(): void {
    this.syncDockFromLayout();
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (changed.has('inspectMode')) {
      document.documentElement.style.cursor = this.inspectMode
        ? 'crosshair'
        : '';
    }
    if (changed.has('tasksPanelOpen') && this.tasksPanelOpen) {
      void this.loadDashboard({ showLoading: true });
    }
    if (changed.has('pendingCount')) {
      this.syncDockFromLayout({ preserveEdge: true, save: true });
    }
  }

  private getViewportSize(): ViewportSize {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  private readDockSize(): DockSize {
    const dock = this.renderRoot.querySelector<HTMLElement>('.dock');
    if (!dock) {
      return this._dockSize;
    }
    const rect = dock.getBoundingClientRect();
    return {
      width: Math.max(1, Math.ceil(rect.width), dock.scrollWidth),
      height: Math.max(1, Math.ceil(rect.height), dock.scrollHeight),
    };
  }

  private readStoredDockPosition(): DockPosition | null {
    try {
      const raw = window.localStorage.getItem(this.dockStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<DockPosition>;
      if (
        typeof parsed.x === 'number'
        && typeof parsed.y === 'number'
        && (parsed.edge === 'left' || parsed.edge === 'right' || parsed.edge === 'top' || parsed.edge === 'bottom')
      ) {
        return parsed as DockPosition;
      }
    }
    catch {
      // Ignore unavailable or malformed storage in embedded dev pages.
    }
    return null;
  }

  private saveDockPosition(): void {
    if (!this._dockPosition) {
      return;
    }
    try {
      window.localStorage.setItem(this.dockStorageKey, JSON.stringify(this._dockPosition));
    }
    catch {
      // Storage can be disabled; the dock still works for the session.
    }
  }

  private syncDockFromLayout(options?: { preserveEdge?: boolean, save?: boolean }): void {
    const viewport = this.getViewportSize();
    const size = this.readDockSize();
    const sizeChanged = size.width !== this._dockSize.width || size.height !== this._dockSize.height;
    if (sizeChanged) {
      this._dockSize = size;
    }

    const stored = this._dockPosition
      ? null
      : this.readStoredDockPosition();
    const next = this._dockPosition
      ? (
          options?.preserveEdge
            ? clampDockPosition(this._dockPosition, size, viewport)
            : snapDockPosition(this._dockPosition, size, viewport)
        )
      : (
          stored
            ? clampDockPosition(stored, size, viewport)
            : getDefaultDockPosition(viewport, size)
        );

    if (
      !this._dockPosition
      || next.x !== this._dockPosition.x
      || next.y !== this._dockPosition.y
      || next.edge !== this._dockPosition.edge
    ) {
      this._dockPosition = next;
      if (options?.save) {
        this.saveDockPosition();
      }
    }
  }

  private detachDockDragListeners(): void {
    window.removeEventListener('pointermove', this._onDockPointerMove, true);
    window.removeEventListener('pointerup', this._onDockPointerUp, true);
    window.removeEventListener('pointercancel', this._onDockPointerUp, true);
  }

  private _attachInspectListeners(): void {
    window.addEventListener('pointermove', this._onPointerMove, true);
    window.addEventListener('pointerdown', this._onPointerDown, true);
  }

  private _detachInspectListeners(): void {
    window.removeEventListener('pointermove', this._onPointerMove, true);
    window.removeEventListener('pointerdown', this._onPointerDown, true);
  }

  private toggleInspect(): void {
    if (this.menuOpen) {
      return;
    }
    this.inspectMode = !this.inspectMode;
    if (this.inspectMode) {
      this._attachInspectListeners();
    }
    else {
      this._highlight = null;
      this._detachInspectListeners();
    }
  }

  private closeMenu(): void {
    this.menuOpen = false;
    this._menuElement = null;
    this._rawPickedElement = null;
    this.userNote = '';
  }

  private toggleTasksPanel(): void {
    if (this.menuOpen) {
      return;
    }
    this.tasksPanelOpen = !this.tasksPanelOpen;
    if (this.tasksPanelOpen && this.inspectMode) {
      this.inspectMode = false;
      this._highlight = null;
      this._detachInspectListeners();
    }
  }

  private closeTasksPanel(): void {
    this.tasksPanelOpen = false;
  }

  private onDockPointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') {
      return;
    }
    const target = e.target;
    if (target instanceof Element && target.closest('.dock-tasks, .badge')) {
      return;
    }
    const dock = e.currentTarget as HTMLElement;
    const viewport = this.getViewportSize();
    const current = this._dockPosition
      ?? getDefaultDockPosition(viewport, this._dockSize);
    this._dockDragState = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: current.x,
      originY: current.y,
      moved: false,
      dock,
    };
    try {
      dock.setPointerCapture(e.pointerId);
    }
    catch {
      // Pointer capture is best-effort across browsers.
    }
    window.addEventListener('pointermove', this._onDockPointerMove, true);
    window.addEventListener('pointerup', this._onDockPointerUp, true);
    window.addEventListener('pointercancel', this._onDockPointerUp, true);
  }

  private consumeSuppressedDockClick(): boolean {
    if (!this._suppressNextDockClick) {
      return false;
    }
    this._suppressNextDockClick = false;
    return true;
  }

  private onTasksToggleClick(): void {
    if (this.consumeSuppressedDockClick()) {
      return;
    }
    this.toggleTasksPanel();
  }

  private onBadgeClick(): void {
    if (this.consumeSuppressedDockClick()) {
      return;
    }
    this.toggleInspect();
  }

  private getDockStyle(): string {
    if (!this._dockPosition) {
      return '';
    }
    const edge = this._dockPosition.edge;
    const minimizedOffset = 13;
    const transform = edge === 'left' || edge === 'right'
      ? 'translate(-50%, -50%) rotate(90deg)'
      : 'translate(-50%, -50%)';
    const minimizedTransform = edge === 'left'
      ? `translate(calc(-50% - ${minimizedOffset}px), -50%) rotate(90deg)`
      : edge === 'right'
        ? `translate(calc(-50% + ${minimizedOffset}px), -50%) rotate(90deg)`
        : edge === 'top'
          ? `translate(-50%, calc(-50% - ${minimizedOffset}px))`
          : `translate(-50%, calc(-50% + ${minimizedOffset}px))`;
    return [
      `left:${this._dockPosition.x}px`,
      `top:${this._dockPosition.y}px`,
      'right:auto',
      'bottom:auto',
      `--dock-transform:${transform}`,
      `--dock-minimized-transform:${minimizedTransform}`,
    ].join(';');
  }

  private getTasksPanelStyle(): string {
    if (!this._dockPosition) {
      return '';
    }
    const panel = getTaskPanelPosition(
      this._dockPosition,
      this._dockSize,
      this.getViewportSize(),
    );
    return [
      `left:${panel.x}px`,
      `top:${panel.y}px`,
      'right:auto',
      'bottom:auto',
      `width:${panel.width}px`,
      `max-height:${panel.maxHeight}px`,
    ].join(';');
  }

  private async loadDashboard(options?: { showLoading?: boolean }): Promise<void> {
    const client = this.devpilotClient;
    if (!client?.isConnected()) {
      this._taskList = [];
      this._inProgressList = [];
      this.pendingCount = 0;
      return;
    }
    if (options?.showLoading) {
      this._tasksLoading = true;
      this.requestUpdate();
    }
    try {
      const dash = await client.rpcCall('getTaskDashboard') as {
        pending: PendingTask[]
        inProgress: TaskHistory[]
      };
      this._taskList = Array.isArray(dash?.pending)
        ? dash.pending
        : [];
      this._inProgressList = Array.isArray(dash?.inProgress)
        ? dash.inProgress
        : [];
      this.pendingCount = this._taskList.length;
    }
    catch (err) {
      console.error('[devpilot] getTaskDashboard failed:', err);
      this._taskList = [];
      this._inProgressList = [];
    }
    finally {
      if (options?.showLoading) {
        this._tasksLoading = false;
      }
      this.requestUpdate();
    }
  }

  private async copyApprovalToken(taskId: string): Promise<void> {
    const client = this.devpilotClient;
    if (!client?.isConnected()) {
      return;
    }
    try {
      const r = await client.rpcCall('prepareTaskCompletionApproval', taskId) as { token: string } | { error: string };
      if ('error' in r) {
        this._approvalToast = r.error;
        this.requestUpdate();
        return;
      }
      try {
        await navigator.clipboard.writeText(r.token);
        this._approvalToast = 'Token copied. Paste it to the agent for complete_task after you confirm.';
      }
      catch {
        this._approvalToast = r.token;
      }
    }
    catch (err) {
      console.error('[devpilot] prepareTaskCompletionApproval failed:', err);
      this._approvalToast = 'Failed to get token';
    }
    this.requestUpdate();
    window.setTimeout(() => {
      this._approvalToast = '';
      this.requestUpdate();
    }, 5000);
  }

  private taskOriginLabel(sourceClient: string): string {
    const mine = this.devpilotClient?.getClientId() ?? null;
    return mine && sourceClient === mine
      ? 'this tab'
      : sourceClient;
  }

  private renderTaskRow(t: PendingTask) {
    const note = t.userNote?.trim();
    return html`
      <li class="task-row">
        <div class="task-row-head">
          <span class="task-age">${formatRelativeAge(t.timestamp)}</span>
          <span class="task-origin">${this.taskOriginLabel(t.sourceClient)}</span>
        </div>
        <p class="task-id-line"><code class="task-id">${t.id}</code></p>
        <p class="task-msg">${note || html`<em class="muted">(no message)</em>`}</p>
        <pre class="task-json">${JSON.stringify(t.element, null, 2)}</pre>
      </li>
    `;
  }

  private renderInProgressRow(t: TaskHistory) {
    const note = t.userNote?.trim();
    return html`
      <li class="task-row in-progress">
        <div class="task-row-head">
          <span class="task-badge-ip">In progress</span>
          <span class="task-age">${formatRelativeAge(t.timestamp)}</span>
        </div>
        <p class="task-id-line"><code class="task-id">${t.id}</code></p>
        <p class="task-msg">${note || html`<em class="muted">(no message)</em>`}</p>
        <pre class="task-json">${JSON.stringify(t.element, null, 2)}</pre>
        <button type="button" class="approval-btn" @click=${() => this.copyApprovalToken(t.id)}>
          Get approval token
        </button>
      </li>
    `;
  }

  private async submitTask(): Promise<void> {
    if (!this._menuElement || !this.devpilotClient || !this._rawPickedElement) {
      return;
    }
    let payload: TaskSubmitPayload = {
      element: this._menuElement,
      userNote: this.userNote.trim() || undefined,
    };
    this.submitting = true;
    try {
      payload = await runTaskPayloadHooks(payload, {
        element: this._rawPickedElement,
        client: this.devpilotClient,
      });
      await this.devpilotClient.rpcCall('submitTask', payload);
      this.closeMenu();
    }
    catch (err) {
      console.error('[devpilot] submitTask failed:', err);
    }
    finally {
      this.submitting = false;
    }
  }

  render() {
    const dockEdge = this._dockPosition?.edge ?? 'right';
    const dockClass = [
      'dock',
      `edge-${dockEdge}`,
      this._draggingDock ? 'is-dragging' : '',
      this.menuOpen || this.tasksPanelOpen ? 'is-active' : '',
    ].filter(Boolean).join(' ');
    return html`
      ${this.inspectMode
        ? html`<div class="inspect-banner" part="inspect-banner">Click an element to attach a task (Esc to exit)</div>`
        : null}
      ${this._highlight && this.inspectMode
        ? html`<div class="highlight" style=${`top:${this._highlight.top}px;left:${this._highlight.left}px;width:${this._highlight.width}px;height:${this._highlight.height}px`}></div>`
        : null}
      ${this.tasksPanelOpen
        ? html`
            <div
              class="panel-backdrop"
              part="tasks-backdrop"
              @click=${() => this.closeTasksPanel()}
            ></div>
            <section
              class="tasks-panel"
              part="tasks-panel"
              style=${this.getTasksPanelStyle()}
              @click=${(e: Event) => e.stopPropagation()}
            >
              <header class="tasks-header">
                <h3 class="tasks-title">Tasks</h3>
                <div class="tasks-header-actions">
                  <button type="button" class="icon-btn" title="Refresh" @click=${() => this.loadDashboard({ showLoading: true })}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 20q-3.35 0-5.675-2.325T4 12t2.325-5.675T12 4q1.725 0 3.3.712T18 6.75V5q0-.425.288-.712T19 4t.713.288T20 5v5q0 .425-.288.713T19 11h-5q-.425 0-.712-.288T13 10t.288-.712T14 9h3.2q-.8-1.4-2.187-2.2T12 6Q9.5 6 7.75 7.75T6 12t1.75 4.25T12 18q1.7 0 3.113-.862t2.187-2.313q.2-.35.563-.487t.737-.013q.4.125.575.525t-.025.75q-1.025 2-2.925 3.2T12 20"/></svg></button>
                  <button type="button" class="icon-btn" title="Close" @click=${() => this.closeTasksPanel()}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="m12 13.4l-4.9 4.9q-.275.275-.7.275t-.7-.275t-.275-.7t.275-.7l4.9-4.9l-4.9-4.9q-.275-.275-.275-.7t.275-.7t.7-.275t.7.275l4.9 4.9l4.9-4.9q.275-.275.7-.275t.7.275t.275.7t-.275.7L13.4 12l4.9 4.9q.275.275.275.7t-.275.7t-.7.275t-.7-.275z"/></svg></button>
                </div>
              </header>
              ${this._approvalToast
                ? html`<div class="approval-toast" part="approval-toast">${this._approvalToast}</div>`
                : null}
              <div class="tasks-body">
                ${this._tasksLoading
                  ? html`<p class="tasks-empty">Loading…</p>`
                  : html`
                      <div class="tasks-section">
                        <h4 class="tasks-subtitle">Pending</h4>
                        ${this._taskList.length === 0
                          ? html`<p class="tasks-empty tight">None</p>`
                          : html`<ul class="task-list">${this._taskList.map(t => this.renderTaskRow(t))}</ul>`}
                      </div>
                      <div class="tasks-section">
                        <h4 class="tasks-subtitle">In progress</h4>
                        ${this._inProgressList.length === 0
                          ? html`<p class="tasks-empty tight">None</p>`
                          : html`<ul class="task-list">${this._inProgressList.map(t => this.renderInProgressRow(t))}</ul>`}
                      </div>
                    `}
              </div>
            </section>
          `
        : null}
      ${this.menuOpen && this._menuElement
        ? html`
            <div class="backdrop" part="backdrop" @click=${() => !this.submitting && this.closeMenu()}></div>
            <div class="dialog" part="dialog" @click=${(e: Event) => e.stopPropagation()}>
              <h3 class="dialog-title">New task</h3>
              <p class="dialog-hint">${this._menuElement.selector}</p>
              <label class="note-label" for="dp-task-note">Message</label>
              <textarea
                id="dp-task-note"
                class="note-input"
                .value=${this.userNote}
                @input=${(e: Event) => {
                  this.userNote = (e.target as HTMLTextAreaElement).value;
                }}
                placeholder="What should change?"
                rows="4"
                ?disabled=${this.submitting}
              ></textarea>
              <div class="actions">
                <button type="button" class="btn secondary" ?disabled=${this.submitting} @click=${() => this.closeMenu()}>Cancel</button>
                <button type="button" class="btn primary" ?disabled=${this.submitting} @click=${() => this.submitTask()}>Submit</button>
              </div>
            </div>
          `
        : null}
      <div
        class=${dockClass}
        part="dock"
        style=${this.getDockStyle()}
        title="Drag to move, release near an edge to dock"
        @pointerdown=${(e: PointerEvent) => this.onDockPointerDown(e)}
      >
        <button
          type="button"
          class="dock-mark"
          title="Pick element (Alt+Shift+I)"
          @click=${() => this.onBadgeClick()}
        >
          D
        </button>
        <span class="dock-content">
          <button
            type="button"
            class="dock-tasks ${this.tasksPanelOpen
              ? 'is-open'
              : ''}"
            part="tasks-toggle"
            title="View pending task queue"
            ?aria-expanded=${this.tasksPanelOpen}
            @click=${() => this.onTasksToggleClick()}
          >
            Tasks
          </button>
          <button
            type="button"
            class="badge"
            part="badge"
            title="Pick element (Alt+Shift+I)"
            @click=${() => this.onBadgeClick()}
          >
            <span class="badge-label">Devpilot</span>
            <span class="badge-count">${this.pendingCount}</span>
          </button>
        </span>
      </div>
    `;
  }

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1e293b;
    }

    /* ── Inspect mode ── */
    .inspect-banner {
      pointer-events: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      padding: 8px 16px;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #f1f5f9;
      text-align: center;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.01em;
    }
    .highlight {
      pointer-events: none;
      position: fixed;
      box-sizing: border-box;
      border: 2px solid #38bdf8;
      border-radius: 6px;
      background: rgba(56, 189, 248, 0.08);
      z-index: 2147483001;
    }

    /* ── Panel backdrop ── */
    .panel-backdrop {
      pointer-events: auto;
      position: fixed;
      inset: 0;
      background: transparent;
      z-index: 2147483001;
    }

    /* ── Tasks panel ── */
    .tasks-panel {
      pointer-events: auto;
      position: fixed;
      right: 16px;
      bottom: 64px;
      width: min(380px, calc(100vw - 32px));
      max-height: min(440px, 50vh);
      display: flex;
      flex-direction: column;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.82);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 0, 0, 0.08);
      color: #1e293b;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      z-index: 2147483002;
      overflow: hidden;
    }
    .tasks-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      flex-shrink: 0;
    }
    .tasks-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }
    .tasks-header-actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .icon-btn {
      border: none;
      background: transparent;
      cursor: pointer;
      line-height: 1;
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      border-radius: 8px;
      transition: background 0.15s, color 0.15s;
    }
    .icon-btn:hover {
      background: rgba(0, 0, 0, 0.05);
      color: #1e293b;
    }
    .approval-toast {
      margin: 8px 12px;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.5;
      color: #0c4a6e;
      background: #e0f2fe;
      border-radius: 10px;
      border: 1px solid #bae6fd;
      word-break: break-word;
    }
    .tasks-body {
      overflow-y: auto;
      padding: 4px 0 8px;
      flex: 1;
      min-height: 0;
    }
    .tasks-section {
      padding: 0 8px 4px;
    }
    .tasks-subtitle {
      margin: 10px 8px 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
    }
    .tasks-empty {
      margin: 20px 16px;
      text-align: center;
      color: #94a3b8;
      font-size: 13px;
    }
    .tasks-empty.tight {
      margin: 4px 8px 12px;
      text-align: left;
    }
    .task-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .task-row {
      margin: 4px 4px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(0, 0, 0, 0.04);
      background: rgba(255, 255, 255, 0.6);
      transition: background 0.15s;
    }
    .task-row:hover {
      background: rgba(255, 255, 255, 0.9);
    }
    .task-row.in-progress {
      border-color: rgba(56, 189, 248, 0.2);
      background: rgba(56, 189, 248, 0.04);
    }
    .task-row.in-progress:hover {
      background: rgba(56, 189, 248, 0.08);
    }
    .task-id-line {
      margin: 0 0 4px;
    }
    .task-id {
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
      font-size: 11px;
      color: #94a3b8;
      word-break: break-all;
    }
    .task-badge-ip {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #0284c7;
      background: rgba(56, 189, 248, 0.12);
      padding: 2px 6px;
      border-radius: 6px;
    }
    .approval-btn {
      margin-top: 8px;
      width: 100%;
      padding: 7px 12px;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.8);
      font: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      color: #1e293b;
      transition: border-color 0.15s, background 0.15s;
    }
    .approval-btn:hover {
      background: #fff;
      border-color: #38bdf8;
      color: #0284c7;
    }
    .task-row-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    .task-origin {
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
      font-size: 10px;
      max-width: 55%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .task-msg {
      margin: 0 0 6px;
      font-size: 13px;
      line-height: 1.5;
      color: #334155;
    }
    .task-json {
      margin: 4px 0 0;
      padding: 8px 10px;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
      font-size: 11px;
      line-height: 1.5;
      color: #475569;
      background: rgba(0, 0, 0, 0.03);
      border: 1px solid rgba(0, 0, 0, 0.04);
      border-radius: 8px;
      max-height: 120px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .muted {
      color: #94a3b8;
      font-style: italic;
    }

    /* ── Dock (floating widget) ── */
    .dock {
      pointer-events: auto;
      position: fixed;
      right: 16px;
      bottom: 16px;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 4px;
      z-index: 2147483003;
      box-sizing: border-box;
      width: max-content;
      max-width: 34px;
      min-width: 34px;
      height: 34px;
      padding: 2px;
      border-radius: 100px;
      overflow: hidden;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
      opacity: 0.88;
      transform: var(--dock-minimized-transform, translate(-50%, -50%));
      transition:
        max-width 0.45s ease,
        padding 0.35s ease,
        transform 0.35s ease,
        opacity 0.2s ease,
        box-shadow 0.35s ease,
        background 0.2s ease;
      touch-action: none;
      user-select: none;
      will-change: transform;
    }
    .dock:hover,
    .dock:focus-within,
    .dock.is-active,
    .dock.is-dragging {
      max-width: 220px;
      padding: 2px;
      opacity: 1;
      transform: var(--dock-transform, translate(-50%, -50%));
      background: rgba(15, 23, 42, 0.92);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.24);
    }
    .dock.is-dragging {
      cursor: grabbing;
      transition: none;
    }
    .dock-mark {
      flex: none;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      color: #0f172a;
      background: linear-gradient(135deg, #67e8f9, #38bdf8);
      font-size: 13px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
      cursor: grab;
      box-shadow: 0 0 18px rgba(56, 189, 248, 0.28);
    }
    .dock-mark:hover {
      background: linear-gradient(135deg, #7dd3fc, #38bdf8);
    }
    .dock.is-dragging .dock-mark {
      cursor: grabbing;
    }
    .dock-content {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    .dock:hover .dock-content,
    .dock:focus-within .dock-content,
    .dock.is-active .dock-content,
    .dock.is-dragging .dock-content {
      opacity: 1;
    }
    .dock-tasks {
      padding: 6px 14px;
      border: none;
      border-radius: 100px;
      background: transparent;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      transition: color 0.15s, background 0.15s;
    }
    .dock-tasks:hover {
      color: #f1f5f9;
      background: rgba(255, 255, 255, 0.1);
    }
    .dock-tasks.is-open {
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.15);
    }
    .badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px 6px 12px;
      border: none;
      border-radius: 100px;
      background: rgba(255, 255, 255, 0.1);
      color: #f1f5f9;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.15s;
    }
    .badge:hover {
      background: rgba(255, 255, 255, 0.18);
    }
    .badge-label {
      opacity: 0.9;
    }
    .badge-count {
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border-radius: 100px;
      background: #38bdf8;
      color: #0f172a;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
    }

    /* ── Dialog backdrop ── */
    .backdrop {
      pointer-events: auto;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.3);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      z-index: 2147483004;
    }

    /* ── New task dialog ── */
    .dialog {
      pointer-events: auto;
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(400px, calc(100vw - 32px));
      max-height: calc(100vh - 48px);
      overflow: auto;
      padding: 24px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(0, 0, 0, 0.08);
      color: #1e293b;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.06);
      z-index: 2147483005;
    }
    .dialog-title {
      margin: 0 0 4px;
      font-size: 16px;
      font-weight: 600;
    }
    .dialog-hint {
      margin: 0 0 16px;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
    }
    .note-label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 500;
      color: #475569;
    }
    .note-input {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.8);
      font: inherit;
      font-size: 13px;
      resize: vertical;
      transition: border-color 0.15s;
      outline: none;
    }
    .note-input:focus {
      border-color: #38bdf8;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      justify-content: flex-end;
    }
    .btn {
      padding: 8px 18px;
      border-radius: 10px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background 0.15s, border-color 0.15s, opacity 0.15s;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn.secondary {
      background: rgba(0, 0, 0, 0.04);
      border-color: rgba(0, 0, 0, 0.08);
      color: #475569;
    }
    .btn.secondary:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.08);
    }
    .btn.primary {
      background: #0f172a;
      color: #f8fafc;
    }
    .btn.primary:hover:not(:disabled) {
      background: #1e293b;
    }
  `;
}
