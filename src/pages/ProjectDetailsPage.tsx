import React from 'react';
import { Project, CodeReview, PageType } from '../types';
import { ScoreRing } from '../components/common/ScoreRing';
import { LanguageBadge, StatusBadge } from '../components/common/Badge';
import { EmptyState } from '../components/common/StateViews';
import {
  FolderGit2,
  GitBranch,
  ArrowLeft,
  ExternalLink,
  ShieldAlert,
  Play,
  Clock,
  Sparkles,
  GitPullRequest,
  CheckCircle2,
  Sliders
} from 'lucide-react';

interface ProjectDetailsPageProps {
  project?: Project;
  projectReviews: CodeReview[];
  onNavigate: (page: PageType, paramId?: string) => void;
}

export const ProjectDetailsPage: React.FC<ProjectDetailsPageProps> = ({
  project,
  projectReviews,
  onNavigate
}) => {
  if (!project) {
    return (
      <EmptyState
        title="Project Not Found"
        description="The requested project repository does not exist."
        actionLabel="Back to Projects"
        onAction={() => onNavigate('projects')}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <button
            onClick={() => onNavigate('projects')}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Projects List
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl md:text-2xl font-bold text-slate-100 tracking-tight">
              {project.name}
            </h2>
            <LanguageBadge language={project.language} />
            <StatusBadge status={project.status} />
          </div>
          <p className="text-xs text-slate-400 max-w-xl">
            {project.description}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            Repository
          </a>
          <button
            onClick={() => onNavigate('new-review')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-950/50"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            Run Project Scan
          </button>
        </div>
      </div>

      {/* Project Overview Stats Card */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
          <span className="text-xs font-mono uppercase font-semibold text-slate-400 block mb-1">
            Overall Security Health
          </span>
          <span className="text-2xl font-extrabold text-emerald-400 font-mono">
            Grade {project.securityHealth}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
          <span className="text-xs font-mono uppercase font-semibold text-slate-400 block mb-1">
            Average Score
          </span>
          <span className="text-2xl font-extrabold text-cyan-400 font-mono">
            {project.avgScore}/100
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-950/60 border border-red-500/20">
          <span className="text-xs font-mono uppercase font-semibold text-slate-400 block mb-1">
            Open Critical Flaws
          </span>
          <span className="text-2xl font-extrabold text-red-400 font-mono">
            {project.criticalIssuesCount}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
          <span className="text-xs font-mono uppercase font-semibold text-slate-400 block mb-1">
            Active Branch
          </span>
          <span className="text-xl font-bold text-slate-200 font-mono flex items-center justify-center gap-1">
            <GitBranch className="w-4 h-4 text-cyan-400" />
            {project.primaryBranch}
          </span>
        </div>
      </div>

      {/* Project Reviews History */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Project Code Review Runs ({projectReviews.length})
          </h3>
          <button
            onClick={() => onNavigate('new-review')}
            className="text-xs font-bold text-cyan-400 hover:text-cyan-300"
          >
            + Trigger Review
          </button>
        </div>

        {projectReviews.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            No code reviews have been associated with this project yet.
          </p>
        ) : (
          <div className="space-y-3">
            {projectReviews.map((r) => (
              <div
                key={r.id}
                onClick={() => onNavigate('review-results', r.id)}
                className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-cyan-500/50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-slate-200 hover:text-cyan-400 transition-colors">
                    {r.title}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {r.linesOfCode} LOC • Ran by {r.author.name} on {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  {r.analyzerStatus === 'ANALYZER_UNAVAILABLE' || r.status === 'failed' ? (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-xs font-mono">
                      Unavailable
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 font-bold">
                        {r.issueCounts.critical} C
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold">
                        {r.issueCounts.warning} W
                      </span>
                    </div>
                  )}
                  <ScoreRing score={r.overallScore} size="sm" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
