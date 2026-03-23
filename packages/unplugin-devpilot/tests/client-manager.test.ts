import { describe, expect, it } from 'vitest';
import { ClientManager } from '../src/core/client-manager';

const minimalElement = {
  uid: 'dp_x_1',
  selector: 'button.foo',
  role: 'button',
  name: 'Go',
};

describe('clientManager', () => {
  it('claimTask removes queue entry and sets history in_progress', () => {
    const m = new ClientManager();
    m.addTask({
      id: 'task_claim_1',
      sourceClient: 'c_test',
      element: minimalElement,
      timestamp: Date.now(),
    });
    expect(m.peekPendingTasks()).toHaveLength(1);
    const r = m.claimTask('task_claim_1');
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.task.id).toBe('task_claim_1');
    }
    expect(m.peekPendingTasks()).toHaveLength(0);
    const ip = m.getTaskHistory({ status: 'in_progress' });
    expect(ip.some(t => t.id === 'task_claim_1')).toBe(true);
  });

  it('completeTaskWithApproval requires token from createCompletionApproval', () => {
    const m = new ClientManager();
    m.addTask({
      id: 'task_done_1',
      sourceClient: 'c_test',
      element: minimalElement,
      timestamp: Date.now(),
    });
    expect(m.claimTask('task_done_1').ok).toBe(true);
    const appr = m.createCompletionApproval('task_done_1');
    expect(appr).toMatchObject({ token: expect.any(String) });
    if (!('token' in appr)) {
      return;
    }
    const bad = m.completeTaskWithApproval('task_done_1', 'wrong');
    expect(bad).toEqual({ ok: false, error: expect.any(String) });
    const good = m.completeTaskWithApproval('task_done_1', appr.token, { summary: 'ok' });
    expect(good).toEqual({ ok: true });
    expect(m.getTaskHistory({ status: 'completed' }).some(t => t.id === 'task_done_1')).toBe(true);
  });
});
