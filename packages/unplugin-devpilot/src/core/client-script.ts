export function generateClientScript(wsPort: number): string {
  return `
(function() {
  const WS_PORT = ${wsPort};
  let ws = null;
  let clientId = null;
  let rpcCallId = 0;
  const pendingCalls = new Map();
  const rpcHandlers = {
    notifyTaskUpdate(count) {
      window.dispatchEvent(new CustomEvent('devpilot:taskUpdate', { detail: { count } }));
    },
    notifyTaskCompleted(taskId) {
      window.dispatchEvent(new CustomEvent('devpilot:taskCompleted', { detail: { taskId } }));
    }
  };

  function generateId() {
    return Math.random().toString(36).slice(2, 12);
  }

  function connect() {
    ws = new WebSocket('ws://localhost:' + WS_PORT);

    ws.onopen = function() {
      console.log('[devpilot] Connected to server');
    };

    ws.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);

        // Handle initial connection message
        if (data.type === 'connected') {
          clientId = data.clientId;
          console.log('[devpilot] Client ID:', clientId);
          // Now send client info after receiving clientId
          rpcCall('updateClientInfo', {
            url: location.href,
            title: document.title,
            userAgent: navigator.userAgent
          });
          return;
        }

        // Handle birpc request (t: 'q')
        if (data.t === 'q' && data.m && rpcHandlers[data.m]) {
          const result = rpcHandlers[data.m](...(data.a || []));
          if (data.i) {
            // Send birpc response (t: 's')
            ws.send(JSON.stringify({ t: 's', i: data.i, r: result }));
          }
          return;
        }

        // Handle birpc response (t: 's')
        if (data.t === 's' && data.i && pendingCalls.has(data.i)) {
          const { resolve, reject } = pendingCalls.get(data.i);
          pendingCalls.delete(data.i);
          if (data.e) reject(new Error(String(data.e)));
          else resolve(data.r);
          return;
        }
      } catch (e) {
        console.error('[devpilot] Message parse error:', e);
      }
    };

    ws.onclose = function() {
      console.log('[devpilot] Disconnected, reconnecting...');
      clientId = null;
      setTimeout(connect, 2000);
    };

    ws.onerror = function(err) {
      console.error('[devpilot] WebSocket error:', err);
    };
  }

  function rpcCall(method, ...args) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const id = generateId();
      pendingCalls.set(id, { resolve, reject });
      // Use birpc protocol format: t='q' for request
      ws.send(JSON.stringify({ t: 'q', m: method, a: args, i: id }));
    });
  }

  window.__devpilot = {
    getClientId: () => clientId,
    rpcCall,
    isConnected: () => ws && ws.readyState === WebSocket.OPEN
  };

  connect();
})();
`;
}
