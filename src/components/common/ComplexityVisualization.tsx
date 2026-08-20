import React from 'react';
import { ComplexityAnalysis } from '../../types';
import { Clock, Cpu, ArrowUpRight, CheckCircle2, AlertTriangle, Zap, Sparkles } from 'lucide-react';

interface ComplexityVisualizationProps {
  complexity?: ComplexityAnalysis;
}

const TIME_COMPLEXITIES = [
  { notation: 'O(1)', label: 'Constant', rank: 1, barWidth: '15%', color: 'bg-emerald-500', textColor: 'text-emerald-400', badge: 'Optimal' },
  { notation: 'O(log n)', label: 'Logarithmic', rank: 2, barWidth: '30%', color: 'bg-teal-500', textColor: 'text-teal-400', badge: 'Excellent' },
  { notation: 'O(n)', label: 'Linear', rank: 3, barWidth: '50%', color: 'bg-cyan-500', textColor: 'text-cyan-400', badge: 'Good' },
  { notation: 'O(n log n)', label: 'Linearithmic', rank: 4, barWidth: '70%', color: 'bg-blue-500', textColor: 'text-blue-400', badge: 'Fair' },
  { notation: 'O(n²)', label: 'Quadratic', rank: 5, barWidth: '85%', color: 'bg-amber-500', textColor: 'text-amber-400', badge: 'Warning' },
  { notation: 'O(2ⁿ)', label: 'Exponential', rank: 6, barWidth: '100%', color: 'bg-rose-500', textColor: 'text-rose-400', badge: 'Critical' }
];

export const ComplexityVisualization: React.FC<ComplexityVisualizationProps> = ({ complexity }) => {
  if (!complexity) {
    return (
      <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 text-slate-400 text-xs">
        Complexity analysis is calculating...
      </div>
    );
  }

  const detectedTime = (complexity.timeComplexity || 'O(n)').trim();
  const detectedSpace = (complexity.spaceComplexity || 'O(1)').trim();

  // Normalize detected string to match one of the predefined notations
  const matchedScale = TIME_COMPLEXITIES.find(
    (c) => detectedTime.toLowerCase().replace(/\s+/g, '') === c.notation.toLowerCase().replace(/\s+/g, '')
  ) || (detectedTime.includes('²') || detectedTime.includes('^2') ? TIME_COMPLEXITIES[4] : detectedTime.includes('2^n') || detectedTime.includes('2ⁿ') ? TIME_COMPLEXITIES[5] : TIME_COMPLEXITIES[2]);

  return (
    <div className="space-y-6 animate-fade-in" id="complexity-section">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Time Complexity Card */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold uppercase tracking-wider font-mono">Time Complexity</span>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${matchedScale.textColor} border-current/30 bg-slate-950`}>
              {matchedScale.badge}
            </span>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-extrabold font-mono text-slate-100 tracking-tight">
              {detectedTime}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              ({matchedScale.label})
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            {complexity.timeExplanation}
          </p>

          {complexity.bottleneckLocation && (
            <div className="flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-950/30 p-2.5 rounded-xl border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span><strong>Bottleneck:</strong> {complexity.bottleneckLocation}</span>
            </div>
          )}
        </div>

        {/* Space Complexity Card */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <Cpu className="w-4 h-4 text-teal-400" />
              <span className="text-xs font-bold uppercase tracking-wider font-mono">Space Complexity (Auxiliary)</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold text-teal-400 border border-teal-500/30 bg-slate-950">
              {detectedSpace === 'O(1)' ? 'Optimal In-Place' : 'Dynamic Memory'}
            </span>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-extrabold font-mono text-slate-100 tracking-tight">
              {detectedSpace}
            </span>
            <span className="text-xs font-semibold text-slate-400">
              {detectedSpace === 'O(1)' ? '(Constant Memory)' : '(Linear Memory)'}
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            {complexity.spaceExplanation}
          </p>

          {complexity.canBeImproved && complexity.improvedTimeComplexity && (
            <div className="flex items-start gap-2 text-[11px] text-emerald-300/90 bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-500/20">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span><strong>Optimization Target:</strong> Potential reduction to <code className="font-mono text-emerald-300 font-bold">{complexity.improvedTimeComplexity}</code> time / <code className="font-mono text-emerald-300 font-bold">{complexity.improvedSpaceComplexity || 'O(n)'}</code> space.</span>
            </div>
          )}
        </div>
      </div>

      {/* Visual Big-O Scale Comparison Chart */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
              Big-O Algorithmic Efficiency Spectrum
            </h4>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Current: <strong className={matchedScale.textColor}>{detectedTime}</strong>
          </span>
        </div>

        <div className="space-y-3">
          {TIME_COMPLEXITIES.map((tier) => {
            const isCurrent = tier.notation.toLowerCase().replace(/\s+/g, '') === matchedScale.notation.toLowerCase().replace(/\s+/g, '');
            return (
              <div
                key={tier.notation}
                className={`p-2.5 rounded-xl transition-all ${
                  isCurrent
                    ? 'bg-slate-950 border border-cyan-500/50 shadow-md ring-1 ring-cyan-500/30'
                    : 'bg-slate-950/40 border border-slate-800/60 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5 font-mono">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${isCurrent ? tier.textColor : 'text-slate-300'}`}>
                      {tier.notation}
                    </span>
                    <span className="text-slate-400 text-[11px] font-sans font-normal">
                      • {tier.label}
                    </span>
                  </div>

                  {isCurrent ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Detected Complexity
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">
                      {tier.badge}
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${tier.color} ${isCurrent ? 'animate-pulse' : ''}`}
                    style={{ width: tier.barWidth }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {complexity.complexityImprovementSummary && (
          <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-200 flex items-start gap-2.5">
            <ArrowUpRight className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-cyan-300 uppercase tracking-wider text-[10px] font-mono block">
                Recommended Complexity Optimization
              </span>
              <p className="leading-relaxed text-[11px] text-cyan-100/90">
                {complexity.complexityImprovementSummary}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
