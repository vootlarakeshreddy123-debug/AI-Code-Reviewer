import React from 'react';
import { PageType, CodeReview, Project, DashboardStats } from '../types';
import { ScoreRing } from '../components/common/ScoreRing';
import { StatusBadge, LanguageBadge, SeverityBadge } from '../components/common/Badge';
import {
  ShieldAlert,
  AlertTriangle,
  Lightbulb,
  FileCode2,
  FolderGit2,
  TrendingUp,
  ArrowRight,
  PlusCircle,
  GitBranch,
  Clock,
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface DashboardPageProps {
  stats: DashboardStats;
  recentReviews: CodeReview[];
  projects: Project[];
  onNavigate: (page: PageType, paramId?: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  stats,
  recentReviews,
  projects,
  onNavigate
}) => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner & Primary Call to Action */}
      <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950 border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Static Analysis Engine Connected</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-100 tracking-tight">
            Codebase Security & Quality Health
          </h2>
          <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
            Real-time vulnerability scanning, style linter, and performance profiling across {stats.activeProjects} connected repositories.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <button
            onClick={() => onNavigate('new-review')}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs md:text-sm shadow-xl shadow-cyan-950/60 transition-all cursor-pointer hover:scale-105"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Code Review</span>
          </button>
          <button
            onClick={() => onNavigate('projects')}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs md:text-sm transition-all cursor-pointer"
          >
            <FolderGit2 className="w-4 h-4 text-cyan-400" />
            <span>View Repositories</span>
          </button>
        </div>
      </div>

      {/* Main Required Stats Grid (Total Reviews, Avg Score, Critical Issues, Warnings, Suggestions) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Total Reviews */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Total Reviews</span>
            <FileCode2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl md:text-3xl font-extrabold text-slate-100 font-mono">
              {stats.totalReviews}
            </span>
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" />
              +12%
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            {(stats.codeLinesAnalyzed / 1000).toFixed(0)}k LOC analyzed
          </p>
        </div>

        {/* Average Review Score */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Avg Score</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl md:text-3xl font-extrabold text-emerald-400 font-mono">
              {stats.avgReviewScore}
              <span className="text-xs text-slate-500">/100</span>
            </span>
            <span className="text-[11px] text-emerald-400 font-semibold">Grade A</span>
          </div>
          <p className="text-[11px] text-slate-500">+5.4% security score boost</p>
        </div>

        {/* Critical Issues */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-3 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Critical Issues</span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl md:text-3xl font-extrabold text-red-400 font-mono">
              {stats.criticalIssues}
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono font-bold">
              Action Required
            </span>
          </div>
          <p className="text-[11px] text-slate-500">SQLi, XSS, Hardcoded Keys</p>
        </div>

        {/* Warnings */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-3 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Warnings</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl md:text-3xl font-extrabold text-amber-400 font-mono">
              {stats.warnings}
            </span>
            <span className="text-[11px] text-amber-400 font-semibold">Medium risk</span>
          </div>
          <p className="text-[11px] text-slate-500">Memory leaks & race cond.</p>
        </div>

        {/* Suggestions */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-3 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider font-mono">Suggestions</span>
            <Lightbulb className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl md:text-3xl font-extrabold text-sky-400 font-mono">
              {stats.suggestions}
            </span>
            <span className="text-[11px] text-sky-400 font-semibold">Optimization</span>
          </div>
          <p className="text-[11px] text-slate-500">Style, types, formatting</p>
        </div>
      </div>

      {/* Advanced AI Code Intelligence Highlight Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-cyan-500/20 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono uppercase font-bold text-cyan-400">⚡ Complexity Health</span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">92% O(1)-O(n)</span>
          </div>
          <p className="text-[11px] text-slate-300">
            Automated Big-O analysis identifies nested quadratic loops and suggests hash-lookup optimizations.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-purple-500/20 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono uppercase font-bold text-purple-400">🛠️ Maintainability Index</span>
            <span className="text-[10px] font-mono text-purple-300 font-bold">88/100 (Grade A)</span>
          </div>
          <p className="text-[11px] text-slate-300">
            Separates architectural code smells (long functions, dead code) from fatal syntax bugs.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-rose-500/20 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono uppercase font-bold text-rose-400">🔒 Security Posture</span>
            <span className="text-[10px] font-mono text-rose-300 font-bold">Low Risk</span>
          </div>
          <p className="text-[11px] text-slate-300">
            Deterministic vulnerability scanner with CWE mappings and AI surgical auto-fixes.
          </p>
        </div>
      </div>

      {/* Main Content Grid: Recent Reviews & Project Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Reviews (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Recent Code Reviews
              </h3>
              <p className="text-xs text-slate-400">Latest static analysis runs across active repositories</p>
            </div>
            <button
              onClick={() => onNavigate('review-history')}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {recentReviews.slice(0, 4).map((review) => (
              <div
                key={review.id}
                onClick={() => onNavigate('review-results', review.id)}
                className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-cyan-500/50 transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-2 max-w-md">
                  <div className="flex items-center gap-2 flex-wrap">
                    <LanguageBadge language={review.language} />
                    <StatusBadge status={review.status} />
                    <span className="text-xs font-semibold text-slate-400 font-mono truncate">
                      {review.projectName || 'Standalone'}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-200 group-hover:text-cyan-400 transition-colors">
                    {review.title}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>By {review.author.name}</span>
                    <span>•</span>
                    <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="font-mono text-slate-400">{review.linesOfCode} LOC</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-800">
                  {/* Issue count breakdown */}
                  {review.analyzerStatus === 'ANALYZER_UNAVAILABLE' || review.status === 'failed' ? (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-xs font-mono">
                      Unavailable
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-bold" title="Critical Issues">
                        {review.issueCounts.critical} C
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold" title="Warnings">
                        {review.issueCounts.warning} W
                      </span>
                    </div>
                  )}

                  {/* Score ring */}
                  <ScoreRing score={review.overallScore} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Project Statistics (1 col) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-cyan-400" />
                Project Statistics
              </h3>
              <button
                onClick={() => onNavigate('projects')}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>Projects</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {projects.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  onClick={() => onNavigate('project-details', p.id)}
                  className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-200">{p.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        p.securityHealth === 'A+' || p.securityHealth === 'A'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      Grade {p.securityHealth}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono text-[11px]">{p.totalReviews} reviews</span>
                    <span className="text-red-400 font-semibold">{p.criticalIssuesCount} critical</span>
                    <span className="font-mono text-cyan-400 font-bold">{p.avgScore}/100</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-800/40 text-xs text-cyan-200 space-y-2">
            <span className="font-bold flex items-center gap-1.5 text-cyan-300">
              <GitBranch className="w-4 h-4" />
              GitHub Webhook Status
            </span>
            <p className="text-[11px] text-cyan-200/80 leading-relaxed">
              Automated pull request scanning enabled for 3 repositories. Next sync in 15 mins.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
