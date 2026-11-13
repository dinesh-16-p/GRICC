import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckSquare,
  Clock,
  Edit3,
  ExternalLink,
  Link2,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Share2,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import apiService from '../services/apiService';

const PRIORITY_BADGE = {
  CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/40',
  HIGH: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
  MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  LOW: 'bg-sky-500/15 text-sky-400 border-sky-500/40',
};

const STATUS_BADGE = {
  OPEN: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  IN_PROGRESS: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  CLOSED: 'bg-slate-700/60 text-slate-300 border-slate-600',
  TODO: 'bg-slate-700/60 text-slate-200 border-slate-600',
  UNDER_REVIEW: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
  COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/40',
};

const DISCUSSION_TYPES = [
  'GENERAL_INTELLIGENCE',
  'INCIDENT_DISCUSSION',
  'COUNTRY_RISK_DISCUSSION',
  'THREAT_ANALYSIS',
  'PREDICTIVE_WARNING_DISCUSSION',
  'GEOSPATIAL_DISCUSSION',
  'STRATEGIC_RECOMMENDATION',
];

const RECORD_TYPES = [
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

function formatTime(iso) {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function initials(user) {
  const name = user?.fullName || user?.username || 'U';
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function renderMentionText(text) {
  const parts = String(text || '').split(/(@[a-zA-Z0-9_.-]+)/g);
  return parts.map((part, idx) =>
    part.startsWith('@') ? (
      <span key={idx} className="text-cyan-300 font-semibold">
        {part}
      </span>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

export default function IntelligenceCollaboration({
  currentUser = null,
  canModify = false,
  isAdmin = false,
  latestCollabEvent = null,
  onNavigateTab = null,
}) {
  const [subTab, setSubTab] = useState('discussions'); // 'discussions' | 'tasks' | 'team' | 'activity'
  const [overview, setOverview] = useState(null);
  const [discussions, setDiscussions] = useState([]);
  const [selectedDisc, setSelectedDisc] = useState(null);
  const [comments, setComments] = useState([]);
  const [sharedRecords, setSharedRecords] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [team, setTeam] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  // Discussion Filters
  const [discSearch, setDiscSearch] = useState('');
  const [discStatus, setDiscStatus] = useState('ALL');
  const [discPriority, setDiscPriority] = useState('ALL');

  // Task Filters
  const [taskStatus, setTaskStatus] = useState('ALL');
  const [taskPriority, setTaskPriority] = useState('ALL');
  const [taskAssignee, setTaskAssignee] = useState('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Modals & Inputs
  const [showNewDiscModal, setShowNewDiscModal] = useState(false);
  const [newDisc, setNewDisc] = useState({
    title: '',
    description: '',
    discussionType: 'GENERAL_INTELLIGENCE',
    priority: 'MEDIUM',
    visibility: 'TEAM',
    countryId: '',
    assignedTo: '',
  });

  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignedTo: '',
    priority: 'MEDIUM',
    dueDate: '',
    discussionId: '',
  });

  const [showShareModal, setShowShareModal] = useState(false);
  const [sharePayload, setSharePayload] = useState({
    recordType: 'INCIDENT',
    recordId: '',
    note: '',
  });

  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingContent, setEditingContent] = useState('');

  const loadWorkspace = useCallback(async () => {
    setError('');
    try {
      const [ov, discRes, taskRes, teamRes, actRes] = await Promise.all([
        apiService.getCollaborationOverview(),
        apiService.getDiscussions({
          status: discStatus,
          priority: discPriority,
          search: discSearch,
        }),
        apiService.getInvestigationTasks({
          status: taskStatus,
          priority: taskPriority,
          assignedTo: taskAssignee,
          overdueOnly,
        }),
        apiService.getTeamDirectory(),
        apiService.getCollaborationActivity({ limit: 40 }),
      ]);
      setOverview(ov);
      const list = discRes.discussions || [];
      setDiscussions(list);
      setTasks(taskRes.tasks || []);
      setTeam(teamRes.members || []);
      setActivity(actRes.activity || []);

      if (selectedDisc) {
        const refreshed = list.find((d) => d.id === selectedDisc.id);
        if (refreshed) setSelectedDisc(refreshed);
      } else if (list.length > 0) {
        setSelectedDisc(list[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load collaboration workspace.');
    } finally {
      setLoading(false);
    }
  }, [discStatus, discPriority, discSearch, taskStatus, taskPriority, taskAssignee, overdueOnly]);

  const loadDiscussionDetails = useCallback(async (discussionId) => {
    if (!discussionId) return;
    try {
      const [cmtRes, shrRes] = await Promise.all([
        apiService.getDiscussionComments(discussionId),
        apiService.getSharedRecords(discussionId),
      ]);
      setComments(cmtRes.comments || []);
      setSharedRecords(shrRes.records || []);
    } catch (err) {
      setError(err.message || 'Failed to load discussion thread.');
    }
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (selectedDisc?.id) {
      loadDiscussionDetails(selectedDisc.id);
    } else {
      setComments([]);
      setSharedRecords([]);
    }
  }, [selectedDisc?.id, loadDiscussionDetails]);

  useEffect(() => {
    if (latestCollabEvent) {
      loadWorkspace();
      if (selectedDisc?.id) {
        loadDiscussionDetails(selectedDisc.id);
      }
    }
  }, [latestCollabEvent, loadWorkspace, loadDiscussionDetails, selectedDisc?.id]);

  const threadedComments = useMemo(() => {
    const roots = comments.filter((c) => !c.parentCommentId);
    const byParent = new Map();
    for (const c of comments) {
      if (c.parentCommentId) {
        const arr = byParent.get(c.parentCommentId) || [];
        arr.push(c);
        byParent.set(c.parentCommentId, arr);
      }
    }
    return { roots, byParent };
  }, [comments]);

  const handleCreateDiscussion = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiService.createDiscussion({
        ...newDisc,
        assignedTo: newDisc.assignedTo || null,
        countryId: newDisc.countryId || null,
      });
      setShowNewDiscModal(false);
      setNewDisc({
        title: '',
        description: '',
        discussionType: 'GENERAL_INTELLIGENCE',
        priority: 'MEDIUM',
        visibility: 'TEAM',
        countryId: '',
        assignedTo: '',
      });
      setSelectedDisc(res.discussion);
      setActionMsg(`Discussion "${res.discussion.title}" created.`);
      await loadWorkspace();
    } catch (err) {
      setError(err.message || 'Failed to create discussion.');
    }
  };

  const handleDiscussionStatus = async (status) => {
    if (!selectedDisc) return;
    setError('');
    try {
      const res = await apiService.updateDiscussionStatus(selectedDisc.id, status);
      setSelectedDisc(res.discussion);
      setActionMsg(`Discussion status updated to ${status}.`);
      await loadWorkspace();
    } catch (err) {
      setError(err.message || 'Failed to update discussion status.');
    }
  };

  const handleDiscussionAssign = async (assignedTo) => {
    if (!selectedDisc) return;
    setError('');
    try {
      const res = await apiService.assignDiscussion(selectedDisc.id, assignedTo || null);
      setSelectedDisc(res.discussion);
      setActionMsg('Discussion assignee updated.');
      await loadWorkspace();
    } catch (err) {
      setError(err.message || 'Failed to assign discussion.');
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!selectedDisc || !commentText.trim()) return;
    setError('');
    try {
      await apiService.addDiscussionComment(selectedDisc.id, {
        content: commentText,
        parentCommentId: replyTo?.id || null,
      });
      setCommentText('');
      setReplyTo(null);
      await loadDiscussionDetails(selectedDisc.id);
      await loadWorkspace();
    } catch (err) {
      setError(err.message || 'Failed to post comment.');
    }
  };

  const handleSaveEditComment = async (commentId) => {
    if (!editingContent.trim()) return;
    setError('');
    try {
      await apiService.editDiscussionComment(commentId, editingContent);
      setEditingCommentId(null);
      setEditingContent('');
      await loadDiscussionDetails(selectedDisc.id);
    } catch (err) {
      setError(err.message || 'Failed to edit comment.');
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment? This action will be audited.')) return;
    setError('');
    try {
      await apiService.deleteDiscussionComment(commentId);
      await loadDiscussionDetails(selectedDisc.id);
    } catch (err) {
      setError(err.message || 'Failed to delete comment.');
    }
  };

  const handleShareRecord = async (e) => {
    e.preventDefault();
    if (!selectedDisc) return;
    setError('');
    try {
      await apiService.shareIntelligenceRecord(selectedDisc.id, sharePayload);
      setShowShareModal(false);
      setSharePayload({ recordType: 'INCIDENT', recordId: '', note: '' });
      setActionMsg('Intelligence record linked to discussion.');
      await loadDiscussionDetails(selectedDisc.id);
      await loadWorkspace();
    } catch (err) {
      setError(err.message || 'Failed to share intelligence record.');
    }
  };

  const handleUnshareRecord = async (sharedId) => {
    if (!window.confirm('Remove this shared intelligence record from the discussion?')) return;
    setError('');
    try {
      await apiService.unshareIntelligenceRecord(sharedId);
      await loadDiscussionDetails(selectedDisc.id);
    } catch (err) {
      setError(err.message || 'Failed to remove shared record.');
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiService.createInvestigationTask({
        ...newTask,
        discussionId: newTask.discussionId || null,
        dueDate: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : null,
      });
      setShowNewTaskModal(false);
      setNewTask({ title: '', description: '', assignedTo: '', priority: 'MEDIUM', dueDate: '', discussionId: '' });
      setActionMsg('Investigation task created and assigned.');
      await loadWorkspace();
    } catch (err) {
      setError(err.message || 'Failed to create investigation task.');
    }
  };

  const handleTaskStatus = async (taskId, status) => {
    setError('');
    try {
      await apiService.updateInvestigationTaskStatus(taskId, status);
      setActionMsg(`Task moved to ${status}.`);
      await loadWorkspace();
    } catch (err) {
      setError(err.message || 'Failed to update task status.');
    }
  };

  const handleTaskAssign = async (taskId, assignedTo) => {
    setError('');
    try {
      await apiService.assignInvestigationTask(taskId, assignedTo);
      setActionMsg('Task reassigned.');
      await loadWorkspace();
    } catch (err) {
      setError(err.message || 'Failed to reassign task.');
    }
  };

  const summary = overview?.summary || {};

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">
              Intelligence Collaboration & Team Workspace
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Coordinate geopolitical investigations, share verified intelligence records, and track team tasks in real time.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={loadWorkspace}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {canModify && (
            <>
              <button
                onClick={() => {
                  setNewTask((p) => ({ ...p, assignedTo: currentUser?.id || '', discussionId: selectedDisc?.id || '' }));
                  setShowNewTaskModal(true);
                }}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                New Task
              </button>
              <button
                onClick={() => setShowNewDiscModal(true)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                New Discussion
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-500/40 text-red-300 px-4 py-3 rounded-lg text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionMsg && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-lg text-xs flex items-center justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg('')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Overview KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Open Discussions', value: summary.openDiscussions ?? 0, color: 'text-cyan-400', icon: MessageSquare },
          { label: 'Total Discussions', value: summary.totalDiscussions ?? 0, color: 'text-white', icon: Users },
          { label: 'My Active Tasks', value: summary.myActiveTasks ?? 0, color: 'text-amber-400', icon: CheckSquare },
          { label: 'Overdue Tasks', value: summary.overdueTasks ?? 0, color: 'text-red-400', icon: AlertCircle },
          { label: 'Shared Records', value: summary.sharedRecords ?? 0, color: 'text-emerald-400', icon: Share2 },
          { label: 'Active Members', value: summary.activeTeamMembers ?? 0, color: 'text-sky-400', icon: Activity },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">{kpi.label}</p>
                <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              </div>
              <Icon className={`w-5 h-5 ${kpi.color} opacity-75`} />
            </div>
          );
        })}
      </div>

      {/* Workspace Sub-Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        {[
          { id: 'discussions', label: `Discussions (${discussions.length})` },
          { id: 'tasks', label: `Investigation Tasks (${tasks.length})` },
          { id: 'team', label: `Team Directory (${team.length})` },
          { id: 'activity', label: `Activity Timeline (${activity.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
              subTab === t.id
                ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: DISCUSSIONS */}
      {subTab === 'discussions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Discussion List */}
          <div className="lg:col-span-5 bg-slate-900/85 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search discussions..."
                  value={discSearch}
                  onChange={(e) => setDiscSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white"
                />
              </div>
              <select
                value={discStatus}
                onChange={(e) => setDiscStatus(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="ALL">All Status</option>
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
              <select
                value={discPriority}
                onChange={(e) => setDiscPriority(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="ALL">All Priority</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>

            {loading ? (
              <div className="py-10 text-center text-xs text-slate-400">Loading discussions...</div>
            ) : discussions.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                No intelligence discussions found. {canModify ? 'Create one to start collaborating.' : ''}
              </div>
            ) : (
              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {discussions.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDisc(d)}
                    className={`w-full text-left p-3.5 rounded-xl border transition ${
                      selectedDisc?.id === d.id
                        ? 'bg-cyan-950/30 border-cyan-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 text-[10px] rounded-full border font-semibold ${PRIORITY_BADGE[d.priority]}`}>
                          {d.priority}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] rounded-full border font-semibold ${STATUS_BADGE[d.status]}`}>
                          {d.status}
                        </span>
                        {d.visibility === 'PRIVATE' && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/15 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> PRIVATE
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">{d.id}</span>
                    </div>
                    <p className="text-sm font-semibold text-white line-clamp-1">{d.title}</p>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{d.description}</p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                      <span>By {d.creator?.username || 'User'}</span>
                      <span>
                        {d.commentCount} comments • {d.sharedCount} shared
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Discussion Detail, Shared Records & Threaded Comments */}
          <div className="lg:col-span-7 bg-slate-900/85 border border-slate-800 rounded-xl p-5 space-y-5">
            {!selectedDisc ? (
              <div className="py-16 text-center text-sm text-slate-400">
                Select an intelligence discussion to view details, shared records, and threaded comments.
              </div>
            ) : (
              <>
                {/* Discussion Header */}
                <div className="border-b border-slate-800 pb-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-cyan-400">{selectedDisc.id}</span>
                        <span className="text-xs text-slate-400">{selectedDisc.discussionType}</span>
                        {selectedDisc.countryId && (
                          <span className="px-2 py-0.5 text-[10px] rounded bg-slate-800 text-slate-200">
                            {selectedDisc.countryId}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-white mt-1">{selectedDisc.title}</h3>
                    </div>

                    {canModify && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={selectedDisc.status}
                          onChange={(e) => handleDiscussionStatus(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                        >
                          <option value="OPEN">OPEN</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="RESOLVED">RESOLVED</option>
                          <option value="CLOSED">CLOSED</option>
                        </select>
                        <select
                          value={selectedDisc.assignedTo || ''}
                          onChange={(e) => handleDiscussionAssign(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                        >
                          <option value="">Unassigned</option>
                          {team.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.fullName} ({m.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-line">{selectedDisc.description}</p>
                </div>

                {/* Shared Intelligence Records */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-cyan-400" />
                      Shared Intelligence Records ({sharedRecords.length})
                    </h4>
                    {canModify && (
                      <button
                        onClick={() => setShowShareModal(true)}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 flex items-center gap-1"
                      >
                        <Share2 className="w-3 h-3" /> Share Record
                      </button>
                    )}
                  </div>

                  {sharedRecords.length === 0 ? (
                    <p className="text-xs text-slate-500">No GRICC intelligence records linked yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {sharedRecords.map((rec) => (
                        <div
                          key={rec.id}
                          className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 flex flex-col justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-mono text-cyan-400">{rec.recordType}</span>
                              <span className="text-[10px] font-mono text-slate-500">{rec.recordId}</span>
                            </div>
                            <p className="text-xs font-semibold text-white mt-0.5">{rec.recordTitle}</p>
                            {rec.note && <p className="text-[11px] text-slate-400 mt-1">"{rec.note}"</p>}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                            <span>Shared by {rec.sharer?.username}</span>
                            <div className="flex items-center gap-2">
                              {onNavigateTab && (
                                <button
                                  onClick={() => onNavigateTab(rec.sourceModule)}
                                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                                >
                                  Open <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              )}
                              {canModify && (isAdmin || rec.sharedBy === currentUser?.id) && (
                                <button
                                  onClick={() => handleUnshareRecord(rec.id)}
                                  className="text-red-400 hover:text-red-300"
                                  title="Remove shared record"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Threaded Comments */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Discussion Thread ({comments.filter((c) => !c.isDeleted).length})
                  </h4>

                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {threadedComments.roots.length === 0 ? (
                      <p className="text-xs text-slate-500">No comments yet.</p>
                    ) : (
                      threadedComments.roots.map((cmt) => {
                        const replies = threadedComments.byParent.get(cmt.id) || [];
                        return (
                          <div key={cmt.id} className="space-y-2">
                            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-cyan-600/25 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold flex items-center justify-center">
                                    {initials(cmt.author)}
                                  </span>
                                  <span className="text-xs font-semibold text-white">{cmt.author?.username}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                    {cmt.author?.role}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500">
                                  {formatTime(cmt.createdAt)} {cmt.editedAt ? '(edited)' : ''}
                                </span>
                              </div>

                              {editingCommentId === cmt.id ? (
                                <div className="mt-2 flex gap-2">
                                  <input
                                    type="text"
                                    value={editingContent}
                                    onChange={(e) => setEditingContent(e.target.value)}
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                                  />
                                  <button
                                    onClick={() => handleSaveEditComment(cmt.id)}
                                    className="px-2.5 py-1 rounded bg-cyan-600 text-white text-xs"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingCommentId(null)}
                                    className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-200 mt-2">{renderMentionText(cmt.content)}</p>
                              )}

                              {!cmt.isDeleted && canModify && (
                                <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                                  <button
                                    onClick={() => setReplyTo(cmt)}
                                    className="hover:text-cyan-300 flex items-center gap-1"
                                  >
                                    <Reply className="w-3 h-3" /> Reply
                                  </button>
                                  {(isAdmin || cmt.userId === currentUser?.id) && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setEditingCommentId(cmt.id);
                                          setEditingContent(cmt.content);
                                        }}
                                        className="hover:text-amber-300 flex items-center gap-1"
                                      >
                                        <Edit3 className="w-3 h-3" /> Edit
                                      </button>
                                      <button
                                        onClick={() => handleDeleteComment(cmt.id)}
                                        className="hover:text-red-400 flex items-center gap-1"
                                      >
                                        <Trash2 className="w-3 h-3" /> Delete
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>

                            {replies.map((rep) => (
                              <div key={rep.id} className="ml-6 bg-slate-950/50 border border-slate-800/80 rounded-lg p-2.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-semibold text-cyan-300">
                                    @{rep.author?.username} ({rep.author?.role})
                                  </span>
                                  <span className="text-slate-500">{formatTime(rep.createdAt)}</span>
                                </div>
                                <p className="text-xs text-slate-300 mt-1">{renderMentionText(rep.content)}</p>
                              </div>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {canModify && (
                    <form onSubmit={handleAddComment} className="space-y-2">
                      {replyTo && (
                        <div className="flex items-center justify-between bg-slate-950 px-3 py-1.5 rounded text-xs text-cyan-300 border border-cyan-500/30">
                          <span>Replying to @{replyTo.author?.username}</span>
                          <button type="button" onClick={() => setReplyTo(null)}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Add intelligence comment... Use @username to mention a teammate"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="submit"
                          disabled={!commentText.trim()}
                          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" /> Post
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: INVESTIGATION TASKS */}
      {subTab === 'tasks' && (
        <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Investigation Task Board</h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value="ALL">All Statuses</option>
                <option value="TODO">TODO</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
              <select
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value="ALL">All Assignees</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-slate-300 px-2">
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(e) => setOverdueOnly(e.target.checked)}
                />
                Overdue only
              </label>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">No investigation tasks match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] uppercase text-slate-400">
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Task</th>
                    <th className="py-2.5 px-3">Assignee</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Due Date</th>
                    <th className="py-2.5 px-3">Discussion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {tasks.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full border font-semibold ${PRIORITY_BADGE[t.priority]}`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-white">{t.title}</p>
                        {t.description && <p className="text-slate-400 line-clamp-1">{t.description}</p>}
                      </td>
                      <td className="py-3 px-3">
                        {canModify && (isAdmin || t.assignedBy === currentUser?.id || t.assignedTo === currentUser?.id) ? (
                          <select
                            value={t.assignedTo}
                            onChange={(e) => handleTaskAssign(t.id, e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                          >
                            {team.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.username} ({m.role})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-300">{t.assignee?.username}</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {canModify && (isAdmin || t.assignedBy === currentUser?.id || t.assignedTo === currentUser?.id) ? (
                          <select
                            value={t.status}
                            onChange={(e) => handleTaskStatus(t.id, e.target.value)}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                          >
                            <option value="TODO">TODO</option>
                            <option value="IN_PROGRESS">IN_PROGRESS</option>
                            <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                            <option value="COMPLETED">COMPLETED</option>
                            <option value="CANCELLED">CANCELLED</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full border font-semibold ${STATUS_BADGE[t.status]}`}>
                            {t.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={t.isOverdue ? 'text-red-400 font-semibold' : 'text-slate-400'}>
                          {t.dueDate ? formatTime(t.dueDate) : 'No due date'}
                        </span>
                        {t.isOverdue && (
                          <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400 border border-red-500/40">
                            OVERDUE
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-cyan-400">{t.discussionId || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TEAM DIRECTORY */}
      {subTab === 'team' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {team.map((m) => (
            <div key={m.id} className="bg-slate-900/85 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 font-bold flex items-center justify-center">
                    {initials(m)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">
                      {m.fullName} {m.isCurrentUser ? '(You)' : ''}
                    </p>
                    <p className="text-xs text-slate-400">@{m.username} • {m.department}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
                  {m.role}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-center text-xs">
                <div>
                  <p className="text-slate-500 text-[10px]">Tasks</p>
                  <p className="font-bold text-white">{m.assignedTasksCount}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-[10px]">Investigations</p>
                  <p className="font-bold text-cyan-400">{m.openInvestigationsCount}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-[10px]">Status</p>
                  <p className={m.isActive ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {m.isActive ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: ACTIVITY TIMELINE */}
      {subTab === 'activity' && (
        <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Collaboration Activity Timeline</h3>
          {activity.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No collaboration activity recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {activity.map((act) => (
                <div key={act.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div>
                      <p className="text-slate-200">{act.summary}</p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {act.actionType} • {act.entityId}
                      </p>
                    </div>
                  </div>
                  <span className="text-slate-500 whitespace-nowrap">{formatTime(act.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: NEW DISCUSSION */}
      {showNewDiscModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateDiscussion}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">New Intelligence Discussion</h3>
              <button type="button" onClick={() => setShowNewDiscModal(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="Discussion title"
              value={newDisc.title}
              onChange={(e) => setNewDisc({ ...newDisc, title: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            />
            <textarea
              required
              rows={3}
              placeholder="Intelligence context & analytical objectives..."
              value={newDisc.description}
              onChange={(e) => setNewDisc({ ...newDisc, description: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newDisc.discussionType}
                onChange={(e) => setNewDisc({ ...newDisc, discussionType: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200"
              >
                {DISCUSSION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select
                value={newDisc.priority}
                onChange={(e) => setNewDisc({ ...newDisc, priority: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
              <select
                value={newDisc.visibility}
                onChange={(e) => setNewDisc({ ...newDisc, visibility: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="TEAM">TEAM (All Authorized)</option>
                <option value="PRIVATE">PRIVATE (Members Only)</option>
              </select>
              <select
                value={newDisc.assignedTo}
                onChange={(e) => setNewDisc({ ...newDisc, assignedTo: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="">Assign Lead (Optional)</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>{m.fullName}</option>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="Country (optional, e.g. Ukraine)"
              value={newDisc.countryId}
              onChange={(e) => setNewDisc({ ...newDisc, countryId: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewDiscModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold">
                Create Discussion
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: SHARE RECORD */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleShareRecord}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Share Intelligence Record</h3>
              <button type="button" onClick={() => setShowShareModal(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <select
              value={sharePayload.recordType}
              onChange={(e) => setSharePayload({ ...sharePayload, recordType: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
            >
              {RECORD_TYPES.map((rt) => (
                <option key={rt} value={rt}>{rt}</option>
              ))}
            </select>
            <input
              type="text"
              required
              placeholder="Record ID (e.g. INC-1001 or Ukraine)"
              value={sharePayload.recordId}
              onChange={(e) => setSharePayload({ ...sharePayload, recordId: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            />
            <input
              type="text"
              placeholder="Analyst note (optional)"
              value={sharePayload.note}
              onChange={(e) => setSharePayload({ ...sharePayload, note: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowShareModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold">
                Share to Discussion
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: NEW TASK */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTask}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Assign Investigation Task</h3>
              <button type="button" onClick={() => setShowNewTaskModal(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="Task title"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            />
            <textarea
              rows={2}
              placeholder="Task instructions..."
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                required
                value={newTask.assignedTo}
                onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="">Select Assignee</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>{m.fullName} ({m.role})</option>
                ))}
              </select>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="datetime-local"
                value={newTask.dueDate}
                onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
              />
              <select
                value={newTask.discussionId}
                onChange={(e) => setNewTask({ ...newTask, discussionId: e.target.value })}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="">No linked discussion</option>
                {discussions.map((d) => (
                  <option key={d.id} value={d.id}>{d.id}: {d.title.slice(0, 28)}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewTaskModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold">
                Create Task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

