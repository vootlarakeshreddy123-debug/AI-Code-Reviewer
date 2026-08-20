import React, { useState } from 'react';
import { GitHubRepo, PageType } from '../types';
import { reviewService } from '../services/reviewService';
import {
  GitBranch,
  Github,
  RefreshCw,
  CheckCircle2,
  GitPullRequest,
  Sliders,
  ShieldAlert,
  Bot,
  Star,
  ExternalLink,
  Sparkles
} from 'lucide-react';

interface GitHubIntegrationPageProps {
  repos: GitHubRepo[];
  onNavigate: (page: PageType, paramId?: string) => void;
  onRefreshRepos: () => void;
}

export const GitHubIntegrationPage: React.FC<GitHubIntegrationPageProps> = ({
  repos,
  onNavigate,
  onRefreshRepos
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoCommentPr, setAutoCommentPr] = useState(true);
  const [blockMergeOnCritical, setBlockMergeOnCritical] = useState(true);

  const handleSyncNow = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      onRefreshRepos();
    }, 1200);
  };

  const handleToggleConnect = (id: string) => {
    reviewService.toggleRepoConnection(id);
    onRefreshRepos();
  };

  const handleToggleAutoReview = (id: string) => {
    reviewService.toggleRepoAutoReview(id);
    onRefreshRepos();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-100 flex items-center gap-2 tracking-tight">
            <GitBranch className="w-6 h-6 text-cyan-400" />
            GitHub App Integration & Webhooks
          </h2>
          <p className="text-xs md:text-sm text-slate-400">
            Connect your GitHub organization to trigger automated code reviews on pull requests.
          </p>
        </div>

        <button
          onClick={handleSyncNow}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-cyan-400 font-bold text-xs md:text-sm transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Syncing Repos...' : 'Sync GitHub Repos'}</span>
        </button>
      </div>

      {/* GitHub OAuth App Connection Card */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-100 shadow-lg">
            <Github className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-slate-100">@techcorp-org</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Installed GitHub App • Authorized for 4 repositories • Webhook Active
            </p>
          </div>
        </div>

        <div className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
          App Installation ID: <span className="text-cyan-400 font-bold">#gh_inst_99812</span>
        </div>
      </div>

      {/* Installed Repositories Table & PR Triggers */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <GitPullRequest className="w-4 h-4 text-cyan-400" />
            Monitored GitHub Repositories ({repos.length})
          </h3>
          <span className="text-xs font-mono text-slate-400">
            PR Auto-Review Trigger Settings
          </span>
        </div>

        <div className="space-y-3">
          {repos.map((repo) => (
            <div
              key={repo.id}
              className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-200">{repo.fullName}</span>
                  {repo.isPrivate && (
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                      Private
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1 font-mono">
                    <Star className="w-3 h-3 text-amber-400" /> {repo.starsCount}
                  </span>
                  <span>•</span>
                  <span>Branch: {repo.defaultBranch}</span>
                  <span>•</span>
                  <span className="text-cyan-400 font-mono">{repo.openPullRequestsCount} Open PRs</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Auto Review PR toggle */}
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={repo.autoReviewPr}
                    onChange={() => handleToggleAutoReview(repo.id)}
                    disabled={!repo.isConnected}
                    className="rounded border-slate-800 bg-slate-950 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span>Auto-Review PRs</span>
                </label>

                {/* Connection toggle */}
                <button
                  onClick={() => handleToggleConnect(repo.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    repo.isConnected
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white border-transparent'
                  }`}
                >
                  {repo.isConnected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bot Automation Rules */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
          <Bot className="w-4 h-4 text-cyan-400" />
          GitHub Review Bot Preferences
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <label className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCommentPr}
              onChange={(e) => setAutoCommentPr(e.target.checked)}
              className="mt-0.5 rounded border-slate-800 bg-slate-950 text-cyan-600"
            />
            <div>
              <span className="font-bold text-slate-200 block">Post PR Comment Review Summaries</span>
              <span className="text-slate-400 leading-relaxed block mt-1">
                Bot automatically comments line-level fix recommendations directly on GitHub PR code diffs.
              </span>
            </div>
          </label>

          <label className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={blockMergeOnCritical}
              onChange={(e) => setBlockMergeOnCritical(e.target.checked)}
              className="mt-0.5 rounded border-slate-800 bg-slate-950 text-cyan-600"
            />
            <div>
              <span className="font-bold text-slate-200 block">Block Merging on Critical Vulnerability</span>
              <span className="text-slate-400 leading-relaxed block mt-1">
                Fails GitHub Status Check if code analysis detects critical SQL injection or hardcoded credentials.
              </span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};
