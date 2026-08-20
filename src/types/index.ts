export type Language = 
  | 'python' 
  | 'typescript' 
  | 'javascript' 
  | 'go' 
  | 'rust' 
  | 'java' 
  | 'cpp' 
  | 'csharp' 
  | 'php' 
  | 'ruby'
  | 'html';

export type AnalyzerStatus = 'FULLY_SUPPORTED' | 'ANALYZER_UNAVAILABLE' | 'PARTIAL_SUPPORT';

export type IssueCategory =
  | 'SYNTAX_ERRORS'
  | 'BUGS_RUNTIME_ERRORS'
  | 'SECURITY_ISSUES'
  | 'PERFORMANCE'
  | 'CODE_QUALITY'
  | 'DEBUG_DEVELOPMENT_ARTIFACTS'
  | 'STYLE'
  | 'OTHER_QUALITY_ISSUES'
  | 'syntax'
  | 'bug'
  | 'security'
  | 'performance'
  | 'quality'
  | 'style'
  | 'debug';

export type Severity =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'INFO'
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'suggestion';

export type ReviewStatus = 'queued' | 'analyzing' | 'completed' | 'failed';

export type FindingType =
  | 'confirmed_error'
  | 'potential_bug'
  | 'security_vulnerability'
  | 'performance_bottleneck'
  | 'code_smell'
  | 'best_practice_suggestion'
  | 'CONFIRMED'
  | 'POTENTIAL';

export interface Finding {
  id: string;
  lineNumber: number;
  line?: number;
  column?: number;
  endLineNumber?: number;
  category: IssueCategory;
  severity: Severity;
  title: string;
  explanation: string;
  codeSnippet: string;
  problematicCode?: string;
  problematic_code?: string;
  recommendedFix: string;
  recommended_fix?: string;
  diffPatch?: string;
  source?: string;
  detectionSource?: string;
  detection_source?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  findingType?: FindingType;
  whyThisMatters?: string;
  beforeCode?: string;
  afterCode?: string;
  beforeComplexity?: string;
  afterComplexity?: string;
  aiFixExplanation?: string;
  status: 'open' | 'ignored' | 'resolved';
  ruleId?: string;
}

export interface ComplexityAnalysis {
  timeComplexity: string; // e.g., 'O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)'
  spaceComplexity: string; // e.g., 'O(1)', 'O(n)', 'O(n²)'
  timeExplanation: string; // Detailed beginner-friendly breakdown
  spaceExplanation: string; // Memory, data structures, recursion stack
  bottleneckLocation?: string;
  canBeImproved: boolean;
  improvedTimeComplexity?: string;
  improvedSpaceComplexity?: string;
  complexityImprovementSummary?: string;
}

export interface ScoreBreakdown {
  correctness: number; // 0-100
  security: number; // 0-100
  performance: number; // 0-100
  maintainability: number; // 0-100
  codeQuality: number; // 0-100
  reliability?: number; // 0-100
  bestPractices?: number; // 0-100
  reasoning?: {
    correctness?: string;
    security?: string;
    performance?: string;
    maintainability?: string;
    codeQuality?: string;
  };
}

export interface OptimizationSuggestion {
  id: string;
  title: string;
  currentApproach: string; // e.g. "Nested loop — O(n²)"
  recommendedApproach: string; // e.g. "Hash map lookup — approximately O(n)"
  explanation: string;
  beforeCode: string;
  afterCode: string;
  beforeComplexity?: string;
  afterComplexity?: string;
  potentialSavings?: string;
  line?: number;
}

export interface SecurityVulnerabilityItem {
  id: string;
  title: string;
  risk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE';
  location: string;
  line?: number;
  whyDangerous: string;
  howToFix: string;
  codeSnippet?: string;
  cwe?: string;
}

export interface SecurityAnalysisSummary {
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE';
  score: number; // 0-100
  summary: string;
  vulnerabilities: SecurityVulnerabilityItem[];
  safePractices: string[];
}

export interface PerformanceBottleneckItem {
  id: string;
  title: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  location: string;
  line?: number;
  description: string;
  optimization: string;
}

export interface PerformanceAnalysisSummary {
  score: number; // 0-100
  summary: string;
  bottlenecks: PerformanceBottleneckItem[];
  recommendations: string[];
}

export interface MaintainabilityAnalysis {
  score: number; // 0-100
  summary: string;
  functionSizeScore: number;
  cyclomaticComplexity: string;
  namingConventions: string;
  duplicationScore: number;
  structureReadability: string;
  recommendations: string[];
}

