import React from 'react';

interface DiffViewerProps {
  diffPatch?: string;
  originalCode?: string;
  recommendedFix?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diffPatch, originalCode, recommendedFix }) => {
  if (diffPatch) {
    const patchLines = diffPatch.split('\n');
    return (
      <div className="border border-slate-800 rounded-lg bg-slate-950 font-mono text-xs overflow-hidden shadow-inner">
        <div className="px-3 py-1.5 bg-slate-900 text-slate-400 border-b border-slate-800 flex items-center justify-between font-sans text-xs">
          <span className="font-semibold text-slate-300">Suggested Code Diff Patch</span>
          <span className="text-[10px] text-slate-500 font-mono">- Red Removal / + Green Addition</span>
        </div>
        <div className="p-3 overflow-x-auto space-y-1">
          {patchLines.map((line, idx) => {
            const isAddition = line.startsWith('+');
            const isRemoval = line.startsWith('-');
            return (
              <div
                key={idx}
                className={`px-2 py-0.5 rounded ${
                  isAddition
                    ? 'bg-emerald-950/50 text-emerald-300 border-l-2 border-emerald-500'
                    : isRemoval
                    ? 'bg-rose-950/50 text-rose-300 border-l-2 border-rose-500 line-through opacity-80'
                    : 'text-slate-400'
                }`}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
      <div className="border border-red-900/40 rounded-lg bg-red-950/20 p-3 space-y-1.5">
        <span className="font-sans text-[11px] font-bold text-red-400 uppercase tracking-wider block">
          Current Vulnerable Snippet
        </span>
        <pre className="text-red-300 whitespace-pre-wrap overflow-x-auto p-2 bg-slate-950 rounded border border-red-900/30">
          {originalCode || '// Original snippet'}
        </pre>
      </div>

      <div className="border border-emerald-900/40 rounded-lg bg-emerald-950/20 p-3 space-y-1.5">
        <span className="font-sans text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
          Recommended Secure Code
        </span>
        <pre className="text-emerald-300 whitespace-pre-wrap overflow-x-auto p-2 bg-slate-950 rounded border border-emerald-900/30">
          {recommendedFix || '// Secure fix recommendation'}
        </pre>
      </div>
    </div>
  );
};
