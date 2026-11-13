import crypto from 'node:crypto';
import db from '../db/database.js';
import authService from './authService.js';
import alertingService from './alertingService.js';
import countryRiskService from './countryRiskService.js';
import { broadcastEvent } from './realtimeService.js';

export const DISCUSSION_TYPES = [
  'INCIDENT_DISCUSSION',
  'COUNTRY_RISK_DISCUSSION',
  'THREAT_ANALYSIS',
  'PREDICTIVE_WARNING_DISCUSSION',
  'GEOSPATIAL_DISCUSSION',
  'STRATEGIC_RECOMMENDATION',
  'GENERAL_INTELLIGENCE',
];

export const DISCUSSION_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED', 'CANCELLED'];
export const RECORD_TYPES = [
  'COUNTRY',
  'INCIDENT',
  'EARLY_WARNING',
  'STRATEGIC_RECOMMENDATION',
  'ANALYTICAL_INSIGHT',
  'DETECTED_ANOMALY',
  'GEOSPATIAL_CLUSTER',
  'INTELLIGENCE_ALERT',
  'AI_REPORT',
];

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  err.name = name;
  return err;
}

/**
 * Strip HTML tags, script/style blocks, and dangerous URI protocols from user text.
 */
export function sanitizeText(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .trim();
}

function getUserSummary(userId) {
  if (!userId) return null;
  const row = db
    .prepare('SELECT id, username, full_name, department, role, is_active FROM users WHERE id = ?')
    .get(userId);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    department: row.department,
    role: row.role,
    isActive: Boolean(row.is_active),
  };
}

function getDiscussionMemberIds(discussionRow) {
  const members = db
    .prepare('SELECT user_id FROM discussion_members WHERE discussion_id = ?')
    .all(discussionRow.id)
    .map((r) => r.user_id);
  const set = new Set(members);
  if (discussionRow.created_by) set.add(discussionRow.created_by);
  if (discussionRow.assigned_to) set.add(discussionRow.assigned_to);
  return Array.from(set);
}

function assertDiscussionAccess(discussionRow, user) {
  if (!discussionRow) {
    throw createHttpError(404, 'Discussion not found.', 'NotFound');
  }
  if (discussionRow.visibility === 'TEAM' || user.role === 'ADMIN') {
    return;
  }
  const allowedIds = getDiscussionMemberIds(discussionRow);
  if (!allowedIds.includes(user.id)) {
    throw createHttpError(403, 'You do not have permission to access this private discussion.', 'Forbidden');
  }
}

function assertDiscussionModify(discussionRow, user) {
  assertDiscussionAccess(discussionRow, user);
  if (user.role === 'ADMIN') return;
  if (user.role === 'VIEWER') {
    throw createHttpError(403, 'VIEWER role cannot modify discussions.', 'Forbidden');
  }
  const allowedIds = getDiscussionMemberIds(discussionRow);
  if (discussionRow.visibility === 'PRIVATE' && !allowedIds.includes(user.id)) {
    throw createHttpError(403, 'You are not authorized to modify this discussion.', 'Forbidden');
  }
}

function getBroadcastTargets(discussionRow) {
  if (discussionRow.visibility === 'PRIVATE') {
    const adminIds = db
      .prepare("SELECT id FROM users WHERE role = 'ADMIN' AND is_active = 1")
      .all()
      .map((r) => r.id);
    return Array.from(new Set([...getDiscussionMemberIds(discussionRow), ...adminIds]));
  }
  return null;
}

