import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import db from '../db/database.js';
import countryRiskService from './countryRiskService.js';

export const REPORT_TYPES = [
  'GLOBAL_RISK_SUMMARY',
  'COUNTRY_RISK_REPORT',
  'INCIDENT_SITREP',
  'CRITICAL_ALERT_REPORT',
  'HISTORICAL_INCIDENT_REPORT',
  'AUDIT_ACTIVITY_REPORT',
];

const REPORT_LABELS = {
  GLOBAL_RISK_SUMMARY: 'Global Risk Summary Report',
  COUNTRY_RISK_REPORT: 'Country Risk Intelligence Report',
  INCIDENT_SITREP: 'Incident Situation Report (SITREP)',
  CRITICAL_ALERT_REPORT: 'Critical Alert & Threat Advisory Report',
  HISTORICAL_INCIDENT_REPORT: 'Historical Incident Analysis Report',
  AUDIT_ACTIVITY_REPORT: 'Security & Operational Audit Report',
};

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  return err;
}

function mapReportRow(row) {
  return {
    id: row.id,
    title: row.title,
    reportType: row.report_type,
    filters: JSON.parse(row.filters_json),
    summary: JSON.parse(row.summary_json),
    payload: JSON.parse(row.payload_json),
    isPublished: Boolean(row.is_published),
    generatedBy: row.generated_by,
    generatedByRole: row.generated_by_role,
    createdAt: row.created_at,
  };
}

function filterByDate(dateStr, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  if (!dateStr) return true;
  const iso = dateStr.slice(0, 10);
  if (dateFrom && iso < dateFrom) return false;
  if (dateTo && iso > dateTo) return false;
  return true;
}

