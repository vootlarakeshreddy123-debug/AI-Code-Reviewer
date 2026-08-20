import React, { useState } from 'react';
import { UserProfile, PageType } from '../types';
import { reviewService } from '../services/reviewService';
import {
  User,
  Mail,
  Shield,
  Github,
  Award,
  Clock,
  Sparkles,
  CheckCircle2,
  Calendar,
  Code2,
  Key
} from 'lucide-react';

interface ProfilePageProps {
  userProfile: UserProfile;
  onNavigate: (page: PageType) => void;
  onRefreshProfile: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  userProfile,
  onNavigate,
  onRefreshProfile
}) => {
  const [name, setName] = useState(userProfile.name);
  const [role, setRole] = useState(userProfile.role);
  const [githubUsername, setGithubUsername] = useState(userProfile.githubUsername || 'arivera-dev');
  const [isEditing, setIsEditing] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    reviewService.updateUserProfile({
      name,
      role,
      githubUsername
    });
    setIsEditing(false);
    onRefreshProfile();
  };

  const activityLog = [
    { title: 'Executed AST Scan on payment-gateway-service', time: '2 hours ago', icon: Shield },
    { title: 'Resolved Critical SQL Injection vulnerability #f_01', time: '1 day ago', icon: CheckCircle2 },
    { title: 'Added Custom Rule "Ban dangerouslySetInnerHTML"', time: '3 days ago', icon: Code2 },
    { title: 'Connected GitHub App Organization @techcorp-org', time: '1 week ago', icon: Github }
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Top Banner Card */}
      <div className="p-6 md:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <img
            src={userProfile.avatarUrl}
            alt="Avatar"
            className="w-20 h-20 rounded-2xl border-2 border-cyan-500/50 object-cover shadow-xl"
          />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl md:text-2xl font-bold text-slate-100">{userProfile.name}</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Verified Lead
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">{userProfile.role}</p>
            <p className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
              <Mail className="w-3 h-3" /> {userProfile.email}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsEditing(!isEditing)}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
        >
          {isEditing ? 'Cancel Editing' : 'Edit Profile'}
        </button>
      </div>

      {/* Edit Profile Form */}
      {isEditing && (
        <form onSubmit={handleSaveProfile} className="p-6 rounded-3xl bg-slate-900/90 border border-cyan-500/40 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-100">Update Profile Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Role Title</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">GitHub Handle</label>
              <input
                type="text"
                value={githubUsername}
                onChange={(e) => setGithubUsername(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-950/50"
          >
            Save Profile
          </button>
        </form>
      )}

      {/* Stats Breakdown Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-1">
          <span className="text-xs text-slate-400 uppercase font-mono font-bold block">Reviews Executed</span>
          <span className="text-2xl font-extrabold text-cyan-400 font-mono">
            {userProfile.stats.reviewsSubmitted}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-1">
          <span className="text-xs text-slate-400 uppercase font-mono font-bold block">Vulnerabilities Patched</span>
          <span className="text-2xl font-extrabold text-emerald-400 font-mono">
            {userProfile.stats.issuesFixed}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-1">
          <span className="text-xs text-slate-400 uppercase font-mono font-bold block">Reputation Score</span>
          <span className="text-2xl font-extrabold text-amber-400 font-mono">
            {userProfile.stats.reputationScore}/100
          </span>
        </div>
      </div>

      {/* Connected Accounts & Audit Activity Log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Connected Accounts */}
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Github className="w-4 h-4 text-cyan-400" />
            Connected Accounts
          </h3>

          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <Github className="w-5 h-5 text-slate-200" />
              <div>
                <span className="font-bold text-slate-200 block">GitHub Account</span>
                <span className="text-[11px] text-slate-400 font-mono">@{userProfile.githubUsername || 'arivera-dev'}</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
              Connected
            </span>
          </div>
        </div>

        {/* Audit Activity Log */}
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Clock className="w-4 h-4 text-cyan-400" />
            Recent Personal Security Trail
          </h3>

          <div className="space-y-3">
            {activityLog.map((act, idx) => {
              const Icon = act.icon;
              return (
                <div key={idx} className="flex items-start gap-3 text-xs">
                  <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-cyan-400 mt-0.5">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-200">{act.title}</p>
                    <span className="text-[10px] text-slate-500">{act.time}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
