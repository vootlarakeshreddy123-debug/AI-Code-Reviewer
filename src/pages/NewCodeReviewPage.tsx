import React, { useState } from 'react';
import { PageType, Language, Project, CodeReview } from '../types';
import { CODE_PRESETS } from '../services/mockData';
import { reviewService } from '../services/reviewService';
import {
  Code2,
  Play,
  RotateCcw,
  Upload,
  Sparkles,
  FileCode,
  FolderGit2,
  Check,
  Cpu,
  ShieldAlert,
  Sliders
} from 'lucide-react';

interface NewCodeReviewPageProps {
  projects: Project[];
  onNavigate: (page: PageType, paramId?: string) => void;
  onReviewCreated: (review: CodeReview) => void;
}

export const NewCodeReviewPage: React.FC<NewCodeReviewPageProps> = ({
  projects,
  onNavigate,
  onReviewCreated
}) => {
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<Language>('python');
  const [code, setCode] = useState(CODE_PRESETS[0].code);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');

  const languages: { id: Language; label: string }[] = [
    { id: 'python', label: 'Python 3.12' },
    { id: 'typescript', label: 'TypeScript / React' },
    { id: 'javascript', label: 'JavaScript (Node.js)' },
    { id: 'go', label: 'Go 1.22' },
    { id: 'rust', label: 'Rust 2021' },
    { id: 'java', label: 'Java 21 (Spring)' },
    { id: 'cpp', label: 'C++20' },
    { id: 'csharp', label: 'C# (.NET 8)' },
    { id: 'php', label: 'PHP 8.3' },
    { id: 'ruby', label: 'Ruby 3.3' },
    { id: 'html', label: 'HTML' }
  ];

  const handleSelectPreset = (presetCode: string, lang: Language, label: string) => {
    setCode(presetCode);
    setLanguage(lang);
    setTitle(`Review: ${label}`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTitle(`Review File: ${file.name}`);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) setCode(content);
      };
      reader.readAsText(file);
    }
  };

  const handleClear = () => {
    setCode('');
    setTitle('');
  };

  const handleRunReview = async () => {
    if (!code.trim()) return;

    setIsAnalyzing(true);
    setAnalysisStep('Initializing Static Analysis Engine...');

    setTimeout(() => {
      setAnalysisStep('Scanning AST for OWASP Top 10 Security Vulnerabilities...');
    }, 400);

    setTimeout(() => {
      setAnalysisStep('Evaluating Custom Rule Sets & Linter Rules...');
    }, 800);

    setTimeout(() => {
      setAnalysisStep('Generating AI Code Recommendations & Fix Diffs...');
    }, 1100);

    const newReview = await reviewService.createReview({
      title: title.trim() || `${language.toUpperCase()} Analysis Run`,
      language,
      code,
      projectId: selectedProjectId || undefined
    });

    setIsAnalyzing(false);
    onReviewCreated(newReview);
    onNavigate('review-results', newReview.id);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-100 flex items-center gap-2 tracking-tight">
            <Sparkles className="w-6 h-6 text-cyan-400" />
            New Code Review
          </h2>
          <p className="text-xs md:text-sm text-slate-400">
            Paste source code or load an example snippet to perform deep vulnerability and performance analysis.
          </p>
        </div>
      </div>

      {/* Analyzing Loading Overlay */}
      {isAnalyzing && (
        <div className="p-8 rounded-3xl bg-slate-900 border border-cyan-500/40 shadow-2xl text-center space-y-6 animate-pulse my-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 mx-auto flex items-center justify-center text-white shadow-xl shadow-cyan-950/80 animate-spin">
            <Cpu className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-100">Analyzing Source Code...</h3>
            <p className="text-xs font-mono text-cyan-400">{analysisStep}</p>
          </div>
          <div className="max-w-md mx-auto h-2 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div className="h-full bg-cyan-500 rounded-full animate-pulse w-3/4" />
          </div>
        </div>
      )}

      {!isAnalyzing && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Code Editor & Controls (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Top Toolbar */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Review Title Input */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Review Title / Module Name</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. FastAPI Auth Middleware Scan"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Programming Language Selector */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Programming Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Language)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    {languages.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Link Project Context */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <FolderGit2 className="w-3.5 h-3.5 text-cyan-400" />
                  Link to Project (Optional)
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- Standalone Review (No Project) --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.language})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Code Input Textarea */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Source Code Input</span>
                <span className="font-mono text-[11px]">{code.split('\n').length} lines</span>
              </div>

              <div className="relative border border-slate-800 rounded-2xl bg-slate-950 font-mono text-xs overflow-hidden shadow-inner group">
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="// Paste your source code here..."
                  className="w-full h-96 p-4 bg-slate-950 text-slate-200 font-mono text-xs md:text-sm focus:outline-none leading-relaxed tracking-wide border-0 resize-y"
                  spellCheck={false}
                />
              </div>
            </div>

            {/* Action Bar (Review button, Clear button, Upload option) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                {/* Upload file option */}
                <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium text-xs cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Upload File</span>
                  <input
                    type="file"
                    accept=".py,.ts,.js,.go,.rs,.java,.cpp,.cs,.php,.rb,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {/* Clear button */}
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 font-medium text-xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Editor</span>
                </button>
              </div>

              {/* Review button */}
              <button
                type="button"
                onClick={handleRunReview}
                disabled={!code.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-xs md:text-sm shadow-xl shadow-cyan-950/60 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Run AI Review</span>
              </button>
            </div>
          </div>

          {/* Right Presets & Quick Examples Sidebar (1 col) */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <FileCode className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100">Vulnerable Code Presets</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Test the analysis engine instantly by loading sample snippets with security flaws:
              </p>

              <div className="space-y-2.5">
                {CODE_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectPreset(preset.code, preset.language, preset.label)}
                    className="w-full p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-cyan-500/60 text-left transition-all cursor-pointer group space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-200 group-hover:text-cyan-400 transition-colors">
                        {preset.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Scan Checks Banner */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 space-y-2">
              <span className="font-bold text-slate-200 block">Automatic Inspections Triggered:</span>
              <ul className="space-y-1 text-slate-400 text-[11px]">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-emerald-400" />
                  SQL Injection & XSS Sanitization
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-emerald-400" />
                  Hardcoded Cryptographic Secrets
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-emerald-400" />
                  Memory Leaks & Async Deadlocks
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-emerald-400" />
                  Custom Linter Regex Rule Matches
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
