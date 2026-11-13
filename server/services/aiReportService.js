import db from '../db/database.js';
import countryRiskService from './countryRiskService.js';
import predictiveService from './predictiveService.js';
import { advancedAnalyticsService } from './advancedAnalyticsService.js';
import { geospatialService } from './geospatialService.js';
import { aiProviderService } from './aiProviderService.js';
import { aiPromptService } from './aiPromptService.js';

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  return err;
}

const VALID_REPORT_TYPES = [
  'COUNTRY_INTELLIGENCE',
  'EXECUTIVE_SUMMARY',
  'REGIONAL_INTELLIGENCE',
  'INCIDENT_ANALYSIS',
  'PREDICTIVE_RISK',
  'COMPARATIVE_COUNTRY',
];

function mapAiReportRow(row) {
  let relevantCountries = [];
  let content = {};
  try {
    relevantCountries = JSON.parse(row.relevant_countries_json || '[]');
  } catch {
    relevantCountries = [];
  }
  try {
    content = JSON.parse(row.content_json || '{}');
  } catch {
    content = {};
  }
  return {
    id: row.id,
    userId: row.user_id,
    createdByUsername: row.created_by_username,
    reportType: row.report_type,
    title: row.title,
    analysisPeriod: row.analysis_period,
    relevantCountries,
    content,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    linkedReportId: row.linked_report_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const aiReportService = {
  async generateDraftReport({ reportType, countries = [], region = null, analysisPeriod = 'Last 30 Days', title = '' }, user) {
    if (!VALID_REPORT_TYPES.includes(reportType)) {
      throw createHttpError(400, `Invalid reportType. Must be one of: ${VALID_REPORT_TYPES.join(', ')}`);
    }

    const allProfiles = countryRiskService.getAllCountryProfiles();
    const targetCountries =
      Array.isArray(countries) && countries.length > 0
        ? allProfiles.filter((p) => countries.some((c) => c.toLowerCase() === p.country.toLowerCase())).map((p) => p.country)
        : allProfiles.slice(0, 3).map((p) => p.country);

    const selectedProfiles = allProfiles.filter((p) => targetCountries.includes(p.country));
    const warnings = predictiveService.getEarlyWarnings({ limit: 20 });
    const { insights } = advancedAnalyticsService.getInsights({ limit: 15 });
    const regionsData = geospatialService.getRegions();

    const evidenceRefs = [];
    for (const p of selectedProfiles) {
      evidenceRefs.push({
        recordId: `COUNTRY-${p.country.toUpperCase().replace(/\s+/g, '-')}`,
        sourceType: 'COUNTRY_RISK_PROFILE',
        country: p.country,
        date: p.lastCalculated,
        title: `${p.country} Risk Score ${p.riskScore}/100 (${p.classification})`,
      });
      for (const inc of (p.allIncidents || []).slice(0, 3)) {
        evidenceRefs.push({
          recordId: inc.id,
          sourceType: 'INCIDENT',
          country: inc.country,
          date: inc.dateReported,
          title: inc.title,
        });
      }
    }

    const reportTitle =
      (title && String(title).trim()) ||
      `[AI DRAFT] ${reportType.replace(/_/g, ' ')} — ${targetCountries.join(', ') || region || 'Global'}`;

    const deterministicSummary = () => {
      const lines = selectedProfiles.map(
        (p) =>
          `${p.country} (${p.region}): Risk Score ${p.riskScore}/100 (${p.classification}), ${p.counts.activeIncidents} active incident(s), ${p.counts.criticalAlerts} critical alert(s), trend ${p.trendDirection}.`
      );
      if (region) {
        const reg = regionsData.regions.find((r) => r.region.toLowerCase() === region.toLowerCase());
        if (reg) {
          lines.push(`Region ${reg.region}: Avg risk ${reg.averageRiskScore}/100 across ${reg.countryCount} monitored countries with ${reg.totalIncidents} incident(s).`);
        }
      }
      return lines.join(' ');
    };

    const synthesis = await aiProviderService.generateSynthesis({
      systemPrompt: aiPromptService.buildSystemPrompt(user.role),
      userPrompt: `Draft a concise ${reportType} intelligence summary for ${targetCountries.join(', ') || region || 'Global'} over ${analysisPeriod}.`,
      deterministicFallback: deterministicSummary,
    });

    const content = {
      executiveSummary: `[DRAFT — REQUIRES HUMAN APPROVAL] ${synthesis.text}`,
      supportingIntelligence: evidenceRefs.map((e) => `[${e.sourceType}:${e.recordId}] ${e.country} (${e.date}) — ${e.title}`),
      riskAssessment: selectedProfiles.map((p) => ({
        country: p.country,
        riskScore: p.riskScore,
        classification: p.classification,
        activeIncidents: p.counts.activeIncidents,
        trendDirection: p.trendDirection,
      })),
      activeWarningsCount: warnings.filter((w) => w.status === 'active').length,
      analyticalInsightsCount: insights.length,
      analyticalLimitations:
        'This draft was synthesized from recorded SQLite incidents, alerts, snapshots, and Phase 11-14 indicators. Statistical correlations do not imply causation, and predictive projections require >= 2 historical snapshots. Marked as DRAFT until approved by an authorized operator.',
      sourceReferences: evidenceRefs,
      providerMetadata: { provider: synthesis.provider, model: synthesis.model },
    };

    const id = `AIRPT-${Date.now().toString(36).toUpperCase()}`;
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO ai_generated_reports (
        id, user_id, created_by_username, report_type, title, analysis_period,
        relevant_countries_json, content_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).run(
      id,
      String(user.id),
      user.username,
      reportType,
      reportTitle,
      analysisPeriod,
      JSON.stringify(targetCountries),
      JSON.stringify(content),
      nowIso,
      nowIso
    );

    return mapAiReportRow(db.prepare('SELECT * FROM ai_generated_reports WHERE id = ?').get(id));
  },

  listReports(user) {
    if (['ADMIN', 'ANALYST'].includes(user.role)) {
      return db
        .prepare('SELECT * FROM ai_generated_reports ORDER BY created_at DESC LIMIT 100')
        .all()
        .map(mapAiReportRow);
    }
    // VIEWER: only approved reports or own reports
    return db
      .prepare(`SELECT * FROM ai_generated_reports WHERE status = 'approved' OR user_id = ? ORDER BY created_at DESC LIMIT 100`)
      .all(String(user.id))
      .map(mapAiReportRow);
  },

  getReportById(id, user) {
    const row = db.prepare('SELECT * FROM ai_generated_reports WHERE id = ?').get(id);
    if (!row) {
      throw createHttpError(404, `AI Report ${id} not found.`, 'NotFound');
    }
    if (user.role === 'VIEWER' && row.status !== 'approved' && String(row.user_id) !== String(user.id)) {
      throw createHttpError(403, 'Viewers may only access approved AI reports.', 'Forbidden');
    }
    return mapAiReportRow(row);
  },

  approveAndEditReport(id, { title, executiveSummary, approve = true }, user) {
    const row = db.prepare('SELECT * FROM ai_generated_reports WHERE id = ?').get(id);
    if (!row) {
      throw createHttpError(404, `AI Report ${id} not found.`, 'NotFound');
    }
    const existing = mapAiReportRow(row);
    const nextContent = {
      ...existing.content,
      executiveSummary:
        executiveSummary !== undefined
          ? String(executiveSummary).trim()
          : existing.content.executiveSummary.replace(/^\[DRAFT — REQUIRES HUMAN APPROVAL\]\s*/i, ''),
    };
    const nextTitle =
      title !== undefined
        ? String(title).trim()
        : existing.title.replace(/^\[AI DRAFT\]\s*/i, '');
    const nowIso = new Date().toISOString();

    let linkedReportId = existing.linkedReportId;
    const nextStatus = approve ? 'approved' : existing.status;

    // When approved, also register in Phase 10 reports table so PDF export works seamlessly
    if (approve && !linkedReportId) {
      linkedReportId = `RPT-AI-${Date.now().toString(36).toUpperCase()}`;
      const summaryObj = {
        executiveSummary: nextContent.executiveSummary,
        analyticalLimitations: nextContent.analyticalLimitations,
        aiApprovedBy: user.username,
      };
      const payload = {
        reportType: 'GLOBAL_RISK_SUMMARY',
        title: nextTitle,
        generatedAt: nowIso,
        generatedBy: user.username,
        summary: summaryObj,
        countries: nextContent.riskAssessment || [],
        sources: nextContent.sourceReferences || [],
      };
      db.prepare(`
        INSERT INTO reports (
          id, title, report_type, filters_json, summary_json, payload_json, is_published, generated_by, generated_by_role, created_at
        ) VALUES (?, ?, 'GLOBAL_RISK_SUMMARY', ?, ?, ?, 1, ?, ?, ?)
      `).run(
        linkedReportId,
        nextTitle,
        JSON.stringify({ country: existing.relevantCountries[0] || null, aiReportId: id }),
        JSON.stringify(summaryObj),
        JSON.stringify(payload),
        user.username,
        user.role,
        nowIso
      );
    }

    db.prepare(`
      UPDATE ai_generated_reports
      SET title = ?, content_json = ?, status = ?, approved_by = ?, approved_at = ?, linked_report_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      nextTitle,
      JSON.stringify(nextContent),
      nextStatus,
      approve ? user.username : existing.approvedBy,
      approve ? nowIso : existing.approvedAt,
      linkedReportId,
      nowIso,
      id
    );

    return mapAiReportRow(db.prepare('SELECT * FROM ai_generated_reports WHERE id = ?').get(id));
  },
};
