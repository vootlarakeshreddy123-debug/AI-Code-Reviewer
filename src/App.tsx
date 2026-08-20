import React, { useState, useEffect } from 'react';
import { PageType, CodeReview, Project, CustomRule, GitHubRepo, DashboardStats, UserProfile } from './types';
import { reviewService } from './services/reviewService';
import { MainLayout } from './components/layout/MainLayout';

// Import all 12 pages
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewCodeReviewPage } from './pages/NewCodeReviewPage';
import { ReviewResultsPage } from './pages/ReviewResultsPage';
import { ReviewHistoryPage } from './pages/ReviewHistoryPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailsPage } from './pages/ProjectDetailsPage';
import { GitHubIntegrationPage } from './pages/GitHubIntegrationPage';
import { CustomRulesPage } from './pages/CustomRulesPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');
  const [selectedReviewId, setSelectedReviewId] = useState<string | undefined>('rev_9001');
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>('proj_pay_01');

  // Service Data State
  const [stats, setStats] = useState<DashboardStats>(reviewService.getStats());
  const [reviews, setReviews] = useState<CodeReview[]>(reviewService.getReviews());
  const [projects, setProjects] = useState<Project[]>(reviewService.getProjects());
  const [customRules, setCustomRules] = useState<CustomRule[]>(reviewService.getCustomRules());
  const [gitHubRepos, setGitHubRepos] = useState<GitHubRepo[]>(reviewService.getGitHubRepos());
  const [userProfile, setUserProfile] = useState<UserProfile>(reviewService.getUserProfile());

  const refreshAllData = () => {
    setStats(reviewService.getStats());
    setReviews(reviewService.getReviews());
    setProjects(reviewService.getProjects());
    setCustomRules(reviewService.getCustomRules());
    setGitHubRepos(reviewService.getGitHubRepos());
    setUserProfile(reviewService.getUserProfile());
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  const handleNavigate = (page: PageType, paramId?: string) => {
    setCurrentPage(page);
    if (page === 'review-results' && paramId) {
      setSelectedReviewId(paramId);
    } else if (page === 'project-details' && paramId) {
      setSelectedProjectId(paramId);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReviewCreated = (newReview: CodeReview) => {
    setSelectedReviewId(newReview.id);
    refreshAllData();
  };

  const activeReview = reviews.find((r) => r.id === selectedReviewId) || reviews[0];
  const activeProject = projects.find((p) => p.id === selectedProjectId) || projects[0];
  const projectReviews = reviews.filter((r) => r.projectId === activeProject?.id);

  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return <LoginPage onNavigate={handleNavigate} />;

      case 'register':
        return <RegisterPage onNavigate={handleNavigate} />;

      case 'dashboard':
        return (
          <DashboardPage
            stats={stats}
            recentReviews={reviews}
            projects={projects}
            onNavigate={handleNavigate}
          />
        );

      case 'new-review':
        return (
          <NewCodeReviewPage
            projects={projects}
            onNavigate={handleNavigate}
            onReviewCreated={handleReviewCreated}
          />
        );

      case 'review-results':
        return (
          <ReviewResultsPage
            review={activeReview}
            onNavigate={handleNavigate}
            onReviewUpdated={refreshAllData}
          />
        );

      case 'review-history':
        return (
          <ReviewHistoryPage
            reviews={reviews}
            onNavigate={handleNavigate}
            onRefreshReviews={refreshAllData}
          />
        );

      case 'projects':
        return (
          <ProjectsPage
            projects={projects}
            onNavigate={handleNavigate}
            onRefreshProjects={refreshAllData}
          />
        );

      case 'project-details':
        return (
          <ProjectDetailsPage
            project={activeProject}
            projectReviews={projectReviews}
            onNavigate={handleNavigate}
          />
        );

      case 'github-integration':
        return (
          <GitHubIntegrationPage
            repos={gitHubRepos}
            onNavigate={handleNavigate}
            onRefreshRepos={refreshAllData}
          />
        );

      case 'custom-rules':
        return (
          <CustomRulesPage
            rules={customRules}
            onNavigate={handleNavigate}
            onRefreshRules={refreshAllData}
          />
        );

      case 'settings':
        return (
          <SettingsPage
            userProfile={userProfile}
            onNavigate={handleNavigate}
            onRefreshProfile={refreshAllData}
          />
        );

      case 'profile':
        return (
          <ProfilePage
            userProfile={userProfile}
            onNavigate={handleNavigate}
            onRefreshProfile={refreshAllData}
          />
        );

      default:
        return (
          <DashboardPage
            stats={stats}
            recentReviews={reviews}
            projects={projects}
            onNavigate={handleNavigate}
          />
        );
    }
  };

  return (
    <MainLayout
      currentPage={currentPage}
      onNavigate={handleNavigate}
      projects={projects}
      selectedProjectId={selectedProjectId}
      onSelectProject={(projId) => {
        setSelectedProjectId(projId);
        if (projId) handleNavigate('project-details', projId);
      }}
    >
      {renderPage()}
    </MainLayout>
  );
}
