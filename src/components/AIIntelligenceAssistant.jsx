import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../services/apiService';
import {
  Bot,
  Send,
  Plus,
  Trash2,
  Search,
  ShieldAlert,
  FileText,
  CheckCircle2,
  Download,
  Sparkles,
  Info,
  MessageSquare,
  GitCompare,
  Settings,
} from 'lucide-react';

const TIER_BADGES = {
  VERIFIED_DATA: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  ANALYTICAL_ASSESSMENT: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
  AI_INTERPRETATION: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
};

const SUGGESTED_QUERIES = [
  'What is the current geopolitical risk status of India?',
  'Which countries have experienced increasing risk scores?',
  'What early warnings are currently active?',
  'Find all high-severity incidents related to supply chain.',
];

export default function AIIntelligenceAssistant({ canModify = false, isAdmin = false, countries = [] }) {
  const [subTab, setSubTab] = useState('chat'); // chat | search-explain | reports
  const [aiStatus, setAiStatus] = useState(null);
  const [error, setError] = useState('');

  // Chat & Conversations
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [activeCountryCtx, setActiveCountryCtx] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  // NL Search & Risk Explainer & Compare
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [explainCountry, setExplainCountry] = useState('India');
  const [riskExplanation, setRiskExplanation] = useState(null);
  const [compareCountries, setCompareCountries] = useState(['United States', 'India']);
  const [comparisonRes, setComparisonRes] = useState(null);

  // Summarizer & AI Reports
  const [sumFormat, setSumFormat] = useState('Executive Summary');
  const [sumCountry, setSumCountry] = useState('');
  const [summaryRes, setSummaryRes] = useState(null);
  const [reports, setReports] = useState([]);
  const [reportType, setReportType] = useState('COUNTRY_INTELLIGENCE');
  const [reportCountry, setReportCountry] = useState('India');
  const [editingReportId, setEditingReportId] = useState(null);
  const [editSummaryText, setEditSummaryText] = useState('');

  // Admin Provider Config
  const [showConfig, setShowConfig] = useState(false);
  const [cfgForm, setCfgForm] = useState({ provider: 'gricc-deterministic', model: 'grounded-retrieval-v1' });

  const loadInitial = useCallback(async () => {
    setError('');
    try {
      const [st, convs, rpts] = await Promise.all([
        apiService.getAiStatus(),
        apiService.getAiConversations(),
        apiService.getAiReports(),
      ]);
      setAiStatus(st);
      setCfgForm({ provider: st.provider, model: st.model });
      setConversations(convs.conversations || []);
      setReports(rpts.reports || []);
    } catch (err) {
      setError(err?.message || 'Failed to load AI Intelligence Assistant.');
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const openConversation = async (id) => {
    setError('');
    try {
      const res = await apiService.getAiConversation(id);
      setActiveConvId(res.conversation.id);
      setActiveCountryCtx(res.conversation.activeCountry);
      setMessages(res.messages || []);
    } catch (err) {
      setError(err?.message || 'Failed to load conversation.');
    }
  };

  const handleNewConversation = async () => {
    setError('');
    try {
      const res = await apiService.createAiConversation({ title: 'New Intelligence Session' });
      setConversations((prev) => [res.conversation, ...prev]);
      setActiveConvId(res.conversation.id);
      setActiveCountryCtx(null);
      setMessages([]);
    } catch (err) {
      setError(err?.message || 'Failed to create conversation.');
    }
  };

  const handleDeleteConversation = async (id, e) => {
    e.stopPropagation();
    try {
      await apiService.deleteAiConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
        setActiveCountryCtx(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err?.message || 'Failed to delete conversation.');
    }
  };

  const handleSendChat = async (textOverride = null) => {
    const text = (textOverride ?? chatInput).trim();
    if (!text) return;
    setIsSending(true);
    setError('');
    if (!textOverride) setChatInput('');

    try {
      const res = await apiService.sendAiChat({
        conversationId: activeConvId,
        message: text,
      });
      if (!activeConvId) {
        setActiveConvId(res.conversationId);
        const convList = await apiService.getAiConversations();
        setConversations(convList.conversations || []);
      }
      setActiveCountryCtx(res.activeCountry);
      const convData = await apiService.getAiConversation(res.conversationId);
      setMessages(convData.messages || []);
    } catch (err) {
      setError(err?.message || 'Failed to process AI intelligence query.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setError('');
    try {
      const res = await apiService.searchAiIntelligence(searchQuery);
      setSearchResult(res);
    } catch (err) {
      setError(err?.message || 'Intelligence search failed.');
    }
  };

  const handleExplainRisk = async () => {
    setError('');
    try {
      const res = await apiService.explainAiRisk(explainCountry);
      setRiskExplanation(res);
    } catch (err) {
      setError(err?.message || 'Risk explanation failed.');
    }
  };

  const handleCompare = async () => {
    setError('');
    try {
      const res = await apiService.compareAiCountries(compareCountries);
      setComparisonRes(res);
    } catch (err) {
      setError(err?.message || 'Comparative analysis failed.');
    }
  };

  const handleSummarize = async () => {
    setError('');
    try {
      const res = await apiService.summarizeAiIntelligence({
        format: sumFormat,
        country: sumCountry || null,
      });
      setSummaryRes(res);
    } catch (err) {
      setError(err?.message || 'Summarization failed.');
    }
  };

  const handleGenerateReport = async () => {
    setError('');
    try {
      await apiService.generateAiReport({
        reportType,
        countries: reportCountry ? [reportCountry] : [],
      });
      const rpts = await apiService.getAiReports();
      setReports(rpts.reports || []);
    } catch (err) {
      setError(err?.message || 'Failed to generate draft AI report.');
    }
  };

  const handleApproveReport = async (id, customSummary = undefined) => {
    setError('');
    try {
      await apiService.approveAiReport(id, {
        approve: true,
        executiveSummary: customSummary,
      });
      setEditingReportId(null);
      const rpts = await apiService.getAiReports();
      setReports(rpts.reports || []);
    } catch (err) {
      setError(err?.message || 'Failed to approve AI report.');
    }
  };

  const handleDownloadPdf = async (linkedReportId, title) => {
    try {
      const blob = await apiService.downloadReport(linkedReportId, 'pdf');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9_-]/gi, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.message || 'Failed to export approved report PDF.');
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      const res = await apiService.updateAiConfig(cfgForm);
      setAiStatus(res.config);
      setShowConfig(false);
    } catch (err) {
      setError(err?.message || 'Failed to update AI provider configuration.');
    }
  };

  const countryList =
    countries.length > 0
      ? countries.map((c) => c.country)
      : ['India', 'United States', 'Brazil', 'United Kingdom', 'Japan', 'Singapore', 'United Arab Emirates'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Bot className="h-6 w-6 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              AI-Powered Intelligence Assistant
            </h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Evidence-grounded natural language intelligence chat, semantic search, risk explanations, and draft reporting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {aiStatus && (
            <span className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-1.5 text-xs font-mono text-cyan-300">
              Provider: {aiStatus.provider} ({aiStatus.status})
            </span>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowConfig((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-700 bg-navy-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-navy-700"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Model Config</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin Provider Config Drawer */}
      {showConfig && isAdmin && (
        <form onSubmit={handleSaveConfig} className="rounded-xl border border-cyan-500/30 bg-navy-900/90 p-4 flex flex-wrap items-center gap-3 text-xs">
          <select
            value={cfgForm.provider}
            onChange={(e) => setCfgForm({ ...cfgForm, provider: e.target.value })}
            className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-white"
          >
            {(aiStatus?.supportedProviders || ['gricc-deterministic']).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            type="text"
            value={cfgForm.model}
            onChange={(e) => setCfgForm({ ...cfgForm, model: e.target.value })}
            placeholder="Model name"
            className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-white"
          />
          <button type="submit" className="rounded-lg bg-cyan-500/20 border border-cyan-500/40 px-3 py-1.5 font-semibold text-cyan-300">
            Save Provider Config
          </button>
        </form>
      )}

      {/* Guardrail Banner */}
      <div className="flex items-start gap-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-200">
        <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
        <span>
          Every factual statement is grounded in GRICC SQLite records and labeled by tier (<code className="font-mono">VERIFIED_DATA</code>, <code className="font-mono">ANALYTICAL_ASSESSMENT</code>, <code className="font-mono">AI_INTERPRETATION</code>). The assistant cannot modify risk scores or execute automated actions.
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'chat', label: 'Intelligence Chat', icon: MessageSquare },
          { id: 'search-explain', label: 'NL Search, Risk Explainer & Compare', icon: Search },
          { id: 'reports', label: 'Summarizer & Draft Reports', icon: FileText },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold border ${
                subTab === t.id
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-navy-900 text-slate-400 border-navy-700 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: INTELLIGENCE CHAT */}
      {subTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Conversation Sidebar */}
          <div className="lg:col-span-3 rounded-xl border border-navy-700/60 bg-navy-900/80 p-4 space-y-3">
            <button
              onClick={handleNewConversation}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25"
            >
              <Plus className="h-4 w-4" />
              <span>New Conversation</span>
            </button>

            <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 text-center">No saved sessions yet.</p>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => openConversation(c.id)}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs cursor-pointer border ${
                      activeConvId === c.id
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-white'
                        : 'bg-navy-950/60 border-navy-800 text-slate-300 hover:border-navy-600'
                    }`}
                  >
                    <span className="truncate">{c.title}</span>
                    <button
                      onClick={(e) => handleDeleteConversation(c.id, e)}
                      className="text-slate-500 hover:text-red-400 shrink-0"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat Workspace */}
          <div className="lg:col-span-9 rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 flex flex-col justify-between min-h-[540px]">
            <div className="space-y-4">
              {activeCountryCtx && (
                <div className="text-[11px] font-mono text-cyan-300">
                  Active Context Country: {activeCountryCtx} (pronouns like &ldquo;it&rdquo; / &ldquo;its&rdquo; resolve automatically)
                </div>
              )}

              {messages.length === 0 ? (
                <div className="py-8 space-y-4">
                  <p className="text-sm text-slate-300 text-center">
                    Ask a natural-language question about GRICC countries, incidents, early warnings, or risk trends:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {SUGGESTED_QUERIES.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSendChat(q)}
                        className="text-left rounded-lg border border-navy-700 bg-navy-950/70 p-3 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-white"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl p-4 text-xs space-y-2 ${
                        m.role === 'user'
                          ? 'bg-cyan-500/15 border border-cyan-500/30 text-white ml-8'
                          : 'bg-navy-950/80 border border-navy-700/70 text-slate-200 mr-4'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>{m.role === 'user' ? 'OPERATOR' : 'GRICC AI ASSISTANT'}</span>
                        <span>{m.createdAt}</span>
                      </div>
                      <p className="whitespace-pre-line leading-relaxed">{m.content}</p>

                      {m.evidence && m.evidence.length > 0 && (
                        <div className="pt-2 border-t border-navy-800 space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase text-slate-400">
                            Evidence &amp; Source Attribution
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {m.evidence.slice(0, 4).map((ev) => (
                              <div key={`${ev.sourceType}-${ev.recordId}`} className="rounded border border-navy-800 bg-navy-900 p-2 text-[11px]">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-mono text-cyan-300">{ev.recordId}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] border font-mono ${TIER_BADGES[ev.tier] || ''}`}>
                                    {ev.tier}
                                  </span>
                                </div>
                                <p className="font-semibold text-white mt-0.5 truncate">{ev.title}</p>
                                <p className="text-slate-400 text-[10px]">{ev.country} | {ev.date}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {isSending && (
                    <div className="text-xs font-mono text-cyan-300 animate-pulse">
                      Retrieving GRICC records and synthesizing response...
                    </div>
                  )}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat();
              }}
              className="mt-4 flex items-center gap-2 pt-3 border-t border-navy-800"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about country risk, incidents, early warnings, or follow up on the active country..."
                className="flex-1 rounded-lg border border-navy-700 bg-navy-950 px-3.5 py-2.5 text-xs text-white"
              />
              <button
                type="submit"
                disabled={isSending || !chatInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-4 py-2.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: NL SEARCH, RISK EXPLAINER & COMPARE */}
      {subTab === 'search-explain' && (
        <div className="space-y-6">
          {/* Natural Language Search */}
          <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Search className="h-4 w-4 text-cyan-400" />
              <span>Natural Language Intelligence Search</span>
            </h2>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='e.g. "Find all high-severity incidents in South Asia during the last 30 days"'
                className="flex-1 rounded-lg border border-navy-700 bg-navy-950 px-3.5 py-2 text-xs text-white"
              />
              <button
                type="submit"
                className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-300"
              >
                Search
              </button>
            </form>
            {searchResult && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Found {searchResult.totalMatches} matching record(s):
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {searchResult.results.map((r) => (
                    <div key={`${r.sourceType}-${r.recordId}`} className="rounded-lg border border-navy-800 bg-navy-950 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-cyan-300">{r.recordId} ({r.sourceType})</span>
                        <span className="font-mono text-emerald-300">Rel: {r.relevanceScore}%</span>
                      </div>
                      <p className="font-semibold text-white">{r.title}</p>
                      <p className="text-slate-400 text-[11px]">{r.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Risk Explanation Engine */}
            <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-cyan-400" />
                  <span>AI Risk Explanation Engine</span>
                </h2>
                <div className="flex items-center gap-2">
                  <select
                    value={explainCountry}
                    onChange={(e) => setExplainCountry(e.target.value)}
                    className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1 text-xs text-white"
                  >
                    {countryList.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleExplainRisk}
                    className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300"
                  >
                    Explain
                  </button>
                </div>
              </div>
              {riskExplanation && (
                <div className="rounded-lg border border-navy-800 bg-navy-950 p-3.5 text-xs space-y-2">
                  <p className="font-semibold text-cyan-300">
                    Authoritative Score: {riskExplanation.authoritativeScore}/100 ({riskExplanation.classification})
                  </p>
                  <p className="text-slate-200 leading-relaxed">{riskExplanation.aiExplanation}</p>
                  <p className="text-[10px] font-mono text-slate-500">{riskExplanation.note}</p>
                </div>
              )}
            </div>

            {/* AI Comparative Analysis */}
            <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <GitCompare className="h-4 w-4 text-cyan-400" />
                  <span>AI Comparative Analysis</span>
                </h2>
                <button
                  onClick={handleCompare}
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300"
                >
                  Compare Selected
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {countryList.map((c) => {
                  const active = compareCountries.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() =>
                        setCompareCountries((prev) =>
                          active ? (prev.length > 1 ? prev.filter((x) => x !== c) : prev) : [...prev, c].slice(0, 4)
                        )
                      }
                      className={`rounded px-2 py-1 text-[11px] border ${
                        active
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-navy-950 text-slate-400 border-navy-700'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {comparisonRes && (
                <div className="rounded-lg border border-navy-800 bg-navy-950 p-3.5 text-xs space-y-2">
                  <p className="text-slate-200 leading-relaxed">{comparisonRes.aiComparison}</p>
                  <p className="text-[10px] font-mono text-slate-500">{comparisonRes.correlationNote}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SUMMARIZER & DRAFT AI REPORTS */}
      {subTab === 'reports' && (
        <div className="space-y-6">
          {/* Intelligence Summarizer */}
          <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-3">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <span>Intelligence Summarization Engine</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={sumFormat}
                onChange={(e) => setSumFormat(e.target.value)}
                className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs text-white"
              >
                <option>Executive Summary</option>
                <option>Detailed Intelligence Summary</option>
                <option>Risk Assessment Summary</option>
                <option>Incident Summary</option>
                <option>Regional Intelligence Summary</option>
              </select>
              <select
                value={sumCountry}
                onChange={(e) => setSumCountry(e.target.value)}
                className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs text-white"
              >
                <option value="">Global Scope</option>
                {countryList.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                onClick={handleSummarize}
                className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3.5 py-1.5 text-xs font-semibold text-cyan-300"
              >
                Generate Summary
              </button>
            </div>
            {summaryRes && (
              <div className="rounded-lg border border-navy-800 bg-navy-950 p-3.5 text-xs space-y-1.5">
                <p className="font-semibold text-cyan-300">{summaryRes.format}</p>
                <p className="text-slate-200">{summaryRes.summary}</p>
              </div>
            )}
          </div>

          {/* AI Report Assistant */}
          <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white">AI Intelligence Report Assistant (Drafts &amp; Approval)</h2>
              {canModify && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="COUNTRY_INTELLIGENCE">Country Intelligence</option>
                    <option value="EXECUTIVE_SUMMARY">Executive Summary</option>
                    <option value="REGIONAL_INTELLIGENCE">Regional Intelligence</option>
                    <option value="INCIDENT_ANALYSIS">Incident Analysis</option>
                    <option value="PREDICTIVE_RISK">Predictive Risk</option>
                    <option value="COMPARATIVE_COUNTRY">Comparative Country</option>
                  </select>
                  <select
                    value={reportCountry}
                    onChange={(e) => setReportCountry(e.target.value)}
                    className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-xs text-white"
                  >
                    {countryList.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleGenerateReport}
                    className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300"
                  >
                    Generate Draft Report
                  </button>
                </div>
              )}
            </div>

            {reports.length === 0 ? (
              <p className="text-sm text-slate-400">No AI reports generated yet.</p>
            ) : (
              <div className="space-y-3">
                {reports.map((rpt) => (
                  <div key={rpt.id} className="rounded-lg border border-navy-700/70 bg-navy-950/70 p-4 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded border font-mono text-[10px] uppercase ${
                          rpt.status === 'approved'
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                        }`}>
                          {rpt.status}
                        </span>
                        <span className="font-semibold text-white">{rpt.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {canModify && rpt.status === 'draft' && (
                          <>
                            <button
                              onClick={() => {
                                setEditingReportId(rpt.id);
                                setEditSummaryText(rpt.content?.executiveSummary || '');
                              }}
                              className="rounded border border-navy-700 bg-navy-800 px-2.5 py-1 text-[11px] text-slate-200"
                            >
                              Edit Draft
                            </button>
                            <button
                              onClick={() => handleApproveReport(rpt.id)}
                              className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Approve</span>
                            </button>
                          </>
                        )}
                        {rpt.status === 'approved' && rpt.linkedReportId && (
                          <button
                            onClick={() => handleDownloadPdf(rpt.linkedReportId, rpt.title)}
                            className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-300"
                          >
                            <Download className="h-3 w-3" />
                            <span>Export PDF</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {editingReportId === rpt.id ? (
                      <div className="space-y-2 pt-2">
                        <textarea
                          rows={3}
                          value={editSummaryText}
                          onChange={(e) => setEditSummaryText(e.target.value)}
                          className="w-full rounded border border-navy-700 bg-navy-900 p-2 text-xs text-white"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingReportId(null)}
                            className="rounded border border-navy-700 px-2.5 py-1 text-[11px] text-slate-300"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleApproveReport(rpt.id, editSummaryText)}
                            className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300"
                          >
                            Save &amp; Approve
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-slate-300">{rpt.content?.executiveSummary}</p>
                        <p className="text-[10px] font-mono text-slate-500">
                          Period: {rpt.analysisPeriod} | Countries: {(rpt.relevantCountries || []).join(', ')} | Sources: {(rpt.content?.sourceReferences || []).length}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

