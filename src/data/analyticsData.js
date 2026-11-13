/**
 * GRICC Risk Analytics Data (Phase 5)
 *
 * NOTE: All trends, distributions, and comparative risk metrics are simulated
 * DEMO DATA for dashboard visual testing and evaluation purposes only.
 */

// 12-Month Historical Trend Data
export const monthlyRiskTrend = [
  { month: 'Nov 25', score: 42, incidents: 14, critical: 2, high: 4, medium: 5, low: 3 },
  { month: 'Dec 25', score: 45, incidents: 18, critical: 3, high: 5, medium: 6, low: 4 },
  { month: 'Jan 26', score: 51, incidents: 22, critical: 4, high: 6, medium: 7, low: 5 },
  { month: 'Feb 26', score: 48, incidents: 19, critical: 3, high: 5, medium: 6, low: 5 },
  { month: 'Mar 26', score: 55, incidents: 25, critical: 5, high: 8, medium: 7, low: 5 },
  { month: 'Apr 26', score: 53, incidents: 21, critical: 3, high: 7, medium: 6, low: 5 },
  { month: 'May 26', score: 59, incidents: 28, critical: 6, high: 9, medium: 8, low: 5 },
  { month: 'Jun 26', score: 64, incidents: 32, critical: 7, high: 10, medium: 9, low: 6 },
  { month: 'Jul 26', score: 61, incidents: 29, critical: 5, high: 9, medium: 9, low: 6 },
  { month: 'Aug 26', score: 58, incidents: 26, critical: 4, high: 8, medium: 8, low: 6 },
  { month: 'Sep 26', score: 66, incidents: 35, critical: 8, high: 11, medium: 10, low: 6 },
  { month: 'Oct 26', score: 63, incidents: 31, critical: 6, high: 10, medium: 9, low: 6 },
];

// Country Risk Comparison Data
export const countryRiskComparison = [
  { country: 'United States', score: 78, level: 'High', incidents: 38 },
  { country: 'Brazil', score: 58, level: 'Medium', incidents: 24 },
  { country: 'India', score: 48, level: 'Medium', incidents: 29 },
  { country: 'United Arab Emirates', score: 44, level: 'Medium', incidents: 18 },
  { country: 'United Kingdom', score: 28, level: 'Low', incidents: 15 },
  { country: 'Japan', score: 22, level: 'Low', incidents: 12 },
  { country: 'Singapore', score: 19, level: 'Low', incidents: 10 },
  { country: 'Germany', score: 32, level: 'Low', incidents: 14 },
  { country: 'Australia', score: 25, level: 'Low', incidents: 11 },
];

// Incident Categories (Required: Geopolitical, Terrorism, Natural Disaster, Cybersecurity, Civil Unrest, Health Emergency)
export const initialCategoryAnalysis = [
  { category: 'Cybersecurity', count: 48, percentage: 31, color: '#38bdf8' },
  { category: 'Geopolitical', count: 36, percentage: 23, color: '#f59e0b' },
  { category: 'Natural Disaster', count: 28, percentage: 18, color: '#10b981' },
  { category: 'Civil Unrest', count: 21, percentage: 14, color: '#ec4899' },
  { category: 'Terrorism', count: 14, percentage: 9, color: '#ef4444' },
  { category: 'Health Emergency', count: 8, percentage: 5, color: '#a855f7' },
];

// Risk Distribution Breakdown
export const initialRiskDistribution = [
  { name: 'Critical', value: 24, color: '#ef4444' },
  { name: 'High', value: 45, color: '#f97316' },
  { name: 'Medium', value: 58, color: '#eab308' },
  { name: 'Low', value: 28, color: '#10b981' },
];

// Incident Status Breakdown (Required: Open, Investigating, Contained, Resolved)
export const initialStatusAnalysis = [
  { status: 'Open', count: 34, color: '#38bdf8' },
  { status: 'Investigating', count: 42, color: '#f59e0b' },
  { status: 'Contained', count: 29, color: '#818cf8' },
  { status: 'Resolved', count: 50, color: '#10b981' },
];

