import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import apiService from '../services/apiService';
import {
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Sliders,
  CheckCircle2,
  XCircle,
  Play,
  ClipboardList,
  Plus,
  Info,
  History,
  CheckSquare,
  Square,
  UserCheck,
} from 'lucide-react';

const SEV_STYLES = {
  Critical: 'border-red-500/40 bg-red-500/15 text-red-300',
  High: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  Medium: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  Low: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
};

const PRIORITY_STYLES = {
  P1: 'border-red-500/40 bg-red-500/15 text-red-300',
  P2: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  P3: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  P4: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
};

const STATUS_STYLES = {
  pending: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  accepted: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
  executed: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  dismissed: 'border-slate-500/40 bg-slate-500/15 text-slate-400',
  active: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
  in_progress: 'border-blue-500/40 bg-blue-500/15 text-blue-300',
  blocked: 'border-red-500/40 bg-red-500/15 text-red-300',
  completed: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  draft: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
  archived: 'border-slate-600/40 bg-slate-700/20 text-slate-400',
};

export default function StrategicDecisions({ canModify = false }) {
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  // Scenario Simulation State
  const [simCountry, setSimCountry] = useState('');
  const [mitigationFactor, setMitigationFactor] = useState(0.25);
  const [horizonSteps, setHorizonSteps] = useState(3);
  const [simulation, setSimulation] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Filters
  const [recFilter, setRecFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');

  // Create Playbook Form
  const [showNewPlaybook, setShowNewPlaybook] = useState(false);
  const [pbForm, setPbForm] = useState({
    name: '',
    category: 'Cyber',
    severityTrigger: 'High',
    description: '',
    stepsText: '',
  });

  // Create Action Form
  const [showNewAction, setShowNewAction] = useState(false);
  const [actionForm, setActionForm] = useState({
    title: '',
    description: '',
    country: '',
    priority: 'P2',
    assignedToUserId: '',
    dueDate: '',
    playbookId: '',
    recommendationId: '',
  });

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await apiService.getDecisionOverview();
      setDashboard(data);
      if (!simCountry && data?.availableCountries?.length > 0) {
        setSimCountry(data.availableCountries[0].country);
      }
      if (!actionForm.country && data?.availableCountries?.length > 0) {
        setActionForm((prev) => ({ ...prev, country: prev.country || data.availableCountries[0].country }));
      }
    } catch (err) {
      setError(err?.message || 'Failed to load Strategic Decision Support dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, [simCountry, actionForm.country]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleGenerateRecommendations = async () => {
    setIsGenerating(true);
    setError('');
    try {
      await apiService.generateRecommendations();
      await loadDashboard();
    } catch (err) {
      setError(err?.message || 'Failed to generate recommendations.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRecommendationDecision = async (id, status) => {
    setError('');
    try {
      await apiService.updateRecommendationDecision(id, { status });
      await loadDashboard();
    } catch (err) {
      setError(err?.message || 'Failed to update recommendation decision.');
    }
  };

  const handleRunSimulation = async (recordSimulation = false) => {
    if (!simCountry) return;
    setIsSimulating(true);
    setError('');
    try {
      const res = await apiService.simulateScenarios({
        country: simCountry,
        horizonSteps: Number(horizonSteps),
        mitigationFactor: Number(mitigationFactor),
        recordSimulation,
      });
      setSimulation(res);
      if (recordSimulation) {
        await loadDashboard();
      }
    } catch (err) {
      setError(err?.message || 'Failed to run scenario simulation.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleTogglePlaybookStep = async (pb, stepOrder) => {
    if (!canModify) return;
    const nextSteps = pb.steps.map((s) =>
      s.stepOrder === stepOrder ? { ...s, completed: !s.completed } : s
    );
    const allDone = nextSteps.every((s) => s.completed);
    const anyDone = nextSteps.some((s) => s.completed);
    const nextStatus = allDone ? 'completed' : anyDone ? 'in_progress' : pb.status;
    try {
      await apiService.updatePlaybook(pb.id, { steps: nextSteps, status: nextStatus });
      await loadDashboard();
    } catch (err) {
      setError(err?.message || 'Failed to update playbook step.');
    }
  };

  const handlePlaybookStatus = async (pbId, status) => {
    try {
      await apiService.updatePlaybook(pbId, { status });
      await loadDashboard();
    } catch (err) {
      setError(err?.message || 'Failed to update playbook status.');
    }
  };

  const handleCreatePlaybook = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const steps = pbForm.stepsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      await apiService.createPlaybook({
        name: pbForm.name,
        category: pbForm.category,
        severityTrigger: pbForm.severityTrigger,
        description: pbForm.description,
        steps,
      });
      setPbForm({ name: '', category: 'Cyber', severityTrigger: 'High', description: '', stepsText: '' });
      setShowNewPlaybook(false);
      await loadDashboard();
    } catch (err) {
      setError(err?.message || 'Failed to create playbook.');
    }
  };

  const handleCreateAction = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiService.createResponseAction({
        title: actionForm.title,
        description: actionForm.description,
        country: actionForm.country,
        priority: actionForm.priority,
        assignedToUserId: actionForm.assignedToUserId || null,
        dueDate: actionForm.dueDate || null,
        playbookId: actionForm.playbookId || null,
        recommendationId: actionForm.recommendationId || null,
      });
      setActionForm((prev) => ({
        ...prev,
        title: '',
        description: '',
        dueDate: '',
        playbookId: '',
        recommendationId: '',
      }));
      setShowNewAction(false);
      await loadDashboard();
    } catch (err) {
      setError(err?.message || 'Failed to create response action.');
    }
  };

  const handleUpdateAction = async (actionId, patch) => {
    setError('');
    try {
      await apiService.updateResponseAction(actionId, patch);
      await loadDashboard();
    } catch (err) {
      setError(err?.message || 'Failed to update response action.');
    }
  };

  const summary = dashboard?.summary || {};
  const recommendations = (dashboard?.recommendations || []).filter(
    (r) => recFilter === 'ALL' || r.status === recFilter
  );
  const actions = (dashboard?.actions || []).filter(
    (a) => actionFilter === 'ALL' || a.status === actionFilter
  );
  const playbooks = dashboard?.playbooks || [];
  const decisionLogs = dashboard?.decisionLogs || [];
  const assignableUsers = dashboard?.assignableUsers || [];
  const availableCountries = dashboard?.availableCountries || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Strategic Decision Support & Automated Response
            </h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Intelligent recommendations, multi-scenario simulations, response playbooks, and operational action tracking.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {canModify && (
            <button
              onClick={handleGenerateRecommendations}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              <span>{isGenerating ? 'Evaluating...' : 'Generate Recommendations'}</span>
            </button>
          )}
          <button
            onClick={loadDashboard}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-navy-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Pending Recommendations</p>
          <p className="mt-2 text-2xl font-bold text-amber-300">{summary.pendingRecommendations ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">Total generated: {summary.totalRecommendations ?? 0}</p>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Active Playbooks</p>
          <p className="mt-2 text-2xl font-bold text-cyan-300">{summary.activePlaybooks ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">Total workflows: {playbooks.length}</p>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Open Response Actions</p>
          <p className="mt-2 text-2xl font-bold text-orange-300">{summary.openActions ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">Completed: {summary.completedActions ?? 0}</p>
        </div>
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Action Completion Rate</p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">{summary.completionRate ?? 0}%</p>
          <p className="text-xs text-slate-400 mt-1">Decisions logged: {summary.totalDecisionsLogged ?? 0}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Recommendations by Priority</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard?.charts?.recommendationsByPriority || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="priority" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                <Bar dataKey="count" name="Recommendations" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Action Status Breakdown</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard?.charts?.actionsByStatus || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="status" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                <Bar dataKey="count" name="Actions" fill="#34d399" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Scenario Simulation */}
      <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-semibold text-white">Scenario Simulation Engine</h2>
              <p className="text-xs text-slate-400">
                Compare Best-Case, Most-Likely, and Worst-Case risk trajectories under mitigation assumptions.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={simCountry}
              onChange={(e) => setSimCountry(e.target.value)}
              className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-1.5 text-xs text-slate-200"
            >
              {availableCountries.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country} ({c.riskScore}/100)
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <span>Mitigation: {(Number(mitigationFactor) * 100).toFixed(0)}%</span>
              <input
                type="range"
                min="0.05"
                max="0.75"
                step="0.05"
                value={mitigationFactor}
                onChange={(e) => setMitigationFactor(e.target.value)}
                className="accent-cyan-400"
              />
            </label>
            <select
              value={horizonSteps}
              onChange={(e) => setHorizonSteps(e.target.value)}
              className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value={3}>3 Steps (T+3)</option>
              <option value={5}>5 Steps (T+5)</option>
            </select>
            <button
              onClick={() => handleRunSimulation(false)}
              disabled={isSimulating || !simCountry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{isSimulating ? 'Simulating...' : 'Run Simulation'}</span>
            </button>
            {canModify && (
              <button
                onClick={() => handleRunSimulation(true)}
                disabled={isSimulating || !simCountry}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                <span>Run & Log Decision</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2.5 text-xs text-cyan-200">
          <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            {simulation?.disclaimer ||
              'Scenario simulations model hypothetical best-case, most-likely, and worst-case risk trajectories based on mitigation assumptions. They are NOT actual predictions or verified external intelligence.'}
          </span>
        </div>

        {simulation && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-[11px] uppercase text-emerald-300 font-semibold">Best-Case End Score</p>
                <p className="text-xl font-bold text-white mt-1">
                  {simulation.summary.bestCaseEndScore}/100{' '}
                  <span className="text-xs font-mono text-emerald-300">
                    ({simulation.summary.bestCaseDelta >= 0 ? '+' : ''}
                    {simulation.summary.bestCaseDelta})
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
                <p className="text-[11px] uppercase text-cyan-300 font-semibold">Most-Likely End Score</p>
                <p className="text-xl font-bold text-white mt-1">
                  {simulation.summary.mostLikelyEndScore}/100{' '}
                  <span className="text-xs font-mono text-cyan-300">
                    ({simulation.summary.mostLikelyDelta >= 0 ? '+' : ''}
                    {simulation.summary.mostLikelyDelta})
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-[11px] uppercase text-red-300 font-semibold">Worst-Case End Score</p>
                <p className="text-xl font-bold text-white mt-1">
                  {simulation.summary.worstCaseEndScore}/100{' '}
                  <span className="text-xs font-mono text-red-300">
                    ({simulation.summary.worstCaseDelta >= 0 ? '+' : ''}
                    {simulation.summary.worstCaseDelta})
                  </span>
                </p>
              </div>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={simulation.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="step" stroke="#94a3b8" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                  <Legend />
                  <Line type="monotone" dataKey="bestCase" name="Best-Case (Simulated)" stroke="#34d399" strokeWidth={2} />
                  <Line type="monotone" dataKey="mostLikely" name="Most-Likely (Simulated)" stroke="#22d3ee" strokeWidth={2} />
                  <Line type="monotone" dataKey="worstCase" name="Worst-Case (Simulated)" stroke="#f87171" strokeWidth={2} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Intelligent Recommendations Queue */}
      <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Intelligent Recommendation Engine</h2>
          <div className="flex items-center gap-2">
            {['ALL', 'pending', 'accepted', 'executed', 'dismissed'].map((st) => (
              <button
                key={st}
                onClick={() => setRecFilter(st)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize ${
                  recFilter === st
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-navy-800 text-slate-400 border border-navy-700 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {recommendations.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">
            No recommendations match the current filter. Click &ldquo;Generate Recommendations&rdquo; to evaluate risk &amp; warning signals.
          </p>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="rounded-lg border border-navy-700/70 bg-navy-950/60 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${PRIORITY_STYLES[rec.priority] || ''}`}>
                      {rec.priority}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${SEV_STYLES[rec.severity] || ''}`}>
                      {rec.severity}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono border border-navy-700 bg-navy-900 text-slate-300">
                      Confidence: {rec.confidence}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border uppercase ${STATUS_STYLES[rec.status] || ''}`}>
                      {rec.status}
                    </span>
                    <span className="text-xs font-semibold text-cyan-300">{rec.country}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white">{rec.title}</h3>
                  <p className="text-xs text-slate-400">{rec.rationale}</p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Signal: {rec.sourceSignal} | Playbook: {rec.recommendedPlaybookId || 'N/A'}
                  </p>
                </div>

                {canModify && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {rec.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleRecommendationDecision(rec.id, 'accepted')}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Accept</span>
                        </button>
                        <button
                          onClick={() => handleRecommendationDecision(rec.id, 'dismissed')}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-600/50 bg-slate-700/20 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700/40"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Dismiss</span>
                        </button>
                      </>
                    )}
                    {rec.status === 'accepted' && (
                      <button
                        onClick={() => handleRecommendationDecision(rec.id, 'executed')}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Mark Executed</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setActionForm((prev) => ({
                          ...prev,
                          title: `Execute: ${rec.title}`,
                          description: rec.rationale,
                          country: rec.country,
                          priority: rec.priority,
                          playbookId: rec.recommendedPlaybookId || '',
                          recommendationId: String(rec.id),
                        }));
                        setShowNewAction(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-navy-700 bg-navy-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-navy-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Assign Action</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Response Playbooks & Action Management */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Response Playbooks */}
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-cyan-400" />
              <h2 className="text-base font-semibold text-white">Response Playbooks</h2>
            </div>
            {canModify && (
              <button
                onClick={() => setShowNewPlaybook((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Playbook</span>
              </button>
            )}
          </div>

          {showNewPlaybook && canModify && (
            <form onSubmit={handleCreatePlaybook} className="rounded-lg border border-navy-700 bg-navy-950/80 p-4 space-y-3">
              <input
                type="text"
                required
                placeholder="Playbook Name"
                value={pbForm.name}
                onChange={(e) => setPbForm({ ...pbForm, name: e.target.value })}
                className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Category"
                  value={pbForm.category}
                  onChange={(e) => setPbForm({ ...pbForm, category: e.target.value })}
                  className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-white"
                />
                <select
                  value={pbForm.severityTrigger}
                  onChange={(e) => setPbForm({ ...pbForm, severityTrigger: e.target.value })}
                  className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-white"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <input
                type="text"
                required
                placeholder="Workflow Description"
                value={pbForm.description}
                onChange={(e) => setPbForm({ ...pbForm, description: e.target.value })}
                className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-white"
              />
              <textarea
                rows={3}
                placeholder="Response steps (one per line)"
                value={pbForm.stepsText}
                onChange={(e) => setPbForm({ ...pbForm, stepsText: e.target.value })}
                className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-white"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewPlaybook(false)}
                  className="rounded-lg border border-navy-700 px-3 py-1.5 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-cyan-500/20 border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-300"
                >
                  Create Playbook
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {playbooks.map((pb) => (
              <div key={pb.id} className="rounded-lg border border-navy-700/70 bg-navy-950/60 p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">{pb.id}</span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${SEV_STYLES[pb.severityTrigger] || ''}`}>
                        {pb.severityTrigger}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border uppercase ${STATUS_STYLES[pb.status] || ''}`}>
                        {pb.status.replace('_', ' ')}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-white mt-1">{pb.name}</h3>
                  </div>
                  {canModify && (
                    <select
                      value={pb.status}
                      onChange={(e) => handlePlaybookStatus(pb.id, e.target.value)}
                      className="rounded-lg border border-navy-700 bg-navy-900 px-2 py-1 text-xs text-slate-200"
                    >
                      <option value="active">Active</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </select>
                  )}
                </div>
                <p className="text-xs text-slate-400">{pb.description}</p>
                <div className="space-y-1.5 pt-1">
                  {pb.steps.map((step) => (
                    <button
                      key={step.stepOrder}
                      type="button"
                      disabled={!canModify}
                      onClick={() => handleTogglePlaybookStep(pb, step.stepOrder)}
                      className="w-full flex items-start gap-2 text-left text-xs rounded-md px-2 py-1 hover:bg-navy-900/80 disabled:cursor-default"
                    >
                      {step.completed ? (
                        <CheckSquare className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                      )}
                      <span className={step.completed ? 'line-through text-slate-500' : 'text-slate-300'}>
                        {step.stepOrder}. {step.title}{' '}
                        <span className="text-[10px] font-mono text-cyan-400/80">[{step.ownerRole}]</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Management */}
        <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-cyan-400" />
              <h2 className="text-base font-semibold text-white">Action Management</h2>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="rounded-lg border border-navy-700 bg-navy-950 px-2.5 py-1 text-xs text-slate-200"
              >
                <option value="ALL">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Completed</option>
              </select>
              {canModify && (
                <button
                  onClick={() => setShowNewAction((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Action</span>
                </button>
              )}
            </div>
          </div>

          {showNewAction && canModify && (
            <form onSubmit={handleCreateAction} className="rounded-lg border border-navy-700 bg-navy-950/80 p-4 space-y-3">
              <input
                type="text"
                required
                placeholder="Action Title"
                value={actionForm.title}
                onChange={(e) => setActionForm({ ...actionForm, title: e.target.value })}
                className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-white"
              />
              <textarea
                rows={2}
                required
                placeholder="Action Description"
                value={actionForm.description}
                onChange={(e) => setActionForm({ ...actionForm, description: e.target.value })}
                className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Country"
                  value={actionForm.country}
                  onChange={(e) => setActionForm({ ...actionForm, country: e.target.value })}
                  className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-white"
                />
                <select
                  value={actionForm.priority}
                  onChange={(e) => setActionForm({ ...actionForm, priority: e.target.value })}
                  className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-white"
                >
                  <option value="P1">P1 (Immediate)</option>
                  <option value="P2">P2 (High)</option>
                  <option value="P3">P3 (Medium)</option>
                  <option value="P4">P4 (Low)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={actionForm.assignedToUserId}
                  onChange={(e) => setActionForm({ ...actionForm, assignedToUserId: e.target.value })}
                  className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-white"
                >
                  <option value="">Unassigned</option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.role})
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={actionForm.dueDate}
                  onChange={(e) => setActionForm({ ...actionForm, dueDate: e.target.value })}
                  className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewAction(false)}
                  className="rounded-lg border border-navy-700 px-3 py-1.5 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-cyan-500/20 border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-300"
                >
                  Create Action
                </button>
              </div>
            </form>
          )}

          {actions.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No response actions recorded for this filter.</p>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {actions.map((act) => (
                <div key={act.id} className="rounded-lg border border-navy-700/70 bg-navy-950/60 p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${PRIORITY_STYLES[act.priority] || ''}`}>
                        {act.priority}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border uppercase ${STATUS_STYLES[act.status] || ''}`}>
                        {act.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-semibold text-cyan-300">{act.country}</span>
                    </div>
                    {canModify && (
                      <select
                        value={act.status}
                        onChange={(e) => handleUpdateAction(act.id, { status: e.target.value })}
                        className="rounded-lg border border-navy-700 bg-navy-900 px-2 py-1 text-xs text-slate-200"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="blocked">Blocked</option>
                        <option value="completed">Completed</option>
                      </select>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-white">{act.title}</h3>
                  <p className="text-xs text-slate-400">{act.description}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono pt-1">
                    <span>Assignee: {act.assignedToUsername || 'Unassigned'}</span>
                    <span>Due: {act.dueDate || 'No deadline'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Decision History & Outcomes */}
      <div className="rounded-xl border border-navy-700/60 bg-navy-900/80 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-cyan-400" />
          <h2 className="text-base font-semibold text-white">Decision History &amp; Outcomes</h2>
        </div>

        {decisionLogs.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No strategic decisions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-navy-700/80 text-slate-400 uppercase">
                <tr>
                  <th className="py-2 pr-4">Country</th>
                  <th className="py-2 pr-4">Decision Type</th>
                  <th className="py-2 pr-4">Outcome</th>
                  <th className="py-2 pr-4">Summary</th>
                  <th className="py-2 pr-4">Decided By</th>
                  <th className="py-2">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/70 text-slate-300">
                {decisionLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 pr-4 font-semibold text-cyan-300">{log.country}</td>
                    <td className="py-2.5 pr-4 font-mono">{log.decisionType}</td>
                    <td className="py-2.5 pr-4">
                      <span className="px-2 py-0.5 rounded border border-navy-700 bg-navy-950 font-mono text-[11px]">
                        {log.outcomeStatus}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 max-w-md">{log.summary}</td>
                    <td className="py-2.5 pr-4 font-mono">{log.decidedBy}</td>
                    <td className="py-2.5 text-slate-400 font-mono">{log.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

