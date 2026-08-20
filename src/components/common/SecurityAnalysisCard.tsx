import React from 'react';
import { SecurityAnalysisSummary } from '../../types';
import { Shield, ShieldAlert, ShieldCheck, AlertCircle, CheckCircle2, Lock } from 'lucide-react';

interface SecurityAnalysisCardProps {
  security?: SecurityAnalysisSummary;
}

export const SecurityAnalysisCard: React.FC<SecurityAnalysisCardProps> = ({ security }) => {
  if (!security) return null;

  const risk = (security.riskLevel || 'LOW').toUpperCase();
  const isHighRisk = risk === 'CRITICAL' || risk === 'HIGH';

  return (
    <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6 shadow-2xl" id="security-analysis-section">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          {isHighRisk ? (
            <ShieldAlert className="w-5 h-5 text-rose-400" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          )}
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
              Comprehensive Security & Vulnerability Analysis
            </h3>
            <p className="text-[11px] text-slate-400">
              Deterministic vulnerability scan for injection attacks, unsafe memory/deserialization, and exposed credentials.
            </p>
          </div>
        </div>

        <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
          risk === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border-rose-600' :
          risk === 'HIGH' ? 'bg-orange-950 text-orange-300 border-orange-600' :
          risk === 'MEDIUM' ? 'bg-amber-950 text-amber-300 border-amber-600' :
          'bg-emerald-950 text-emerald-300 border-emerald-600'
        }`}>
          Risk: {risk}
        </span>
      </div>

      {/* Overview */}
      <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
        {security.overview}
      </p>

      {/* Vulnerabilities List */}
      {security.vulnerabilities && security.vulnerabilities.length > 0 ? (
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> Detected Security Vulnerabilities ({security.vulnerabilities.length})
          </h4>
          <div className="space-y-3">
            {security.vulnerabilities.map((vuln) => (
              <div
                key={vuln.id}
                className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-rose-200">{vuln.name}</span>
                    {vuln.cwe && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950 text-rose-300 border border-rose-800">
                        {vuln.cwe}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono font-bold text-rose-400 uppercase">
                    {vuln.severity} Severity
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong className="text-slate-100">Why it's dangerous:</strong> {vuln.explanation}
                </p>

                {vuln.location && (
                  <div className="text-[11px] text-slate-400 font-mono">
                    Target: <span className="text-slate-200">{vuln.location}</span>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs text-emerald-300 space-y-1">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-400 block font-mono">
                    Recommended Security Fix
                  </span>
                  <p className="text-[11px] leading-relaxed text-slate-200">
                    {vuln.fix}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>No critical security vulnerabilities or credential leaks were detected in this snippet.</span>
        </div>
      )}

      {/* Safe Practices */}
      {security.safePractices && security.safePractices.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <span className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-cyan-400" /> Recommended Defensive Practices
          </span>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
            {security.safePractices.map((practice, idx) => (
              <li key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="text-[11px] truncate">{practice}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
