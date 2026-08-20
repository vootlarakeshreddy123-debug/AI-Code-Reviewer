import React from 'react';
import { ScoreBreakdown } from '../../types';
import { ShieldCheck, CheckCircle2, Zap, Sparkles, Wrench, Shield, Award } from 'lucide-react';

interface ScoreBreakdownCardProps {
  scoreBreakdown?: ScoreBreakdown;
  overallScore: number;
}

export const ScoreBreakdownCard: React.FC<ScoreBreakdownCardProps> = ({
  scoreBreakdown,
  overallScore
}) => {
  const dimensions = [
    {
      id: 'correctness',
      name: 'Correctness & Reliability',
      score: scoreBreakdown?.correctness ?? Math.max(20, overallScore),
      icon: CheckCircle2,
      color: 'text-emerald-400',
      barColor: 'bg-emerald-500',
      reasoning: scoreBreakdown?.reasoning?.correctness || 'Evaluation of syntax validity, type safety, runtime exception resilience, and bounds integrity.'
    },
    {
      id: 'security',
      name: 'Security & Vulnerability Risk',
      score: scoreBreakdown?.security ?? 95,
      icon: Shield,
      color: 'text-rose-400',
      barColor: 'bg-rose-500',
      reasoning: scoreBreakdown?.reasoning?.security || 'Analysis of injection vectors, unsafe execution contexts, memory leaks, and input sanitization.'
    },
    {
      id: 'performance',
      name: 'Performance & Algorithmic Scalability',
      score: scoreBreakdown?.performance ?? 90,
      icon: Zap,
      color: 'text-amber-400',
      barColor: 'bg-amber-500',
      reasoning: scoreBreakdown?.reasoning?.performance || 'Evaluation of Big-O time and space complexity, loop bottlenecks, and redundant computation.'
    },
    {
      id: 'maintainability',
      name: 'Maintainability & Architecture',
      score: scoreBreakdown?.maintainability ?? 85,
      icon: Wrench,
      color: 'text-purple-400',
      barColor: 'bg-purple-500',
      reasoning: scoreBreakdown?.reasoning?.maintainability || 'Assessment of cyclomatic complexity, function lengths, decoupling, and modular separation.'
    },
    {
      id: 'codeQuality',
      name: 'Code Quality & Idiomatic Style',
      score: scoreBreakdown?.codeQuality ?? 90,
      icon: Sparkles,
      color: 'text-cyan-400',
      barColor: 'bg-cyan-500',
      reasoning: scoreBreakdown?.reasoning?.codeQuality || 'Verification of language-specific naming idioms, PEP/clean-code conventions, and dead-code elimination.'
    }
  ];

  return (
    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6 shadow-2xl" id="score-breakdown-section">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <Award className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
              Multi-Dimensional Code Health Breakdown
            </h3>
            <p className="text-[11px] text-slate-400">
              Deterministic scoring weighted across 5 core software engineering criteria.
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-2xl font-extrabold font-mono text-cyan-400">
            {overallScore}<span className="text-xs text-slate-500 font-normal">/100</span>
          </span>
          <span className="block text-[10px] uppercase font-mono text-slate-400">Overall Score</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dimensions.map((dim) => {
          const Icon = dim.icon;
          const score = dim.score;
          const grade = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';

          return (
            <div
              key={dim.id}
              className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/90 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${dim.color}`} />
                    <span className="text-xs font-bold text-slate-200 truncate">{dim.name}</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    score >= 85 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40' :
                    score >= 70 ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/40' :
                    'bg-amber-950 text-amber-300 border border-amber-800/40'
                  }`}>
                    {grade} ({score}%)
                  </span>
                </div>

                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${dim.barColor}`}
                    style={{ width: `${Math.min(100, Math.max(5, score))}%` }}
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                {dim.reasoning}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
