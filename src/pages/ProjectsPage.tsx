import React, { useState } from 'react';
import { Project, PageType, Language } from '../types';
import { reviewService } from '../services/reviewService';
import { LanguageBadge, StatusBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/StateViews';
import {
  FolderGit2,
  Plus,
  Search,
  ExternalLink,
  ShieldAlert,
  GitBranch,
  Clock,
  Sparkles,
  Layers
} from 'lucide-react';

interface ProjectsPageProps {
  projects: Project[];
  onNavigate: (page: PageType, paramId?: string) => void;
  onRefreshProjects: () => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  projects,
  onNavigate,
  onRefreshProjects
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Project Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<Language>('python');
  const [primaryBranch, setPrimaryBranch] = useState('main');

  const filteredProjects = projects.filter((p) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    }
    return true;
  });

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    reviewService.createProject({
      name,
      description: description || 'Project connected to AI Code Reviewer.',
      repoUrl: `https://github.com/techcorp/${name}`,
      language,
      primaryBranch: primaryBranch || 'main',
      customRulesCount: 5,
      securityHealth: 'A+'
    });

    setShowAddModal(false);
    setName('');
    setDescription('');
    onRefreshProjects();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-100 flex items-center gap-2 tracking-tight">
            <FolderGit2 className="w-6 h-6 text-cyan-400" />
            Monitored Projects
          </h2>
          <p className="text-xs md:text-sm text-slate-400">
            Connected code projects with automated static analysis and security policy rules.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs md:text-sm shadow-md shadow-cyan-950/50 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Connect New Project</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects by name..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="text-xs font-mono text-slate-400">
          Showing {filteredProjects.length} Projects
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <EmptyState
          title="No Projects Found"
          description="You haven't connected any code projects yet."
          actionLabel="Add First Project"
          onAction={() => setShowAddModal(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((p) => (
            <div
              key={p.id}
              onClick={() => onNavigate('project-details', p.id)}
              className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 transition-all cursor-pointer space-y-4 group flex flex-col justify-between shadow-xl"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <LanguageBadge language={p.language} />
                    <StatusBadge status={p.status} />
                  </div>
                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${
                      p.securityHealth === 'A+' || p.securityHealth === 'A'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    Grade {p.securityHealth}
                  </span>
                </div>

                <h3 className="font-bold text-base text-slate-100 group-hover:text-cyan-400 transition-colors tracking-tight">
                  {p.name}
                </h3>

                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  {p.description}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800/80 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">Reviews</span>
                    <span className="font-bold text-slate-200">{p.totalReviews}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">Avg Score</span>
                    <span className="font-bold text-cyan-400">{p.avgScore}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">Critical</span>
                    <span className="font-bold text-red-400">{p.criticalIssuesCount}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1 font-mono">
                    <GitBranch className="w-3 h-3 text-slate-400" />
                    {p.primaryBranch}
                  </span>
                  <span>
                    Last reviewed {new Date(p.lastReviewAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Project Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Connect New Code Project"
        description="Configure project settings to enable automated static code analysis and PR checks."
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Project Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. auth-service-go"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Project Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Microservice handling customer authentication..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 h-20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Primary Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="python">Python 3.12</option>
                <option value="typescript">TypeScript / React</option>
                <option value="javascript">JavaScript (Node.js)</option>
                <option value="go">Go 1.22</option>
                <option value="rust">Rust 2021</option>
                <option value="java">Java 21 (Spring)</option>
                <option value="cpp">C++20</option>
                <option value="csharp">C# (.NET 8)</option>
                <option value="php">PHP 8.3</option>
                <option value="ruby">Ruby 3.3</option>
                <option value="html">HTML</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Default Branch</label>
              <input
                type="text"
                value={primaryBranch}
                onChange={(e) => setPrimaryBranch(e.target.value)}
                placeholder="main"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/50"
            >
              Add Project
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
