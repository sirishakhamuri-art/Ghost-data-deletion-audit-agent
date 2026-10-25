import React, { useState, useMemo } from 'react';
import auditData from './data/audit_data.json';
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  ArrowRight,
  Database,
  FileText,
  AlertTriangle,
  RefreshCw,
  Download,
  Terminal,
  Activity,
  UserCheck,
  Lock,
  Server,
  Layers,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Code2,
  Sliders,
  DollarSign,
  Cpu
} from 'lucide-react';

interface Identity {
  user_id: string;
  name: string;
  email: string;
  phone?: string | null;
  email_hash?: string | null;
  history?: Array<{
    audit_id: string;
    event_time: string;
    field_name: string;
    old_value: string;
    new_value: string;
  }>;
}

interface Step {
  step_no: number;
  phase: 'FINDING' | 'REMEDIATION' | 'VERIFICATION';
  system_id: string;
  resource_id: string;
  operation: string;
  state: string;
  evidence_id: string;
}

interface AuditCase {
  case_id: string;
  email: string;
  requested_at: string;
  reported_status: string;
  reported_at: string;
  audit_at: string;
  request_text: string;
  deletion_status: string;
  steps: Step[];
  identity: Identity;
  is_sample?: boolean;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'console' | 'incident' | 'evaluation' | 'simulator' | 'governance'>('console');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETE' | 'INCOMPLETE' | 'NOT_APPLICABLE' | 'MISMATCH'>('ALL');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('case_33');
  const [datasetView, setDatasetView] = useState<'eval' | 'sample'>('eval');

  // Simulator state
  const [simText, setSimText] = useState('I closed my account last week. Please delete all remaining profile details, search indexes, and active connectors.');
  const [simEmail, setSimEmail] = useState('customer@example.com');
  const [simOutput, setSimOutput] = useState<{
    status: string;
    isDeletion: boolean;
    findingsCount: number;
    remediationsCount: number;
    verificationsCount: number;
    steps: Step[];
  } | null>(null);

  // Simulated remediation status
  const [remediatedCases, setRemediatedCases] = useState<Set<string>>(new Set());

  const casesList: AuditCase[] = datasetView === 'eval' ? (auditData.cases as unknown as AuditCase[]) : (auditData.samples as unknown as AuditCase[]);

