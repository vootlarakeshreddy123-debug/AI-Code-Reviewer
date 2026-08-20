import React from 'react';
import { AlertCircle, FileSearch, RefreshCw, Sparkles, FolderPlus } from 'lucide-react';

export const LoadingSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-1/3 bg-slate-800 rounded" />
            <div className="h-4 w-16 bg-slate-800 rounded-full" />
          </div>
          <div className="h-3 w-3/4 bg-slate-800/60 rounded" />
          <div className="flex items-center gap-2 pt-2">
            <div className="h-3 w-12 bg-slate-800/40 rounded" />
            <div className="h-3 w-20 bg-slate-800/40 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}> = ({ title, description, actionLabel, onAction, icon }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 md:p-12 text-center rounded-2xl bg-slate-900/50 border border-dashed border-slate-800 my-4">
      <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-cyan-400 mb-4 shadow-lg">
        {icon || <FileSearch className="w-8 h-8" />}
      </div>
      <h3 className="text-lg font-bold text-slate-200">{title}</h3>
      <p className="mt-1.5 text-xs md:text-sm text-slate-400 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs md:text-sm transition-all shadow-lg shadow-cyan-950/40 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export const ErrorState: React.FC<{
  message?: string;
  onRetry?: () => void;
}> = ({ message = 'Failed to load analysis or resource. Please check network connectivity and try again.', onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-rose-950/20 border border-rose-900/40 text-center my-4 space-y-3">
      <div className="p-3 rounded-full bg-rose-900/30 text-rose-400 border border-rose-800/50">
        <AlertCircle className="w-6 h-6" />
      </div>
      <div>
        <h4 className="text-sm font-bold text-rose-300">An Error Occurred</h4>
        <p className="text-xs text-rose-200/80 mt-1 max-w-md">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900/40 hover:bg-rose-900/60 text-rose-200 text-xs font-semibold border border-rose-800/60 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try Again
        </button>
      )}
    </div>
  );
};
