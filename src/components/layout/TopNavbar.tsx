import React, { useState } from 'react';
import { PageType, Project } from '../../types';
import { MALE_AI_CHATBOT_AVATAR } from '../../assets/avatar';
import {
  Menu,
  Search,
  Moon,
  Sun,
  Bell,
  Plus,
  ChevronDown,
  Folder,
  ShieldAlert,
  User,
  Settings,
  LogOut,
  Sparkles,
  Check
} from 'lucide-react';

interface TopNavbarProps {
  onOpenMobileSidebar: () => void;
  currentPage: PageType;
  onNavigate: (page: PageType, paramId?: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  projects: Project[];
  selectedProjectId?: string;
  onSelectProject: (projectId?: string) => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  onOpenMobileSidebar,
  currentPage,
  onNavigate,
  isDarkMode,
  onToggleTheme,
  projects,
  selectedProjectId,
  onSelectProject
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const notifications = [
    {
      id: '1',
      title: 'Critical Vulnerability Found',
      message: 'FastAPI SQL Injection in payment-gateway-service',
      time: '10m ago',
      type: 'critical'
    },
    {
      id: '2',
      title: 'PR #104 Auto-Reviewed',
      message: 'Score 91/100 on cloud-console-react',
      time: '1h ago',
      type: 'success'
    },
    {
      id: '3',
      title: 'Custom Rule Triggered',
      message: 'Ban dangerouslySetInnerHTML flagged 2 files',
      time: '3h ago',
      type: 'warning'
    }
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onNavigate('review-history');
    }
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 md:px-6 flex items-center justify-between">
      {/* Left: Mobile Toggle & Context Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileSidebar}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-900 lg:hidden transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Project Selector Dropdown */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setShowProjectDropdown(!showProjectDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 transition-all"
          >
            <Folder className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-medium max-w-[140px] truncate">
              {selectedProject ? selectedProject.name : 'All Projects Context'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {showProjectDropdown && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs space-y-1">
              <span className="px-2 py-1 text-[10px] uppercase font-mono font-bold text-slate-500 block">
                Filter Workspace Context
              </span>
              <button
                onClick={() => {
                  onSelectProject(undefined);
                  setShowProjectDropdown(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left ${
                  !selectedProjectId ? 'bg-cyan-950/60 text-cyan-300 font-semibold' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>All Projects</span>
                {!selectedProjectId && <Check className="w-3.5 h-3.5 text-cyan-400" />}
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectProject(p.id);
                    setShowProjectDropdown(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left ${
                    selectedProjectId === p.id ? 'bg-cyan-950/60 text-cyan-300 font-semibold' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  {selectedProjectId === p.id && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Middle: Global Search Input */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md mx-4 hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reviews, findings, or code snippets..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
          />
        </div>
      </form>

      {/* Right Actions */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Quick New Review Button */}
        <button
          onClick={() => onNavigate('new-review')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-md shadow-cyan-950/40 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Review</span>
        </button>

        {/* Dark/Light Mode Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-slate-800/80 transition-colors"
          title={isDarkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-cyan-400" />}
        </button>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserDropdown(false);
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-slate-800/80 transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 z-50">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="font-bold text-slate-100 text-xs">Security Notifications</span>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded">3 New</span>
              </div>
              <div className="py-2 space-y-2 max-h-64 overflow-y-auto">
                {notifications.map((n) => (
                  <div key={n.id} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">{n.title}</span>
                      <span className="text-[10px] text-slate-500">{n.time}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">{n.message}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  onNavigate('review-history');
                  setShowNotifications(false);
                }}
                className="w-full text-center text-xs font-semibold text-cyan-400 hover:text-cyan-300 pt-2 block border-t border-slate-800"
              >
                View All Security Activity →
              </button>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserDropdown(!showUserDropdown);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-900 transition-colors"
          >
            <img
              src={MALE_AI_CHATBOT_AVATAR}
              alt="Avatar"
              className="w-8 h-8 rounded-full border border-slate-700 object-cover"
            />
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 hidden sm:block" />
          </button>

          {showUserDropdown && (
            <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 text-xs space-y-1">
              <div className="px-3 py-2 border-b border-slate-800">
                <p className="font-bold text-slate-100">Vootla Rakesh Reddy</p>
                <p className="text-[10px] text-slate-400 truncate">vootlarakeshreddy123@gmail.com</p>
              </div>
              <button
                onClick={() => {
                  onNavigate('profile');
                  setShowUserDropdown(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-left"
              >
                <User className="w-4 h-4 text-cyan-400" />
                <span>My Profile</span>
              </button>
              <button
                onClick={() => {
                  onNavigate('settings');
                  setShowUserDropdown(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 text-left"
              >
                <Settings className="w-4 h-4 text-cyan-400" />
                <span>Settings</span>
              </button>
              <div className="border-t border-slate-800 pt-1">
                <button
                  onClick={() => {
                    onNavigate('login');
                    setShowUserDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-950/30 text-left font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
