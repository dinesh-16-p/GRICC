import db from '../db/database.js';

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  return err;
}

function mapConversationRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    activeCountry: row.active_country,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessageRow(row) {
  let evidence = [];
  let metadata = {};
  try {
    evidence = JSON.parse(row.evidence_json || '[]');
  } catch {
    evidence = [];
  }
  try {
    metadata = JSON.parse(row.metadata_json || '{}');
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    evidence,
    metadata,
    createdAt: row.created_at,
  };
}

export const conversationService = {
  createConversation(userId, title = 'New Intelligence Session', activeCountry = null) {
    const id = `CONV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const nowIso = new Date().toISOString();
    const safeTitle = String(title || 'New Intelligence Session').trim().slice(0, 120);

    db.prepare(`
      INSERT INTO ai_conversations (id, user_id, title, active_country, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, String(userId), safeTitle, activeCountry || null, nowIso, nowIso);

    return mapConversationRow(db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id));
  },

  listConversations(userId) {
    return db
      .prepare('SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC')
      .all(String(userId))
      .map(mapConversationRow);
  },

  getOwnedConversation(conversationId, userId) {
    const row = db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(conversationId);
    if (!row) {
      throw createHttpError(404, `Conversation ${conversationId} not found.`, 'NotFound');
    }
    if (String(row.user_id) !== String(userId)) {
      throw createHttpError(403, 'Access denied: you do not own this conversation.', 'Forbidden');
    }
    const messages = db
      .prepare('SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY id ASC')
      .all(conversationId)
      .map(mapMessageRow);

    return {
      conversation: mapConversationRow(row),
      messages,
    };
  },

  deleteConversation(conversationId, userId) {
    const row = db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(conversationId);
    if (!row) {
      throw createHttpError(404, `Conversation ${conversationId} not found.`, 'NotFound');
    }
    if (String(row.user_id) !== String(userId)) {
      throw createHttpError(403, 'Access denied: you do not own this conversation.', 'Forbidden');
    }
    db.prepare('DELETE FROM ai_conversations WHERE id = ? AND user_id = ?').run(conversationId, String(userId));
    return { deleted: true, id: conversationId };
  },

  appendMessage(conversationId, userId, { role, content, evidence = [], metadata = {}, activeCountry = undefined }) {
    const nowIso = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO ai_messages (conversation_id, user_id, role, content, evidence_json, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversationId,
      String(userId),
      role,
      content,
      JSON.stringify(evidence),
      JSON.stringify(metadata),
      nowIso
    );

    if (activeCountry !== undefined) {
      db.prepare('UPDATE ai_conversations SET active_country = ?, updated_at = ? WHERE id = ?').run(
        activeCountry,
        nowIso,
        conversationId
      );
    } else {
      db.prepare('UPDATE ai_conversations SET updated_at = ? WHERE id = ?').run(nowIso, conversationId);
    }

    return mapMessageRow(db.prepare('SELECT * FROM ai_messages WHERE id = ?').get(info.lastInsertRowid));
  },
};