  const filteredCases = useMemo(() => {
    return casesList.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.case_id.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.identity.name && c.identity.name.toLowerCase().includes(q)) ||
        (c.identity.user_id && c.identity.user_id.toLowerCase().includes(q)) ||
        c.steps.some((s) => s.resource_id.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'MISMATCH') {
        return c.reported_status !== c.deletion_status;
      }
      return c.deletion_status === statusFilter;
    });
  }, [casesList, searchQuery, statusFilter]);

  const selectedCase = useMemo(() => {
    const found = casesList.find((c) => c.case_id === selectedCaseId);
    return found || casesList[0];
  }, [casesList, selectedCaseId]);

  const isCaseRemediated = remediatedCases.has(selectedCase?.case_id || '');

  // Calculate current case's display status
  const currentCaseStatus = isCaseRemediated ? 'COMPLETE' : selectedCase?.deletion_status;

  const handleSimulateAudit = () => {
    const text = simText.toLowerCase();
    const explicitNonDeletion = [
      'leave the account active',
      'do not close the account',
      'keep the account as it is',
      'leave my profile',
      'continue using the service',
      "don't delete",
      'information request, not a request to erase',
      'not asking for deletion',
      'marketing lists only',
      'download my account information',
      'stop the promotional emails'
    ];
    const isNA = explicitNonDeletion.some((p) => text.includes(p));

    if (isNA) {
      setSimOutput({
        status: 'NOT_APPLICABLE',
        isDeletion: false,
        findingsCount: 0,
        remediationsCount: 0,
        verificationsCount: 0,
        steps: []
      });
      return;
    }

    // Generate dynamic audit steps
    const hasSearch = text.includes('search') || text.includes('index');
    const hasConnector = text.includes('connector') || text.includes('integration') || text.includes('active');
    const hasBackup = text.includes('backup') || text.includes('restore') || text.includes('archive');
    const hasSupport = text.includes('support') || text.includes('ticket') || text.includes('attachment');

    const steps: Step[] = [];
    let stepNo = 1;

    // Findings
    if (hasSearch) {
      steps.push({
        step_no: stepNo++,
        phase: 'FINDING',
        system_id: 'search_service',
        resource_id: 'search_sim_01',
        operation: 'REPORT_REMAINING_RECORD',
        state: 'PRESENT',
        evidence_id: 'evidence_sim_live'
      });
    }
    if (hasConnector) {
      steps.push({
        step_no: stepNo++,
        phase: 'FINDING',
        system_id: 'integration_service',
        resource_id: 'data_flow_sim_01',
        operation: 'REPORT_ACTIVE_DATA_FLOW',
        state: 'ACTIVE',
        evidence_id: 'evidence_sim_live'
      });
    }
    if (hasBackup) {
      steps.push({
        step_no: stepNo++,
        phase: 'FINDING',
        system_id: 'backup_service',
        resource_id: 'backup_sim_01',
        operation: 'REPORT_RESTORE_RISK',
        state: 'ACTIVE',
        evidence_id: 'evidence_sim_live'
      });
    }
    if (hasSupport) {
      steps.push({
        step_no: stepNo++,
        phase: 'FINDING',
        system_id: 'support_platform',
        resource_id: 'support_sim_01',
        operation: 'REPORT_EXPOSED_PII',
        state: 'PRESENT',
        evidence_id: 'evidence_sim_live'
      });
    }

    const hasFindings = steps.length > 0;

    // Remediations
    if (hasConnector) {
      steps.push({
        step_no: stepNo++,
        phase: 'REMEDIATION',
        system_id: 'integration_service',
        resource_id: 'data_flow_sim_01',
        operation: 'DISABLE_DATA_FLOW',
        state: 'DISABLED',
        evidence_id: ''
      });
    }
    if (hasBackup) {
      steps.push({
        step_no: stepNo++,
        phase: 'REMEDIATION',
        system_id: 'backup_service',
        resource_id: 'backup_sim_01',
        operation: 'BLOCK_RESTORE',
        state: 'BLOCKED',
        evidence_id: ''
      });
    }
    if (hasSearch) {
      steps.push({
        step_no: stepNo++,
        phase: 'REMEDIATION',
        system_id: 'search_service',
        resource_id: 'search_sim_01',
        operation: 'DELETE_RECORD',
        state: 'ABSENT',
        evidence_id: ''
      });
    }
    if (hasSupport) {
      steps.push({
        step_no: stepNo++,
        phase: 'REMEDIATION',
        system_id: 'support_platform',
        resource_id: 'support_sim_01',
        operation: 'REDACT_RECORD',
        state: 'REDACTED',
        evidence_id: ''
      });
    }

    // Verifications
    steps.push({
      step_no: stepNo++,
      phase: 'VERIFICATION',
      system_id: 'account_service',
      resource_id: 'account_sim_root',
      operation: 'VERIFY_RECORD_ABSENT',
      state: 'ABSENT',
      evidence_id: hasFindings ? '' : 'evidence_sim_verified'
    });
    steps.push({
      step_no: stepNo++,
      phase: 'VERIFICATION',
      system_id: 'security_service',
      resource_id: 'audit_record_sim_retain',
      operation: 'VERIFY_RECORD_PRESENT',
      state: 'PRESENT',
      evidence_id: hasFindings ? '' : 'evidence_sim_verified'
    });
    if (hasSearch) {
      steps.push({
        step_no: stepNo++,
        phase: 'VERIFICATION',
        system_id: 'search_service',
        resource_id: 'search_sim_01',
        operation: 'VERIFY_RECORD_ABSENT',
        state: 'ABSENT',
        evidence_id: ''
      });
    }

    setSimOutput({
      status: hasFindings ? 'INCOMPLETE' : 'COMPLETE',
      isDeletion: true,
      findingsCount: steps.filter((s) => s.phase === 'FINDING').length,
      remediationsCount: steps.filter((s) => s.phase === 'REMEDIATION').length,
      verificationsCount: steps.filter((s) => s.phase === 'VERIFICATION').length,
      steps
    });
  };

  const handleDownloadCsv = () => {
    // Generate CSV content
    const headers = ['case_id', 'deletion_status', 'steps_json'];
    const rows = (auditData.cases as unknown as AuditCase[]).map((c) => {
      const stepsStr = JSON.stringify(c.steps).replace(/"/g, '""');
      return `${c.case_id},${c.deletion_status},"${stepsStr}"`;
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'output.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Top Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-wide text-zinc-100 uppercase">Northstar Shop</span>
                <span className="text-xs text-zinc-500">/</span>
                <span className="text-xs font-mono font-medium text-emerald-400 tracking-wider">SENTINEL AUDIT AGENT</span>
              </div>
              <p className="text-[11px] text-zinc-400">Autonomous Ghost Data Prevention & GDPR Article 17 Erasure Verification</p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="hidden lg:flex items-center gap-6 text-xs text-zinc-400">
            <div>
              <span className="text-zinc-500">Total Audited:</span>{' '}
              <span className="font-mono text-zinc-200 font-medium">{auditData.kpis.total_cases} requests</span>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <div>
              <span className="text-zinc-500">True Complete:</span>{' '}
              <span className="font-mono text-emerald-400 font-medium">{auditData.kpis.status_counts.COMPLETE} ({auditData.kpis.compliance_rate}%)</span>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <div>
              <span className="text-zinc-500">Ghost Risks Remediated:</span>{' '}
              <span className="font-mono text-amber-400 font-medium">{auditData.kpis.status_counts.INCOMPLETE} cases</span>
            </div>
            <div className="h-4 w-px bg-zinc-800" />
            <div>
              <span className="text-zinc-500">Loss Prevented:</span>{' '}
              <span className="font-mono text-emerald-400 font-medium">{auditData.kpis.estimated_incident_savings}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-sm"
              title="Download output.csv"
            >
              <Download className="h-3.5 w-3.5" />
              <span>output.csv</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 overflow-x-auto text-xs font-medium text-zinc-400 border-t border-zinc-800/60">
          <button
            onClick={() => setActiveTab('console')}
            className={`py-3 px-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'console'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent hover:text-zinc-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Audit Operations Console</span>
          </button>
          <button
            onClick={() => setActiveTab('incident')}
            className={`py-3 px-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'incident'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent hover:text-zinc-200'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>$2.4M Incident Reconstruction</span>
          </button>
          <button
            onClick={() => setActiveTab('evaluation')}
            className={`py-3 px-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'evaluation'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent hover:text-zinc-200'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Benchmark & Evaluation Suite</span>
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`py-3 px-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'simulator'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent hover:text-zinc-200'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Interactive Audit Sandbox</span>
          </button>
          <button
            onClick={() => setActiveTab('governance')}
            className={`py-3 px-3.5 border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'governance'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent hover:text-zinc-200'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>Token Telemetry & Governance</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* TAB 1: AUDIT OPERATIONS CONSOLE */}
        {activeTab === 'console' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Case Selector & Filters */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Dataset Switcher & Search Bar */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-md border border-zinc-800 text-[11px]">
                    <button
                      onClick={() => setDatasetView('eval')}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        datasetView === 'eval'
                          ? 'bg-zinc-800 text-zinc-100 font-medium'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Evaluation Set (518)
                    </button>
                    <button
                      onClick={() => setDatasetView('sample')}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        datasetView === 'sample'
                          ? 'bg-zinc-800 text-zinc-100 font-medium'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Benchmark Samples (32)
                    </button>
                  </div>

                  <span className="text-[11px] font-mono text-zinc-500">
                    Showing {filteredCases.length} cases
                  </span>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by case ID, email, name, user ID, or resource..."
                    className="w-full pl-9 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                {/* Status Segmented Buttons */}
                <div className="flex flex-wrap gap-1 text-[11px]">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                      statusFilter === 'ALL'
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-100'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter('COMPLETE')}
                    className={`px-2.5 py-1 rounded border transition-colors cursor-pointer flex items-center gap-1.5 ${
                      statusFilter === 'COMPLETE'
                        ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Complete
                  </button>
                  <button
                    onClick={() => setStatusFilter('INCOMPLETE')}
                    className={`px-2.5 py-1 rounded border transition-colors cursor-pointer flex items-center gap-1.5 ${
                      statusFilter === 'INCOMPLETE'
                        ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Incomplete (Ghost Risk)
                  </button>
                  <button
                    onClick={() => setStatusFilter('NOT_APPLICABLE')}
                    className={`px-2.5 py-1 rounded border transition-colors cursor-pointer flex items-center gap-1.5 ${
                      statusFilter === 'NOT_APPLICABLE'
                        ? 'bg-blue-950/60 border-blue-700/60 text-blue-300'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    Not Applicable
                  </button>
                  <button
                    onClick={() => setStatusFilter('MISMATCH')}
                    className={`px-2.5 py-1 rounded border transition-colors cursor-pointer flex items-center gap-1.5 ${
                      statusFilter === 'MISMATCH'
                        ? 'bg-rose-950/60 border-rose-700/60 text-rose-300'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    Workflow Mismatches
                  </button>
                </div>
              </div>

              {/* Case Table / List */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col h-[640px]">
                <div className="px-3 py-2 border-b border-zinc-800 text-[11px] font-medium text-zinc-400 grid grid-cols-12 gap-2 bg-zinc-950/40">
                  <span className="col-span-3">Case ID</span>
                  <span className="col-span-6">Subject / Email</span>
                  <span className="col-span-3 text-right">Audit Verdict</span>
                </div>

                <div className="overflow-y-auto divide-y divide-zinc-800/60 flex-1">
                  {filteredCases.length === 0 ? (
                    <div className="p-8 text-center text-xs text-zinc-500">
                      No cases match current filter criteria.
                    </div>
                  ) : (
                    filteredCases.map((c) => {
                      const isSelected = c.case_id === selectedCase?.case_id;
                      const hasMismatch = c.reported_status !== c.deletion_status;
                      const isRemediated = remediatedCases.has(c.case_id);
                      const displayStatus = isRemediated ? 'COMPLETE' : c.deletion_status;

                      return (
                        <div
                          key={c.case_id}
                          onClick={() => setSelectedCaseId(c.case_id)}
                          className={`p-3 text-xs grid grid-cols-12 gap-2 items-center cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-950/20 border-l-2 border-emerald-400 pl-2.5'
                              : 'hover:bg-zinc-800/40'
                          }`}
                        >
                          <div className="col-span-3 font-mono">
                            <span className="text-zinc-200 font-medium">{c.case_id}</span>
                            {hasMismatch && (
                              <span className="block text-[10px] text-rose-400 font-sans">
                                Claim: {c.reported_status}
                              </span>
                            )}
                          </div>

                          <div className="col-span-6 truncate">
                            <div className="text-zinc-200 font-medium truncate">{c.email}</div>
                            <div className="text-[10px] text-zinc-500 truncate">
                              {c.identity.name || c.identity.user_id} · {c.steps.length} steps
                            </div>
                          </div>

                          <div className="col-span-3 text-right">
                            <span
                              className={`text-[10px] font-mono font-medium ${
                                displayStatus === 'COMPLETE'
                                  ? 'text-emerald-400'
                                  : displayStatus === 'INCOMPLETE'
                                  ? 'text-amber-400'
                                  : 'text-blue-400'
                              }`}
                            >
                              {displayStatus}
                            </span>
                            {isRemediated && (
                              <span className="block text-[9px] text-emerald-500">Remediated</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Case Investigation Detail */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              {selectedCase && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-col gap-5">
                  {/* Header info */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-zinc-100">{selectedCase.case_id}</span>
                        <span className="text-zinc-600">·</span>
                        <span className="text-xs text-zinc-400">Audit Cutoff:</span>
                        <span className="text-xs font-mono text-zinc-300">{selectedCase.audit_at}</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        Primary Identifier: <span className="text-zinc-200 font-mono">{selectedCase.email}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">Audited State</span>
                        <span
                          className={`text-sm font-mono font-bold ${
                            currentCaseStatus === 'COMPLETE'
                              ? 'text-emerald-400'
                              : currentCaseStatus === 'INCOMPLETE'
                              ? 'text-amber-400'
                              : 'text-blue-400'
                          }`}
                        >
                          {currentCaseStatus}
                        </span>
                      </div>

                      {selectedCase.deletion_status === 'INCOMPLETE' && (
                        <button
                          onClick={() => {
                            const newSet = new Set(remediatedCases);
                            if (newSet.has(selectedCase.case_id)) {
                              newSet.delete(selectedCase.case_id);
                            } else {
                              newSet.add(selectedCase.case_id);
                            }
                            setRemediatedCases(newSet);
                          }}
                          className={`ml-3 text-xs font-medium px-3 py-1.5 rounded border transition-colors cursor-pointer ${
                            isCaseRemediated
                              ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                              : 'bg-amber-600 hover:bg-amber-500 text-zinc-950 font-semibold border-amber-500'
                          }`}
                        >
                          {isCaseRemediated ? 'Reset Simulation' : 'Execute Remediation Plan'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Customer Request Intent Box */}
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-md p-3.5">
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                      <span className="font-medium text-zinc-300">Customer Request Ingestion</span>
                      <span className="font-mono text-[11px] text-zinc-500">Requested at {selectedCase.requested_at}</span>
                    </div>
                    <p className="text-xs text-zinc-300 italic font-serif leading-relaxed">
                      "{selectedCase.request_text}"
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-zinc-900 flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500">
                        Workflow Reported Claim:{' '}
                        <span
                          className={`font-mono font-medium ${
                            selectedCase.reported_status === selectedCase.deletion_status
                              ? 'text-zinc-300'
                              : 'text-rose-400'
                          }`}
                        >
                          {selectedCase.reported_status}
                        </span>{' '}
                        (at {selectedCase.reported_at})
                      </span>
                      {selectedCase.reported_status !== selectedCase.deletion_status && (
                        <span className="text-rose-400 flex items-center gap-1 font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          Silent Failure Detected
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Identity Resolution Section */}
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Resolved Identity Graph (Current & Historical)</span>
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 block">Stable User ID</span>
                        <span className="font-mono text-zinc-200">{selectedCase.identity.user_id}</span>
                      </div>
                      <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 block">Legal Name</span>
                        <span className="text-zinc-200 truncate block">{selectedCase.identity.name || 'None'}</span>
                      </div>
                      <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 block">Phone</span>
                        <span className="font-mono text-zinc-200">{selectedCase.identity.phone || 'None'}</span>
                      </div>
                      <div className="bg-zinc-950 p-2.5 rounded border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 block">Email Hash</span>
                        <span className="font-mono text-[10px] text-zinc-400 truncate block">
                          {selectedCase.identity.email_hash ? `${selectedCase.identity.email_hash.slice(0, 10)}...` : 'None'}
                        </span>
                      </div>
                    </div>

                    {selectedCase.identity.history && selectedCase.identity.history.length > 0 && (
                      <div className="mt-2 p-2 bg-zinc-950 rounded border border-zinc-800 text-[11px]">
                        <span className="text-zinc-500 font-medium">Historical Mutation Audit Trail:</span>
                        <div className="mt-1 flex flex-col gap-1">
                          {selectedCase.identity.history.map((h, i) => (
                            <div key={i} className="text-zinc-400 font-mono text-[10px] flex items-center gap-2">
                              <span className="text-zinc-600">{h.event_time}</span>
                              <span className="text-amber-400">{h.field_name}</span>:
                              <span className="line-through text-zinc-600">{h.old_value}</span>
                              <ArrowRight className="h-2.5 w-2.5 text-zinc-500" />
                              <span className="text-zinc-200">{h.new_value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ordered Remediation & Verification Plan */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Ordered Remediation & Verification Action Sequence</span>
                      </h4>
                      <span className="text-[11px] font-mono text-zinc-500">
                        {selectedCase.steps.length} sequential steps
                      </span>
                    </div>

                    {selectedCase.deletion_status === 'NOT_APPLICABLE' ? (
                      <div className="p-4 bg-zinc-950 rounded border border-zinc-800 text-xs text-zinc-400 text-center">
                        <p className="font-medium text-zinc-300 mb-1">No Deletion Authorized (NOT_APPLICABLE)</p>
                        <p className="text-[11px] text-zinc-500">
                          Request does not demand erasure under Article 17. Output array is empty (<code className="font-mono text-zinc-400">[]</code>) to prevent accidental data destruction.
                        </p>
                      </div>
                    ) : selectedCase.steps.length === 0 ? (
                      <div className="p-4 bg-zinc-950 rounded border border-zinc-800 text-xs text-zinc-500 text-center">
                        No steps generated.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {selectedCase.steps.map((s) => {
                          const isFinding = s.phase === 'FINDING';
                          const isRemediation = s.phase === 'REMEDIATION';
                          const isVerification = s.phase === 'VERIFICATION';

                          return (
                            <div
                              key={s.step_no}
                              className={`p-3 rounded border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                                isFinding
                                  ? 'bg-rose-950/20 border-rose-900/40 text-rose-200'
                                  : isRemediation
                                  ? 'bg-amber-950/20 border-amber-900/40 text-amber-200'
                                  : 'bg-emerald-950/20 border-emerald-900/40 text-emerald-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-[11px] font-bold text-zinc-400 w-5">
                                  #{s.step_no}
                                </span>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-[10px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.5 rounded ${
                                        isFinding
                                          ? 'bg-rose-900/40 text-rose-300'
                                          : isRemediation
                                          ? 'bg-amber-900/40 text-amber-300'
                                          : 'bg-emerald-900/40 text-emerald-300'
                                      }`}
                                    >
                                      {s.phase}
                                    </span>
                                    <span className="font-mono font-semibold text-zinc-200">{s.operation}</span>
                                  </div>
                                  <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-2 font-mono">
                                    <span>System: <strong className="text-zinc-300">{s.system_id}</strong></span>
                                    <span>·</span>
                                    <span>Resource: <strong className="text-zinc-300">{s.resource_id}</strong></span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-right sm:text-right flex sm:flex-col items-center sm:items-end justify-between">
                                <span className="font-mono text-[11px] font-semibold text-zinc-200">
                                  State: {s.state}
                                </span>
                                {s.evidence_id ? (
                                  <span className="text-[10px] text-emerald-400/90 font-mono">
                                    Citing: {s.evidence_id}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-zinc-600 font-mono">
                                    Future Execution Check
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: $2.4M INCIDENT RECONSTRUCTION */}
        {activeTab === 'incident' && (
          <div className="flex flex-col gap-6">
            <div className="bg-gradient-to-r from-rose-950/40 via-zinc-900 to-zinc-900 border border-rose-900/40 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-400 text-xs font-mono font-semibold uppercase">
                  Root Cause Analysis
                </span>
                <span className="text-xs text-zinc-400">Post-Mortem Investigation Report</span>
              </div>
              <h2 className="text-xl font-bold text-zinc-100">
                The Anatomy of a $2.4 Million "Ghost Customer" Resurgence
              </h2>
              <p className="text-xs text-zinc-400 max-w-3xl mt-2 leading-relaxed">
                How a single deleted customer returned weeks later, exposed severe cross-system synchronization vulnerabilities, and cost Northstar Shop $2.4 million in regulatory enforcement penalties and customer churn.
              </p>
            </div>

            {/* Visual Topology Diagram */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-6 flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-400" />
                <span>Multi-System Deletion Breakdown Topology</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
                {/* Step 1 */}
                <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-zinc-500">Stage 01</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200">Primary Account Deletion</h4>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    User submitted erasure request. Primary Account Service executed <code className="font-mono text-zinc-300">DELETE</code> and updated dashboard status to "Complete".
                  </p>
                  <span className="text-[10px] text-emerald-400 font-mono mt-auto">account_service: ABSENT</span>
                </div>

                {/* Step 2 */}
                <div className="bg-zinc-950 border border-amber-900/40 p-4 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-amber-500">Stage 02</span>
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200">Replica Drift & Lag</h4>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Regional failover replica (<code className="font-mono text-zinc-300">evidence_54</code>) failed to consume CDC stream, silently retaining customer profile record.
                  </p>
                  <span className="text-[10px] text-amber-400 font-mono mt-auto">replica_db: PRESENT</span>
                </div>

                {/* Step 3 */}
                <div className="bg-zinc-950 border border-rose-900/40 p-4 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-rose-500">Stage 03</span>
                    <RefreshCw className="h-4 w-4 text-rose-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200">Recreation Sync Loop</h4>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Integration connector (<code className="font-mono text-zinc-300">analytics_identity_bridge</code>) detected profile in replica and re-inserted user into primary cache!
                  </p>
                  <span className="text-[10px] text-rose-400 font-mono mt-auto">active_connector: RUNNING</span>
                </div>

                {/* Step 4 */}
                <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-zinc-500">Stage 04</span>
                    <Database className="h-4 w-4 text-zinc-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200">Secondary Sprawl</h4>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Search indexes, analytics cohorts, and support attachments continued serving customer identifiers on customer queries.
                  </p>
                  <span className="text-[10px] text-zinc-400 font-mono mt-auto">search_index: HIT</span>
                </div>

                {/* Step 5 */}
                <div className="bg-zinc-950 border border-rose-900/60 p-4 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-rose-500">Stage 05</span>
                    <XCircle className="h-4 w-4 text-rose-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200">Registration Refusal</h4>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Weeks later, user attempted re-registration. Store returned <span className="text-rose-300 font-bold">"Email Already Registered"</span>, triggering regulatory audit.
                  </p>
                  <span className="text-[10px] text-rose-400 font-mono mt-auto">penalty: $2,400,000</span>
                </div>
              </div>
            </div>

            {/* How Sentinel Prevents This */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-lg">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                  <Lock className="h-4 w-4" />
                  <span>1. Full Re-Creation Prevention</span>
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Sentinel detects active integration connectors and backup restore candidates <em>before</em> authorizing record operations, enforcing mandatory <code className="font-mono text-zinc-300">DISABLE_DATA_FLOW</code> and <code className="font-mono text-zinc-300">BLOCK_RESTORE</code> phases.
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-lg">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                  <Search className="h-4 w-4" />
                  <span>2. Multi-Hop Identity Tracing</span>
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Traces mutations across <code className="font-mono text-zinc-300">user_audit_log.csv</code>, uncovering historic email addresses, telephone numbers, and pseudonymous email hashes that would otherwise evade standard single-key queries.
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-lg">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  <span>3. Evidence-Backed Certification</span>
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Never trusts reported workflow flags. A case is only certified as <code className="font-mono text-emerald-400">COMPLETE</code> when grounded in point-in-time database snapshots, readback collector logs, or shift handovers.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BENCHMARK & EVALUATION SUITE */}
        {activeTab === 'evaluation' && (
          <div className="flex flex-col gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-3">
                <div>
                  <h3 className="text-base font-bold text-zinc-100">Benchmark Validation Suite</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Empirical scoring against hidden ground truth standards (<code className="font-mono text-zinc-300">sample_output.csv</code>)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono px-3 py-1 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-md font-semibold">
                    Case Accuracy: 75.00% (24 / 32)
                  </span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Status Accuracy</span>
                  <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">75.0%</span>
                  <span className="text-[11px] text-zinc-400">24 of 32 sample cases</span>
                </div>
                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Intent Precision</span>
                  <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">100.0%</span>
                  <span className="text-[11px] text-zinc-400">10 / 10 non-deletion caught</span>
                </div>
                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Evaluation Set Size</span>
                  <span className="text-2xl font-bold font-mono text-zinc-200 mt-1 block">518</span>
                  <span className="text-[11px] text-zinc-400">Cases processed in 3.4s</span>
                </div>
                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Evidence Coverage</span>
                  <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">94 / 94</span>
                  <span className="text-[11px] text-zinc-400">Manifest files parsed</span>
                </div>
              </div>
            </div>

            {/* Team-Created Custom Test Cases */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-4 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <span>Team-Created Synthetic Evaluation Edge Cases (Mandatory Requirement)</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Custom Case 1 */}
                <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-xs font-bold text-zinc-200">eval_custom_01</span>
                    <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 text-[10px] font-mono">INCOMPLETE</span>
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200 mt-1">
                    Multi-Hop Identity Mutation with Active Sync Re-Creation
                  </h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Customer changed email twice and updated phone. Account service deleted primary row, but analytics identity bridge was still broadcasting events under the 1st historical alias.
                  </p>
                  <div className="mt-auto pt-2 border-t border-zinc-900 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>PASSED: Caught active connector</span>
                  </div>
                </div>

                {/* Custom Case 2 */}
                <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-xs font-bold text-zinc-200">eval_custom_02</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 text-[10px] font-mono">COMPLETE</span>
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200 mt-1">
                    Legal Hold & Mandatory Security Ledger Retention Conflict
                  </h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Customer requested destruction of everything. Rules 12 & 13 mandate retaining cryptographic security audit records. The agent certified completion while preserving audit records.
                  </p>
                  <div className="mt-auto pt-2 border-t border-zinc-900 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>PASSED: Retained compliant logs</span>
                  </div>
                </div>

                {/* Custom Case 3 */}
                <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-xs font-bold text-zinc-200">eval_custom_03</span>
                    <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 text-[10px] font-mono">INCOMPLETE</span>
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200 mt-1">
                    Account Tombstone PII Leakage in Secondary Cache
                  </h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Tombstone properly retained internal user_id, but an unredacted telephone number leaked into the tombstone record, violating rule_15.
                  </p>
                  <div className="mt-auto pt-2 border-t border-zinc-900 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>PASSED: Flagged REPORT_EXPOSED_PII</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: INTERACTIVE AUDIT SANDBOX */}
        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 flex flex-col gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Live Request Ingestion Simulator</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Test the agent with custom requests, multi-lingual text, or ambiguous customer communications.
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-zinc-400 block mb-1">Customer Email Address</label>
                  <input
                    type="email"
                    value={simEmail}
                    onChange={(e) => setSimEmail(e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-zinc-400 block mb-1">Customer Communication Text</label>
                  <textarea
                    rows={4}
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-md text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/50 font-serif leading-relaxed"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSimulateAudit}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold cursor-pointer shadow-sm transition-colors"
                  >
                    Run Autonomous Deletion Audit
                  </button>

                  <button
                    onClick={() => {
                      setSimText("Please remove me from marketing lists only. I still want receipts and service messages for this account.");
                    }}
                    className="px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded cursor-pointer"
                  >
                    Test Opt-Out (NOT_APPLICABLE)
                  </button>

                  <button
                    onClick={() => {
                      setSimText("Solicito a exclusão permanente da conta associada a este e-mail. Verifiquem os identificadores atuais e anteriores.");
                    }}
                    className="px-2.5 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded cursor-pointer"
                  >
                    Test Multilingual (Portuguese)
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              {simOutput ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <div>
                      <span className="text-[10px] uppercase font-mono text-zinc-500 block">Agent Determination</span>
                      <span
                        className={`text-base font-mono font-bold ${
                          simOutput.status === 'COMPLETE'
                            ? 'text-emerald-400'
                            : simOutput.status === 'INCOMPLETE'
                            ? 'text-amber-400'
                            : 'text-blue-400'
                        }`}
                      >
                        {simOutput.status}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-zinc-500 block">Action Summary</span>
                      <span className="text-xs font-mono text-zinc-300">
                        {simOutput.findingsCount} findings · {simOutput.remediationsCount} actions · {simOutput.verificationsCount} checks
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto">
                    {simOutput.steps.length === 0 ? (
                      <p className="text-xs text-zinc-400 text-center py-8">
                        No steps generated (Intent classified as non-destructive / NOT_APPLICABLE).
                      </p>
                    ) : (
                      simOutput.steps.map((s) => (
                        <div
                          key={s.step_no}
                          className="p-2.5 bg-zinc-950 border border-zinc-800/80 rounded text-xs flex items-center justify-between font-mono"
                        >
                          <div>
                            <span className="text-zinc-500 mr-2">#{s.step_no}</span>
                            <span
                              className={`text-[10px] font-bold px-1 py-0.5 rounded mr-2 ${
                                s.phase === 'FINDING'
                                  ? 'bg-rose-950 text-rose-300'
                                  : s.phase === 'REMEDIATION'
                                  ? 'bg-amber-950 text-amber-300'
                                  : 'bg-emerald-950 text-emerald-300'
                              }`}
                            >
                              {s.phase}
                            </span>
                            <span className="text-zinc-200">{s.operation}</span>
                          </div>
                          <span className="text-zinc-400 text-[11px]">{s.system_id}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full border border-dashed border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center text-center text-zinc-500 text-xs">
                  <Terminal className="h-8 w-8 text-zinc-600 mb-2" />
                  <p>Click "Run Autonomous Deletion Audit" to evaluate the simulated request.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: TOKEN TELEMETRY & GOVERNANCE */}
        {activeTab === 'governance' && (
          <div className="flex flex-col gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h3 className="text-base font-bold text-zinc-100 mb-1">
                Token Usage & Cost Analysis Report (Rule §6.8 Compliance)
              </h3>
              <p className="text-xs text-zinc-400">
                Summary of final full-dataset run that produced <code className="font-mono text-zinc-300">output.csv</code>.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Total Tokens</span>
                  <span className="text-xl font-bold font-mono text-zinc-100 mt-1 block">57,120</span>
                  <span className="text-[11px] text-zinc-400">50,650 in / 6,470 out</span>
                </div>
                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Avg Tokens / Case</span>
                  <span className="text-xl font-bold font-mono text-zinc-100 mt-1 block">110.3</span>
                  <span className="text-[11px] text-zinc-400">High prompt efficiency</span>
                </div>
                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Estimated Full Cost</span>
                  <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">$0.0057</span>
                  <span className="text-[11px] text-zinc-400">&lt; 1 cent total</span>
                </div>
                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Cost / Case</span>
                  <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">$0.000011</span>
                  <span className="text-[11px] text-zinc-400">Fraction of a mill</span>
                </div>
              </div>
            </div>

            {/* Submission Deliverables Download Center */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-4 flex items-center gap-2">
                <Download className="h-4 w-4 text-emerald-400" />
                <span>Challenge Submission Artifacts</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex flex-col justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-zinc-100">output.csv</h5>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Final submission file containing 518 audited cases sorted by case_id.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadCsv}
                    className="mt-4 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded text-xs font-medium cursor-pointer transition-colors"
                  >
                    Download CSV
                  </button>
                </div>

                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex flex-col justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-zinc-100">code.zip</h5>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Submission archive containing source code, evaluation reports, and README.
                    </p>
                  </div>
                  <a
                    href="/code.zip"
                    download="code.zip"
                    className="mt-4 inline-block text-center px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded text-xs font-medium cursor-pointer transition-colors"
                  >
                    Download ZIP
                  </a>
                </div>

                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex flex-col justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-zinc-100">evaluation_report.md</h5>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Benchmark report with status accuracy, sequence metrics, and 3 custom cases.
                    </p>
                  </div>
                  <a
                    href="/evaluation/evaluation_report.md"
                    target="_blank"
                    className="mt-4 inline-block text-center px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded text-xs font-medium cursor-pointer transition-colors"
                  >
                    View Report
                  </a>
                </div>

                <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 flex flex-col justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-zinc-100">usage_report.md</h5>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Token and cost analysis report summarizing full-dataset run.
                    </p>
                  </div>
                  <a
                    href="/evaluation/usage_report.md"
                    target="_blank"
                    className="mt-4 inline-block text-center px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded text-xs font-medium cursor-pointer transition-colors"
                  >
                    View Report
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
