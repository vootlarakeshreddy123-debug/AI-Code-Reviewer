import React from 'react';
import { CodeSmell } from '../../types';
import { Wind, AlertTriangle, Lightbulb, CheckCircle2, ChevronRight } from 'lucide-react';

interface CodeSmellsCardProps {
  codeSmells?: CodeSmell[];
}

export const CodeSmellsCard: React.FC<CodeSmellsCardProps> = ({ codeSmells = [] }) => {
  if (codeSmells.length === 0) {
    return (
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-2" id="code-smells-section">
        <div className="w-10 h-10 rounded-full bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-bold text-slate-200">No Code Smells Detected</h4>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          The code adheres to modularity standards, clean naming conventions, and manageable cyclomatic complexity.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6 shadow-2xl" id="code-smells-section">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <Wind className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
              Code Smell & Anti-Pattern Detection ({codeSmells.length})
            </h3>
            <p className="text-[11px] text-slate-400">
              Structural design flaws and maintainability anti-patterns identified separately from fatal compiler errors.
            </p>
          </div>
        </div>

        <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800/40">
          {codeSmells.length} Smell{codeSmells.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {codeSmells.map((smell) => (
          <div
            key={smell.id}
            className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/90 space-y-3 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  {smell.type}
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                  smell.impact === 'HIGH' ? 'bg-rose-950 text-rose-300 border border-rose-800/40' :
                  smell.impact === 'MEDIUM' ? 'bg-amber-950 text-amber-300 border border-amber-800/40' :
                  'bg-slate-900 text-slate-400 border border-slate-700'
                }`}>
                  {smell.impact} Impact
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {smell.description}
              </p>

              {smell.location && (
                <div className="text-[11px] font-mono text-slate-400">
                  Location: <span className="text-slate-200">{smell.location}</span>
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-cyan-200 space-y-1 mt-2">
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase text-cyan-300">
                <Lightbulb className="w-3 h-3 text-cyan-400" /> Refactoring Action
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                {smell.recommendation}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