function buildReportDataset(reportType, filters = {}) {
  const { country = 'ALL', dateFrom = '', dateTo = '', severity = 'ALL', status = 'ALL' } = filters;

  const allIncidents = db.prepare('SELECT * FROM incidents ORDER BY last_updated DESC').all();
  const allAlerts = db.prepare('SELECT * FROM alerts ORDER BY updated_at DESC').all();

  const filteredIncidents = allIncidents.filter((inc) => {
    if (country && country !== 'ALL' && inc.country.toLowerCase() !== country.toLowerCase()) return false;
    if (severity && severity !== 'ALL' && inc.severity !== severity) return false;
    if (status && status !== 'ALL' && inc.status !== status) return false;
    if (!filterByDate(inc.date_reported || inc.created_at, dateFrom, dateTo)) return false;
    return true;
  });

  const filteredAlerts = allAlerts.filter((alt) => {
    if (country && country !== 'ALL' && alt.country.toLowerCase() !== country.toLowerCase()) return false;
    if (severity && severity !== 'ALL' && alt.severity !== severity) return false;
    if (!filterByDate(alt.timestamp || alt.updated_at, dateFrom, dateTo)) return false;
    return true;
  });

  const countryProfiles = countryRiskService.getAllCountryProfiles({
    search: country && country !== 'ALL' ? country : '',
  });

  let rows = [];
  let columns = [];
  let summary = {};

  if (reportType === 'GLOBAL_RISK_SUMMARY' || reportType === 'COUNTRY_RISK_REPORT') {
    columns = ['Country', 'Region', 'Risk Score', 'Classification', 'Active Incidents', 'Critical Alerts'];
    rows = countryProfiles.map((p) => ({
      country: p.country,
      region: p.region,
      riskScore: p.riskScore,
      classification: p.classification,
      activeIncidents: p.counts.activeIncidents,
      criticalAlerts: p.counts.criticalAlerts,
    }));
    summary = {
      monitoredCountries: countryProfiles.length,
      criticalCountries: countryProfiles.filter((p) => p.classification === 'Critical').length,
      highRiskCountries: countryProfiles.filter((p) => p.classification === 'High').length,
      totalActiveIncidents: filteredIncidents.filter((i) => i.status !== 'Resolved').length,
      averageRiskScore:
        countryProfiles.length > 0
          ? Number(
              (
                countryProfiles.reduce((acc, p) => acc + p.riskScore, 0) / countryProfiles.length
              ).toFixed(1)
            )
          : 0,
    };
  } else if (reportType === 'CRITICAL_ALERT_REPORT') {
    const targetAlerts =
      severity === 'ALL' ? filteredAlerts.filter((a) => a.severity === 'Critical' || a.severity === 'High') : filteredAlerts;
    columns = ['ID', 'Title', 'Country', 'Severity', 'Status', 'Source', 'Timestamp'];
    rows = targetAlerts.map((a) => ({
      id: a.id,
      title: a.title,
      country: a.country,
      severity: a.severity,
      status: a.status,
      source: a.source,
      timestamp: a.timestamp,
    }));
    summary = {
      totalAlerts: targetAlerts.length,
      criticalCount: targetAlerts.filter((a) => a.severity === 'Critical').length,
      activeCount: targetAlerts.filter((a) => a.status === 'active').length,
      acknowledgedCount: targetAlerts.filter((a) => a.status === 'acknowledged').length,
      resolvedCount: targetAlerts.filter((a) => a.status === 'resolved').length,
    };
  } else if (reportType === 'AUDIT_ACTIVITY_REPORT') {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all();
    columns = ['ID', 'Actor', 'Role', 'Action', 'Resource', 'Record ID', 'Status', 'Timestamp'];
    rows = logs.map((l) => ({
      id: l.id,
      actor: l.username || 'system',
      role: l.user_role || 'SYSTEM',
      action: l.action,
      resource: l.resource_type,
      recordId: l.record_id || '—',
      status: l.status,
      timestamp: l.created_at,
    }));
    summary = {
      totalEvents: logs.length,
      successEvents: logs.filter((l) => l.status === 'SUCCESS').length,
      deniedOrFailedEvents: logs.filter((l) => l.status !== 'SUCCESS').length,
    };
  } else {
    // INCIDENT_SITREP or HISTORICAL_INCIDENT_REPORT
    columns = ['Incident ID', 'Title', 'Country', 'Category', 'Severity', 'Status', 'Assigned Team', 'Updated'];
    rows = filteredIncidents.map((i) => ({
      id: i.id,
      title: i.title,
      country: i.country,
      category: i.category,
      severity: i.severity,
      status: i.status,
      assignedTeam: i.assigned_team,
      lastUpdated: i.last_updated,
    }));
    summary = {
      totalIncidents: filteredIncidents.length,
      openCount: filteredIncidents.filter((i) => i.status === 'Open').length,
      investigatingCount: filteredIncidents.filter((i) => i.status === 'Investigating').length,
      containedCount: filteredIncidents.filter((i) => i.status === 'Contained').length,
      resolvedCount: filteredIncidents.filter((i) => i.status === 'Resolved').length,
      criticalCount: filteredIncidents.filter((i) => i.severity === 'Critical').length,
    };
  }

  return {
    columns,
    rows,
    summary,
    severityBreakdown: ['Critical', 'High', 'Medium', 'Low'].map((sev) => ({
      name: sev,
      count: filteredIncidents.filter((i) => i.severity === sev).length,
    })),
    methodology:
      'GRICC Risk Score (0-100) = Active Incident Load (max 40) + Threat Category Diversity (max 15) + Active Alert Load (max 30) + Historical Incident Volume (max 15). All figures are computed directly from persisted SQLite records.',
    dataSources: {
      primaryStore: 'GRICC Persistent SQLite Database (incidents, alerts, audit_logs)',
      liveExternalFeeds: Array.from(
        new Set(allAlerts.filter((a) => a.is_live).map((a) => a.source))
      ),
    },
  };
}

