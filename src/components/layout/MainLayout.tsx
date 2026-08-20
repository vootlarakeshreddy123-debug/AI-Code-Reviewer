import React, { useState, useEffect } from 'react';
import { PageType, Project } from '../../types';
import { Sidebar } from './Sidebar';
import { TopNavbar } from './TopNavbar';

interface MainLayoutProps {
  currentPage: PageType;
  onNavigate: (page: PageType, paramId?: string) => void;
  children: React.ReactNode;
  projects: Project[];
  selectedProjectId?: string;
  onSelectProject: (projectId?: string) => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  currentPage,
  onNavigate,
  children,
  projects,
  selectedProjectId,
  onSelectProject
}) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Sync dark class with document element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const isAuthPage = currentPage === 'login' || currentPage === 'register';

  if (isAuthPage) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans antialiased`}>
        {children}
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'} font-sans antialiased flex flex-col`}>
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        isOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="lg:pl-64 flex-1 flex flex-col min-w-0">
        <TopNavbar
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          currentPage={currentPage}
          onNavigate={onNavigate}
          isDarkMode={isDarkMode}
          onToggleTheme={() => setIsDarkMode(!isDarkMode)}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={onSelectProject}
        />

        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
};
