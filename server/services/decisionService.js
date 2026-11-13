import db from '../db/database.js';
import { countryRiskService } from './countryRiskService.js';
import { predictiveService } from './predictiveService.js';
import { broadcastEvent } from './realtimeService.js';

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  return err;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mapRecommendationRow(row) {
  return {
    id: row.id,
    dedupKey: row.dedup_key,
    country: row.country,
    category: row.category,
    title: row.title,
    rationale: row.rationale,
    severity: row.severity,
    priority: row.priority,
    confidence: row.confidence,
    sourceSignal: row.source_signal,
    recommendedPlaybookId: row.recommended_playbook_id,
    status: row.status,
    outcomeNotes: row.outcome_notes,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

function mapPlaybookRow(row) {
  let steps = [];
  try {
    steps = JSON.parse(row.steps_json || '[]');
  } catch {
    steps = [];
  }
  const completedSteps = steps.filter((s) => Boolean(s.completed)).length;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    severityTrigger: row.severity_trigger,
    description: row.description,
    steps,
    completedSteps,
    totalSteps: steps.length,
    status: row.status,
    country: row.country,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function mapActionRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    country: row.country,
    playbookId: row.playbook_id,
    recommendationId: row.recommendation_id,
    assignedToUserId: row.assigned_to_user_id,
    assignedToUsername: row.assigned_to_username,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date,
    outcomeNotes: row.outcome_notes,
    createdBy: row.created_by,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function mapDecisionLogRow(row) {
  return {
    id: row.id,
    recommendationId: row.recommendation_id,
    playbookId: row.playbook_id,
    country: row.country,
    decisionType: row.decision_type,
    outcomeStatus: row.outcome_status,
    summary: row.summary,
    decidedBy: row.decided_by,
    createdAt: row.created_at,
  };
}

function matchPlaybookId(category, severity) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('cyber')) return 'PB-CYBER-ISOLATION';
  if (cat.includes('supply') || cat.includes('freight')) return 'PB-SUPPLY-REROUTE';
  if (cat.includes('maritime') || cat.includes('port')) return 'PB-MARITIME-LOCKDOWN';
  if (cat.includes('geopolitical') || cat.includes('trade')) return 'PB-GEOPOLITICAL-CRISIS';
  return severity === 'Critical' ? 'PB-CYBER-ISOLATION' : 'PB-GEOPOLITICAL-CRISIS';
}

export const decisionService = {
  getRecommendations({ status = 'ALL', priority = 'ALL', country = 'ALL', limit = 100 } = {}) {
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
    if (country && country !== 'ALL') {
      conditions.push('LOWER(country) = LOWER(?)');
      params.push(country);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 300);

    return db
      .prepare(`SELECT * FROM strategic_recommendations ${where} ORDER BY CASE priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END, id DESC LIMIT ?`)
      .all(...params, safeLimit)
      .map(mapRecommendationRow);
  },

  generateRecommendations() {
    const profiles = countryRiskService.getAllCountryProfiles();
    const activeWarnings = predictiveService.getEarlyWarnings({ status: 'active' });
    const emerging = predictiveService.detectEmergingThreats();

    const insertRec = db.prepare(`
      INSERT OR IGNORE INTO strategic_recommendations (
        dedup_key, country, category, title, rationale, severity, priority,
        confidence, source_signal, recommended_playbook_id, status
      ) VALUES (
        @dedupKey, @country, @category, @title, @rationale, @severity, @priority,
        @confidence, @sourceSignal, @recommendedPlaybookId, 'pending'
      )
    `);

    const candidates = [];

    // 1. High / Critical Risk Country Profiles
    for (const p of profiles) {
      if (p.riskScore >= 50 || p.counts.criticalAlerts > 0) {
        const isCritical = p.riskScore >= 75 || p.classification === 'Critical';
        const severity = isCritical ? 'Critical' : 'High';
        const priority = isCritical ? 'P1' : 'P2';
        const topCat = p.topCategories?.[0]?.category || 'Geopolitical & Trade Dispute';
        candidates.push({
          dedupKey: `REC-RISK-${p.country.toUpperCase()}-${severity}`,
          country: p.country,
          category: topCat,
          title: `Activate ${severity === 'Critical' ? 'Immediate' : 'Elevated'} Containment Posture for ${p.country}`,
          rationale: `${p.country} currently registers a calculated risk score of ${p.riskScore}/100 (${p.classification}) with ${p.counts.activeIncidents} active incident(s) and ${p.counts.criticalAlerts} critical alert(s).`,
          severity,
          priority,
          confidence: p.counts.activeIncidents >= 2 ? 'HIGH' : 'MEDIUM',
          sourceSignal: isCritical ? 'COUNTRY_RISK_CRITICAL' : 'COUNTRY_RISK_HIGH',
          recommendedPlaybookId: matchPlaybookId(topCat, severity),
        });
      }
    }

    // 2. Active Early Warnings from Phase 11
    for (const w of activeWarnings) {
      const severity = w.severity || 'High';
      const priority = severity === 'Critical' ? 'P1' : severity === 'High' ? 'P2' : 'P3';
      candidates.push({
        dedupKey: `REC-WARN-${w.id}`,
        country: w.country,
        category: w.warningType || 'Early Warning',
        title: `Mitigate Early Warning: ${w.title}`,
        rationale: `Triggered by Phase 11 early-warning signal (${w.warningType}): ${w.description}`,
        severity,
        priority,
        confidence: w.projectedScore !== null && w.projectedScore !== undefined ? 'HIGH' : 'MEDIUM',
        sourceSignal: 'EARLY_WARNING_ACTIVE',
        recommendedPlaybookId: matchPlaybookId(w.warningType, severity),
      });
    }

    // 3. Emerging Threat Signals (Volume Surges & Recurring Categories)
    for (const surge of emerging.volumeSurges || []) {
      candidates.push({
        dedupKey: `REC-SURGE-${surge.country.toUpperCase()}-${surge.activeCount}`,
        country: surge.country,
        category: 'Multi-Incident Surge',
        title: `Deploy Surge Response Taskforce in ${surge.country}`,
        rationale: `${surge.country} has ${surge.activeCount} active incidents (threshold: ${surge.threshold}), indicating concentrated operational strain.`,
        severity: surge.activeCount >= 3 ? 'Critical' : 'High',
        priority: surge.activeCount >= 3 ? 'P1' : 'P2',
        confidence: 'HIGH',
        sourceSignal: 'INCIDENT_SURGE',
        recommendedPlaybookId: 'PB-GEOPOLITICAL-CRISIS',
      });
    }

    const created = [];
    const tx = db.transaction(() => {
      for (const c of candidates) {
        const info = insertRec.run(c);
        if (info.changes > 0) {
          const row = db
            .prepare('SELECT * FROM strategic_recommendations WHERE id = ?')
            .get(info.lastInsertRowid);
          if (row) created.push(mapRecommendationRow(row));
        }
      }
    });
    tx();

    if (created.length > 0) {
      broadcastEvent('strategic_recommendations_generated', {
        count: created.length,
        recommendations: created,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      newRecommendationsCount: created.length,
      newRecommendations: created,
    };
  },

  updateRecommendationDecision(id, { status, outcomeNotes }, actor) {
    if (!['pending', 'accepted', 'dismissed', 'executed'].includes(status)) {
      throw createHttpError(400, 'Status must be pending, accepted, dismissed, or executed.');
    }
    const existing = db.prepare('SELECT * FROM strategic_recommendations WHERE id = ?').get(id);
    if (!existing) {
      throw createHttpError(404, `Recommendation ${id} not found.`, 'NotFound');
    }

    const nowIso = new Date().toISOString();
    const actorName = actor?.username || 'Operator';
    const nextNotes = outcomeNotes !== undefined ? String(outcomeNotes).trim() : existing.outcome_notes;

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE strategic_recommendations
        SET status = ?, outcome_notes = ?, decided_by = ?, decided_at = ?
        WHERE id = ?
      `).run(status, nextNotes || null, actorName, nowIso, id);

      if (status !== 'pending') {
        const decisionTypeMap = {
          accepted: 'RECOMMENDATION_ACCEPTED',
          dismissed: 'RECOMMENDATION_DISMISSED',
          executed: 'RECOMMENDATION_EXECUTED',
        };
        const outcomeStatusMap = {
          accepted: 'MONITORING',
          dismissed: 'DEFERRED',
          executed: 'SUCCESS',
        };
        db.prepare(`
          INSERT INTO decision_logs (
            recommendation_id, playbook_id, country, decision_type, outcome_status, summary, decided_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          existing.id,
          existing.recommended_playbook_id || null,
          existing.country,
          decisionTypeMap[status],
          outcomeStatusMap[status],
          `${existing.title}${nextNotes ? ` — ${nextNotes}` : ''}`,
          actorName
        );
      }
    });
    tx();

    const updated = mapRecommendationRow(
      db.prepare('SELECT * FROM strategic_recommendations WHERE id = ?').get(id)
    );
    broadcastEvent('strategic_decision_updated', { recommendation: updated });
    return updated;
  },

  simulateScenarios(country, { horizonSteps = 3, mitigationFactor = 0.25, recordSimulation = false } = {}, actor = null) {
    if (!country || !String(country).trim()) {
      throw createHttpError(400, 'Country name is required for scenario simulation.');
    }

    const profile = countryRiskService.getCountryProfile(country);
    const predData = predictiveService.getCountryPrediction(country);
    const currentScore = profile.riskScore;
    const steps = Math.min(Math.max(parseInt(horizonSteps, 10) || 3, 1), 6);
    const mitigation = Math.min(Math.max(Number(mitigationFactor) || 0.25, 0.05), 0.75);

    const observedSlope = predData.prediction.hasSufficientHistory
      ? predData.prediction.rateOfChange
      : profile.counts.activeIncidents > 0
      ? 2.0
      : 0;

    // Deterministic scenario trajectories clearly separated from predictions
    const bestSlope = -Math.max(2.5, currentScore * (mitigation / steps));
    const mostLikelySlope = observedSlope;
    const worstSlope = Math.max(4.0, Math.abs(observedSlope) * 1.5 + profile.counts.criticalAlerts * 2.5 + 3.0);

    const series = [
      {
        step: 'Current',
        bestCase: currentScore,
        mostLikely: currentScore,
        worstCase: currentScore,
        isSimulation: false,
      },
    ];

    for (let t = 1; t <= steps; t += 1) {
      series.push({
        step: `T+${t}`,
        bestCase: clampScore(currentScore + bestSlope * t),
        mostLikely: clampScore(currentScore + mostLikelySlope * t),
        worstCase: clampScore(currentScore + worstSlope * t),
        isSimulation: true,
      });
    }

    const finalPoint = series[series.length - 1];
    const summary = {
      bestCaseEndScore: finalPoint.bestCase,
      mostLikelyEndScore: finalPoint.mostLikely,
      worstCaseEndScore: finalPoint.worstCase,
      bestCaseDelta: finalPoint.bestCase - currentScore,
      mostLikelyDelta: finalPoint.mostLikely - currentScore,
      worstCaseDelta: finalPoint.worstCase - currentScore,
    };

    if (recordSimulation && actor) {
      db.prepare(`
        INSERT INTO decision_logs (
          country, decision_type, outcome_status, summary, decided_by
        ) VALUES (?, 'SCENARIO_SIMULATED', 'MONITORING', ?, ?)
      `).run(
        profile.country,
        `Simulated ${steps}-step scenarios for ${profile.country} (mitigation ${(mitigation * 100).toFixed(0)}%): Best ${summary.bestCaseEndScore}, Likely ${summary.mostLikelyEndScore}, Worst ${summary.worstCaseEndScore}.`,
        actor.username || 'Operator'
      );
    }

    return {
      country: profile.country,
      region: profile.region,
      currentScore,
      classification: profile.classification,
      horizonSteps: steps,
      mitigationFactor: mitigation,
      isSimulation: true,
      hasPredictiveBaseline: predData.prediction.hasSufficientHistory,
      summary,
      series,
      disclaimer:
        'Scenario simulations model hypothetical best-case, most-likely, and worst-case risk trajectories based on mitigation assumptions and observed SQLite baselines. Simulations are NOT actual predictions or verified external intelligence.',
    };
  },

  getPlaybooks({ status = 'ALL', category = 'ALL' } = {}) {
    const conditions = [];
    const params = [];
    if (status && status !== 'ALL') {
      conditions.push('status = ?');
      params.push(status);
    }
    if (category && category !== 'ALL') {
      conditions.push('category = ?');
      params.push(category);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return db
      .prepare(`SELECT * FROM response_playbooks ${where} ORDER BY updated_at DESC, id ASC`)
      .all(...params)
      .map(mapPlaybookRow);
  },

  createPlaybook({ name, category, severityTrigger = 'High', description, steps, country = null }, actor) {
    if (!name || !String(name).trim() || !category || !String(category).trim() || !description || !String(description).trim()) {
      throw createHttpError(400, 'Playbook name, category, and description are required.');
    }
    if (!['Critical', 'High', 'Medium', 'Low'].includes(severityTrigger)) {
      throw createHttpError(400, 'Invalid severityTrigger. Must be Critical, High, Medium, or Low.');
    }

    const normalizedSteps = Array.isArray(steps) && steps.length > 0
      ? steps.map((s, idx) => ({
          stepOrder: idx + 1,
          title: typeof s === 'string' ? s.trim() : String(s.title || `Step ${idx + 1}`).trim(),
          ownerRole: typeof s === 'object' && s.ownerRole ? s.ownerRole : 'ANALYST',
          completed: typeof s === 'object' ? Boolean(s.completed) : false,
        }))
      : [
          { stepOrder: 1, title: 'Assess immediate threat perimeter and verify telemetry', ownerRole: 'ANALYST', completed: false },
          { stepOrder: 2, title: 'Execute containment and notify stakeholders', ownerRole: 'ADMIN', completed: false },
        ];

    const id = `PB-${Date.now().toString(36).toUpperCase()}`;
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO response_playbooks (
        id, name, category, severity_trigger, description, steps_json, status, country, created_by, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(
      id,
      String(name).trim(),
      String(category).trim(),
      severityTrigger,
      String(description).trim(),
      JSON.stringify(normalizedSteps),
      country ? String(country).trim() : null,
      actor?.username || 'Operator',
      nowIso,
      nowIso
    );

    return mapPlaybookRow(db.prepare('SELECT * FROM response_playbooks WHERE id = ?').get(id));
  },

  updatePlaybook(id, { status, steps, country }, actor) {
    const existing = db.prepare('SELECT * FROM response_playbooks WHERE id = ?').get(id);
    if (!existing) {
      throw createHttpError(404, `Playbook ${id} not found.`, 'NotFound');
    }

    const nextStatus = status !== undefined ? status : existing.status;
    if (!['draft', 'active', 'in_progress', 'completed', 'archived'].includes(nextStatus)) {
      throw createHttpError(400, 'Invalid playbook status.');
    }

    const nextStepsJson = Array.isArray(steps)
      ? JSON.stringify(
          steps.map((s, idx) => ({
            stepOrder: idx + 1,
            title: String(s.title || `Step ${idx + 1}`).trim(),
            ownerRole: s.ownerRole || 'ANALYST',
            completed: Boolean(s.completed),
          }))
        )
      : existing.steps_json;

    const nextCountry = country !== undefined ? (country ? String(country).trim() : null) : existing.country;
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE response_playbooks
        SET status = ?, steps_json = ?, country = ?, updated_at = ?
        WHERE id = ?
      `).run(nextStatus, nextStepsJson, nextCountry, nowIso, id);

      if (status && status !== existing.status && (status === 'in_progress' || status === 'completed')) {
        db.prepare(`
          INSERT INTO decision_logs (
            playbook_id, country, decision_type, outcome_status, summary, decided_by
          ) VALUES (?, ?, 'PLAYBOOK_ACTIVATED', ?, ?, ?)
        `).run(
          id,
          nextCountry || 'Global',
          status === 'completed' ? 'SUCCESS' : 'MONITORING',
          `Playbook "${existing.name}" transitioned to ${status}.`,
          actor?.username || 'Operator'
        );
      }
    });
    tx();

    return mapPlaybookRow(db.prepare('SELECT * FROM response_playbooks WHERE id = ?').get(id));
  },

  getActions({ status = 'ALL', priority = 'ALL', assignedTo = 'ALL', limit = 150 } = {}) {
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
      conditions.push('LOWER(assigned_to_username) = LOWER(?)');
      params.push(assignedTo);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 150, 1), 300);

    return db
      .prepare(`SELECT * FROM response_actions ${where} ORDER BY CASE status WHEN 'pending' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'blocked' THEN 3 ELSE 4 END, id DESC LIMIT ?`)
      .all(...params, safeLimit)
      .map(mapActionRow);
  },

  createAction({ title, description, country, playbookId = null, recommendationId = null, assignedToUserId = null, priority = 'P2', dueDate = null }, actor) {
    if (!title || !String(title).trim() || !description || !String(description).trim() || !country || !String(country).trim()) {
      throw createHttpError(400, 'Action title, description, and country are required.');
    }
    if (!['P1', 'P2', 'P3', 'P4'].includes(priority)) {
      throw createHttpError(400, 'Priority must be P1, P2, P3, or P4.');
    }

    let assigneeId = null;
    let assigneeUsername = null;
    if (assignedToUserId !== null && assignedToUserId !== undefined && assignedToUserId !== '') {
      const user = db.prepare('SELECT id, username, is_active FROM users WHERE id = ?').get(String(assignedToUserId).trim());
      if (!user || !user.is_active) {
        throw createHttpError(400, 'Assigned user does not exist or is inactive.');
      }
      assigneeId = user.id;
      assigneeUsername = user.username;
    }

    const nowIso = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO response_actions (
        title, description, country, playbook_id, recommendation_id,
        assigned_to_user_id, assigned_to_username, priority, status, due_date, created_by, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(
      String(title).trim(),
      String(description).trim(),
      String(country).trim(),
      playbookId || null,
      recommendationId ? Number(recommendationId) : null,
      assigneeId,
      assigneeUsername,
      priority,
      dueDate || null,
      actor?.username || 'Operator',
      nowIso,
      nowIso
    );

    return mapActionRow(db.prepare('SELECT * FROM response_actions WHERE id = ?').get(info.lastInsertRowid));
  },

  updateAction(id, { status, priority, assignedToUserId, dueDate, outcomeNotes }, actor) {
    const existing = db.prepare('SELECT * FROM response_actions WHERE id = ?').get(id);
    if (!existing) {
      throw createHttpError(404, `Action ${id} not found.`, 'NotFound');
    }

    const nextStatus = status !== undefined ? status : existing.status;
    if (!['pending', 'in_progress', 'blocked', 'completed'].includes(nextStatus)) {
      throw createHttpError(400, 'Invalid action status. Must be pending, in_progress, blocked, or completed.');
    }

    const nextPriority = priority !== undefined ? priority : existing.priority;
    if (!['P1', 'P2', 'P3', 'P4'].includes(nextPriority)) {
      throw createHttpError(400, 'Priority must be P1, P2, P3, or P4.');
    }

    let nextAssigneeId = existing.assigned_to_user_id;
    let nextAssigneeName = existing.assigned_to_username;
    if (assignedToUserId !== undefined) {
      if (assignedToUserId === null || assignedToUserId === '') {
        nextAssigneeId = null;
        nextAssigneeName = null;
      } else {
        const user = db.prepare('SELECT id, username, is_active FROM users WHERE id = ?').get(String(assignedToUserId).trim());
        if (!user || !user.is_active) {
          throw createHttpError(400, 'Assigned user does not exist or is inactive.');
        }
        nextAssigneeId = user.id;
        nextAssigneeName = user.username;
      }
    }

    const nowIso = new Date().toISOString();
    const nextCompletedAt =
      nextStatus === 'completed' ? existing.completed_at || nowIso : null;
    const nextDueDate = dueDate !== undefined ? dueDate : existing.due_date;
    const nextNotes = outcomeNotes !== undefined ? outcomeNotes : existing.outcome_notes;

    db.prepare(`
      UPDATE response_actions
      SET status = ?, priority = ?, assigned_to_user_id = ?, assigned_to_username = ?,
          due_date = ?, outcome_notes = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      nextStatus,
      nextPriority,
      nextAssigneeId,
      nextAssigneeName,
      nextDueDate || null,
      nextNotes || null,
      nextCompletedAt,
      nowIso,
      id
    );

    const updated = mapActionRow(db.prepare('SELECT * FROM response_actions WHERE id = ?').get(id));
    broadcastEvent('response_action_updated', { action: updated, updatedBy: actor?.username || 'Operator' });
    return updated;
  },

  getDecisionDashboard() {
    const recommendations = this.getRecommendations({ limit: 100 });
    const playbooks = this.getPlaybooks();
    const actions = this.getActions({ limit: 150 });
    const decisionLogs = db
      .prepare('SELECT * FROM decision_logs ORDER BY id DESC LIMIT 50')
      .all()
      .map(mapDecisionLogRow);

    const assignableUsers = db
      .prepare('SELECT id, username, full_name, role FROM users WHERE is_active = 1 ORDER BY username ASC')
      .all()
      .map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        role: u.role,
      }));

    const availableCountries = countryRiskService
      .getAllCountryProfiles()
      .map((c) => ({ country: c.country, riskScore: c.riskScore, classification: c.classification }));

    const pendingRecs = recommendations.filter((r) => r.status === 'pending').length;
    const activePlaybooks = playbooks.filter((p) => p.status === 'active' || p.status === 'in_progress').length;
    const openActions = actions.filter((a) => a.status !== 'completed').length;
    const completedActions = actions.filter((a) => a.status === 'completed').length;
    const completionRate = actions.length > 0 ? Math.round((completedActions / actions.length) * 100) : 0;

    const priorityCounts = ['P1', 'P2', 'P3', 'P4'].map((p) => ({
      priority: p,
      count: recommendations.filter((r) => r.priority === p).length,
    }));

    const actionStatusCounts = ['pending', 'in_progress', 'blocked', 'completed'].map((st) => ({
      status: st.replace('_', ' ').toUpperCase(),
      count: actions.filter((a) => a.status === st).length,
    }));

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalRecommendations: recommendations.length,
        pendingRecommendations: pendingRecs,
        activePlaybooks,
        totalActions: actions.length,
        openActions,
        completedActions,
        completionRate,
        totalDecisionsLogged: decisionLogs.length,
      },
      charts: {
        recommendationsByPriority: priorityCounts,
        actionsByStatus: actionStatusCounts,
      },
      recommendations,
      playbooks,
      actions,
      decisionLogs,
      assignableUsers,
      availableCountries,
    };
  },
};
