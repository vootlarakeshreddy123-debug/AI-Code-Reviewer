import React from 'react';

interface ScoreRingProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showGrade?: boolean;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({ score, size = 'md', label, showGrade = false }) => {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  
  // Dimensions
  const strokeWidth = size === 'sm' ? 6 : size === 'md' ? 8 : 12;
  const radius = size === 'sm' ? 24 : size === 'md' ? 36 : 56;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (normalizedScore / 100) * circumference;

  let colorClass = 'text-emerald-500';
  let strokeBg = 'stroke-emerald-500/10';
  let grade = 'A+';

  if (normalizedScore < 60) {
    colorClass = 'text-red-500';
    strokeBg = 'stroke-red-500/10';
    grade = 'F';
  } else if (normalizedScore < 75) {
    colorClass = 'text-amber-500';
    strokeBg = 'stroke-amber-500/10';
    grade = 'C';
  } else if (normalizedScore < 88) {
    colorClass = 'text-sky-500';
    strokeBg = 'stroke-sky-500/10';
    grade = 'B';
  } else if (normalizedScore < 95) {
    colorClass = 'text-emerald-400';
    strokeBg = 'stroke-emerald-500/10';
    grade = 'A';
  }

  const containerSizes = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-36 h-36'
  };

  const textSizes = {
    sm: 'text-sm font-bold',
    md: 'text-xl font-bold',
    lg: 'text-3xl font-extrabold'
  };

  return (
    <div className="flex flex-col items-center">
      <div className={`relative flex items-center justify-center ${containerSizes[size]}`}>
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="50%"
            cy="50%"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className={`${strokeBg} fill-none`}
          />
          <circle
            cx="50%"
            cy="50%"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`${colorClass} fill-none transition-all duration-1000 ease-out`}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className={`${textSizes[size]} text-slate-100 tracking-tight font-mono`}>
            {normalizedScore}
          </span>
          {showGrade && (
            <span className="text-[10px] font-semibold tracking-wide uppercase text-slate-400">
              Grade {grade}
            </span>
          )}
        </div>
      </div>
      {label && <span className="mt-2 text-xs font-medium text-slate-400 tracking-wide">{label}</span>}
    </div>
  );
};

export const ScoreBar: React.FC<{ label: string; score: number; icon?: React.ReactNode }> = ({ label, score, icon }) => {
  const norm = Math.max(0, Math.min(100, Math.round(score)));
  let barColor = 'bg-emerald-500';
  if (norm < 60) barColor = 'bg-red-500';
  else if (norm < 75) barColor = 'bg-amber-500';
  else if (norm < 88) barColor = 'bg-sky-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="flex items-center gap-1.5 text-slate-300">
          {icon}
          {label}
        </span>
        <span className="font-mono font-bold text-slate-200">{norm}/100</span>
      </div>
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700`}
          style={{ width: `${norm}%` }}
        />
      </div>
    </div>
  );
};
