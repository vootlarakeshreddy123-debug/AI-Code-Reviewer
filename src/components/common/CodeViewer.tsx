import React, { useState } from 'react';
import { Finding } from '../../types';
import { Copy, Check, ShieldAlert, AlertTriangle, Info, Bug } from 'lucide-react';

interface CodeViewerProps {
  code: string;
  language?: string;
  findings?: Finding[];
  selectedFindingId?: string;
  onSelectFinding?: (finding: Finding) => void;
  maxHeight?: string;
  editable?: boolean;
  onChange?: (val: string) => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  code,
  language = 'text',
  findings = [],
  selectedFindingId,
  onSelectFinding,
  maxHeight = 'max-h-[600px]',
  editable = false,
  onChange
}) => {
  const [copied, setCopied] = useState(false);
  const lines = code.split('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Map line numbers to findings
  const findingsByLine = new Map<number, Finding[]>();
  findings.forEach(f => {
    const list = findingsByLine.get(f.lineNumber) || [];
    list.push(f);
    findingsByLine.set(f.lineNumber, list);
  });

  if (editable) {
    return (
      <div className="relative border border-slate-800 rounded-xl bg-slate-950 font-mono text-sm overflow-hidden group shadow-inner">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-wider text-cyan-400">{language} Editor</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
            title="Copy Code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <textarea
          value={code}
          onChange={(e) => onChange && onChange(e.target.value)}
          placeholder="// Paste source code here for AI analysis..."
          className="w-full h-80 p-4 bg-slate-950 text-slate-100 font-mono text-xs md:text-sm focus:outline-none resize-y leading-relaxed tracking-wide border-0"
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="relative border border-slate-800 rounded-xl bg-slate-950 font-mono text-xs md:text-sm overflow-hidden group shadow-xl">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 text-xs text-slate-400 select-none">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          <span className="ml-2 font-mono uppercase text-slate-300 font-bold text-[11px] tracking-wider px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60">
            {language}
          </span>
          <span className="text-slate-500 text-[11px]">({lines.length} lines)</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700/60 text-[11px] font-sans"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy Code'}
        </button>
      </div>

      {/* Code Container */}
      <div className={`overflow-x-auto ${maxHeight} scrollbar-thin scrollbar-thumb-slate-800`}>
        <table className="w-full border-collapse font-mono text-xs leading-relaxed">
          <tbody>
            {lines.map((lineContent, idx) => {
              const lineNum = idx + 1;
              const lineFindings = findingsByLine.get(lineNum);
              const hasFindings = lineFindings && lineFindings.length > 0;
              const isSelected = lineFindings?.some(f => f.id === selectedFindingId);

              let rowBg = 'hover:bg-slate-900/50';
              if (isSelected) {
                rowBg = 'bg-rose-950/40 border-l-4 border-rose-500';
              } else if (hasFindings) {
                const highestSev = lineFindings[0].severity;
                if (highestSev === 'critical') rowBg = 'bg-red-950/20 hover:bg-red-950/30 border-l-2 border-red-500/80';
                else if (highestSev === 'high') rowBg = 'bg-orange-950/20 hover:bg-orange-950/30 border-l-2 border-orange-500/80';
                else if (highestSev === 'medium') rowBg = 'bg-amber-950/20 hover:bg-amber-950/30 border-l-2 border-amber-500/80';
                else rowBg = 'bg-sky-950/20 hover:bg-sky-950/30 border-l-2 border-sky-500/80';
              }

              return (
                <React.Fragment key={idx}>
                  <tr className={`transition-colors duration-150 ${rowBg}`}>
                    {/* Line number */}
                    <td className="w-12 py-1 px-3 text-right select-none text-slate-600 border-r border-slate-800/60 font-mono text-[11px]">
                      {lineNum}
                    </td>

                    {/* Code contents */}
                    <td className="py-1 px-4 text-slate-200 whitespace-pre font-mono text-xs md:text-sm">
                      {lineContent || ' '}
                    </td>

                    {/* Finding trigger pill */}
                    <td className="w-16 py-1 px-2 text-right">
                      {hasFindings && (
                        <div className="flex justify-end gap-1">
                          {lineFindings.map((f) => (
                            <button
                              key={f.id}
                              onClick={() => onSelectFinding && onSelectFinding(f)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-transform hover:scale-105 ${
                                f.severity === 'critical'
                                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                  : f.severity === 'high'
                                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              }`}
                              title={`Line ${lineNum}: ${f.title}`}
                            >
                              <ShieldAlert className="w-3 h-3" />
                              L{lineNum}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Inline finding details expansion if selected */}
                  {isSelected && lineFindings && (
                    <tr className="bg-slate-900/90 border-y border-rose-900/50">
                      <td colSpan={3} className="p-3">
                        {lineFindings.map(f => (
                          <div key={f.id} className="p-3 bg-slate-950/90 rounded-lg border border-rose-500/30 text-xs font-sans space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-rose-400 text-sm flex items-center gap-1.5">
                                <Bug className="w-4 h-4 text-rose-500" />
                                {f.title}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400">Line {f.lineNumber}</span>
                            </div>
                            <p className="text-slate-300 leading-relaxed">{f.explanation}</p>
                            {f.recommendedFix && (
                              <div className="mt-2 p-2.5 rounded bg-emerald-950/30 border border-emerald-800/40 font-mono text-emerald-300 text-xs">
                                <span className="font-sans text-[11px] font-semibold text-emerald-400 block mb-1">Recommended Fix:</span>
                                {f.recommendedFix}
                              </div>
                            )}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
