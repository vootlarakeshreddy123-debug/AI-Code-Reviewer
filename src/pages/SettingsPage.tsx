import React, { useState } from 'react';
import { UserProfile, PageType } from '../types';
import { reviewService, getApiUrl } from '../services/reviewService';
import { Modal } from '../components/common/Modal';
import {
  Settings,
  Key,
  Bell,
  Cpu,
  Users,
  Copy,
  Check,
  Plus,
  Shield,
  Eye,
  EyeOff,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail
} from 'lucide-react';

interface SettingsPageProps {
  userProfile: UserProfile;
  onNavigate: (page: PageType) => void;
  onRefreshProfile: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  userProfile,
  onNavigate,
  onRefreshProfile
}) => {
  const [copiedKey, setCopiedKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Form State
  const [reviewDepth, setReviewDepth] = useState('deep');
  const [emailNotify, setEmailNotify] = useState(userProfile.preferences.emailNotifications);
  const [autoFix, setAutoFix] = useState(userProfile.preferences.autoFixSuggestions);
  const [strictSecurity, setStrictSecurity] = useState(userProfile.preferences.strictSecurityMode);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Security Lead');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const [teamMembers, setTeamMembers] = useState([
    { name: userProfile.name || 'Vootla Rakesh Reddy', email: userProfile.email || 'vootlarakeshreddy123@gmail.com', role: 'Security Lead (Owner)', status: 'Active' },
    { name: 'Sarah Chen', email: 'sarah.chen@techcorp.io', role: 'Senior Frontend Eng', status: 'Active' },
    { name: 'Marcus Vance', email: 'marcus.v@techcorp.io', role: 'Backend Dev', status: 'Active' }
  ]);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(userProfile.apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleSaveSettings = () => {
    reviewService.updateUserProfile({
      preferences: {
        ...userProfile.preferences,
        emailNotifications: emailNotify,
        autoFixSuggestions: autoFix,
        strictSecurityMode: strictSecurity
      }
    });
    onRefreshProfile();
    alert('Settings saved successfully!');
  };

  const handleOpenInviteModal = () => {
    setInviteEmail('');
    setInviteRole('Security Lead');
    setInviteError(null);
    setInviteSuccess(null);
    setShowInviteModal(true);
  };

  const handleInviteTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    const emailToInvite = inviteEmail.trim();

    if (!emailToInvite) {
      setInviteError('Please enter a work email address.');
      return;
    }

    // Email regex validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(emailToInvite)) {
      setInviteError('Please enter a valid email address (e.g. colleague@company.com).');
      return;
    }

    setIsSendingInvite(true);

    try {
      const targetUrl = getApiUrl('/api/team/invite');
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: emailToInvite,
          role: inviteRole
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send invitation. Please try again.');
      }

      // Success
      setInviteSuccess(data.message || `Invitation successfully sent to ${emailToInvite}.`);

      // Update team member list dynamically
      const displayName = emailToInvite.split('@')[0].replace(/[._-]/g, ' ');
      const formattedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

      setTeamMembers((prev) => [
        ...prev,
        {
          name: formattedName,
          email: emailToInvite,
          role: inviteRole,
          status: 'Pending'
        }
      ]);

      // Reset email field
      setInviteEmail('');

      // Auto-close modal after 2.5 seconds
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteSuccess(null);
      }, 2500);
    } catch (err: any) {
      setInviteError(err.message || 'An error occurred while sending the invitation. Please try again.');
    } finally {
      setIsSendingInvite(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-100 flex items-center gap-2 tracking-tight">
            <Settings className="w-6 h-6 text-cyan-400" />
            Platform Settings & AI Configuration
          </h2>
          <p className="text-xs md:text-sm text-slate-400">
            Manage static analysis engine preferences, API keys, and team permissions.
          </p>
        </div>

        <button
          onClick={handleSaveSettings}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs md:text-sm shadow-md shadow-cyan-950/50 transition-colors cursor-pointer"
        >
          <span>Save Changes</span>
        </button>
      </div>

      {/* AI Review Engine Preferences */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
          <Cpu className="w-4 h-4 text-cyan-400" />
          AI Review Engine Preferences
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300">Analysis Depth Mode</label>
            <select
              value={reviewDepth}
              onChange={(e) => setReviewDepth(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="fast">Fast Scan (Basic Linter & Syntax Check)</option>
              <option value="deep">Deep Security Audit (OWASP Top 10 & AST Scan)</option>
              <option value="paranoid">Paranoid Mode (Strict Compliance & Style Enforcement)</option>
            </select>
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoFix}
                onChange={(e) => setAutoFix(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950 text-cyan-600"
              />
              <span className="font-medium text-slate-200">Auto-Generate Recommended Code Diffs</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={strictSecurity}
                onChange={(e) => setStrictSecurity(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950 text-cyan-600"
              />
              <span className="font-medium text-slate-200">Enforce Strict Cryptographic & Password Rules</span>
            </label>
          </div>
        </div>
      </div>

      {/* API Key Management */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
          <Key className="w-4 h-4 text-cyan-400" />
          REST API Key Management
        </h3>

        <p className="text-xs text-slate-400">
          Use this API token to trigger remote reviews via CI/CD pipelines, FastAPI, or custom cURL scripts.
        </p>

        <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
          <span className="font-mono text-xs text-slate-300 flex-1 truncate">
            {showKey ? userProfile.apiKey : 'ak_live_' + '•'.repeat(24)}
          </span>

          <button
            onClick={() => setShowKey(!showKey)}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg bg-slate-900 border border-slate-800"
            title="Toggle Visibility"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          <button
            onClick={handleCopyKey}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold"
          >
            {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedKey ? 'Copied' : 'Copy Key'}
          </button>
        </div>
      </div>

      {/* Team Members & Workspace Permissions */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            Team Members & Access
          </h3>
          <button
            onClick={handleOpenInviteModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-950/40 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Invite
          </button>
        </div>

        <div className="space-y-2">
          {teamMembers.map((m, idx) => (
            <div
              key={idx}
              className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-bold text-slate-200 block">{m.name}</span>
                <span className="text-[11px] text-slate-400 font-mono">{m.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-cyan-400 font-semibold">{m.role}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    m.status === 'Active'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {m.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Member Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => {
          if (!isSendingInvite) {
            setShowInviteModal(false);
            setInviteError(null);
            setInviteSuccess(null);
          }
        }}
        title="Invite Team Member"
        description="Send an email invitation to collaborate on security reviews and codebase analysis."
      >
        <form onSubmit={handleInviteTeam} className="space-y-4">
          {/* Feedback Banners */}
          {inviteError && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{inviteError}</span>
            </div>
          )}

          {inviteSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800/80 text-emerald-300 text-xs flex items-start gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{inviteSuccess}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  if (inviteError) setInviteError(null);
                }}
                placeholder="colleague@company.com"
                disabled={isSendingInvite}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Team Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              disabled={isSendingInvite}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            >
              <option value="Security Lead">Security Lead</option>
              <option value="Lead Code Reviewer">Lead Code Reviewer</option>
              <option value="Senior Developer">Senior Developer</option>
              <option value="Security Analyst">Security Analyst</option>
              <option value="DevOps Engineer">DevOps Engineer</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              disabled={isSendingInvite}
              onClick={() => {
                setShowInviteModal(false);
                setInviteError(null);
                setInviteSuccess(null);
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSendingInvite}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/50 transition-all disabled:opacity-60 cursor-pointer"
            >
              {isSendingInvite ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending Invitation...</span>
                </>
              ) : (
                <span>Send Invite</span>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
