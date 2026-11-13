import db from '../db/database.js';
import countryRiskService from './countryRiskService.js';
import predictiveService from './predictiveService.js';
import { advancedAnalyticsService } from './advancedAnalyticsService.js';
import { aiProviderService } from './aiProviderService.js';
import { intelligenceRetrievalService, detectPromptInjection, sanitizeUntrustedText } from './intelligenceRetrievalService.js';
import { aiPromptService } from './aiPromptService.js';
import { conversationService } from './conversationService.js';

function createHttpError(status, message, name = 'ValidationError') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  return err;
}

function logAiUsage(user, operation, { provider, model, status, latencyMs }) {
  db.prepare(`
    INSERT INTO ai_usage_logs (user_id, username, user_role, operation, provider, model, status, latency_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(user.id),
    user.username,
    user.role,
    operation,
    provider,
    model,
    status,
    latencyMs
  );
}

export const aiIntelligenceService = {
  getStatus() {
    return aiProviderService.getConfig();
  },

  updateConfig(payload) {
    return aiProviderService.updateConfig(payload);
  },

  async chat({ conversationId, message }, user) {
    const start = Date.now();
    if (!message || !String(message).trim()) {
      throw createHttpError(400, 'Message cannot be empty.');
    }
    if (detectPromptInjection(message)) {
      throw createHttpError(
        400,
        'Query rejected by AI safety guardrails: instruction override or credential/mutation probes are not permitted.',
        'SecurityPolicyError'
      );
    }

    const cleanQuestion = sanitizeUntrustedText(message, 800);
    let conv;
    if (conversationId) {
      conv = conversationService.getOwnedConversation(conversationId, user.id).conversation;
    } else {
      conv = conversationService.createConversation(user.id, cleanQuestion.slice(0, 60));
    }

    conversationService.appendMessage(conv.id, user.id, {
      role: 'user',
      content: cleanQuestion,
    });

    const searchRes = intelligenceRetrievalService.searchIntelligence(
      cleanQuestion,
      user.role,
      conv.activeCountry
    );
    const nextActiveCountry =
      searchRes.entities.mentionedCountries[0] || conv.activeCountry || null;

    const evidence = searchRes.results.slice(0, 8);

    const deterministicAnswer = () => {
      if (evidence.length === 0) {
        return `No supporting records were found in GRICC for "${cleanQuestion}". Try specifying a monitored country (e.g., India, United States, Brazil, United Kingdom, Japan, Singapore, United Arab Emirates) or threat category.`;
      }
      const lines = evidence.slice(0, 5).map(
        (e, i) => `${i + 1}. [${e.tier}] (${e.sourceType}:${e.recordId}) ${e.country}: ${e.title} — ${e.summary}`
      );
      return `Based on ${searchRes.totalMatches} matching GRICC record(s)${nextActiveCountry ? ` (active context: ${nextActiveCountry})` : ''}:\n${lines.join('\n')}`;
    };

    try {
      const synthesis = await aiProviderService.generateSynthesis({
        systemPrompt: aiPromptService.buildSystemPrompt(user.role),
        userPrompt: aiPromptService.buildGroundedUserPrompt({
          question: cleanQuestion,
          activeCountry: nextActiveCountry,
          evidence,
        }),
        deterministicFallback: deterministicAnswer,
      });

      const assistantMsg = conversationService.appendMessage(conv.id, user.id, {
        role: 'assistant',
        content: synthesis.text,
        evidence,
        metadata: {
          provider: synthesis.provider,
          model: synthesis.model,
          tier: synthesis.tier,
          totalMatches: searchRes.totalMatches,
        },
        activeCountry: nextActiveCountry,
      });

      logAiUsage(user, 'CHAT', {
        provider: synthesis.provider,
        model: synthesis.model,
        status: 'SUCCESS',
        latencyMs: Date.now() - start,
      });

      return {
        conversationId: conv.id,
        activeCountry: nextActiveCountry,
        message: assistantMsg,
      };
    } catch (err) {
      const cfg = aiProviderService.getConfig();
      logAiUsage(user, 'CHAT', {
        provider: cfg.provider,
        model: cfg.model,
        status: 'ERROR',
        latencyMs: Date.now() - start,
      });
      throw err;
    }
  },

  async explainRisk({ country }, user) {
    const start = Date.now();
    if (!country || !String(country).trim()) {
      throw createHttpError(400, 'Country is required for risk explanation.');
    }
    const profile = countryRiskService.getCountryProfile(country);
    const predData = predictiveService.getCountryPrediction(profile.country);
    const compData = advancedAnalyticsService.getComparison({ countries: [profile.country] });
    const warnings = predictiveService.getEarlyWarnings({ country: profile.country, status: 'active' });
    const dims = compData.items[0]?.indicators || {
      overall: profile.riskScore,
      political: 0,
      economic: 0,
      security: 0,
      geopolitical: 0,
    };

    const deterministicExplanation = () =>
      `${profile.country} holds an authoritative GRICC risk score of ${profile.riskScore}/100 (${profile.classification}). ` +
      `Dimensional breakdown — Political: ${dims.political}/100, Economic: ${dims.economic}/100, Security: ${dims.security}/100, Geopolitical: ${dims.geopolitical}/100. ` +
      `Active incidents: ${profile.counts.activeIncidents}; Critical alerts: ${profile.counts.criticalAlerts}; Historical trend: ${profile.trendDirection} (delta: ${profile.scoreDelta}). ` +
      `Phase 11 forecast: ${predData.prediction.hasSufficientHistory ? `${predData.prediction.direction} toward ${predData.prediction.projectedNextScore}/100 (${predData.prediction.confidence})` : 'INSUFFICIENT_DATA (< 2 snapshots)'}.`;

    const synthesis = await aiProviderService.generateSynthesis({
      systemPrompt: aiPromptService.buildSystemPrompt(user.role),
      userPrompt: deterministicExplanation(),
      deterministicFallback: deterministicExplanation,
    });

    logAiUsage(user, 'EXPLAIN_RISK', {
      provider: synthesis.provider,
      model: synthesis.model,
      status: 'SUCCESS',
      latencyMs: Date.now() - start,
    });

    return {
      country: profile.country,
      authoritativeScore: profile.riskScore,
      classification: profile.classification,
      dimensions: dims,
      scoreExplanation: profile.scoreExplanation,
      recentIncidents: (profile.allIncidents || []).slice(0, 5),
      activeWarnings: warnings,
      prediction: predData.prediction,
      aiExplanation: synthesis.text,
      tier: synthesis.tier,
      note: 'AI explanation is interpretive only and cannot modify authoritative GRICC risk scores.',
    };
  },

  async summarize({ format = 'Executive Summary', country = null, incidentId = null, region = null }, user) {
    const start = Date.now();
    const validFormats = [
      'Executive Summary',
      'Detailed Intelligence Summary',
      'Risk Assessment Summary',
      'Incident Summary',
      'Regional Intelligence Summary',
    ];
    if (!validFormats.includes(format)) {
      throw createHttpError(400, `Invalid summary format. Must be one of: ${validFormats.join(', ')}`);
    }

    const references = [];
    let contextText = '';

    if (incidentId) {
      const inc = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
      if (!inc) throw createHttpError(404, `Incident ${incidentId} not found.`, 'NotFound');
      references.push({ recordId: inc.id, sourceType: 'INCIDENT', country: inc.country, date: inc.date_reported });
      contextText = `[INCIDENT:${inc.id}] ${inc.title} in ${inc.country} (${inc.severity}, ${inc.status}) — ${sanitizeUntrustedText(inc.description, 300)}`;
    } else if (country) {
      const profile = countryRiskService.getCountryProfile(country);
      references.push({
        recordId: `COUNTRY-${profile.country.toUpperCase()}`,
        sourceType: 'COUNTRY_RISK_PROFILE',
        country: profile.country,
        date: profile.lastCalculated,
      });
      contextText = `${profile.country} (${profile.region}): Score ${profile.riskScore}/100 (${profile.classification}), ${profile.counts.activeIncidents} active incident(s), ${profile.counts.criticalAlerts} critical alert(s).`;
    } else {
      const profiles = countryRiskService.getAllCountryProfiles();
      const top = profiles.slice(0, 4);
      for (const p of top) {
        references.push({
          recordId: `COUNTRY-${p.country.toUpperCase()}`,
          sourceType: 'COUNTRY_RISK_PROFILE',
          country: p.country,
          date: p.lastCalculated,
        });
      }
      contextText = `${region ? `Region ${region}` : 'Global'} Intelligence Overview across ${profiles.length} monitored countries. Top risks: ${top.map((p) => `${p.country} (${p.riskScore}/100)`).join(', ')}.`;
    }

    const deterministicSummary = () => `${format}: ${contextText}`;
    const synthesis = await aiProviderService.generateSynthesis({
      systemPrompt: aiPromptService.buildSystemPrompt(user.role),
      userPrompt: `Produce a ${format} strictly grounded in: ${contextText}`,
      deterministicFallback: deterministicSummary,
    });

    logAiUsage(user, 'SUMMARIZE', {
      provider: synthesis.provider,
      model: synthesis.model,
      status: 'SUCCESS',
      latencyMs: Date.now() - start,
    });

    return {
      format,
      summary: synthesis.text,
      tier: synthesis.tier,
      references,
    };
  },

  async compare({ countries = [] }, user) {
    const start = Date.now();
    const comp = advancedAnalyticsService.getComparison({ countries });
    const corr = advancedAnalyticsService.getCorrelations();

    const deterministicComparison = () => {
      const lines = comp.items.map(
        (i) => `${i.country}: Risk ${i.riskScore}/100 (${i.classification}), Security ${i.indicators.security}, Political ${i.indicators.political}, Economic ${i.indicators.economic}, Active Incidents ${i.activeIncidents}.`
      );
      return `Comparative Intelligence across ${comp.comparedCountries.join(', ')}: ${lines.join(' ')} Note: Cross-country correlations measure co-movement and do NOT imply causation.`;
    };

    const synthesis = await aiProviderService.generateSynthesis({
      systemPrompt: aiPromptService.buildSystemPrompt(user.role),
      userPrompt: deterministicComparison(),
      deterministicFallback: deterministicComparison,
    });

    logAiUsage(user, 'COMPARE', {
      provider: synthesis.provider,
      model: synthesis.model,
      status: 'SUCCESS',
      latencyMs: Date.now() - start,
    });

    return {
      comparedCountries: comp.comparedCountries,
      items: comp.items,
      correlationNote: corr.correlationNote,
      aiComparison: synthesis.text,
      tier: synthesis.tier,
    };
  },
};

