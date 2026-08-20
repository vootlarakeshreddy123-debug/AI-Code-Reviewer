import React, { useState } from 'react';
import { CustomRule, PageType, IssueCategory, Severity, Language } from '../types';
import { reviewService } from '../services/reviewService';
import { CategoryBadge, SeverityBadge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/StateViews';
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  Code2,
  CheckCircle2,
  ShieldAlert,
  Search,
  Sparkles
} from 'lucide-react';

interface CustomRulesPageProps {
  rules: CustomRule[];
  onNavigate: (page: PageType) => void;
  onRefreshRules: () => void;
}

export const CustomRulesPage: React.FC<CustomRulesPageProps> = ({
  rules,
  onNavigate,
  onRefreshRules
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Rule Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IssueCategory>('security');
  const [severity, setSeverity] = useState<Severity>('critical');
  const [targetLanguage, setTargetLanguage] = useState<Language | 'all'>('all');
  const [pattern, setPattern] = useState('');

  const filteredRules = rules.filter((r) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    }
    return true;
  });

  const handleToggleRule = (id: string) => {
    reviewService.toggleCustomRule(id);
    onRefreshRules();
  };

  const handleDeleteRule = (id: string) => {
    if (confirm('Delete this custom rule permanently?')) {
      reviewService.deleteCustomRule(id);
      onRefreshRules();
    }
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pattern.trim()) return;

    reviewService.createCustomRule({
      name,
      description: description || 'Custom static analysis detection rule.',
      category,
      severity,
      language: targetLanguage,
      enabled: true,
      pattern
    });

    setShowAddModal(false);
    setName('');
    setDescription('');
    setPattern('');
    onRefreshRules();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-100 flex items-center gap-2 tracking-tight">
            <SlidersHorizontal className="w-6 h-6 text-cyan-400" />
            Custom Security & Policy Rules
          </h2>
          <p className="text-xs md:text-sm text-slate-400">
            Define domain-specific linter rules, prohibited regex patterns, and security constraints.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs md:text-sm shadow-md shadow-cyan-950/50 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Custom Rule</span>
        </button>
      </div>

      {/* Filter */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search custom rules..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <span className="text-xs font-mono text-slate-400">
          {rules.filter((r) => r.enabled).length} Active Rules
        </span>
      </div>

      {/* Rules Table */}
      {filteredRules.length === 0 ? (
        <EmptyState
          title="No Custom Rules Defined"
          description="Create your first policy rule to flag forbidden patterns or custom linter violations."
          actionLabel="Create Custom Rule"
          onAction={() => setShowAddModal(true)}
        />
      ) : (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-4">Rule Name & Pattern</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Severity</th>
                  <th className="p-4">Language</th>
                  <th className="p-4">Total Hits</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredRules.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="p-4 max-w-sm space-y-1">
                      <span className="font-bold text-sm text-slate-200 block">{r.name}</span>
                      <p className="text-[11px] text-slate-400 leading-tight">{r.description}</p>
                      <code className="text-[10px] font-mono text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 block truncate max-w-xs">
                        Pattern: {r.pattern}
                      </code>
                    </td>

                    <td className="p-4">
                      <CategoryBadge category={r.category} />
                    </td>

                    <td className="p-4">
                      <SeverityBadge severity={r.severity} />
                    </td>

                    <td className="p-4 font-mono text-xs uppercase text-slate-300">
                      {r.language}
                    </td>

                    <td className="p-4 font-mono font-bold text-slate-200">
                      {r.totalHits}
                    </td>

                    <td className="p-4">
                      <label className="flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={r.enabled}
                          onChange={() => handleToggleRule(r.id)}
                          className="rounded border-slate-800 bg-slate-950 text-cyan-600 focus:ring-cyan-500"
                        />
                        <span className={r.enabled ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                          {r.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </label>
                    </td>

                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleDeleteRule(r.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Custom Rule Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Custom Policy Rule"
        description="Specify a AST regex search pattern and category to evaluate during code reviews."
      >
        <form onSubmit={handleCreateRule} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Rule Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ban dangerouslySetInnerHTML"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Rule Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain why this code pattern is forbidden..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 h-16"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as IssueCategory)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="security">Security</option>
                <option value="bug">Bug</option>
                <option value="performance">Performance</option>
                <option value="quality">Quality</option>
                <option value="style">Style</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Regex Pattern / Token</label>
            <input
              type="text"
              required
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="e.g. dangerouslySetInnerHTML|eval\("
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
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
              Save Rule
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
