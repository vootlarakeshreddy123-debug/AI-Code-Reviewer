import React, { useState, useEffect } from 'react';
import { Finding, Language } from '../../types';
import { reviewService } from '../../services/reviewService';
import { Sparkles, Check, Copy, X, Loader2, Wrench, ArrowRight } from 'lucide-react';

interface AiFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  finding: Finding | null;
  code: string;
  language: Language;
  onApplyFix?: (fixedCode: string) => void;
}

export const AiFixModal: React.FC<AiFixModalProps> = ({
  isOpen,
  onClose,
  finding,
  code,
  language,
  onApplyFix
}) => {
  const [loading, setLoading] = useState(false);
  const [fixResult, setFixResult] = useState<{
    fixedSnippet: string;
    explanation: string;
    diffPatch?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && finding) {
      setLoading(true);
      setFixResult(null);
      reviewService
        .requestAiFix(code, language, finding)
        .then((res) => {
          setFixResult(res);
        })
        .catch((err) => {
          console.error(err);
          setFixResult({
            fixedSnippet: finding.recommendedFix || finding.recommended_fix || finding.codeSnippet,
            explanation: finding.explanation || 'Applied suggested replacement.'
          });
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, finding, code, language]);

  if (!isOpen || !finding) return null;

  const handleCopy = () => {
    if (fixResult?.fixedSnippet) {
      navigator.clipboard.writeText(fixResult.fixedSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApply = () => {
    if (fixResult?.fixedSnippet && onApplyFix) {
      // If finding has codeSnippet, replace first occurrence
      const targetSnippet = finding.codeSnippet || finding.problematicCode || '';
      if (targetSnippet && code.includes(targetSnippet)) {
        const newCode = code.replace(targetSnippet, fixResult.fixedSnippet);
        onApplyFix(newCode);
      } else {
        // Fallback replacement on specified line
        const lines = code.split('\n');
        const targetLineIdx = (finding.lineNumber || finding.line || 1) - 1;
        if (targetLineIdx >= 0 && targetLineIdx < lines.length) {
          lines[targetLineIdx] = fixResult.fixedSnippet;
          onApplyFix(lines.join('\n'));
        }
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-cyan-500/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                AI Surgical Fix Generator
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                  {language.toUpperCase()}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {finding.title || 'Correction for selected finding'} (Line {finding.lineNumber || finding.line || 1})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <p className="text-xs font-semibold text-slate-300">Generating optimal AI fix...</p>
              <p className="text-[11px] text-slate-500">Evaluating AST context, idioms, and security boundaries</p>
            </div>
          ) : (
            <>
              {/* Problematic Code vs Suggested Fix */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-mono font-bold text-rose-400 uppercase tracking-wider block">
                    Original Problematic Snippet (Line {finding.lineNumber || finding.line || 1})
                  </span>
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-rose-900/40 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed">
                    <pre>{finding.codeSnippet || finding.problematicCode || 'Code snippet not provided'}</pre>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="font-bold text-emerald-400 uppercase tracking-wider">
                      AI Recommended Solution
                    </span>
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer font-sans"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copied' : 'Copy Solution'}
                    </button>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/40 font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed">
                    <pre>{fixResult?.fixedSnippet || 'Fix generated'}</pre>
                  </div>
                </div>
              </div>

              {/* Explanation */}
              {fixResult?.explanation && (
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-mono uppercase font-bold text-cyan-400 tracking-wider block">
                    Why This Fix Works
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {fixResult.explanation}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 transition cursor-pointer flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>

            {onApplyFix && (
              <button
                onClick={handleApply}
                disabled={loading}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/20 transition cursor-pointer flex items-center gap-1.5"
              >
                <Wrench className="w-3.5 h-3.5" />
                Apply Fix to Editor
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