function escapeCsvCell(val) {
  const str = String(val ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const reportingService = {
  listReports({ publishedOnly = false } = {}) {
    const where = publishedOnly ? 'WHERE is_published = 1' : '';
    const rows = db.prepare(`SELECT * FROM reports ${where} ORDER BY created_at DESC LIMIT 50`).all();
    return rows.map(mapReportRow);
  },

  getReportById(id) {
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    if (!row) {
      throw createHttpError(404, `Report ${id} not found.`, 'NotFound');
    }
    return mapReportRow(row);
  },

  generateReport({ reportType, filters = {}, title = '', isPublished = true }, actor) {
    if (!REPORT_TYPES.includes(reportType)) {
      throw createHttpError(400, `Invalid reportType. Must be one of: ${REPORT_TYPES.join(', ')}`);
    }

    if (reportType === 'AUDIT_ACTIVITY_REPORT' && actor?.role !== 'ADMIN') {
      throw createHttpError(403, 'Only ADMIN users can generate Audit Activity Reports.', 'Forbidden');
    }

    const dataset = buildReportDataset(reportType, filters);
    const id = `RPT-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const reportTitle =
      title?.trim() ||
      `${REPORT_LABELS[reportType]}${filters.country && filters.country !== 'ALL' ? ` — ${filters.country}` : ''}`;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO reports (
        id, title, report_type, filters_json, summary_json, payload_json,
        is_published, generated_by, generated_by_role, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      reportTitle,
      reportType,
      JSON.stringify(filters),
      JSON.stringify(dataset.summary),
      JSON.stringify(dataset),
      isPublished ? 1 : 0,
      actor?.username || 'GRICC Operator',
      actor?.role || 'ANALYST',
      createdAt
    );

    return this.getReportById(id);
  },

  updatePublishState(id, isPublished) {
    const existing = db.prepare('SELECT id FROM reports WHERE id = ?').get(id);
    if (!existing) {
      throw createHttpError(404, `Report ${id} not found.`, 'NotFound');
    }
    db.prepare('UPDATE reports SET is_published = ? WHERE id = ?').run(isPublished ? 1 : 0, id);
    return this.getReportById(id);
  },

  exportCsv(report) {
    const lines = [
      `# GRICC Global Risk Intelligence Command Centre`,
      `# Report ID: ${report.id}`,
      `# Title: ${report.title}`,
      `# Type: ${report.reportType}`,
      `# Generated At: ${report.createdAt}`,
      `# Generated By: ${report.generatedBy} (${report.generatedByRole})`,
      `# Filters: ${JSON.stringify(report.filters)}`,
      `# Methodology: ${report.payload.methodology}`,
      '',
    ];

    const { columns, rows } = report.payload;
    lines.push(columns.map(escapeCsvCell).join(','));
    for (const row of rows) {
      lines.push(Object.values(row).map(escapeCsvCell).join(','));
    }
    return lines.join('\r\n');
  },

  exportPdfBuffer(report) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Dark Navy Enterprise Banner
      doc.rect(0, 0, doc.page.width, 84).fill('#071224');
      doc.fillColor('#22d3ee').fontSize(18).font('Helvetica-Bold').text('GRICC', 40, 22);
      doc
        .fillColor('#e2e8f0')
        .fontSize(10)
        .font('Helvetica')
        .text('GLOBAL RISK INTELLIGENCE COMMAND CENTRE', 40, 44);
      doc
        .fillColor('#94a3b8')
        .fontSize(9)
        .text(`REPORT ID: ${report.id}  |  GENERATED: ${report.createdAt}`, 40, 60);

      doc.moveDown(3);
      doc.fillColor('#0f172a').fontSize(15).font('Helvetica-Bold').text(report.title, 40, 102);
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#475569')
        .text(`Type: ${report.reportType}  |  Author: ${report.generatedBy} (${report.generatedByRole})`);
      doc.text(`Filters: ${JSON.stringify(report.filters)}`);

      doc.moveDown(0.8);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('Executive Summary');
      doc.fontSize(9).font('Helvetica').fillColor('#334155');
      for (const [k, v] of Object.entries(report.summary || {})) {
        doc.text(`• ${k}: ${v}`);
      }

      doc.moveDown(0.8);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('Records Table');
      doc.fontSize(8).font('Helvetica').fillColor('#1e293b');
      const { columns = [], rows = [] } = report.payload;
      doc.font('Helvetica-Bold').text(columns.join('  |  '));
      doc.font('Helvetica');
      for (const row of rows.slice(0, 60)) {
        doc.text(Object.values(row).map((v) => String(v ?? '')).join('  |  '));
      }
      if (rows.length > 60) {
        doc.fillColor('#64748b').text(`... (${rows.length - 60} additional rows omitted from PDF preview; use CSV/JSON for full export)`);
      }

      doc.moveDown(1);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a').text('Risk Methodology & Data Sources');
      doc.fontSize(8).font('Helvetica').fillColor('#475569').text(report.payload.methodology);
      doc.text(`Primary Store: ${report.payload.dataSources?.primaryStore || 'SQLite'}`);

      doc.end();
    });
  },
};

export default reportingService;

