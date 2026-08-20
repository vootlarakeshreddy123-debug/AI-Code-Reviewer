import React from 'react';
import { Severity, IssueCategory, ReviewStatus } from '../../types';
import { ShieldAlert, AlertTriangle, Info, CheckCircle2, Clock, Sparkles, Bug, Gauge, Code2, Terminal, Lightbulb, AlertOctagon } from 'lucide-react';

interface SeverityBadgeProps {
  severity: Severity;
  showIcon?: boolean;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, showIcon = true }) => {
  const norm = (severity || '').toLowerCase();
  switch (norm) {
    case 'critical':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
          {showIcon && <ShieldAlert className="w-3.5 h-3.5" />}
          CRITICAL
        </span>
      );
    case 'high':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
          {showIcon && <AlertTriangle className="w-3.5 h-3.5" />}
          HIGH
        </span>
      );
    case 'medium':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          {showIcon && <AlertTriangle className="w-3.5 h-3.5" />}
          MEDIUM
        </span>
      );
    case 'low':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {showIcon && <Info className="w-3.5 h-3.5" />}
          LOW
        </span>
      );
    case 'suggestion':
    case 'info':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
          {showIcon && <Lightbulb className="w-3.5 h-3.5" />}
          INFO
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
          {showIcon && <Info className="w-3.5 h-3.5" />}
          {severity}
        </span>
      );
  }
};

interface CategoryBadgeProps {
  category: IssueCategory;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category }) => {
  const norm = (category || '').toLowerCase();
  if (norm === 'syntax' || norm === 'syntax_errors') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-red-950/50 text-red-300 border border-red-800/50 font-mono">
        <AlertOctagon className="w-3 h-3 text-red-400" />
        SYNTAX_ERRORS
      </span>
    );
  }
  if (norm === 'security' || norm === 'security_issues') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-rose-950/40 text-rose-300 border border-rose-800/40 font-mono">
        <ShieldAlert className="w-3 h-3 text-rose-400" />
        SECURITY_ISSUES
      </span>
    );
  }
  if (norm === 'bug' || norm === 'bugs_runtime_errors') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-purple-950/40 text-purple-300 border border-purple-800/40 font-mono">
        <Bug className="w-3 h-3 text-purple-400" />
        BUGS_RUNTIME_ERRORS
      </span>
    );
  }
  if (norm === 'performance') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-950/40 text-amber-300 border border-amber-800/40 font-mono">
        <Gauge className="w-3 h-3 text-amber-400" />
        PERFORMANCE
      </span>
    );
  }
  if (norm === 'quality' || norm === 'code_quality') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 font-mono">
        <Sparkles className="w-3 h-3 text-emerald-400" />
        CODE_QUALITY
      </span>
    );
  }
  if (norm === 'style') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-cyan-950/40 text-cyan-300 border border-cyan-800/40 font-mono">
        <Code2 className="w-3 h-3 text-cyan-400" />
        STYLE
      </span>
    );
  }
  if (norm === 'debug' || norm === 'debug_development_artifacts' || norm === 'debug_development_artifact') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-teal-950/40 text-teal-300 border border-teal-800/40 font-mono">
        <Terminal className="w-3 h-3 text-teal-400" />
        DEBUG_DEVELOPMENT_ARTIFACTS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700 font-mono">
      <Sparkles className="w-3 h-3 text-slate-400" />
      {category}
    </span>
  );
};

interface StatusBadgeProps {
  status: ReviewStatus | 'open' | 'ignored' | 'resolved' | 'active' | 'syncing' | 'paused';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'completed':
    case 'resolved':
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
    case 'analyzing':
    case 'queued':
    case 'syncing':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20 animate-pulse">
          <Clock className="w-3 h-3 animate-spin" />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
    case 'open':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Open
        </span>
      );
    case 'ignored':
    case 'paused':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
          Failed
        </span>
      );
    default:
      return null;
  }
};

export const LanguageBadge: React.FC<{ language: string }> = ({ language }) => {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono uppercase font-semibold bg-slate-800 text-slate-300 border border-slate-700/60">
      <Code2 className="w-3 h-3 text-cyan-400" />
      {language}
    </span>
  );
};
