import crypto from 'node:crypto';

const clients = new Map();
const MAX_SSE_CLIENTS = 500;

// Periodic cleanup of stale/destroyed sockets every 60s
const staleSweepInterval = setInterval(() => {
  for (const [clientId, client] of clients.entries()) {
    if (!client.res || client.res.destroyed || client.res.writableEnded) {
      clients.delete(clientId);
    }
  }
}, 60000);
staleSweepInterval.unref();

/**
 * Register a new authenticated SSE client and configure keep-alive headers & heartbeat.
 */
export function registerSseClient(req, res, user) {
  if (clients.size >= MAX_SSE_CLIENTS) {
    res.status(503).json({
      error: 'ServiceUnavailable',
      message: 'Maximum concurrent real-time connections reached. Please retry shortly.',
    });
    return null;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const clientId = crypto.randomUUID();
  const clientRecord = {
    id: clientId,
    res,
    userId: user.id,
    username: user.username,
    role: user.role,
    connectedAt: new Date().toISOString(),
  };

  clients.set(clientId, clientRecord);

  // Send initial connected handshake event (no secrets or tokens)
  writeSseEvent(res, 'connected', {
    clientId,
    userId: user.id,
    role: user.role,
    timestamp: new Date().toISOString(),
  });

  // Periodic heartbeat to prevent idle proxy timeouts
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      cleanup();
    }
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeatTimer);
    clients.delete(clientId);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);

  return clientId;
}

function writeSseEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Broadcast an event to all connected authenticated SSE clients (optionally filtered by role or userIds).
 */
export function broadcastEvent(eventName, payload, { roles = null, userIds = null } = {}) {
  const enriched = {
    ...payload,
    eventTimestamp: new Date().toISOString(),
  };

  for (const [clientId, client] of clients.entries()) {
    if (!client.res || client.res.destroyed || client.res.writableEnded) {
      clients.delete(clientId);
      continue;
    }
    if (roles && !roles.includes(client.role)) {
      continue;
    }
    if (Array.isArray(userIds) && !userIds.includes(client.userId)) {
      continue;
    }
    try {
      writeSseEvent(client.res, eventName, enriched);
    } catch {
      clients.delete(clientId);
    }
  }
}

export function getConnectedClientCount() {
  return clients.size;
}

export function closeAllSseClients() {
  for (const [clientId, client] of clients.entries()) {
    try {
      client.res.end();
    } catch {
      // ignore close errors
    }
    clients.delete(clientId);
  }
}

export default {
  registerSseClient,
  broadcastEvent,
  getConnectedClientCount,
  closeAllSseClients,
};

