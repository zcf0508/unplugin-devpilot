import type { DevpilotClient } from '../types';
import type { PendingTask, TaskHistory, TaskSubmitPayload } from '../../core/types';
import { LitElement, css, html } from 'lit';
import type { PropertyValues } from 'lit';
import { runTaskPayloadHooks } from '../index.js';
import {
  collectElementContext,
  shouldIgnorePickTarget,
} from './task-element-info.js';

type Rect = { top: number, left: number, width: number, height: number }

function formatRelativeAge(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 5) {
    return 'just now'
  }
  if (sec < 60) {
    return `${sec}s ago`
  }
  const min = Math.floor(sec / 60)
  if (min < 60) {
    return `${min}m ago`
  }
  const hr = Math.floor(min / 60)
  if (hr < 48) {
    return `${hr}h ago`
  }
  return new Date(ts).toLocaleString()
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
  }

  declare inspectMode: boolean
  declare pendingCount: number
  declare menuOpen: boolean
  declare tasksPanelOpen: boolean
  declare userNote: string
  declare submitting: boolean
  declare _menuElement: PendingTask['element'] | null
  declare _highlight: Rect | null
  declare _taskList: PendingTask[]
  declare _inProgressList: TaskHistory[]
  declare _tasksLoading: boolean
  declare _approvalToast: string

  devpilotClient: DevpilotClient | null = null

  /** Raw DOM element kept across pick → submit so hooks can access it. */
  private _rawPickedElement: Element | null = null
  private readonly sessionId: string
  private _pollTimer: ReturnType<typeof setInterval> | null = null
  private _onTaskUpdate = () => {
    void this.loadDashboard()
  }

  private _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (this.menuOpen) {
        e.preventDefault()
        this.closeMenu()
        return
      }
      if (this.tasksPanelOpen) {
        e.preventDefault()
        this.tasksPanelOpen = false
        return
      }
      if (this.inspectMode) {
        e.preventDefault()
        this.inspectMode = false
        this._highlight = null
        this._detachInspectListeners()
      }
      return
    }
    if (!e.altKey || !e.shiftKey) {
      return
    }
    const k = e.key.toLowerCase()
    if (k !== 'i') {
      return
    }
    const t = e.target
    if (t instanceof HTMLElement) {
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
        return
      }
    }
    e.preventDefault()
    this.toggleInspect()
  }

  private _onPointerMove = (e: PointerEvent) => {
    if (!this.inspectMode) {
      return
    }
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el || shouldIgnorePickTarget(el)) {
      this._highlight = null
      return
    }
    const r = el.getBoundingClientRect()
    this._highlight = {
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    }
  }

  private _onPointerDown = (e: PointerEvent) => {
    if (!this.inspectMode) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el || shouldIgnorePickTarget(el)) {
      return
    }
    const elementPayload = collectElementContext(el, this.sessionId)
    this._rawPickedElement = el
    this.inspectMode = false
    this._highlight = null
    this._detachInspectListeners()
    this._menuElement = elementPayload
    this.tasksPanelOpen = false
    this.menuOpen = true
    this.userNote = ''
  }

  constructor() {
    super()
    this.sessionId = globalThis.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    this.inspectMode = false
    this.pendingCount = 0
    this.menuOpen = false
    this.tasksPanelOpen = false
    this.userNote = ''
    this.submitting = false
    this._menuElement = null
    this._highlight = null
    this._taskList = []
    this._inProgressList = []
    this._tasksLoading = false
    this._approvalToast = ''
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.setAttribute('data-devpilot-task-ui', '')
    window.addEventListener('devpilot:taskUpdate', this._onTaskUpdate)
    window.addEventListener('keydown', this._onKeyDown, true)
    void this.loadDashboard({ showLoading: true })
    this._pollTimer = setInterval(() => {
      void this.loadDashboard()
    }, 1000)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    if (this._pollTimer !== null) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
    document.documentElement.style.cursor = ''
    window.removeEventListener('devpilot:taskUpdate', this._onTaskUpdate)
    window.removeEventListener('keydown', this._onKeyDown, true)
    this._detachInspectListeners()
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed)
    if (changed.has('inspectMode')) {
      document.documentElement.style.cursor = this.inspectMode ? 'crosshair' : ''
    }
    if (changed.has('tasksPanelOpen') && this.tasksPanelOpen) {
      void this.loadDashboard({ showLoading: true })
    }
  }

  private _attachInspectListeners(): void {
    window.addEventListener('pointermove', this._onPointerMove, true)
    window.addEventListener('pointerdown', this._onPointerDown, true)
  }

  private _detachInspectListeners(): void {
    window.removeEventListener('pointermove', this._onPointerMove, true)
    window.removeEventListener('pointerdown', this._onPointerDown, true)
  }

  private toggleInspect(): void {
    if (this.menuOpen) {
      return
    }
    this.inspectMode = !this.inspectMode
    if (this.inspectMode) {
      this._attachInspectListeners()
    }
    else {
      this._highlight = null
      this._detachInspectListeners()
    }
  }

  private closeMenu(): void {
    this.menuOpen = false
    this._menuElement = null
    this._rawPickedElement = null
    this.userNote = ''
  }

  private toggleTasksPanel(): void {
    if (this.menuOpen) {
      return
    }
    this.tasksPanelOpen = !this.tasksPanelOpen
    if (this.tasksPanelOpen && this.inspectMode) {
      this.inspectMode = false
      this._highlight = null
      this._detachInspectListeners()
    }
  }

  private closeTasksPanel(): void {
    this.tasksPanelOpen = false
  }

  private async loadDashboard(options?: { showLoading?: boolean }): Promise<void> {
    const client = this.devpilotClient
    if (!client?.isConnected()) {
      this._taskList = []
      this._inProgressList = []
      this.pendingCount = 0
      return
    }
    if (options?.showLoading) {
      this._tasksLoading = true
      this.requestUpdate()
    }
    try {
      const dash = await client.rpcCall('getTaskDashboard') as {
        pending: PendingTask[]
        inProgress: TaskHistory[]
      }
      this._taskList = Array.isArray(dash?.pending) ? dash.pending : []
      this._inProgressList = Array.isArray(dash?.inProgress) ? dash.inProgress : []
      this.pendingCount = this._taskList.length
    }
    catch (err) {
      console.error('[devpilot] getTaskDashboard failed:', err)
      this._taskList = []
      this._inProgressList = []
    }
    finally {
      if (options?.showLoading) {
        this._tasksLoading = false
      }
      this.requestUpdate()
    }
  }

  private async copyApprovalToken(taskId: string): Promise<void> {
    const client = this.devpilotClient
    if (!client?.isConnected()) {
      return
    }
    try {
      const r = await client.rpcCall('prepareTaskCompletionApproval', taskId) as { token: string } | { error: string }
      if ('error' in r) {
        this._approvalToast = r.error
        this.requestUpdate()
        return
      }
      try {
        await navigator.clipboard.writeText(r.token)
        this._approvalToast = 'Token copied. Paste it to the agent for complete_task after you confirm.'
      }
      catch {
        this._approvalToast = r.token
      }
    }
    catch (err) {
      console.error('[devpilot] prepareTaskCompletionApproval failed:', err)
      this._approvalToast = 'Failed to get token'
    }
    this.requestUpdate()
    window.setTimeout(() => {
      this._approvalToast = ''
      this.requestUpdate()
    }, 5000)
  }

  private taskOriginLabel(sourceClient: string): string {
    const mine = this.devpilotClient?.getClientId() ?? null
    return mine && sourceClient === mine ? 'this tab' : sourceClient
  }

  private renderTaskRow(t: PendingTask) {
    const note = t.userNote?.trim()
    return html`
      <li class="task-row">
        <div class="task-row-head">
          <span class="task-age">${formatRelativeAge(t.timestamp)}</span>
          <span class="task-origin">${this.taskOriginLabel(t.sourceClient)}</span>
        </div>
        <p class="task-id-line"><code class="task-id">${t.id}</code></p>
        <p class="task-msg">${note ? note : html`<em class="muted">(no message)</em>`}</p>
        <pre class="task-json">${JSON.stringify(t.element, null, 2)}</pre>
      </li>
    `
  }

  private renderInProgressRow(t: TaskHistory) {
    const note = t.userNote?.trim()
    return html`
      <li class="task-row in-progress">
        <div class="task-row-head">
          <span class="task-badge-ip">In progress</span>
          <span class="task-age">${formatRelativeAge(t.timestamp)}</span>
        </div>
        <p class="task-id-line"><code class="task-id">${t.id}</code></p>
        <p class="task-msg">${note ? note : html`<em class="muted">(no message)</em>`}</p>
        <pre class="task-json">${JSON.stringify(t.element, null, 2)}</pre>
        <button type="button" class="approval-btn" @click=${() => this.copyApprovalToken(t.id)}>
          Get approval token
        </button>
      </li>
    `
  }

  private async submitTask(): Promise<void> {
    if (!this._menuElement || !this.devpilotClient || !this._rawPickedElement) {
      return
    }
    let payload: TaskSubmitPayload = {
      element: this._menuElement,
      userNote: this.userNote.trim() || undefined,
    }
    this.submitting = true
    try {
      payload = await runTaskPayloadHooks(payload, {
        element: this._rawPickedElement,
        client: this.devpilotClient,
      })
      await this.devpilotClient.rpcCall('submitTask', payload)
      this.closeMenu()
    }
    catch (err) {
      console.error('[devpilot] submitTask failed:', err)
    }
    finally {
      this.submitting = false
    }
  }

  render() {
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
            <section class="tasks-panel" part="tasks-panel" @click=${(e: Event) => e.stopPropagation()}>
              <header class="tasks-header">
                <h3 class="tasks-title">Tasks</h3>
                <div class="tasks-header-actions">
                  <button type="button" class="icon-btn" title="Refresh" @click=${() => this.loadDashboard({ showLoading: true })}>↻</button>
                  <button type="button" class="icon-btn" title="Close" @click=${() => this.closeTasksPanel()}>×</button>
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
                  this.userNote = (e.target as HTMLTextAreaElement).value
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
      <div class="dock" part="dock">
        <button
          type="button"
          class="dock-tasks ${this.tasksPanelOpen ? 'is-open' : ''}"
          part="tasks-toggle"
          title="View pending task queue"
          ?aria-expanded=${this.tasksPanelOpen}
          @click=${() => this.toggleTasksPanel()}
        >
          Tasks
        </button>
        <button
          type="button"
          class="badge"
          part="badge"
          title="Pick element (Alt+Shift+I)"
          @click=${() => this.toggleInspect()}
        >
          <span class="badge-label">Devpilot</span>
          <span class="badge-count">${this.pendingCount}</span>
        </button>
      </div>
    `
  }

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483000;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      font-size: 14px;
    }
    .inspect-banner {
      pointer-events: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      padding: 10px 16px;
      background: rgba(15, 23, 42, 0.92);
      color: #f8fafc;
      text-align: center;
      font-weight: 600;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
    }
    .highlight {
      pointer-events: none;
      position: fixed;
      box-sizing: border-box;
      border: 2px solid #38bdf8;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.12);
      z-index: 2147483001;
    }
    .panel-backdrop {
      pointer-events: auto;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.35);
      z-index: 2147483001;
    }
    .tasks-panel {
      pointer-events: auto;
      position: fixed;
      right: 16px;
      bottom: 64px;
      width: min(380px, calc(100vw - 32px));
      max-height: min(420px, 48vh);
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      background: #fff;
      color: #0f172a;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
      z-index: 2147483002;
      overflow: hidden;
    }
    .tasks-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid #e2e8f0;
      flex-shrink: 0;
    }
    .tasks-title {
      margin: 0;
      font-size: 15px;
    }
    .tasks-header-actions {
      display: flex;
      gap: 2px;
    }
    .icon-btn {
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 4px 8px;
      color: #475569;
      border-radius: 6px;
    }
    .icon-btn:hover {
      background: #f1f5f9;
    }
    .approval-toast {
      margin: 0 12px 8px;
      padding: 8px 10px;
      font-size: 12px;
      line-height: 1.4;
      color: #0f172a;
      background: #e0f2fe;
      border-radius: 8px;
      border: 1px solid #7dd3fc;
      word-break: break-word;
    }
    .tasks-body {
      overflow-y: auto;
      padding: 4px 0 12px;
      max-height: min(380px, 52vh);
    }
    .tasks-section {
      padding: 0 4px 10px;
    }
    .tasks-subtitle {
      margin: 8px 10px 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #94a3b8;
    }
    .tasks-empty {
      margin: 16px;
      text-align: center;
      color: #64748b;
      font-size: 13px;
    }
    .tasks-empty.tight {
      margin: 4px 12px 12px;
      text-align: left;
    }
    .task-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .task-row {
      padding: 10px 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    .task-row:last-child {
      border-bottom: none;
    }
    .task-row.in-progress {
      background: #f8fafc;
    }
    .task-id-line {
      margin: 0 0 6px;
    }
    .task-id {
      font-size: 11px;
      color: #64748b;
      word-break: break-all;
    }
    .task-badge-ip {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #0284c7;
    }
    .approval-btn {
      margin-top: 10px;
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      color: #0f172a;
    }
    .approval-btn:hover {
      background: #f1f5f9;
      border-color: #38bdf8;
    }
    .task-row-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 6px;
    }
    .task-origin {
      font-family: ui-monospace, monospace;
      font-size: 10px;
      max-width: 55%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .task-msg {
      margin: 0 0 4px;
      font-size: 14px;
      line-height: 1.4;
    }
    .task-meta {
      margin: 0;
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
    }
    .task-json {
      margin: 4px 0 0;
      padding: 6px 8px;
      font-size: 11px;
      line-height: 1.4;
      color: #334155;
      background: #f1f5f9;
      border-radius: 6px;
      max-height: 120px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .muted {
      color: #94a3b8;
      font-style: italic;
    }
    .dock {
      pointer-events: auto;
      position: fixed;
      right: 16px;
      bottom: 16px;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
      z-index: 2147483003;
    }
    .dock-tasks {
      padding: 8px 14px;
      border: none;
      border-radius: 999px;
      background: #334155;
      color: #f8fafc;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.25);
    }
    .dock-tasks:hover {
      background: #475569;
    }
    .dock-tasks.is-open {
      box-shadow: 0 0 0 2px #38bdf8;
    }
    .badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: none;
      border-radius: 999px;
      background: #0f172a;
      color: #f1f5f9;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(15, 23, 42, 0.35);
      font-weight: 600;
    }
    .badge:hover {
      background: #1e293b;
    }
    .badge-count {
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      border-radius: 999px;
      background: #38bdf8;
      color: #0f172a;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }
    .backdrop {
      pointer-events: auto;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      z-index: 2147483004;
    }
    .dialog {
      pointer-events: auto;
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(400px, calc(100vw - 32px));
      max-height: calc(100vh - 48px);
      overflow: auto;
      padding: 20px;
      border-radius: 12px;
      background: #fff;
      color: #0f172a;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);
      z-index: 2147483005;
    }
    .dialog-title {
      margin: 0 0 6px;
      font-size: 18px;
    }
    .dialog-hint {
      margin: 0 0 14px;
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
    }
    .note-label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 600;
    }
    .note-input {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font: inherit;
      resize: vertical;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 14px;
      justify-content: flex-end;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      border: none;
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .btn.secondary {
      background: #e2e8f0;
      color: #0f172a;
    }
    .btn.secondary:hover:not(:disabled) {
      background: #cbd5e1;
    }
    .btn.primary {
      background: #0f172a;
      color: #f8fafc;
    }
    .btn.primary:hover:not(:disabled) {
      background: #1e293b;
    }
  `
}
