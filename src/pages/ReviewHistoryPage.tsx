import React, { useState } from 'react';
import { CodeReview, PageType, Language } from '../types';
import { reviewService } from '../services/reviewService';
import { ScoreRing } from '../components/common/ScoreRing';
import { LanguageBadge, StatusBadge } from '../components/common/Badge';
import { EmptyState } from '../components/common/StateViews';
import {
  History,
  Search,
  Filter,
  Trash2,
  Download,
  ExternalLink,
  ShieldAlert,
  Clock,
  Sparkles,
  ArrowUpDown
} from 'lucide-react';

interface ReviewHistoryPageProps {
  reviews: CodeReview[];
  onNavigate: (page: PageType, paramId?: string) => void;
  onRefreshReviews: () => void;
}

export const ReviewHistoryPage: React.FC<ReviewHistoryPageProps> = ({
  reviews,
  onNavigate,
  onRefreshReviews
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [selectedScoreFilter, setSelectedScoreFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const filteredReviews = reviews.filter((r) => {
    if (selectedLanguage !== 'all' && r.language !== selectedLanguage) return false;
    if (selectedScoreFilter === 'low' && r.overallScore >= 70) return false;
    if (selectedScoreFilter === 'high' && r.overallScore < 85) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchProject = r.projectName?.toLowerCase().includes(q);
      const matchLang = r.language.toLowerCase().includes(q);
      return matchTitle || matchProject || matchLang;
    }
    return true;
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredReviews.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredReviews.map((r) => r.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedIds.length} review sessions?`)) {
      selectedIds.forEach((id) => reviewService.deleteReview(id));
      setSelectedIds([]);
      onRefreshReviews();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-100 flex items-center gap-2 tracking-tight">
            <History className="w-6 h-6 text-cyan-400" />
            Review History & Audit Trail
          </h2>
          <p className="text-xs md:text-sm text-slate-400">
            Historical logs of all code reviews, AST scans, and static analysis outputs.
          </p>
        </div>

        <button
          onClick={() => onNavigate('new-review')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs md:text-sm shadow-md shadow-cyan-950/50 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          <span>New Analysis Run</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, project, or language..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap justify-end">
          {/* Language filter */}
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono"
          >
            <option value="all">All Languages</option>
            <option value="python">Python</option>
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="go">Go</option>
            <option value="rust">Rust</option>
          </select>

          {/* Score filter */}
          <select
            value={selectedScoreFilter}
            onChange={(e) => setSelectedScoreFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300"
          >
            <option value="all">All Scores</option>
            <option value="high">High Score (85+)</option>
            <option value="low">Needs Attention (&lt; 70)</option>
          </select>

          {/* Bulk actions */}
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Review Table */}
      {filteredReviews.length === 0 ? (
        <EmptyState
          title="No Matching Reviews Found"
          description="No historical code reviews match your search or filter parameters."
          actionLabel="Run New Review"
          onAction={() => onNavigate('new-review')}
        />
      ) : (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredReviews.length && filteredReviews.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-800 bg-slate-950 text-cyan-600"
                    />
                  </th>
                  <th className="p-4">Review Session</th>
                  <th className="p-4">Project Context</th>
                  <th className="p-4">Language</th>
                  <th className="p-4">Score</th>
                  <th className="p-4">Issues Found</th>
                  <th className="p-4">Timestamp</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredReviews.map((r) => {
                  const isSelected = selectedIds.includes(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-800/50 transition-colors ${
                        isSelected ? 'bg-slate-800/80' : ''
                      }`}
                    >
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(r.id)}
                          className="rounded border-slate-800 bg-slate-950 text-cyan-600"
                        />
                      </td>

                      <td className="p-4 font-semibold text-slate-200 max-w-xs">
                        <button
                          onClick={() => onNavigate('review-results', r.id)}
                          className="hover:text-cyan-400 text-left block truncate font-bold text-sm"
                        >
                          {r.title}
                        </button>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {r.linesOfCode} LOC • {r.durationMs}ms scan
                        </span>
                      </td>

                      <td className="p-4 text-slate-300 font-mono text-xs">
                        {r.projectName || 'Standalone'}
                      </td>

                      <td className="p-4">
                        <LanguageBadge language={r.language} />
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <ScoreRing score={r.overallScore} size="sm" />
                        </div>
                      </td>

                      <td className="p-4">
                        {r.analyzerStatus === 'ANALYZER_UNAVAILABLE' || r.status === 'failed' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-xs font-mono">
                            Unavailable
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5 font-mono">
                            <span
                              className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-bold"
                              title="Critical"
                            >
                              {r.issueCounts.critical} C
                            </span>
                            <span
                              className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold"
                              title="Warnings"
                            >
                              {r.issueCounts.warning} W
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-slate-400 text-[11px]">
                        {new Date(r.createdAt).toLocaleDateString()} {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      <td className="p-4 text-right">
                        <button
                          onClick={() => onNavigate('review-results', r.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold text-xs border border-slate-700"
                        >
                          <span>Results</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
