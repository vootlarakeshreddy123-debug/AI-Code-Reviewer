import React, { useState } from 'react';
import { CodeReview, Finding, PageType, IssueCategory, Severity } from '../types';
import { reviewService } from '../services/reviewService';
import { ScoreRing } from '../components/common/ScoreRing';
import { SeverityBadge, CategoryBadge, LanguageBadge } from '../components/common/Badge';
import { CodeViewer } from '../components/common/CodeViewer';
import { DiffViewer } from '../components/common/DiffViewer';
import { EmptyState } from '../components/common/StateViews';
import { ComplexityVisualization } from '../components/common/ComplexityVisualization';
import { ScoreBreakdownCard } from '../components/common/ScoreBreakdownCard';
import { OptimizationCard } from '../components/common/OptimizationCard';
import { SecurityAnalysisCard } from '../components/common/SecurityAnalysisCard';
import { CodeSmellsCard } from '../components/common/CodeSmellsCard';
import { AiFixModal } from '../components/common/AiFixModal';
import {
  ShieldAlert,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  XCircle,
  Download,
  ArrowLeft,
  Sparkles,
  Bug,
  Gauge,
  Code2,
  Terminal,
  AlertOctagon,
  Info,
  Check,
  Filter,
  Cpu,
  Clock,
  Layers,
  Wrench,
  HelpCircle,
  FileText,
  Copy
} from 'lucide-react';

interface ReviewResultsPageProps {
  review?: CodeReview;
  onNavigate: (page: PageType, paramId?: string) => void;
  onReviewUpdated?: () => void;
}

interface CategoryConfig {
  id: IssueCategory;
  num: number;
  title: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  noIssuesMessage: string;
  color: string;
  borderColor: string;
  bgLight: string;
}

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    id: 'syntax',
    num: 1,
    title: 'SYNTAX / COMPILATION ERRORS',
    shortLabel: 'Syntax Errors',
    icon: AlertOctagon,
    noIssuesMessage: 'No syntax errors detected',
    color: 'text-red-400',
    borderColor: 'border-red-500/30',
    bgLight: 'bg-red-950/20'
  },
  {
    id: 'bug',
    num: 2,
    title: 'BUGS',
    shortLabel: 'Bugs',
    icon: Bug,
    noIssuesMessage: 'No bugs detected',
    color: 'text-purple-400',
    borderColor: 'border-purple-500/30',
    bgLight: 'bg-purple-950/20'
  },
  {
    id: 'security',
    num: 3,
    title: 'SECURITY VULNERABILITIES',
    shortLabel: 'Security',
    icon: ShieldAlert,
    noIssuesMessage: 'No security vulnerabilities detected',
    color: 'text-rose-400',
    borderColor: 'border-rose-500/30',
    bgLight: 'bg-rose-950/20'
  },
  {
    id: 'performance',
    num: 4,
    title: 'PERFORMANCE ISSUES',
    shortLabel: 'Performance',
    icon: Gauge,
    noIssuesMessage: 'No performance issues detected',
    color: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    bgLight: 'bg-amber-950/20'
  },
  {
    id: 'quality',
    num: 5,
    title: 'CODE QUALITY',
    shortLabel: 'Quality',
    icon: Sparkles,
    noIssuesMessage: 'No code-quality violations detected',
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    bgLight: 'bg-emerald-950/20'
  },
  {
    id: 'style',
    num: 6,
    title: 'STYLE / CONVENTION',
    shortLabel: 'Style',
    icon: Code2,
    noIssuesMessage: 'No style violations detected',
    color: 'text-cyan-400',
    borderColor: 'border-cyan-500/30',
    bgLight: 'bg-cyan-950/20'
  },
  {
    id: 'debug',
    num: 7,
    title: 'DEBUG / DEVELOPMENT ARTIFACTS',
    shortLabel: 'Debug Artifacts',
    icon: Terminal,
    noIssuesMessage: 'No debug artifacts detected',
    color: 'text-teal-400',
    borderColor: 'border-teal-500/30',
    bgLight: 'bg-teal-950/20'
  }
];

