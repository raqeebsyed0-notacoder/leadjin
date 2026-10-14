/**
 * Jin Employee Status Component
 * 
 * Displays Jin's current status, work log, and provides controls
 * for starting stakeholder extractions.
 * 
 * This component integrates seamlessly into the existing dashboard
 * without changing the layout - it appears as a collapsible panel.
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
  Briefcase
} from 'lucide-react';

interface JinWorkLogEntry {
  timestamp: string;
  action: string;
  details: string;
  status: 'info' | 'success' | 'warning' | 'error';
}

interface JinJob {
  jobId: string;
  domain: string;
  status: string;
  progress: number;
  stakeholders: any[];
  workLog: JinWorkLogEntry[];
}

interface JinStatus {
  employee: {
    name: string;
    role: string;
    status: 'working' | 'available' | 'idle';
    currentTasks: Array<{
      jobId: string;
      domain: string;
      status: string;
      progress: number;
    }>;
  };
  metrics: {
    totalExtractions: number;
    stakeholdersFound: number;
    verifiedContacts: number;
  };
  workLog: JinWorkLogEntry[];
}

interface JinEmployeeStatusProps {
  isOpen: boolean;
  onToggle: () => void;
  authToken: string;
}

export const JinEmployeeStatus: React.FC<JinEmployeeStatusProps> = ({
  isOpen,
  onToggle,
  authToken
}) => {
  const [status, setStatus] = useState<JinStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionJobId, setExtractionJobId] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

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

  // Initial fetch and polling
  useEffect(() => {
    if (authToken) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 5000);
      setPollingInterval(interval);
      return () => clearInterval(interval);
    }
  }, [authToken, fetchStatus]);

  // Poll specific job if extracting
  useEffect(() => {
    if (extractionJobId && isExtracting) {
      const jobInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/jin/jobs/${extractionJobId}`, {
            headers: { Authorization: `Bearer ${authToken}` }
          });
          if (response.ok) {
            const job = await response.json();
            if (job.status === 'completed' || job.status === 'failed') {
              setIsExtracting(false);
              setExtractionJobId(null);
              fetchStatus();
            }
          }
        } catch (error) {
          console.error('[Jin] Failed to fetch job status:', error);
        }
      }, 3000);
      return () => clearInterval(jobInterval);
    }
  }, [extractionJobId, isExtracting, authToken, fetchStatus]);

  const handleStartExtraction = async () => {
    if (!domainInput.trim()) return;
    
    setIsExtracting(true);
    setIsLoading(true);
    
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
    } catch (error) {
      console.error('[Jin] Extraction failed:', error);
      setIsExtracting(false);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working': return <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />;
      case 'available': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getLogIcon = (status: JinWorkLogEntry['status']) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-3 h-3 text-emerald-500" />;
      case 'warning': return <AlertCircle className="w-3 h-3 text-amber-500" />;
      case 'error': return <AlertCircle className="w-3 h-3 text-red-500" />;
      default: return <Activity className="w-3 h-3 text-blue-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-emerald-500';
      case 'failed': return 'text-red-500';
      case 'scanning':
      case 'extracting':
      case 'verifying': return 'text-amber-500';
      default: return 'text-blue-400';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Collapsed State - Floating Action Button */}
      {!isOpen && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggle}
          className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-full shadow-2xl hover:shadow-emerald-500/20 transition-all"
        >
          <Bot className="w-5 h-5" />
          <span className="text-sm font-medium">Jin</span>
          {status?.employee.status === 'working' && (
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          )}
        </motion.button>
      )}

      {/* Expanded State - Full Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-96 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
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
                <div className="flex items-center gap-2">
                  {getStatusIcon(status?.employee.status || 'idle')}
                  <button
                    onClick={onToggle}
                    className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Current Status */}
              {status?.employee.currentTasks && status.employee.currentTasks.length > 0 && (
                <div className="mt-3 p-3 bg-white/10 rounded-xl">
                  <p className="text-xs text-white/70 mb-1">Currently working on:</p>
                  {status.employee.currentTasks.map((task) => (
                    <div key={task.jobId} className="flex items-center gap-2 text-sm">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="truncate">{task.domain}</span>
                      <span className="text-xs text-white/60">({task.progress}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Metrics */}
            {status?.metrics && (
              <div className="grid grid-cols-3 gap-px bg-zinc-200 dark:bg-zinc-800">
                <div className="p-3 bg-white dark:bg-zinc-900 text-center">
                  <p className="text-lg font-semibold text-zinc-900 dark:text-white">
                    {status.metrics.totalExtractions}
                  </p>
                  <p className="text-xs text-zinc-500">Extractions</p>
                </div>
                <div className="p-3 bg-white dark:bg-zinc-900 text-center">
                  <p className="text-lg font-semibold text-zinc-900 dark:text-white">
                    {status.metrics.stakeholdersFound}
                  </p>
                  <p className="text-xs text-zinc-500">Found</p>
                </div>
                <div className="p-3 bg-white dark:bg-zinc-900 text-center">
                  <p className="text-lg font-semibold text-emerald-600">
                    {status.metrics.verifiedContacts}
                  </p>
                  <p className="text-xs text-zinc-500">Verified</p>
                </div>
              </div>
            )}

            {/* Quick Extract */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Quick Extraction
              </h4>
              <div className="space-y-2">
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Company domain (e.g., aramco.com)"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    disabled={isExtracting}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Company name (optional)"
                    value={companyInput}
                    onChange={(e) => setCompanyInput(e.target.value)}
                    disabled={isExtracting}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  onClick={handleStartExtraction}
                  disabled={!domainInput.trim() || isExtracting}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
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

            {/* Work Log */}
            <div className="max-h-64 overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-zinc-900 p-3 border-b border-zinc-200 dark:border-zinc-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Recent Activity
                </h4>
              </div>
              <div className="p-3 space-y-2">
                {status?.workLog && status.workLog.length > 0 ? (
                  status.workLog.map((entry, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-start gap-2 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="mt-0.5">{getLogIcon(entry.status)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-900 dark:text-white">
                          {entry.action}
                        </p>
                        <p className="text-xs text-zinc-500 truncate">{entry.details}</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <p className="text-xs text-zinc-400 text-center py-4">
                    No recent activity
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800">
              <p className="text-xs text-zinc-400 text-center">
                Jin uses Gemini 1.5 Pro for regional intelligence
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default JinEmployeeStatus;