// Comprehensive Raw Analytics Sample Records to power dynamic filters
export const rawAnalyticsIncidents = [
  { id: 'AN-101', country: 'United States', category: 'Cybersecurity', severity: 'Critical', status: 'Investigating', score: 85, date: '2026-10-24' },
  { id: 'AN-102', country: 'United States', category: 'Natural Disaster', severity: 'High', status: 'Contained', score: 76, date: '2026-10-18' },
  { id: 'AN-103', country: 'United States', category: 'Geopolitical', severity: 'Medium', status: 'Resolved', score: 62, date: '2026-09-12' },
  { id: 'AN-104', country: 'United States', category: 'Civil Unrest', severity: 'High', status: 'Open', score: 74, date: '2026-10-29' },
  { id: 'AN-105', country: 'Brazil', category: 'Natural Disaster', severity: 'High', status: 'Open', score: 71, date: '2026-10-21' },
  { id: 'AN-106', country: 'Brazil', category: 'Civil Unrest', severity: 'Medium', status: 'Investigating', score: 55, date: '2026-09-15' },
  { id: 'AN-107', country: 'Brazil', category: 'Cybersecurity', severity: 'Medium', status: 'Resolved', score: 48, date: '2026-08-04' },
  { id: 'AN-108', country: 'India', category: 'Geopolitical', severity: 'Medium', status: 'Contained', score: 52, date: '2026-10-11' },
  { id: 'AN-109', country: 'India', category: 'Cybersecurity', severity: 'High', status: 'Investigating', score: 68, date: '2026-10-02' },
  { id: 'AN-110', country: 'India', category: 'Natural Disaster', severity: 'Medium', status: 'Resolved', score: 45, date: '2026-07-22' },
  { id: 'AN-111', country: 'India', category: 'Terrorism', severity: 'Critical', status: 'Contained', score: 88, date: '2026-09-08' },
  { id: 'AN-112', country: 'United Arab Emirates', category: 'Geopolitical', severity: 'Medium', status: 'Investigating', score: 49, date: '2026-10-19' },
  { id: 'AN-113', country: 'United Arab Emirates', category: 'Cybersecurity', severity: 'Low', status: 'Resolved', score: 25, date: '2026-08-14' },
  { id: 'AN-114', country: 'United Arab Emirates', category: 'Civil Unrest', severity: 'Low', status: 'Resolved', score: 22, date: '2026-06-10' },
  { id: 'AN-115', country: 'United Kingdom', category: 'Cybersecurity', severity: 'Low', status: 'Resolved', score: 28, date: '2026-10-05' },
  { id: 'AN-116', country: 'United Kingdom', category: 'Health Emergency', severity: 'Medium', status: 'Contained', score: 41, date: '2026-07-16' },
  { id: 'AN-117', country: 'United Kingdom', category: 'Civil Unrest', severity: 'Low', status: 'Resolved', score: 24, date: '2026-05-30' },
  { id: 'AN-118', country: 'Japan', category: 'Natural Disaster', severity: 'Low', status: 'Resolved', score: 26, date: '2026-10-14' },
  { id: 'AN-119', country: 'Japan', category: 'Cybersecurity', severity: 'Low', status: 'Resolved', score: 20, date: '2026-09-20' },
  { id: 'AN-120', country: 'Singapore', category: 'Cybersecurity', severity: 'Low', status: 'Resolved', score: 21, date: '2026-10-10' },
  { id: 'AN-121', country: 'Singapore', category: 'Geopolitical', severity: 'Low', status: 'Contained', score: 23, date: '2026-08-28' },
  { id: 'AN-122', country: 'Germany', category: 'Cybersecurity', severity: 'Medium', status: 'Investigating', score: 46, date: '2026-10-22' },
  { id: 'AN-123', country: 'Germany', category: 'Terrorism', severity: 'High', status: 'Contained', score: 72, date: '2026-09-04' },
  { id: 'AN-124', country: 'Australia', category: 'Natural Disaster', severity: 'Low', status: 'Resolved', score: 29, date: '2026-10-01' },
];
