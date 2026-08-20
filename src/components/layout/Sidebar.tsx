import React from 'react';
import { PageType } from '../../types';
import { MALE_AI_CHATBOT_AVATAR } from '../../assets/avatar';
import {
  LayoutDashboard,
  Code2,
  History,
  FolderGit2,
  GitBranch,
  SlidersHorizontal,
  Settings,
  User,
  LogOut,
  ShieldCheck,
  ChevronRight,
  PlusCircle,
  Sparkles,
  Zap
} from 'lucide-react';

interface SidebarProps {
  currentPage: PageType;
  onNavigate: (page: PageType, paramId?: string) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  pendingReviewCount?: number;
  criticalIssuesCount?: number;
}

interface NavItem {
  id: PageType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
  badge?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  isOpen,
  onCloseMobile,
  criticalIssuesCount = 12
}) => {
  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'new-review', label: 'New Code Review', icon: PlusCircle, highlight: true },
    { id: 'review-history', label: 'Review History', icon: History },
    { id: 'projects', label: 'Projects', icon: FolderGit2 },
    { id: 'custom-rules', label: 'Custom Rules', icon: SlidersHorizontal },
  ];

  const secondaryItems: NavItem[] = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-40 h-full w-64 bg-slate-950 border-r border-slate-800/80 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-950/50 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-slate-100 text-sm tracking-tight flex items-center gap-1.5">
                AI Code Reviewer
              </h1>
              <span className="text-[10px] font-mono font-semibold text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-1.5 py-0.2 rounded">
                PRO EDITION v2.4
              </span>
            </div>
          </div>
        </div>

        {/* Quick Action Button */}
        <div className="p-4">
          <button
            onClick={() => {
              onNavigate('new-review');
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs md:text-sm shadow-lg shadow-cyan-950/50 transition-all cursor-pointer group"
          >
            <Sparkles className="w-4 h-4 text-cyan-200 group-hover:rotate-12 transition-transform" />
            <span>Analyze Code Now</span>
          </button>
        </div>

        {/* Primary Navigation */}
        <div className="flex-1 px-3 py-2 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2 font-mono">
            Platform Engine
          </span>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-slate-800/90 text-cyan-400 border border-slate-700/80 shadow-md font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 px-1.5 py-0.5 rounded-md font-bold">
                    {item.badge}
                  </span>
                )}
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />}
              </button>
            );
          })}

          <div className="pt-4">
            <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2 font-mono">
              Account & System
            </span>
            {secondaryItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs md:text-sm font-medium transition-all group ${
                    isActive
                      ? 'bg-slate-800/90 text-cyan-400 border border-slate-700/80 shadow-md font-semibold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Security Health Mini Card */}
        <div className="p-3 m-3 bg-slate-900/90 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-slate-300 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Critical Alerts
            </span>
            <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 font-mono font-bold text-[10px]">
              {criticalIssuesCount} Open
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            2 repos need immediate security patch.
          </p>
        </div>

        {/* Footer User Info & Auth Toggle */}
        <div className="p-3 border-t border-slate-800/80 flex items-center justify-between bg-slate-950">
          <div
            onClick={() => onNavigate('profile')}
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <img
              src={MALE_AI_CHATBOT_AVATAR}
              alt="Vootla Rakesh Reddy Avatar"
              className="w-8 h-8 rounded-full border border-slate-700 object-cover"
            />
            <div className="text-left">
              <p className="text-xs font-semibold text-slate-200 leading-none">Vootla Rakesh Reddy</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Staff Security Eng</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('login')}
            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
            title="Log Out / Login Page"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
};
