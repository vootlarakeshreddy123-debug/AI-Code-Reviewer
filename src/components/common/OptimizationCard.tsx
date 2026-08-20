import React, { useState } from 'react';
import { OptimizationSuggestion } from '../../types';
import { Sparkles, ArrowRight, Check, Copy, Zap, TrendingDown } from 'lucide-react';

interface OptimizationCardProps {
  optimizations?: OptimizationSuggestion[];
}

export const OptimizationCard: React.FC<OptimizationCardProps> = ({ optimizations = [] }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (optimizations.length === 0) {
    return (
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-2">
        <div className="w-10 h-10 rounded-full bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
          <Zap className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-bold text-slate-200">Algorithmic Profile is Optimal</h4>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          No significant nested loop bottlenecks or inefficient linear searches were detected in the reviewed code snippet.
        </p>
      </div>
    );
  }

  const handleCopy = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in" id="optimizations-section">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
            AI Algorithmic Optimization Suggestions ({optimizations.length})
          </h3>
        </div>
        <span className="text-xs text-slate-400 font-mono">Before vs After Comparison</span>
      </div>

      <div className="space-y-6">
        {optimizations.map((opt) => (
          <div
            key={opt.id}
            className="p-6 rounded-3xl bg-slate-900 border border-cyan-500/30 space-y-4 shadow-2xl relative overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                {opt.title}
              </h4>

              {opt.beforeComplexity && opt.afterComplexity && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/40">
                    {opt.beforeComplexity}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40 font-bold">
                    {opt.afterComplexity}
                  </span>
                </div>
              )}
            </div>

            {/* Approach Explanation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-mono font-bold text-rose-400 block">
                  Current Approach
                </span>
                <p className="text-slate-300 leading-relaxed">{opt.currentApproach}</p>
              </div>

              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 space-y-1">
                <span className="text-[10px] uppercase font-mono font-bold text-cyan-300 block">
                  Recommended Approach
                </span>
                <p className="text-slate-200 leading-relaxed">{opt.recommendedApproach}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {opt.explanation}
            </p>

            {opt.potentialSavings && (
              <div className="flex items-center gap-2 text-xs text-emerald-300 font-semibold bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-500/20 font-mono">
                <TrendingDown className="w-4 h-4 text-emerald-400" />
                <span>Gain: {opt.potentialSavings}</span>
              </div>
            )}

            {/* Before vs After Code Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              {/* Before Code */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
                  <span className="text-rose-400 font-bold">BEFORE (Inefficient)</span>
                  {opt.beforeComplexity && <span>{opt.beforeComplexity}</span>}
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-rose-900/40 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed max-h-48">
                  <pre>{opt.beforeCode}</pre>
                </div>
              </div>

              {/* After Code */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
                  <span className="text-emerald-400 font-bold">AFTER (Optimized)</span>
                  <button
                    onClick={() => handleCopy(opt.id, opt.afterCode)}
                    className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer font-sans font-semibold"
                  >
                    {copiedId === opt.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedId === opt.id ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-900/50 font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed max-h-48">
                  <pre>{opt.afterCode}</pre>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