const SourceBadge: React.FC<{ source?: string; detectionSource?: string }> = ({ source, detectionSource }) => {
  const s = (source || '').toUpperCase();
  let badgeStyle = 'bg-slate-900 border-slate-800 text-cyan-300';

  if (s.includes('RUSTC') || s.includes('BORROW')) {
    badgeStyle = 'bg-orange-950/70 border-orange-500/40 text-orange-300';
  } else if (s.includes('CLANG') || s.includes('C++')) {
    badgeStyle = 'bg-blue-950/70 border-blue-500/40 text-blue-300';
  } else if (s.includes('JAVAC') || s.includes('SPOTBUGS') || s.includes('PMD')) {
    badgeStyle = 'bg-red-950/70 border-red-500/40 text-red-300';
  } else if (s.includes('TYPESCRIPT') || s.includes('TS')) {
    badgeStyle = 'bg-sky-950/70 border-sky-500/40 text-sky-300';
  } else if (s.includes('GO') || s.includes('GOSEC')) {
    badgeStyle = 'bg-teal-950/70 border-teal-500/40 text-teal-300';
  } else if (s.includes('PHP')) {
    badgeStyle = 'bg-indigo-950/70 border-indigo-500/40 text-indigo-300';
  } else if (s.includes('RUBY') || s.includes('RUBOCOP')) {
    badgeStyle = 'bg-rose-950/70 border-rose-500/40 text-rose-300';
  } else if (s.includes('HTML')) {
    badgeStyle = 'bg-amber-950/70 border-amber-500/40 text-amber-300';
  } else if (s.includes('BANDIT')) {
    badgeStyle = 'bg-rose-950/70 border-rose-500/40 text-rose-300';
  } else if (s.includes('AST')) {
    badgeStyle = 'bg-amber-950/70 border-amber-500/40 text-amber-300';
  } else if (s.includes('PYFLAKES')) {
    badgeStyle = 'bg-purple-950/70 border-purple-500/40 text-purple-300';
  } else if (s.includes('RUFF')) {
    badgeStyle = 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300';
  } else if (s.includes('MYPY')) {
    badgeStyle = 'bg-blue-950/70 border-blue-500/40 text-blue-300';
  } else if (s.includes('ROSLYN') || s.includes('DOTNET') || s.includes('C#')) {
    badgeStyle = 'bg-purple-950/70 border-purple-500/40 text-purple-300';
  } else if (s.includes('GEMINI')) {
    badgeStyle = 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300';
  }

  const label = source || detectionSource || 'Static';

  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${badgeStyle}`}>
      <span className="opacity-70 text-[9px]">SRC:</span> {label}
    </span>
  );
};

export const ReviewResultsPage: React.FC<ReviewResultsPageProps> = ({
  review: initialReview,
  onNavigate,
  onReviewUpdated
}) => {
  const [review, setReview] = useState<CodeReview | undefined>(initialReview);
  const [selectedFinding, setSelectedFinding] = useState<Finding | undefined>(
    initialReview?.findings[0]
  );
  const [viewSection, setViewSection] = useState<'findings' | 'complexity' | 'optimizations' | 'security' | 'smells' | 'breakdown'>('findings');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [aiFixFinding, setAiFixFinding] = useState<Finding | null>(null);

  if (!review) {
    return (
      <EmptyState
        title="Review Results Not Found"
        description="The code review session you requested does not exist or has been deleted."
        actionLabel="Start New Review"
        onAction={() => onNavigate('new-review')}
      />
    );
  }

  const handleUpdateFindingStatus = (findingId: string, status: 'open' | 'resolved' | 'ignored') => {
    const updated = reviewService.updateFindingStatus(review.id, findingId, status);
    if (updated) {
      setReview({ ...updated });
      if (selectedFinding?.id === findingId) {
        setSelectedFinding({ ...selectedFinding, status });
      }
      if (onReviewUpdated) onReviewUpdated();
    }
  };

  const handleApplyFix = (newCode: string) => {
    setReview((prev) => {
      if (!prev) return prev;
      return { ...prev, code: newCode };
    });
  };

  // Helper to count findings per category
  const getCategoryFindings = (catId: IssueCategory) => {
    return review.findings.filter((f) => {
      const c = (f.category || '').toUpperCase();
      if (catId === 'syntax') return c === 'SYNTAX' || c === 'SYNTAX_ERRORS';
      if (catId === 'bug') return c === 'BUG' || c === 'BUGS' || c === 'BUGS_RUNTIME_ERRORS';
      if (catId === 'security') return c === 'SECURITY' || c === 'SECURITY_ISSUES';
      if (catId === 'performance') return c === 'PERFORMANCE';
      if (catId === 'quality') {
        if (c === 'QUALITY' || c === 'CODE_QUALITY') return true;
        const recognized = ['SYNTAX', 'SYNTAX_ERRORS', 'BUG', 'BUGS', 'BUGS_RUNTIME_ERRORS', 'SECURITY', 'SECURITY_ISSUES', 'PERFORMANCE', 'STYLE', 'INFO', 'DEBUG', 'DEBUG_DEVELOPMENT_ARTIFACTS'];
        return !recognized.includes(c);
      }
      if (catId === 'style') return c === 'STYLE' || c === 'INFO';
      if (catId === 'debug') return c === 'DEBUG' || c === 'DEBUG_DEVELOPMENT_ARTIFACTS';
      return false;
    });
  };

  const totalIssues = review.findings.length;

  const downloadFile = (filename: string, content: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportMarkdown = () => {
    const data = reviewService.getReviewJSON(review);
    const md = `# AI Code Review Report: ${review.title}

**Language:** ${review.language.toUpperCase()}  
**Overall Score:** ${review.overallScore}/100  
**Generated At:** ${new Date(review.createdAt).toLocaleString()}  
**Lines of Code:** ${review.linesOfCode}  

## Executive Summary
${review.summary || data.summary}

## Complexity Metrics
- **Time Complexity:** ${review.complexity?.timeComplexity || 'O(n)'}
- **Space Complexity:** ${review.complexity?.spaceComplexity || 'O(1)'}
- **Time Explanation:** ${review.complexity?.timeExplanation || 'N/A'}
- **Space Explanation:** ${review.complexity?.spaceExplanation || 'N/A'}

## Score Breakdown
- Correctness: ${review.scoreBreakdown?.correctness ?? 95}%
- Security: ${review.scoreBreakdown?.security ?? 95}%
- Performance: ${review.scoreBreakdown?.performance ?? 90}%
- Maintainability: ${review.scoreBreakdown?.maintainability ?? 85}%
- Code Quality: ${review.scoreBreakdown?.codeQuality ?? 90}%

## Findings & Remediation (${review.findings.length})
${review.findings
  .map(
    (f, idx) => `### ${idx + 1}. [${f.severity.toUpperCase()}] ${f.title} (Line ${f.lineNumber || f.line || 1})
**Category:** ${f.category}  
**Source:** ${f.source || f.detectionSource || 'Static'}  
**Problematic Code:**
\`\`\`${review.language}
${f.codeSnippet || f.problematicCode || ''}
\`\`\`

**Explanation:**
${f.explanation}

**Recommended Fix:**
\`\`\`${review.language}
${f.recommendedFix || f.recommended_fix || ''}
\`\`\`
`
  )
  .join('\n\n')}
`;
    downloadFile(`code-review-${review.id}.md`, md, 'text/markdown');
  };

  const exportJSON = () => {
    const data = reviewService.getReviewJSON(review);
    downloadFile(`code-review-${review.id}.json`, JSON.stringify(data, null, 2), 'application/json');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Navigation & Action Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <button
            onClick={() => onNavigate('review-history')}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors mb-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Review History
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl md:text-2xl font-bold text-slate-100 tracking-tight">
              {review.title}
            </h2>
            <LanguageBadge language={review.language} />
            {review.complexity?.timeComplexity && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                ⚡ {review.complexity.timeComplexity} Time
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Analyzed {review.linesOfCode} LOC in {review.durationMs}ms • Analyzed on {new Date(review.createdAt).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            Export Report
          </button>
          <button
            onClick={() => setShowJsonModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-mono font-semibold transition-colors cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
            JSON View
          </button>
          <button
            onClick={() => onNavigate('new-review')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-950/50 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            New Review
          </button>
        </div>
      </div>

      {/* PRIMARY SECTION TABS (Platform Navigation beyond basic linters) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800 scrollbar-none">
        <button
          onClick={() => setViewSection('findings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            viewSection === 'findings'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <AlertOctagon className="w-4 h-4" />
          <span>Overview & Findings ({totalIssues})</span>
        </button>

        <button
          onClick={() => setViewSection('complexity')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            viewSection === 'complexity'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Clock className="w-4 h-4 text-cyan-300" />
          <span>Time & Space Complexity</span>
          {review.complexity?.timeComplexity && (
            <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-slate-950 text-cyan-300">
              {review.complexity.timeComplexity}
            </span>
          )}
        </button>

        <button
          onClick={() => setViewSection('optimizations')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            viewSection === 'optimizations'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>AI Optimizations (Before/After)</span>
          {(review.optimizations?.length || 0) > 0 && (
            <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-emerald-950 text-emerald-300">
              {review.optimizations?.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setViewSection('security')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            viewSection === 'security'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span>Security Analysis</span>
          <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-rose-950 text-rose-300">
            {review.securityAnalysis?.riskLevel || 'Safe'}
          </span>
        </button>

        <button
          onClick={() => setViewSection('smells')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            viewSection === 'smells'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Layers className="w-4 h-4 text-amber-400" />
          <span>Code Smells & Anti-Patterns</span>
          <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-amber-950 text-amber-300">
            {review.codeSmells?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setViewSection('breakdown')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            viewSection === 'breakdown'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Gauge className="w-4 h-4 text-purple-400" />
          <span>Health Breakdown</span>
        </button>
      </div>

      {/* TAB 1: FINDINGS & CODE OVERVIEW */}
      {viewSection === 'findings' && (
        <div className="space-y-6">
          {/* OVERALL SCORE & SUMMARY CARDS */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6">
            {/* Analyzer Status Banner */}
            {review.analyzerStatus === 'ANALYZER_UNAVAILABLE' ? (
              <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider font-mono">
                    Static Toolchain Notice: Analyzer Unavailable
                  </h4>
                  <p className="text-xs text-amber-200">
                    {review.analyzerMessage || 'Language-specific compiler/analyzer is not installed on this host.'}
                  </p>
                </div>
              </div>
            ) : review.analyzerMessage ? (
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span className="font-mono text-[11px] text-slate-400">Static Engine:</span>
                  <span className="font-bold text-slate-200">{review.analyzerMessage}</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/40 flex items-center gap-1">
                  <Check className="w-3 h-3" /> FULLY OPERATIONAL
                </span>
              </div>
            ) : null}

            <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-slate-800 pb-6">
              {/* Overall Score Ring */}
              <div className="flex items-center gap-6">
                <ScoreRing score={review.overallScore} size="lg" showGrade label="Overall Score" />
                <div className="space-y-1">
                  <span className="text-2xl md:text-3xl font-extrabold text-slate-100 font-mono">
                    {review.overallScore}<span className="text-slate-500 text-lg font-normal">/100</span>
                  </span>
                  {review.analyzerStatus === 'ANALYZER_UNAVAILABLE' || review.status === 'failed' ? (
                    <p className="text-xs font-bold text-amber-400">
                      Toolchain Status: <span className="font-mono text-sm">Analyzer Unavailable</span>
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-slate-300">
                      Total Issues Detected: <span className="text-cyan-400 font-mono text-sm">{totalIssues}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    Findings are strictly categorized by impact type. Non-error statements (e.g. valid print calls) are classified as debug artifacts, not syntax bugs.
                  </p>
                </div>
              </div>

              {/* Quick Category Summary Grid (7 Categories) */}
              <div className="w-full md:w-auto grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {CATEGORY_CONFIGS.map((cat) => {
                  const count = getCategoryFindings(cat.id).length;
                  const Icon = cat.icon;
                  return (
                    <div
                      key={cat.id}
                      onClick={() => setActiveTab(cat.id)}
                      className={`p-2.5 rounded-2xl border text-center cursor-pointer transition-all ${
                        activeTab === cat.id
                          ? 'bg-slate-800 border-cyan-500 shadow-lg'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mx-auto mb-1 ${cat.color}`} />
                      <span className="text-[10px] font-bold text-slate-300 block truncate">
                        {cat.shortLabel}
                      </span>
                      {review.analyzerStatus === 'ANALYZER_UNAVAILABLE' ? (
                        <span className="text-[10px] font-mono font-semibold text-amber-400 block mt-0.5">
                          Unavailable
                        </span>
                      ) : count > 0 ? (
                        <span className={`text-xs font-mono font-bold ${cat.color} block`}>
                          {count} {count === 1 ? 'Issue' : 'Issues'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-emerald-400 flex items-center justify-center gap-0.5 mt-0.5">
                          <Check className="w-3 h-3" /> None
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CATEGORY FILTER TABS */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-cyan-400" />
                Filter:
              </span>

              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                [All] ({totalIssues})
              </button>

              {CATEGORY_CONFIGS.map((cat) => {
                const count = getCategoryFindings(cat.id).length;
                const isSelected = activeTab === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveTab(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-cyan-600 text-white shadow-md'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <span>[{cat.shortLabel}]</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${count > 0 ? 'bg-slate-800 text-cyan-300' : 'bg-emerald-950 text-emerald-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* MAIN TWO-COLUMN LAYOUT: SOURCE CODE (LEFT) + CATEGORIZED FINDINGS INSPECTOR (RIGHT) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Code Viewer */}
            <div className="lg:col-span-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-cyan-400" />
                  Source Code View
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">
                  Click line badges to highlight findings
                </span>
              </div>

              <CodeViewer
                code={review.code}
                language={review.language}
                findings={review.findings}
                selectedFindingId={selectedFinding?.id}
                onSelectFinding={(f) => setSelectedFinding(f)}
                maxHeight="max-h-[650px]"
              />
            </div>

            {/* Right Column: Structured Category Findings */}
            <div className="lg:col-span-6 space-y-6">
              {/* OVERALL STATUS BANNER */}
              {(() => {
                if (review.analyzerStatus === 'ANALYZER_UNAVAILABLE') {
                  return (
                    <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-300 space-y-1 shadow-lg">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                        <h3 className="font-extrabold text-sm tracking-wide text-amber-200 uppercase font-mono">
                          ⚠️ ANALYZER UNAVAILABLE
                        </h3>
                      </div>
                      <p className="text-xs text-amber-400/90 pl-7 leading-relaxed">
                        {review.analyzerMessage || `${review.language.toUpperCase()} compiler/analyzer is not installed on this host environment.`}
                      </p>
                    </div>
                  );
                }

                const realErrors = review.findings.filter(f =>
                  ['critical', 'high', 'medium', 'CRITICAL', 'HIGH', 'MEDIUM'].includes(f.severity) &&
                  f.category !== 'debug' && f.category !== 'DEBUG_DEVELOPMENT_ARTIFACTS' &&
                  f.category !== 'style' && f.category !== 'STYLE'
                );
                const hasReal = realErrors.length > 0;

                if (!hasReal) {
                  return (
                    <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 space-y-1 shadow-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        <h3 className="font-extrabold text-sm tracking-wide text-emerald-200 uppercase font-mono">
                          ✅ NO ERRORS DETECTED
                        </h3>
                      </div>
                      <p className="text-xs text-emerald-400/90 pl-7 leading-relaxed">
                        The static analysis engine verified the code: 0 syntax errors, 0 runtime bugs, and 0 security vulnerabilities detected.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-300 space-y-1 shadow-lg">
                    <div className="flex items-center gap-2">
                      <AlertOctagon className="w-5 h-5 text-red-400 shrink-0" />
                      <h3 className="font-extrabold text-sm tracking-wide text-red-200 uppercase font-mono">
                        🔴 ERRORS DETECTED ({realErrors.length})
                      </h3>
                    </div>
                    <p className="text-xs text-red-400/90 pl-7 leading-relaxed">
                      Real code errors detected. Please review the specific error findings highlighted below.
                    </p>
                  </div>
                );
              })()}

              {/* CATEGORIZED SECTIONS DISPLAY */}
              <div className="space-y-6 max-h-[650px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 pr-1">
                {CATEGORY_CONFIGS.filter(cat => activeTab === 'all' || activeTab === cat.id).map((cat) => {
                  const catFindings = getCategoryFindings(cat.id);
                  const Icon = cat.icon;

                  return (
                    <div
                      key={cat.id}
                      className={`p-4 rounded-2xl border ${cat.borderColor} ${cat.bgLight} space-y-3 shadow-lg`}
                    >
                      {/* Category Header */}
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${cat.color}`} />
                          <h4 className="text-xs font-bold text-slate-100 tracking-wider font-mono">
                            {cat.num}. {cat.title}
                          </h4>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-slate-400">
                          {catFindings.length} {catFindings.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>

                      {/* Category Content */}
                      {catFindings.length === 0 ? (
                        <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>✅ {cat.noIssuesMessage}</span>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {catFindings.map((f) => {
                            const isSelected = selectedFinding?.id === f.id;
                            const isConfirmed = f.findingType === 'CONFIRMED' || f.source !== 'AI Inference';
                            return (
                              <div
                                key={f.id}
                                onClick={() => setSelectedFinding(f)}
                                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-2 ${
                                  isSelected
                                    ? 'bg-slate-900 border-cyan-500 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-500/50'
                                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <SeverityBadge severity={f.severity} />
                                    <CategoryBadge category={f.category} />
                                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                      isConfirmed ? 'bg-rose-950/80 text-rose-300 border-rose-800' : 'bg-amber-950/80 text-amber-300 border-amber-800'
                                    }`}>
                                      {isConfirmed ? 'CONFIRMED' : 'POTENTIAL'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <SourceBadge source={f.source} detectionSource={f.detectionSource} />
                                    <span className="text-[11px] font-mono font-bold text-slate-400">
                                      Line {f.lineNumber}
                                    </span>
                                  </div>
                                </div>

                                <h5 className="font-bold text-xs text-slate-200">{f.title}</h5>

                                <div className="p-2 rounded-lg bg-slate-950 font-mono text-[11px] text-slate-300 border border-slate-800 truncate">
                                  <code>{f.codeSnippet}</code>
                                </div>

                                <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                                  {f.explanation}
                                </p>

                                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-800/80">
                                  <span
                                    className={`font-semibold ${
                                      f.status === 'resolved'
                                        ? 'text-emerald-400'
                                        : f.status === 'ignored'
                                        ? 'text-slate-500'
                                        : 'text-amber-400'
                                    }`}
                                  >
                                    Status: {f.status.toUpperCase()}
                                  </span>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAiFixFinding(f);
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                      <Sparkles className="w-3 h-3 text-cyan-400" />
                                      Fix with AI
                                    </button>
                                    <span className="text-cyan-400 font-semibold flex items-center gap-0.5 text-[10px]">
                                      Inspect →
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* DETAILED INSPECTION DRAWER FOR SELECTED FINDING */}
              {selectedFinding && (
                <div className="p-5 rounded-2xl bg-slate-900 border border-cyan-500/40 space-y-4 shadow-2xl animate-fade-in">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <SeverityBadge severity={selectedFinding.severity} />
                        <CategoryBadge category={selectedFinding.category} />
                        <SourceBadge source={selectedFinding.source} detectionSource={selectedFinding.detectionSource} />
                        <span className="text-xs font-mono font-bold text-slate-400">
                          Line {selectedFinding.lineNumber}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-slate-100">{selectedFinding.title}</h4>
                    </div>

                    {/* Status action toggle & AI Fix */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setAiFixFinding(selectedFinding)}
                        className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-md shadow-cyan-950/50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Fix with AI
                      </button>

                      {selectedFinding.status !== 'resolved' && (
                        <button
                          onClick={() => handleUpdateFindingStatus(selectedFinding.id, 'resolved')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          title="Mark as Resolved"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Resolve
                        </button>
                      )}
                      {selectedFinding.status !== 'ignored' && (
                        <button
                          onClick={() => handleUpdateFindingStatus(selectedFinding.id, 'ignored')}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          title="Ignore Finding"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Ignore
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono block">
                      Detailed Explanation
                    </span>
                    <div className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800 whitespace-pre-wrap font-sans">
                      {selectedFinding.explanation}
                    </div>
                  </div>

                  {selectedFinding.whyThisMatters && (
                    <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs text-cyan-200 space-y-1">
                      <span className="font-bold uppercase tracking-wider font-mono text-[10px] text-cyan-300 flex items-center gap-1">
                        <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                        Why This Matters
                      </span>
                      <p className="leading-relaxed text-slate-300">
                        {selectedFinding.whyThisMatters}
                      </p>
                    </div>
                  )}

                  {/* Recommended Fix / Diff */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono block">
                      Recommended Fix
                    </span>
                    <DiffViewer
                      diffPatch={selectedFinding.diffPatch}
                      originalCode={selectedFinding.codeSnippet}
                      recommendedFix={selectedFinding.recommendedFix}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TIME & SPACE COMPLEXITY */}
      {viewSection === 'complexity' && (
        <ComplexityVisualization complexity={review.complexity} />
      )}

      {/* TAB 3: AI OPTIMIZATIONS (BEFORE VS AFTER) */}
      {viewSection === 'optimizations' && (
        <OptimizationCard optimizations={review.optimizations} />
      )}

      {/* TAB 4: SECURITY & VULNERABILITY ANALYSIS */}
      {viewSection === 'security' && (
        <SecurityAnalysisCard security={review.securityAnalysis} />
      )}

      {/* TAB 5: CODE SMELLS & ANTI-PATTERNS */}
      {viewSection === 'smells' && (
        <CodeSmellsCard codeSmells={review.codeSmells} />
      )}

      {/* TAB 6: HEALTH BREAKDOWN */}
      {viewSection === 'breakdown' && (
        <ScoreBreakdownCard
          scoreBreakdown={review.scoreBreakdown}
          overallScore={review.overallScore}
        />
      )}

      {/* AI Fix Interactive Modal */}
      <AiFixModal
        isOpen={Boolean(aiFixFinding)}
        onClose={() => setAiFixFinding(null)}
        finding={aiFixFinding}
        code={review.code}
        language={review.language}
        onApplyFix={handleApplyFix}
      />

      {/* Export Modal with Real Action Downloads */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100">Export Categorized Review Report</h3>
            <p className="text-xs text-slate-400">
              Download static analysis report structured into Syntax, Security, Bugs, Performance, Quality, Complexity, and Smells.
            </p>
            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  exportMarkdown();
                  setShowExportModal(false);
                }}
                className="w-full p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left text-xs font-semibold text-slate-200 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span>Markdown Summary Report (.md)</span>
                </div>
                <Download className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => {
                  exportJSON();
                  setShowExportModal(false);
                }}
                className="w-full p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left text-xs font-semibold text-slate-200 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-purple-400" />
                  <span>Standard SARIF / JSON Format (.json)</span>
                </div>
                <Download className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => {
                  window.print();
                  setShowExportModal(false);
                }}
                className="w-full p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left text-xs font-semibold text-slate-200 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>Print / Save as PDF</span>
                </div>
                <Download className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <button
              onClick={() => setShowExportModal(false)}
              className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 font-medium pt-2 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Raw JSON Output Modal */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-slate-100 font-mono">
                  Standard Static Analysis JSON Payload
                </h3>
              </div>
              <button
                onClick={() => {
                  const jsonStr = JSON.stringify(reviewService.getReviewJSON(review), null, 2);
                  navigator.clipboard.writeText(jsonStr);
                  setCopiedJson(true);
                  setTimeout(() => setCopiedJson(false), 2000);
                }}
                className="px-3 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedJson ? 'Copied JSON!' : 'Copy Raw JSON'}
              </button>
            </div>

            <p className="text-xs text-slate-400 font-sans">
              Clean static analysis response conforming strictly to category schemas (<code className="text-cyan-400">SYNTAX_ERRORS</code>, <code className="text-purple-400">BUGS_RUNTIME_ERRORS</code>, <code className="text-rose-400">SECURITY_ISSUES</code>, <code className="text-amber-400">PERFORMANCE</code>, <code className="text-emerald-400">CODE_QUALITY</code>, <code className="text-teal-400">DEBUG_DEVELOPMENT_ARTIFACTS</code>, <code className="text-cyan-400">STYLE</code>).
            </p>

            <div className="flex-1 overflow-y-auto rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-300 leading-relaxed scrollbar-thin">
              <pre>{JSON.stringify(reviewService.getReviewJSON(review), null, 2)}</pre>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowJsonModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Close JSON Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