export interface CodeQualityAnalysis {
  score: number; // 0-100
  summary: string;
  deadCodeDetected: boolean;
  unusedVariablesDetected: boolean;
  excessiveNestingDetected: boolean;
  bestPracticesNotes: string[];
}

export interface CodeSmell {
  id: string;
  smellType:
    | 'Long Function'
    | 'Duplicate Code'
    | 'Excessive Nesting'
    | 'Magic Numbers'
    | 'Poor Naming'
    | 'Dead Code'
    | 'Too Many Parameters'
    | 'Large Class'
    | 'Repeated Logic'
    | 'Complex Conditionals'
    | 'Other';
  title: string;
  line?: number;
  description: string;
  recommendation: string;
  snippet?: string;
}

export interface ReviewResponseJSON {
  overall_score: number;
  summary: string;
  syntax_status: {
    errors_found: boolean;
    message: string;
  };
  complexity?: ComplexityAnalysis;
  score_breakdown?: ScoreBreakdown;
  optimizations?: OptimizationSuggestion[];
  security_analysis?: SecurityAnalysisSummary;
  performance_analysis?: PerformanceAnalysisSummary;
  maintainability_analysis?: MaintainabilityAnalysis;
  code_quality_analysis?: CodeQualityAnalysis;
  code_smells?: CodeSmell[];
  syntax_errors?: Array<{
    category: string;
    severity: string;
    title: string;
    line: number;
    problematic_code: string;
    explanation: string;
    recommended_fix: string;
  }>;
  findings: Array<{
    category: string;
    severity: string;
    title: string;
    line: number;
    problematic_code: string;
    explanation: string;
    recommended_fix: string;
    finding_type?: string;
    why_this_matters?: string;
    confidence?: string;
  }>;
  statistics: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export interface ReviewMetrics {
  securityScore: number;
  codeQualityScore: number;
  performanceScore: number;
  maintainabilityScore: number;
  correctnessScore?: number;
}

export interface IssueCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

export interface CodeReview {
  id: string;
  title: string;
  language: Language;
  code: string;
  status: ReviewStatus;
  overallScore: number;
  summary?: string;
  hasRealErrors?: boolean;
  analyzerStatus?: AnalyzerStatus;
  analyzerMessage?: string;
  metrics: ReviewMetrics;
  issueCounts: IssueCounts;
  findings: Finding[];
  complexity?: ComplexityAnalysis;
  scoreBreakdown?: ScoreBreakdown;
  optimizations?: OptimizationSuggestion[];
  securityAnalysis?: SecurityAnalysisSummary;
  performanceAnalysis?: PerformanceAnalysisSummary;
  maintainabilityAnalysis?: MaintainabilityAnalysis;
  codeQualityAnalysis?: CodeQualityAnalysis;
  codeSmells?: CodeSmell[];
  durationMs: number;
  createdAt: string;
  projectId?: string;
  projectName?: string;
  author: {
    name: string;
    email: string;
    avatar?: string;
  };
  linesOfCode: number;
  commitHash?: string;
  branch?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  repoUrl: string;
  language: Language;
  primaryBranch: string;
  totalReviews: number;
  avgScore: number;
  lastReviewAt: string;
  criticalIssuesCount: number;
  openIssuesCount: number;
  status: 'active' | 'syncing' | 'paused';
  customRulesCount: number;
  securityHealth: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface CustomRule {
  id: string;
  name: string;
  description: string;
  category: IssueCategory;
  severity: Severity;
  language: Language | 'all';
  enabled: boolean;
  pattern: string;
  totalHits: number;
  createdAt: string;
}

export interface GitHubRepo {
  id: string;
  name: string;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  isConnected: boolean;
  autoReviewPr: boolean;
  starsCount: number;
  lastSyncedAt: string;
  openPullRequestsCount: number;
}

export interface DashboardStats {
  totalReviews: number;
  avgReviewScore: number;
  criticalIssues: number;
  warnings: number;
  suggestions: number;
  activeProjects: number;
  codeLinesAnalyzed: number;
  securityScoreTrend: number; // e.g. +4.2%
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  githubUsername?: string;
  joinedAt: string;
  apiKey: string;
  preferences: {
    theme: 'dark' | 'light' | 'system';
    emailNotifications: boolean;
    autoFixSuggestions: boolean;
    strictSecurityMode: boolean;
    defaultLanguage: Language;
  };
  stats: {
    reviewsSubmitted: number;
    issuesFixed: number;
    reputationScore: number;
  };
}

export type PageType =
  | 'login'
  | 'register'
  | 'dashboard'
  | 'new-review'
  | 'review-results'
  | 'review-history'
  | 'projects'
  | 'project-details'
  | 'github-integration'
  | 'custom-rules'
  | 'settings'
  | 'profile';
