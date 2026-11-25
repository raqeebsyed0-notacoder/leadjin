/**
 * Enhanced Jin Employee Dashboard
 * 
 * Complete UI for all Jin modules:
 * - Module 2: Extraction
 * - Module 3: Verification
 * - Module 4: Outreach
 * - Module 5: KPI & Work Log
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot,
  Activity,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
  Building2,
  User,
  Mail,
  Shield,
  TrendingUp,
  Briefcase,
  Phone,
  MapPin,
  Send,
  BarChart3,
  FileText,
  RefreshCw,
  Zap,
  Eye,
  Hand,
  Mic
} from 'lucide-react';

interface JinDashboardProps {
  authToken: string;
  isOpen: boolean;
  onToggle: () => void;
}

type TabType = 'overview' | 'extraction' | 'verification' | 'outreach' | 'kpi';

const JinEmployeeDashboard: React.FC<JinDashboardProps> = ({
  authToken,
  isOpen,
  onToggle
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [status, setStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionJobId, setExtractionJobId] = useState<string | null>(null);
  const [stakeholders, setStakeholders] = useState<any[]>([]);
  const [selectedStakeholder, setSelectedStakeholder] = useState<any>(null);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [outreachDraft, setOutreachDraft] = useState<any>(null);
  const [kpiReport, setKpiReport] = useState<any>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/jin/status', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('[Jin] Failed to fetch status:', error);
    }
  }, [authToken]);

  // Initial fetch
  useEffect(() => {
    if (authToken && isOpen) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [authToken, isOpen, fetchStatus]);

  // Handle extraction
  const handleStartExtraction = async () => {
    if (!domainInput.trim()) return;

    setIsExtracting(true);
    try {
      const response = await fetch('/api/jin/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          domain: domainInput.trim(),
          companyName: companyInput.trim() || undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        setExtractionJobId(data.jobId);
        setDomainInput('');
        setCompanyInput('');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to start extraction');
        setIsExtracting(false);
      }
    } catch (error: any) {
      console.error('[Jin] Extraction failed:', error);
      setIsExtracting(false);
    }
  };

  // Fetch stakeholders
  const fetchStakeholders = async (domain?: string) => {
    try {
      const url = domain 
        ? `/api/jin/stakeholders?domain=${encodeURIComponent(domain)}`
        : '/api/jin/stakeholders';
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStakeholders(data.stakeholders || []);
      }
    } catch (error) {
      console.error('[Jin] Failed to fetch stakeholders:', error);
    }
  };

  // Perform triple-check verification
  const performVerification = async (stakeholder: any) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/jin/verify/triple-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          stakeholderId: stakeholder.id,
          email: stakeholder.email,
          phone: stakeholder.phone,
          domain: stakeholder.domain,
          companyName: stakeholder.company,
          claimedLocation: 'Riyadh, Saudi Arabia' // Would come from stakeholder data
        })
      });

      if (response.ok) {
        const result = await response.json();
        setVerificationResult(result);
      }
    } catch (error) {
      console.error('[Jin] Verification failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Generate outreach
  const generateOutreach = async (stakeholder: any) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/jin/outreach/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          stakeholder,
          sender: {
            companyName: 'Euphoria Vision',
            services: ['AI Solutions', 'Digital Transformation', 'Strategic Consulting']
          },
          context: {
            targetIndustry: 'Technology',
            majlisMode: true
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        setOutreachDraft(result);
      }
    } catch (error) {
      console.error('[Jin] Outreach generation failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch KPI report
  const fetchKPIReport = async () => {
    try {
      const response = await fetch('/api/jin/kpi/report?period=weekly', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setKpiReport(data);
      }
    } catch (error) {
      console.error('[Jin] Failed to fetch KPI:', error);
    }
  };

  if (!isOpen) {
    return (
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-full shadow-2xl hover:shadow-emerald-500/20 transition-all"
      >
        <Bot className="w-5 h-5" />
        <span className="text-sm font-medium">Jin</span>
        {status?.employee?.status === 'working' && (
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
        )}
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-4 right-4 z-50 w-[600px] max-h-[80vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold">Jin</h3>
              <p className="text-xs text-white/70">Regional Intelligence Specialist</p>
            </div>
          </div>
          <button onClick={onToggle} className="p-1 hover:bg-white/20 rounded-lg">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        {/* Status Badge */}
        <div className="mt-3 flex items-center gap-4">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            status?.employee?.status === 'working'
              ? 'bg-amber-500 text-white'
              : 'bg-emerald-500 text-white'
          }`}>
            {status?.employee?.status === 'working' ? 'Working' : 'Available'}
          </span>
          {status?.metrics && (
            <span className="text-xs text-white/70">
              {status.metrics.verifiedContacts} verified contacts
            </span>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        {[
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'extraction', label: 'Extract', icon: Eye },
          { id: 'verification', label: 'Verify', icon: Shield },
          { id: 'outreach', label: 'Outreach', icon: Mic },
          { id: 'kpi', label: 'Analytics', icon: BarChart3 }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-emerald-600 border-b-2 border-emerald-600'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Current Tasks */}
            {status?.employee?.currentTasks?.length > 0 && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-2">
                  Currently Working On
                </p>
                {status.employee.currentTasks.map((task: any) => (
                  <div key={task.jobId} className="flex items-center gap-2 text-sm">
                    <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                    <span className="text-zinc-700 dark:text-zinc-300">{task.domain}</span>
                    <span className="text-xs text-zinc-500">({task.progress}%)</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                <p className="text-2xl font-semibold text-zinc-900 dark:text-white">
                  {status?.metrics?.totalStakeholders || 0}
                </p>
                <p className="text-xs text-zinc-500">Stakeholders Found</p>
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                <p className="text-2xl font-semibold text-emerald-600">
                  {status?.metrics?.totalVerified || 0}
                </p>
                <p className="text-xs text-zinc-500">Verified Contacts</p>
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                <p className="text-2xl font-semibold text-zinc-900 dark:text-white">
                  {status?.metrics?.totalOutreachSent || 0}
                </p>
                <p className="text-xs text-zinc-500">Outreach Sent</p>
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                <p className="text-2xl font-semibold text-zinc-900 dark:text-white">
                  {status?.metrics?.avgVision2030Alignment || 0}%
                </p>
                <p className="text-xs text-zinc-500">Avg V2030 Alignment</p>
              </div>
            </div>

            {/* Recent Work Log */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Recent Activity
              </h4>
              <div className="space-y-2">
                {status?.workLog?.slice(0, 5).map((entry: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    {entry.status === 'success' ? (
                      <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5" />
                    ) : entry.status === 'error' ? (
                      <AlertCircle className="w-3 h-3 text-red-500 mt-0.5" />
                    ) : (
                      <Activity className="w-3 h-3 text-blue-400 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-900 dark:text-white">
                        {entry.action}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">{entry.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Extraction Tab */}
        {activeTab === 'extraction' && (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
              <h4 className="text-sm font-medium text-zinc-900 dark:text-white mb-3">
                New Extraction
              </h4>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Company domain (e.g., aramco.com)"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  disabled={isExtracting}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Company name (optional)"
                  value={companyInput}
                  onChange={(e) => setCompanyInput(e.target.value)}
                  disabled={isExtracting}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={handleStartExtraction}
                  disabled={!domainInput.trim() || isExtracting}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 text-white rounded-lg text-sm font-medium"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Find Stakeholders
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Recent Stakeholders */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-zinc-900 dark:text-white">
                  Recent Stakeholders
                </h4>
                <button
                  onClick={() => fetchStakeholders()}
                  className="text-xs text-emerald-600 hover:text-emerald-700"
                >
                  Refresh
                </button>
              </div>
              <div className="space-y-2">
                {stakeholders.slice(0, 5).map((stakeholder: any) => (
                  <div
                    key={stakeholder.stakeholder_id}
                    className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-100"
                    onClick={() => setSelectedStakeholder(stakeholder)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-white">
                          {stakeholder.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {stakeholder.title} at {stakeholder.company}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        stakeholder.verified
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {stakeholder.verified ? 'Verified' : 'Unverified'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Verification Tab */}
        {activeTab === 'verification' && (
          <div className="space-y-4">
            {selectedStakeholder ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-zinc-900 dark:text-white">
                    {selectedStakeholder.name}
                  </h4>
                  <button
                    onClick={() => setSelectedStakeholder(null)}
                    className="text-xs text-zinc-500 hover:text-zinc-700"
                  >
                    Back
                  </button>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                  <p className="text-xs text-zinc-500 mb-1">Email</p>
                  <p className="text-sm text-zinc-900 dark:text-white">
                    {selectedStakeholder.email || 'Not found'}
                  </p>
                  {selectedStakeholder.email_verified && (
                    <span className="text-xs text-emerald-600">✓ Verified</span>
                  )}
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                  <p className="text-xs text-zinc-500 mb-1">Phone</p>
                  <p className="text-sm text-zinc-900 dark:text-white">
                    {selectedStakeholder.phone || 'Not found'}
                  </p>
                </div>

                <button
                  onClick={() => performVerification(selectedStakeholder)}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 text-white rounded-lg text-sm font-medium"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Shield className="w-4 h-4" />
                  )}
                  Run Triple-Check Verification
                </button>

                {verificationResult && (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                    <h5 className="text-sm font-medium text-emerald-800 dark:text-emerald-400 mb-2">
                      Verification Result
                    </h5>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-600">Overall Status</span>
                        <span className={`text-xs font-medium px-2 py-1 rounded ${
                          verificationResult.overallStatus === 'verified'
                            ? 'bg-emerald-100 text-emerald-700'
                            : verificationResult.overallStatus === 'partial'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {verificationResult.overallStatus}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-600">Verification Score</span>
                        <span className="text-sm font-medium text-zinc-900">
                          {verificationResult.verificationScore}/100
                        </span>
                      </div>
                      {verificationResult.email && (
                        <div className="text-xs text-zinc-600">
                          Email: {verificationResult.email.deliverable ? '✓ Deliverable' : '✗ Not deliverable'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-500">
                <Shield className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a stakeholder to verify</p>
                <button
                  onClick={() => fetchStakeholders()}
                  className="mt-2 text-emerald-600 hover:text-emerald-700 text-sm"
                >
                  Load Stakeholders
                </button>
              </div>
            )}
          </div>
        )}

        {/* Outreach Tab */}
        {activeTab === 'outreach' && (
          <div className="space-y-4">
            {selectedStakeholder ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-zinc-900 dark:text-white">
                    Draft Outreach for {selectedStakeholder.name}
                  </h4>
                  <button
                    onClick={() => setSelectedStakeholder(null)}
                    className="text-xs text-zinc-500 hover:text-zinc-700"
                  >
                    Back
                  </button>
                </div>

                <button
                  onClick={() => generateOutreach(selectedStakeholder)}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 text-white rounded-lg text-sm font-medium"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Generate Strategic Outreach
                </button>

                {outreachDraft && (
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl space-y-3">
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Subject</p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">
                        {outreachDraft.subject}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Body</p>
                      <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {outreachDraft.body}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                      <span className="text-xs text-zinc-500">V2030 Alignment:</span>
                      <span className="text-xs font-medium text-emerald-600">
                        {outreachDraft.vision2030Alignment}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-500">
                <Send className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a stakeholder to draft outreach</p>
                <button
                  onClick={() => fetchStakeholders()}
                  className="mt-2 text-emerald-600 hover:text-emerald-700 text-sm"
                >
                  Load Stakeholders
                </button>
              </div>
            )}
          </div>
        )}

        {/* KPI Tab */}
        {activeTab === 'kpi' && (
          <div className="space-y-4">
            <button
              onClick={fetchKPIReport}
              className="text-xs text-emerald-600 hover:text-emerald-700"
            >
              Load Weekly Report
            </button>

            {kpiReport ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                    <p className="text-lg font-semibold text-zinc-900 dark:text-white">
                      {kpiReport.metrics.totalStakeholdersDiscovered}
                    </p>
                    <p className="text-xs text-zinc-500">Stakeholders Discovered</p>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                    <p className="text-lg font-semibold text-zinc-900 dark:text-white">
                      {kpiReport.metrics.verificationRate}%
                    </p>
                    <p className="text-xs text-zinc-500">Verification Rate</p>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                    <p className="text-lg font-semibold text-zinc-900 dark:text-white">
                      {kpiReport.metrics.responseRate}%
                    </p>
                    <p className="text-xs text-zinc-500">Response Rate</p>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                    <p className="text-lg font-semibold text-zinc-900 dark:text-white">
                      {kpiReport.metrics.meetingsBooked}
                    </p>
                    <p className="text-xs text-zinc-500">Meetings Booked</p>
                  </div>
                </div>

                {kpiReport.topPerformingIndustries?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                      Top Industries
                    </h5>
                    <div className="space-y-2">
                      {kpiReport.topPerformingIndustries.map((ind: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg"
                        >
                          <span className="text-sm text-zinc-900 dark:text-white">
                            {ind.industry}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {ind.stakeholderCount} stakeholders
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-500">
                <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Load a report to view analytics</p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export { JinEmployeeDashboard };
export default JinEmployeeDashboard;