function mapDiscussion(row) {
  const commentCount = db
    .prepare('SELECT COUNT(*) AS c FROM intelligence_comments WHERE discussion_id = ? AND deleted_at IS NULL')
    .get(row.id).c;
  const sharedCount = db
    .prepare('SELECT COUNT(*) AS c FROM shared_intelligence_records WHERE discussion_id = ?')
    .get(row.id).c;
  const taskCount = db
    .prepare('SELECT COUNT(*) AS c FROM investigation_tasks WHERE discussion_id = ?')
    .get(row.id).c;
  const memberIds = getDiscussionMemberIds(row);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    discussionType: row.discussion_type,
    relatedModule: row.related_module,
    relatedRecordId: row.related_record_id,
    countryId: row.country_id,
    priority: row.priority,
    status: row.status,
    visibility: row.visibility,
    createdBy: row.created_by,
    creator: getUserSummary(row.created_by),
    assignedTo: row.assigned_to,
    assignee: getUserSummary(row.assigned_to),
    memberIds,
    commentCount,
    sharedCount,
    taskCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

function mapComment(row) {
  return {
    id: row.id,
    discussionId: row.discussion_id,
    userId: row.user_id,
    author: getUserSummary(row.user_id),
    parentCommentId: row.parent_comment_id,
    content: row.deleted_at ? '[Comment deleted]' : row.content,
    isDeleted: Boolean(row.deleted_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  };
}

function mapSharedRecord(row) {
  return {
    id: row.id,
    discussionId: row.discussion_id,
    recordType: row.record_type,
    recordId: row.record_id,
    sourceModule: row.source_module,
    recordTitle: row.record_title,
    sharedBy: row.shared_by,
    sharer: getUserSummary(row.shared_by),
    note: row.note,
    createdAt: row.created_at,
  };
}

function isTaskOverdue(row) {
  if (!row.due_date || row.status === 'COMPLETED' || row.status === 'CANCELLED') return false;
  return new Date(row.due_date).getTime() < Date.now();
}

function mapTask(row) {
  const history = db
    .prepare('SELECT * FROM task_status_history WHERE task_id = ? ORDER BY id ASC')
    .all(row.id)
    .map((h) => ({
      id: h.id,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      changedBy: h.changed_by,
      actor: getUserSummary(h.changed_by),
      note: h.note,
      createdAt: h.created_at,
    }));

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    discussionId: row.discussion_id,
    relatedModule: row.related_module,
    relatedRecordId: row.related_record_id,
    assignedTo: row.assigned_to,
    assignee: getUserSummary(row.assigned_to),
    assignedBy: row.assigned_by,
    assigner: getUserSummary(row.assigned_by),
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date,
    isOverdue: isTaskOverdue(row),
    history,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function recordActivity({ actorId, actionType, entityType, entityId, discussionId = null, summary, metadata = {} }) {
  db.prepare(`
    INSERT INTO collaboration_activity (actor_id, action_type, entity_type, entity_id, discussion_id, summary, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(actorId, actionType, entityType, entityId, discussionId, summary, JSON.stringify(metadata), new Date().toISOString());
}

function verifyIntelligenceRecord(recordType, recordId) {
  if (!RECORD_TYPES.includes(recordType)) {
    throw createHttpError(400, `Unsupported recordType. Must be one of: ${RECORD_TYPES.join(', ')}`);
  }
  const cleanId = String(recordId || '').trim();
  if (!cleanId) {
    throw createHttpError(400, 'recordId is required.');
  }

  if (recordType === 'COUNTRY') {
    const profile = countryRiskService.getCountryProfile(cleanId);
    if (!profile) throw createHttpError(404, `Country record "${cleanId}" not found.`, 'NotFound');
    return { sourceModule: 'countries', recordTitle: profile.country || cleanId };
  }
  if (recordType === 'INCIDENT') {
    const row = db.prepare('SELECT id, title FROM incidents WHERE id = ?').get(cleanId);
    if (!row) throw createHttpError(404, `Incident "${cleanId}" not found.`, 'NotFound');
    return { sourceModule: 'incidents', recordTitle: row.title };
  }
  if (recordType === 'EARLY_WARNING') {
    const row = db.prepare('SELECT id, title FROM early_warning_signals WHERE id = ?').get(cleanId);
    if (!row) throw createHttpError(404, `Early warning "${cleanId}" not found.`, 'NotFound');
    return { sourceModule: 'predictive', recordTitle: row.title };
  }
  if (recordType === 'STRATEGIC_RECOMMENDATION') {
    const row = db.prepare('SELECT id, title FROM strategic_recommendations WHERE id = ?').get(cleanId);
    if (!row) throw createHttpError(404, `Strategic recommendation "${cleanId}" not found.`, 'NotFound');
    return { sourceModule: 'decisions', recordTitle: row.title };
  }
  if (recordType === 'ANALYTICAL_INSIGHT') {
    const row = db.prepare('SELECT id, title FROM analytical_insights WHERE id = ?').get(cleanId);
    if (!row) throw createHttpError(404, `Analytical insight "${cleanId}" not found.`, 'NotFound');
    return { sourceModule: 'analytics', recordTitle: row.title };
  }
  if (recordType === 'DETECTED_ANOMALY') {
    const row = db.prepare('SELECT id, description FROM detected_anomalies WHERE id = ?').get(cleanId);
    if (!row) throw createHttpError(404, `Detected anomaly "${cleanId}" not found.`, 'NotFound');
    return { sourceModule: 'analytics', recordTitle: String(row.description).slice(0, 90) };
  }
  if (recordType === 'GEOSPATIAL_CLUSTER') {
    const row = db.prepare('SELECT id, region FROM geospatial_clusters WHERE id = ?').get(cleanId);
    if (!row) throw createHttpError(404, `Geospatial cluster "${cleanId}" not found.`, 'NotFound');
    return { sourceModule: 'geospatial', recordTitle: `Geospatial Cluster: ${row.region}` };
  }
  if (recordType === 'INTELLIGENCE_ALERT') {
    const row = db.prepare('SELECT id, title FROM intelligence_alerts WHERE id = ?').get(Number(cleanId));
    if (!row) throw createHttpError(404, `Intelligence alert "${cleanId}" not found.`, 'NotFound');
    return { sourceModule: 'monitoring', recordTitle: row.title };
  }
  if (recordType === 'AI_REPORT') {
    const row = db.prepare('SELECT id, title FROM ai_generated_reports WHERE id = ?').get(cleanId);
    if (!row) throw createHttpError(404, `AI report "${cleanId}" not found.`, 'NotFound');
    return { sourceModule: 'ai-assistant', recordTitle: row.title };
  }
  throw createHttpError(400, 'Unsupported record type.');
}

function checkDueSoonTaskNotifications() {
  const now = Date.now();
  const in24h = now + 24 * 60 * 60 * 1000;
  const tasks = db
    .prepare("SELECT * FROM investigation_tasks WHERE status NOT IN ('COMPLETED', 'CANCELLED') AND due_date IS NOT NULL")
    .all();

  for (const t of tasks) {
    const dueMs = new Date(t.due_date).getTime();
    if (!Number.isFinite(dueMs)) continue;
    if (dueMs <= in24h) {
      const overdue = dueMs < now;
      alertingService.createNotification({
        dedupKey: `task-due-${t.id}-${overdue ? 'overdue' : 'soon'}`,
        type: 'ALERT_UPDATE',
        title: overdue ? `Overdue Investigation Task: ${t.title}` : `Task Due Soon: ${t.title}`,
        message: `Task "${t.title}" (${t.priority}) is ${overdue ? 'overdue' : 'due within 24 hours'}.`,
        severity: t.priority === 'CRITICAL' ? 'Critical' : 'High',
        entityType: 'task',
        entityId: t.id,
        userIds: [t.assigned_to],
      });
    }
  }
}

export const collaborationService = {
  checkDueSoonTaskNotifications,

  getOverview(user) {
    // Kept lightweight; periodic background job runs checkDueSoonTaskNotifications()

    const allDiscs = db.prepare('SELECT * FROM intelligence_discussions').all();
    const visibleDiscs = allDiscs.filter((d) => {
      if (d.visibility === 'TEAM' || user.role === 'ADMIN') return true;
      return getDiscussionMemberIds(d).includes(user.id);
    });

    const tasks = db.prepare('SELECT * FROM investigation_tasks').all();
    const myTasks = tasks.filter((t) => t.assigned_to === user.id && t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
    const overdueTasks = tasks.filter(isTaskOverdue);
    const sharedCount = db.prepare('SELECT COUNT(*) AS c FROM shared_intelligence_records').get().c;
    const activeMembers = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_active = 1').get().c;

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalDiscussions: visibleDiscs.length,
        openDiscussions: visibleDiscs.filter((d) => d.status === 'OPEN' || d.status === 'IN_PROGRESS').length,
        totalTasks: tasks.length,
        myActiveTasks: myTasks.length,
        overdueTasks: overdueTasks.length,
        sharedRecords: sharedCount,
        activeTeamMembers: activeMembers,
      },
    };
  },

  listDiscussions({ status, priority, discussionType, search, limit = 50, offset = 0 } = {}, user) {
    const conditions = [];
    const params = [];

    if (status && status !== 'ALL') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (priority && priority !== 'ALL') {
      conditions.push('priority = ?');
      params.push(priority);
    }
    if (discussionType && discussionType !== 'ALL') {
      conditions.push('discussion_type = ?');
      params.push(discussionType);
    }
    if (search && String(search).trim()) {
      conditions.push('(LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))');
      const term = `%${String(search).trim()}%`;
      params.push(term, term);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM intelligence_discussions ${where} ORDER BY updated_at DESC`)
      .all(...params);

    const visible = rows.filter((d) => {
      if (d.visibility === 'TEAM' || user.role === 'ADMIN') return true;
      return getDiscussionMemberIds(d).includes(user.id);
    });

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    return {
      total: visible.length,
      limit: safeLimit,
      offset: safeOffset,
      discussions: visible.slice(safeOffset, safeOffset + safeLimit).map(mapDiscussion),
    };
  },

  createDiscussion(payload, user, ipAddress = null) {
    const title = sanitizeText(payload?.title);
    const description = sanitizeText(payload?.description);
    const discussionType = payload?.discussionType || 'GENERAL_INTELLIGENCE';
    const priority = payload?.priority || 'MEDIUM';
    const visibility = payload?.visibility === 'PRIVATE' ? 'PRIVATE' : 'TEAM';
    const relatedModule = payload?.relatedModule ? sanitizeText(payload.relatedModule) : null;
    const relatedRecordId = payload?.relatedRecordId ? sanitizeText(payload.relatedRecordId) : null;
    const countryId = payload?.countryId ? sanitizeText(payload.countryId) : null;
    const assignedTo = payload?.assignedTo || null;
    const memberIds = Array.isArray(payload?.memberIds) ? payload.memberIds : [];

    if (!title || title.length < 3) {
      throw createHttpError(400, 'Discussion title must be at least 3 characters.');
    }
    if (!description || description.length < 5) {
      throw createHttpError(400, 'Discussion description must be at least 5 characters.');
    }
    if (!DISCUSSION_TYPES.includes(discussionType)) {
      throw createHttpError(400, `Invalid discussionType. Must be one of: ${DISCUSSION_TYPES.join(', ')}`);
    }
    if (!PRIORITIES.includes(priority)) {
      throw createHttpError(400, `Invalid priority. Must be one of: ${PRIORITIES.join(', ')}`);
    }
    if (assignedTo && !getUserSummary(assignedTo)) {
      throw createHttpError(404, 'Assigned user not found.', 'NotFound');
    }

    const id = `DISC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO intelligence_discussions (
          id, title, description, discussion_type, related_module, related_record_id,
          country_id, priority, status, visibility, created_by, assigned_to, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)
      `).run(
        id,
        title,
        description,
        discussionType,
        relatedModule,
        relatedRecordId,
        countryId,
        priority,
        visibility,
        user.id,
        assignedTo,
        nowIso,
        nowIso
      );

      const upsertMember = db.prepare(`
        INSERT OR IGNORE INTO discussion_members (discussion_id, user_id, role, added_by, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      upsertMember.run(id, user.id, 'OWNER', user.id, nowIso);
      if (assignedTo) upsertMember.run(id, assignedTo, 'MEMBER', user.id, nowIso);
      for (const mid of memberIds) {
        if (getUserSummary(mid)) upsertMember.run(id, mid, 'MEMBER', user.id, nowIso);
      }

      recordActivity({
        actorId: user.id,
        actionType: 'DISCUSSION_CREATED',
        entityType: 'discussion',
        entityId: id,
        discussionId: id,
        summary: `${user.username} opened ${visibility.toLowerCase()} discussion "${title}"`,
        metadata: { discussionType, priority },
      });
    });

    tx();

    const row = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(id);
    const discussion = mapDiscussion(row);

    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'DISCUSSION_CREATED',
      resourceType: 'intelligence_discussion',
      recordId: id,
      details: `Created discussion "${title}" (${discussionType}, ${visibility}).`,
      ipAddress,
      status: 'SUCCESS',
    });

    if (assignedTo && assignedTo !== user.id) {
      alertingService.createNotification({
        dedupKey: `disc-assign-${id}-${assignedTo}`,
        type: 'ALERT_UPDATE',
        title: `Discussion Assigned: ${title}`,
        message: `${user.username} assigned you to discussion "${title}" (${priority}).`,
        severity: priority === 'CRITICAL' ? 'Critical' : 'Medium',
        country: countryId,
        entityType: 'discussion',
        entityId: id,
        userIds: [assignedTo],
      });
    }

    const targets = getBroadcastTargets(row);
    broadcastEvent('discussion_created', { discussion }, targets ? { userIds: targets } : {});
    return discussion;
  },

  getDiscussionById(id, user) {
    const row = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(id);
    assertDiscussionAccess(row, user);
    return mapDiscussion(row);
  },

  updateDiscussion(id, payload, user, ipAddress = null) {
    const row = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(id);
    assertDiscussionModify(row, user);

    const title = payload?.title !== undefined ? sanitizeText(payload.title) : row.title;
    const description = payload?.description !== undefined ? sanitizeText(payload.description) : row.description;
    const priority = payload?.priority !== undefined ? payload.priority : row.priority;

    if (!title || title.length < 3) throw createHttpError(400, 'Title must be at least 3 characters.');
    if (!PRIORITIES.includes(priority)) throw createHttpError(400, 'Invalid priority.');

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE intelligence_discussions SET title = ?, description = ?, priority = ?, updated_at = ? WHERE id = ?
    `).run(title, description, priority, nowIso, id);

    recordActivity({
      actorId: user.id,
      actionType: 'DISCUSSION_UPDATED',
      entityType: 'discussion',
      entityId: id,
      discussionId: id,
      summary: `${user.username} updated discussion "${title}"`,
    });

    const updated = mapDiscussion(db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(id));
    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'DISCUSSION_UPDATED',
      resourceType: 'intelligence_discussion',
      recordId: id,
      details: `Updated discussion "${title}" (priority=${priority}).`,
      ipAddress,
      status: 'SUCCESS',
    });

    const targets = getBroadcastTargets(row);
    broadcastEvent('discussion_updated', { discussion: updated }, targets ? { userIds: targets } : {});
    return updated;
  },

  assignDiscussion(id, assignedTo, user, ipAddress = null) {
    const row = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(id);
    assertDiscussionModify(row, user);

    if (assignedTo && !getUserSummary(assignedTo)) {
      throw createHttpError(404, 'Assignee user not found.', 'NotFound');
    }

    const nowIso = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare('UPDATE intelligence_discussions SET assigned_to = ?, updated_at = ? WHERE id = ?').run(
        assignedTo || null,
        nowIso,
        id
      );
      if (assignedTo) {
        db.prepare(`
          INSERT OR IGNORE INTO discussion_members (discussion_id, user_id, role, added_by, created_at)
          VALUES (?, ?, 'MEMBER', ?, ?)
        `).run(id, assignedTo, user.id, nowIso);
      }
      recordActivity({
        actorId: user.id,
        actionType: 'DISCUSSION_ASSIGNED',
        entityType: 'discussion',
        entityId: id,
        discussionId: id,
        summary: assignedTo
          ? `${user.username} assigned discussion "${row.title}" to ${getUserSummary(assignedTo).username}`
          : `${user.username} unassigned discussion "${row.title}"`,
      });
    });
    tx();

    const updatedRow = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(id);
    const updated = mapDiscussion(updatedRow);

    if (assignedTo && assignedTo !== user.id) {
      alertingService.createNotification({
        dedupKey: `disc-assign-${id}-${assignedTo}-${Date.now()}`,
        type: 'ALERT_UPDATE',
        title: `Discussion Assigned: ${row.title}`,
        message: `${user.username} assigned you to discussion "${row.title}".`,
        severity: row.priority === 'CRITICAL' ? 'Critical' : 'Medium',
        country: row.country_id,
        entityType: 'discussion',
        entityId: id,
        userIds: [assignedTo],
      });
    }

    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'DISCUSSION_ASSIGNED',
      resourceType: 'intelligence_discussion',
      recordId: id,
      details: `Assigned discussion ${id} to ${assignedTo || 'unassigned'}.`,
      ipAddress,
      status: 'SUCCESS',
    });

    const targets = getBroadcastTargets(updatedRow);
    broadcastEvent('discussion_updated', { discussion: updated }, targets ? { userIds: targets } : {});
    return updated;
  },

  updateDiscussionStatus(id, status, user, ipAddress = null) {
    if (!DISCUSSION_STATUSES.includes(status)) {
      throw createHttpError(400, `Invalid status. Must be one of: ${DISCUSSION_STATUSES.join(', ')}`);
    }
    const row = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(id);
    assertDiscussionModify(row, user);

    const nowIso = new Date().toISOString();
    const closedAt = status === 'CLOSED' ? nowIso : row.closed_at;

    db.prepare(`
      UPDATE intelligence_discussions SET status = ?, updated_at = ?, closed_at = ? WHERE id = ?
    `).run(status, nowIso, closedAt, id);

    recordActivity({
      actorId: user.id,
      actionType: status === 'CLOSED' ? 'DISCUSSION_CLOSED' : status === 'RESOLVED' ? 'DISCUSSION_RESOLVED' : 'DISCUSSION_STATUS_CHANGED',
      entityType: 'discussion',
      entityId: id,
      discussionId: id,
      summary: `${user.username} changed discussion "${row.title}" status to ${status}`,
    });

    const updated = mapDiscussion(db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(id));
    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'DISCUSSION_STATUS_CHANGED',
      resourceType: 'intelligence_discussion',
      recordId: id,
      details: `Changed discussion "${row.title}" status from ${row.status} to ${status}.`,
      ipAddress,
      status: 'SUCCESS',
    });

    const targets = getBroadcastTargets(row);
    broadcastEvent('discussion_updated', { discussion: updated }, targets ? { userIds: targets } : {});
    return updated;
  },

  listComments(discussionId, user) {
    const disc = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(discussionId);
    assertDiscussionAccess(disc, user);

    const rows = db
      .prepare('SELECT * FROM intelligence_comments WHERE discussion_id = ? ORDER BY created_at ASC')
      .all(discussionId);
    return rows.map(mapComment);
  },

  addComment(discussionId, { content, parentCommentId = null }, user, ipAddress = null) {
    const disc = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(discussionId);
    assertDiscussionAccess(disc, user);

    const cleanContent = sanitizeText(content);
    if (!cleanContent) {
      throw createHttpError(400, 'Comment content cannot be empty.');
    }

    let parentRow = null;
    if (parentCommentId) {
      parentRow = db
        .prepare('SELECT * FROM intelligence_comments WHERE id = ? AND discussion_id = ?')
        .get(parentCommentId, discussionId);
      if (!parentRow) {
        throw createHttpError(404, 'Parent comment not found in this discussion.', 'NotFound');
      }
    }

    const id = `CMT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO intelligence_comments (id, discussion_id, user_id, parent_comment_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, discussionId, user.id, parentCommentId, cleanContent, nowIso, nowIso);

    db.prepare('UPDATE intelligence_discussions SET updated_at = ? WHERE id = ?').run(nowIso, discussionId);

    recordActivity({
      actorId: user.id,
      actionType: 'COMMENT_ADDED',
      entityType: 'comment',
      entityId: id,
      discussionId,
      summary: `${user.username} commented on "${disc.title}"`,
    });

    const comment = mapComment(db.prepare('SELECT * FROM intelligence_comments WHERE id = ?').get(id));

    // Parse @mentions and notify mentioned active users
    const mentionMatches = Array.from(cleanContent.matchAll(/@([a-zA-Z0-9_.-]+)/g)).map((m) =>
      m[1].toLowerCase()
    );
    const mentionedUsers = [];
    for (const uname of new Set(mentionMatches)) {
      const u = db.prepare('SELECT id, username, role FROM users WHERE LOWER(username) = ? AND is_active = 1').get(uname);
      if (u && u.id !== user.id) {
        if (disc.visibility === 'TEAM' || u.role === 'ADMIN' || getDiscussionMemberIds(disc).includes(u.id)) {
          mentionedUsers.push(u);
        }
      }
    }

    for (const mu of mentionedUsers) {
      alertingService.createNotification({
        dedupKey: `mention-${id}-${mu.id}`,
        type: 'ALERT_UPDATE',
        title: `Mentioned by ${user.username}`,
        message: `${user.username} mentioned you in "${disc.title}": "${cleanContent.slice(0, 80)}"`,
        severity: 'Medium',
        country: disc.country_id,
        entityType: 'discussion',
        entityId: discussionId,
        userIds: [mu.id],
      });
      broadcastEvent('user_mentioned', { discussionId, comment, mentionedUserId: mu.id }, { userIds: [mu.id] });
    }

    // Notify parent comment author on reply
    if (parentRow && parentRow.user_id !== user.id) {
      alertingService.createNotification({
        dedupKey: `reply-${id}-${parentRow.user_id}`,
        type: 'ALERT_UPDATE',
        title: `New Reply from ${user.username}`,
        message: `${user.username} replied to your comment in "${disc.title}".`,
        severity: 'Info',
        country: disc.country_id,
        entityType: 'discussion',
        entityId: discussionId,
        userIds: [parentRow.user_id],
      });
    }

    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'COMMENT_ADDED',
      resourceType: 'intelligence_comment',
      recordId: id,
      details: `Added comment to discussion ${discussionId}.`,
      ipAddress,
      status: 'SUCCESS',
    });

    const targets = getBroadcastTargets(disc);
    broadcastEvent('comment_added', { discussionId, comment }, targets ? { userIds: targets } : {});
    return comment;
  },

  editComment(commentId, content, user, ipAddress = null) {
    const row = db.prepare('SELECT * FROM intelligence_comments WHERE id = ?').get(commentId);
    if (!row || row.deleted_at) {
      throw createHttpError(404, 'Comment not found.', 'NotFound');
    }
    const disc = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(row.discussion_id);
    assertDiscussionAccess(disc, user);

    if (user.role !== 'ADMIN' && row.user_id !== user.id) {
      throw createHttpError(403, 'You can only edit your own comments.', 'Forbidden');
    }

    const cleanContent = sanitizeText(content);
    if (!cleanContent) {
      throw createHttpError(400, 'Comment content cannot be empty.');
    }

    const nowIso = new Date().toISOString();
    db.prepare('UPDATE intelligence_comments SET content = ?, edited_at = ?, updated_at = ? WHERE id = ?').run(
      cleanContent,
      nowIso,
      nowIso,
      commentId
    );

    const updated = mapComment(db.prepare('SELECT * FROM intelligence_comments WHERE id = ?').get(commentId));
    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'COMMENT_EDITED',
      resourceType: 'intelligence_comment',
      recordId: commentId,
      details: `Edited comment ${commentId}.`,
      ipAddress,
      status: 'SUCCESS',
    });

    const targets = getBroadcastTargets(disc);
    broadcastEvent('comment_updated', { discussionId: row.discussion_id, comment: updated }, targets ? { userIds: targets } : {});
    return updated;
  },

  deleteComment(commentId, user, ipAddress = null) {
    const row = db.prepare('SELECT * FROM intelligence_comments WHERE id = ?').get(commentId);
    if (!row || row.deleted_at) {
      throw createHttpError(404, 'Comment not found.', 'NotFound');
    }
    const disc = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(row.discussion_id);
    assertDiscussionAccess(disc, user);

    if (user.role !== 'ADMIN' && row.user_id !== user.id) {
      throw createHttpError(403, 'You can only delete your own comments.', 'Forbidden');
    }

    const nowIso = new Date().toISOString();
    db.prepare('UPDATE intelligence_comments SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
      nowIso,
      nowIso,
      commentId
    );

    const updated = mapComment(db.prepare('SELECT * FROM intelligence_comments WHERE id = ?').get(commentId));
    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'COMMENT_DELETED',
      resourceType: 'intelligence_comment',
      recordId: commentId,
      details: `Deleted comment ${commentId}.`,
      ipAddress,
      status: 'SUCCESS',
    });

    const targets = getBroadcastTargets(disc);
    broadcastEvent('comment_updated', { discussionId: row.discussion_id, comment: updated }, targets ? { userIds: targets } : {});
    return updated;
  },

  listSharedRecords(discussionId, user) {
    const disc = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(discussionId);
    assertDiscussionAccess(disc, user);

    return db
      .prepare('SELECT * FROM shared_intelligence_records WHERE discussion_id = ? ORDER BY created_at DESC')
      .all(discussionId)
      .map(mapSharedRecord);
  },

  shareRecord(discussionId, { recordType, recordId, note = '' }, user, ipAddress = null) {
    const disc = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(discussionId);
    assertDiscussionModify(disc, user);

    const { sourceModule, recordTitle } = verifyIntelligenceRecord(recordType, recordId);
    const cleanNote = sanitizeText(note);
    const id = `SHR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const nowIso = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO shared_intelligence_records (
          id, discussion_id, record_type, record_id, source_module, record_title, shared_by, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, discussionId, recordType, String(recordId).trim(), sourceModule, recordTitle, user.id, cleanNote, nowIso);
    } catch (err) {
      if (String(err.message).includes('UNIQUE constraint')) {
        throw createHttpError(409, 'This intelligence record is already shared in this discussion.', 'Conflict');
      }
      throw err;
    }

    recordActivity({
      actorId: user.id,
      actionType: 'INTELLIGENCE_RECORD_SHARED',
      entityType: 'shared_record',
      entityId: id,
      discussionId,
      summary: `${user.username} shared ${recordType} (${recordTitle}) in "${disc.title}"`,
    });

    const record = mapSharedRecord(db.prepare('SELECT * FROM shared_intelligence_records WHERE id = ?').get(id));

    const memberTargets = getDiscussionMemberIds(disc).filter((uid) => uid !== user.id);
    if (memberTargets.length > 0) {
      alertingService.createNotification({
        dedupKey: `shared-rec-${id}`,
        type: 'ALERT_UPDATE',
        title: `Intelligence Shared in ${disc.title}`,
        message: `${user.username} shared ${recordType}: ${recordTitle}`,
        severity: 'Info',
        country: disc.country_id,
        entityType: 'discussion',
        entityId: discussionId,
        userIds: memberTargets,
      });
    }

    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'RECORD_SHARED',
      resourceType: 'shared_intelligence_record',
      recordId: id,
      details: `Shared ${recordType}:${recordId} into discussion ${discussionId}.`,
      ipAddress,
      status: 'SUCCESS',
    });

    const targets = getBroadcastTargets(disc);
    broadcastEvent('intelligence_record_shared', { discussionId, record }, targets ? { userIds: targets } : {});
    return record;
  },

  unshareRecord(sharedRecordId, user, ipAddress = null) {
    const row = db.prepare('SELECT * FROM shared_intelligence_records WHERE id = ?').get(sharedRecordId);
    if (!row) throw createHttpError(404, 'Shared record not found.', 'NotFound');
    const disc = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(row.discussion_id);
    assertDiscussionModify(disc, user);

    if (user.role !== 'ADMIN' && row.shared_by !== user.id) {
      throw createHttpError(403, 'Only ADMIN or the sharing user can remove this shared record.', 'Forbidden');
    }

    db.prepare('DELETE FROM shared_intelligence_records WHERE id = ?').run(sharedRecordId);
    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'RECORD_UNSHARED',
      resourceType: 'shared_intelligence_record',
      recordId: sharedRecordId,
      details: `Removed shared record ${row.record_type}:${row.record_id} from discussion ${row.discussion_id}.`,
      ipAddress,
      status: 'SUCCESS',
    });
    return { deleted: true, id: sharedRecordId };
  },

  listTasks({ status, priority, assignedTo, createdBy, overdueOnly, limit = 50, offset = 0 } = {}, user) {
    const conditions = [];
    const params = [];

    if (status && status !== 'ALL') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (priority && priority !== 'ALL') {
      conditions.push('priority = ?');
      params.push(priority);
    }
    if (assignedTo && assignedTo !== 'ALL') {
      conditions.push('assigned_to = ?');
      params.push(assignedTo);
    }
    if (createdBy && createdBy !== 'ALL') {
      conditions.push('assigned_by = ?');
      params.push(createdBy);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    let rows = db.prepare(`SELECT * FROM investigation_tasks ${where} ORDER BY created_at DESC`).all(...params);

    // Filter out tasks linked to private discussions the user cannot access
    rows = rows.filter((t) => {
      if (!t.discussion_id || user.role === 'ADMIN') return true;
      const disc = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(t.discussion_id);
      if (!disc || disc.visibility === 'TEAM') return true;
      return getDiscussionMemberIds(disc).includes(user.id) || t.assigned_to === user.id || t.assigned_by === user.id;
    });

    if (overdueOnly === true || overdueOnly === 'true') {
      rows = rows.filter(isTaskOverdue);
    }

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    return {
      total: rows.length,
      limit: safeLimit,
      offset: safeOffset,
      tasks: rows.slice(safeOffset, safeOffset + safeLimit).map(mapTask),
    };
  },

  createTask(payload, user, ipAddress = null) {
    const title = sanitizeText(payload?.title);
    const description = sanitizeText(payload?.description || '');
    const assignedTo = payload?.assignedTo;
    const priority = payload?.priority || 'MEDIUM';
    const discussionId = payload?.discussionId || null;
    const relatedModule = payload?.relatedModule ? sanitizeText(payload.relatedModule) : null;
    const relatedRecordId = payload?.relatedRecordId ? sanitizeText(payload.relatedRecordId) : null;
    const dueDate = payload?.dueDate || null;

    if (!title || title.length < 3) throw createHttpError(400, 'Task title must be at least 3 characters.');
    if (!assignedTo || !getUserSummary(assignedTo)) throw createHttpError(404, 'Assigned user not found.', 'NotFound');
    if (!PRIORITIES.includes(priority)) throw createHttpError(400, 'Invalid priority.');
    if (discussionId) {
      const disc = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(discussionId);
      assertDiscussionAccess(disc, user);
    }
    if (dueDate && Number.isNaN(new Date(dueDate).getTime())) {
      throw createHttpError(400, 'Invalid dueDate format.');
    }

    const id = `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO investigation_tasks (
          id, title, description, discussion_id, related_module, related_record_id,
          assigned_to, assigned_by, priority, status, due_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'TODO', ?, ?, ?)
      `).run(id, title, description, discussionId, relatedModule, relatedRecordId, assignedTo, user.id, priority, dueDate, nowIso, nowIso);

      db.prepare(`
        INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, note, created_at)
        VALUES (?, NULL, 'TODO', ?, 'Task created', ?)
      `).run(id, user.id, nowIso);

      recordActivity({
        actorId: user.id,
        actionType: 'TASK_CREATED',
        entityType: 'task',
        entityId: id,
        discussionId,
        summary: `${user.username} assigned task "${title}" to ${getUserSummary(assignedTo).username}`,
      });
    });
    tx();

    const task = mapTask(db.prepare('SELECT * FROM investigation_tasks WHERE id = ?').get(id));

    if (assignedTo !== user.id) {
      alertingService.createNotification({
        dedupKey: `task-assigned-${id}-${assignedTo}`,
        type: 'ALERT_UPDATE',
        title: `New Investigation Task: ${title}`,
        message: `${user.username} assigned you task "${title}" (${priority}).`,
        severity: priority === 'CRITICAL' ? 'Critical' : priority === 'HIGH' ? 'High' : 'Medium',
        entityType: 'task',
        entityId: id,
        userIds: [assignedTo],
      });
    }

    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'TASK_CREATED',
      resourceType: 'investigation_task',
      recordId: id,
      details: `Created task "${title}" assigned to ${assignedTo}.`,
      ipAddress,
      status: 'SUCCESS',
    });

    broadcastEvent('task_assigned', { task }, { userIds: Array.from(new Set([assignedTo, user.id])) });
    return task;
  },

  getTaskById(id, user) {
    const row = db.prepare('SELECT * FROM investigation_tasks WHERE id = ?').get(id);
    if (!row) throw createHttpError(404, 'Investigation task not found.', 'NotFound');
    if (row.discussion_id && user.role !== 'ADMIN') {
      const disc = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(row.discussion_id);
      if (disc && disc.visibility === 'PRIVATE' && !getDiscussionMemberIds(disc).includes(user.id) && row.assigned_to !== user.id && row.assigned_by !== user.id) {
        throw createHttpError(403, 'Not authorized to view this task.', 'Forbidden');
      }
    }
    return mapTask(row);
  },

  updateTask(id, payload, user, ipAddress = null) {
    const row = db.prepare('SELECT * FROM investigation_tasks WHERE id = ?').get(id);
    if (!row) throw createHttpError(404, 'Investigation task not found.', 'NotFound');
    if (user.role !== 'ADMIN' && row.assigned_by !== user.id && row.assigned_to !== user.id) {
      throw createHttpError(403, 'Not authorized to update this task.', 'Forbidden');
    }

    const title = payload?.title !== undefined ? sanitizeText(payload.title) : row.title;
    const description = payload?.description !== undefined ? sanitizeText(payload.description) : row.description;
    const priority = payload?.priority !== undefined ? payload.priority : row.priority;
    const dueDate = payload?.dueDate !== undefined ? payload.dueDate : row.due_date;

    if (!title || title.length < 3) throw createHttpError(400, 'Title must be at least 3 characters.');
    if (!PRIORITIES.includes(priority)) throw createHttpError(400, 'Invalid priority.');
    if (dueDate && Number.isNaN(new Date(dueDate).getTime())) throw createHttpError(400, 'Invalid dueDate.');

    db.prepare(`
      UPDATE investigation_tasks SET title = ?, description = ?, priority = ?, due_date = ?, updated_at = ? WHERE id = ?
    `).run(title, description, priority, dueDate, new Date().toISOString(), id);

    const updated = mapTask(db.prepare('SELECT * FROM investigation_tasks WHERE id = ?').get(id));
    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'TASK_UPDATED',
      resourceType: 'investigation_task',
      recordId: id,
      details: `Updated task "${title}".`,
      ipAddress,
      status: 'SUCCESS',
    });

    broadcastEvent('task_updated', { task: updated });
    return updated;
  },

  assignTask(id, assignedTo, user, ipAddress = null) {
    const row = db.prepare('SELECT * FROM investigation_tasks WHERE id = ?').get(id);
    if (!row) throw createHttpError(404, 'Investigation task not found.', 'NotFound');
    if (user.role !== 'ADMIN' && row.assigned_by !== user.id && row.assigned_to !== user.id) {
      throw createHttpError(403, 'Not authorized to reassign this task.', 'Forbidden');
    }
    const targetUser = getUserSummary(assignedTo);
    if (!targetUser) throw createHttpError(404, 'Assignee user not found.', 'NotFound');

    const nowIso = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare('UPDATE investigation_tasks SET assigned_to = ?, updated_at = ? WHERE id = ?').run(assignedTo, nowIso, id);
      db.prepare(`
        INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, row.status, row.status, user.id, `Reassigned to ${targetUser.username}`, nowIso);

      recordActivity({
        actorId: user.id,
        actionType: 'TASK_REASSIGNED',
        entityType: 'task',
        entityId: id,
        discussionId: row.discussion_id,
        summary: `${user.username} reassigned task "${row.title}" to ${targetUser.username}`,
      });
    });
    tx();

    const updated = mapTask(db.prepare('SELECT * FROM investigation_tasks WHERE id = ?').get(id));

    if (assignedTo !== user.id) {
      alertingService.createNotification({
        dedupKey: `task-reassign-${id}-${assignedTo}-${Date.now()}`,
        type: 'ALERT_UPDATE',
        title: `Task Reassigned: ${row.title}`,
        message: `${user.username} reassigned task "${row.title}" to you.`,
        severity: row.priority === 'CRITICAL' ? 'Critical' : 'Medium',
        entityType: 'task',
        entityId: id,
        userIds: [assignedTo],
      });
    }

    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'TASK_ASSIGNED',
      resourceType: 'investigation_task',
      recordId: id,
      details: `Reassigned task ${id} to ${targetUser.username}.`,
      ipAddress,
      status: 'SUCCESS',
    });

    broadcastEvent('task_assigned', { task: updated });
    return updated;
  },

  updateTaskStatus(id, status, user, ipAddress = null) {
    if (!TASK_STATUSES.includes(status)) {
      throw createHttpError(400, `Invalid status. Must be one of: ${TASK_STATUSES.join(', ')}`);
    }
    const row = db.prepare('SELECT * FROM investigation_tasks WHERE id = ?').get(id);
    if (!row) throw createHttpError(404, 'Investigation task not found.', 'NotFound');
    if (user.role !== 'ADMIN' && row.assigned_to !== user.id && row.assigned_by !== user.id) {
      throw createHttpError(403, 'Not authorized to change status of this task.', 'Forbidden');
    }

    const nowIso = new Date().toISOString();
    const completedAt = status === 'COMPLETED' ? nowIso : row.completed_at;

    const tx = db.transaction(() => {
      db.prepare('UPDATE investigation_tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?').run(
        status,
        nowIso,
        completedAt,
        id
      );
      db.prepare(`
        INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, row.status, status, user.id, `Status changed to ${status}`, nowIso);

      recordActivity({
        actorId: user.id,
        actionType: 'TASK_STATUS_CHANGED',
        entityType: 'task',
        entityId: id,
        discussionId: row.discussion_id,
        summary: `${user.username} moved task "${row.title}" to ${status}`,
      });
    });
    tx();

    const updated = mapTask(db.prepare('SELECT * FROM investigation_tasks WHERE id = ?').get(id));
    authService.logAudit({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'TASK_STATUS_CHANGED',
      resourceType: 'investigation_task',
      recordId: id,
      details: `Updated task ${id} status from ${row.status} to ${status}.`,
      ipAddress,
      status: 'SUCCESS',
    });

    broadcastEvent('task_updated', { task: updated });
    return updated;
  },

  getTeamDirectory(user) {
    // Only expose safe team directory fields (never passwords, hashes, tokens, or emails to non-ADMIN)
    const users = db
      .prepare('SELECT id, username, full_name, department, role, is_active FROM users ORDER BY role ASC, username ASC')
      .all();

    return users.map((u) => {
      const assignedTasksCount = db
        .prepare("SELECT COUNT(*) AS c FROM investigation_tasks WHERE assigned_to = ? AND status NOT IN ('COMPLETED', 'CANCELLED')")
        .get(u.id).c;
      const openInvestigationsCount = db
        .prepare("SELECT COUNT(*) AS c FROM intelligence_discussions WHERE assigned_to = ? AND status IN ('OPEN', 'IN_PROGRESS')")
        .get(u.id).c;
      const recentActivityCount = db
        .prepare('SELECT COUNT(*) AS c FROM collaboration_activity WHERE actor_id = ?')
        .get(u.id).c;

      return {
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        department: u.department,
        role: u.role,
        isActive: Boolean(u.is_active),
        assignedTasksCount,
        openInvestigationsCount,
        recentActivityCount,
        isCurrentUser: u.id === user.id,
      };
    });
  },

  getActivityTimeline({ limit = 50, offset = 0 } = {}, user) {
    const rows = db
      .prepare('SELECT * FROM collaboration_activity ORDER BY id DESC LIMIT ? OFFSET ?')
      .all(Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100), Math.max(parseInt(offset, 10) || 0, 0));

    const visible = rows.filter((a) => {
      if (!a.discussion_id || user.role === 'ADMIN') return true;
      const disc = db.prepare('SELECT * FROM intelligence_discussions WHERE id = ?').get(a.discussion_id);
      if (!disc || disc.visibility === 'TEAM') return true;
      return getDiscussionMemberIds(disc).includes(user.id);
    });

    return visible.map((a) => ({
      id: a.id,
      actorId: a.actor_id,
      actor: getUserSummary(a.actor_id),
      actionType: a.action_type,
      entityType: a.entity_type,
      entityId: a.entity_id,
      discussionId: a.discussion_id,
      summary: a.summary,
      createdAt: a.created_at,
    }));
  },
};

export default collaborationService;

