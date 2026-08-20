import { CodeReview, Project, CustomRule, GitHubRepo, DashboardStats, UserProfile, Finding, Language, Severity, IssueCategory, ReviewResponseJSON } from '../types';
import { INITIAL_REVIEWS, INITIAL_PROJECTS, INITIAL_CUSTOM_RULES, INITIAL_GITHUB_REPOS, INITIAL_STATS, INITIAL_USER } from './mockData';
import { MALE_AI_CHATBOT_AVATAR } from '../assets/avatar';

const STORAGE_KEYS = {
  REVIEWS: 'ai_code_reviewer_reviews_v1',
  PROJECTS: 'ai_code_reviewer_projects_v1',
  CUSTOM_RULES: 'ai_code_reviewer_rules_v1',
  GITHUB_REPOS: 'ai_code_reviewer_gh_v1',
  USER_PROFILE: 'ai_code_reviewer_user_v1',
  STATS: 'ai_code_reviewer_stats_v1'
};

function getStored<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    return fallback;
  }
}

function setStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to write to localStorage', e);
  }
}

export function getApiUrl(endpoint: string): string {
  let customApiBase =
    (typeof import.meta !== 'undefined' && ((import.meta as any).env?.VITE_API_BASE_URL || (import.meta as any).env?.VITE_API_URL)) ||
    (typeof window !== 'undefined' && (window as any).__API_BASE_URL__) ||
    '';
  
  if (typeof customApiBase === 'string') {
    customApiBase = customApiBase.trim();
  } else {
    customApiBase = '';
  }

  // Guard: Never use 0.0.0.0 as browser API base URL as it causes ERR_ADDRESS_INVALID in browsers
  if (customApiBase && (customApiBase.includes('0.0.0.0') || customApiBase.startsWith('http://0.0.0.0') || customApiBase.startsWith('https://0.0.0.0'))) {
    customApiBase = '';
  }

  // Ensure endpoint starts with a single leading slash
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // If no custom base URL is configured, use the same-origin relative API path directly
  if (!customApiBase) {
    return cleanEndpoint;
  }

  // Normalize base URL:
  // 1. Remove all trailing slashes (e.g. "http://localhost:3000/" -> "http://localhost:3000")
  let normalizedBase = customApiBase.replace(/\/+$/, '');

  // 2. If base URL has a trailing "/api" and the endpoint already begins with "/api",
  // strip the trailing "/api" from the base URL to prevent duplicate "/api/api/..." routes.
  if (cleanEndpoint.startsWith('/api') && /\/api$/i.test(normalizedBase)) {
    normalizedBase = normalizedBase.replace(/\/api$/i, '');
  }

  // 3. If normalizedBase became empty (e.g. customApiBase was "/api" or "/api/"), return the relative path
  if (!normalizedBase) {
    return cleanEndpoint;
  }

  return `${normalizedBase}${cleanEndpoint}`;
}

// Service API
export const reviewService = {
  getStats(): DashboardStats {
    const reviews = this.getReviews();
    const projects = this.getProjects();
    const totalReviews = reviews.length;
    
    if (totalReviews === 0) return INITIAL_STATS;

    const avgReviewScore = Math.round(
      (reviews.reduce((acc, r) => acc + r.overallScore, 0) / totalReviews) * 10
    ) / 10;

    let criticalCount = 0;
    let warningCount = 0;
    let suggestionCount = 0;

    reviews.forEach(r => {
      criticalCount += r.issueCounts.critical;
      warningCount += r.issueCounts.warning;
      suggestionCount += r.issueCounts.suggestion;
    });

    const activeProjects = projects.filter(p => p.status === 'active').length;
    const codeLinesAnalyzed = reviews.reduce((acc, r) => acc + (r.linesOfCode || 20), 0) + 280000;

    return {
      totalReviews,
      avgReviewScore,
      criticalIssues: criticalCount,
      warnings: warningCount,
      suggestions: suggestionCount,
      activeProjects,
      codeLinesAnalyzed,
      securityScoreTrend: 5.4
    };
  },

  getReviews(): CodeReview[] {
    return getStored<CodeReview[]>(STORAGE_KEYS.REVIEWS, INITIAL_REVIEWS);
  },

  getReviewById(id: string): CodeReview | undefined {
    const reviews = this.getReviews();
    return reviews.find(r => r.id === id);
  },

  async createReview(payload: {
    title: string;
    language: Language;
    code: string;
    projectId?: string;
  }): Promise<CodeReview> {
    try {
      const targetUrl = getApiUrl('/api/review');
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const apiData = await response.json();
        const reviews = this.getReviews();

        let critical = 0;
        let warning = 0;
        let suggestion = 0;

        (apiData.findings || []).forEach((f: Finding) => {
          const sev = (f.severity || '').toLowerCase();
          if (sev === 'critical' || sev === 'high') critical++;
          else if (sev === 'medium') warning++;
          else suggestion++;
        });

        let projectName = 'Standalone Snippet';
        if (payload.projectId) {
          const proj = this.getProjects().find(p => p.id === payload.projectId);
          if (proj) projectName = proj.name;
        }

        const newReview: CodeReview = {
          id: apiData.id || `rev_${Date.now()}`,
          title: apiData.title || payload.title || `${payload.language.toUpperCase()} Analysis Run`,
          language: payload.language,
          code: payload.code,
          status: 'completed',
          overallScore: apiData.overallScore ?? 100,
          summary: apiData.summary,
          hasRealErrors: apiData.hasRealErrors,
          analyzerStatus: apiData.analyzerStatus || 'FULLY_SUPPORTED',
          analyzerMessage: apiData.analyzerMessage,
          projectId: payload.projectId,
          projectName,
          durationMs: apiData.durationMs || 150,
          createdAt: apiData.createdAt || new Date().toISOString(),
          linesOfCode: apiData.linesOfCode || payload.code.split('\n').length,
          commitHash: Math.random().toString(16).substring(2, 9),
          branch: 'main',
          author: {
            name: 'Vootla Rakesh Reddy',
            email: 'vootlarakeshreddy123@gmail.com',
            avatar: MALE_AI_CHATBOT_AVATAR
          },
          issueCounts: apiData.issueCounts || { critical, warning, suggestion },
          metrics: apiData.metrics || {
            securityScore: Math.max(30, 100 - critical * 25),
            codeQualityScore: Math.max(40, 100 - warning * 10),
            performanceScore: Math.max(50, 100 - warning * 5),
            maintainabilityScore: Math.max(50, 100 - suggestion * 5),
            correctnessScore: Math.max(20, 100 - critical * 30 - warning * 10)
          },
          complexity: apiData.complexity,
          scoreBreakdown: apiData.scoreBreakdown,
          optimizations: apiData.optimizations,
          securityAnalysis: apiData.securityAnalysis,
          performanceAnalysis: apiData.performanceAnalysis,
          maintainabilityAnalysis: apiData.maintainabilityAnalysis,
          codeQualityAnalysis: apiData.codeQualityAnalysis,
          codeSmells: apiData.codeSmells,
          findings: apiData.findings || []
        };

        const updated = [newReview, ...reviews];
        setStored(STORAGE_KEYS.REVIEWS, updated);

        if (payload.projectId) {
          const projects = this.getProjects();
          const projIndex = projects.findIndex(p => p.id === payload.projectId);
          if (projIndex !== -1) {
            projects[projIndex].totalReviews += 1;
            projects[projIndex].lastReviewAt = new Date().toISOString();
            projects[projIndex].criticalIssuesCount += critical;
            projects[projIndex].openIssuesCount += (apiData.findings || []).length;
            setStored(STORAGE_KEYS.PROJECTS, projects);
          }
        }

        return newReview;
      }
    } catch (e: any) {
      console.warn('Backend analysis server unreachable or returned error:', e);
    }

    // When backend analysis is unreachable, do NOT synthesize fake mock results.
    // Instead, return an explicit error review with status 'ANALYZER_UNAVAILABLE' and score 0.
    const reviews = this.getReviews();
    const codeLines = payload.code.split('\n').length;
    let projectName = 'Standalone Snippet';
    if (payload.projectId) {
      const proj = this.getProjects().find(p => p.id === payload.projectId);
      if (proj) projectName = proj.name;
    }

    const failedReview: CodeReview = {
      id: `rev_unavail_${Date.now()}`,
      title: payload.title || `${payload.language.toUpperCase()} Analysis Run`,
      language: payload.language,
      code: payload.code,
      status: 'failed',
      overallScore: 0,
      hasRealErrors: false,
      analyzerStatus: 'ANALYZER_UNAVAILABLE',
      analyzerMessage: `Analysis backend at '${getApiUrl('/api/review')}' is unreachable. Please ensure the analysis server is running and accessible.`,
      summary: `Analysis backend is unreachable. Static code review could not be executed.`,
      projectId: payload.projectId,
      projectName,
      durationMs: 0,
      createdAt: new Date().toISOString(),
      linesOfCode: codeLines,
      commitHash: Math.random().toString(16).substring(2, 9),
      branch: 'main',
      author: {
        name: 'Vootla Rakesh Reddy',
        email: 'vootlarakeshreddy123@gmail.com',
        avatar: MALE_AI_CHATBOT_AVATAR
      },
      issueCounts: { critical: 0, warning: 0, suggestion: 0 },
      metrics: {
        securityScore: 0,
        codeQualityScore: 0,
        performanceScore: 0,
        maintainabilityScore: 0
      },
      findings: []
    };

    setStored(STORAGE_KEYS.REVIEWS, [failedReview, ...reviews]);
    return failedReview;
  },

  updateFindingStatus(reviewId: string, findingId: string, newStatus: 'open' | 'ignored' | 'resolved'): CodeReview | undefined {
    const reviews = this.getReviews();
    const review = reviews.find(r => r.id === reviewId);
    if (!review) return undefined;

    const finding = review.findings.find(f => f.id === findingId);
    if (finding) {
      finding.status = newStatus;
      setStored(STORAGE_KEYS.REVIEWS, reviews);
    }
    return review;
  },

  deleteReview(id: string): void {
    const reviews = this.getReviews().filter(r => r.id !== id);
    setStored(STORAGE_KEYS.REVIEWS, reviews);
  },

  // Projects
  getProjects(): Project[] {
    return getStored<Project[]>(STORAGE_KEYS.PROJECTS, INITIAL_PROJECTS);
  },

  getProjectById(id: string): Project | undefined {
    return this.getProjects().find(p => p.id === id);
  },

  createProject(payload: Omit<Project, 'id' | 'totalReviews' | 'avgScore' | 'lastReviewAt' | 'criticalIssuesCount' | 'openIssuesCount' | 'status'>): Project {
    const projects = this.getProjects();
    const newProject: Project = {
      ...payload,
      id: `proj_${Date.now().toString().slice(-6)}`,
      totalReviews: 0,
      avgScore: 100,
      lastReviewAt: new Date().toISOString(),
      criticalIssuesCount: 0,
      openIssuesCount: 0,
      status: 'active',
      securityHealth: 'A+'
    };
    const updated = [newProject, ...projects];
    setStored(STORAGE_KEYS.PROJECTS, updated);
    return newProject;
  },

  // Custom Rules
  getCustomRules(): CustomRule[] {
    return getStored<CustomRule[]>(STORAGE_KEYS.CUSTOM_RULES, INITIAL_CUSTOM_RULES);
  },

  toggleCustomRule(id: string): CustomRule[] {
    const rules = this.getCustomRules();
    const rule = rules.find(r => r.id === id);
    if (rule) {
      rule.enabled = !rule.enabled;
      setStored(STORAGE_KEYS.CUSTOM_RULES, rules);
    }
    return rules;
  },

  createCustomRule(ruleData: Omit<CustomRule, 'id' | 'totalHits' | 'createdAt'>): CustomRule {
    const rules = this.getCustomRules();
    const newRule: CustomRule = {
      ...ruleData,
      id: `rule_${Date.now().toString().slice(-6)}`,
      totalHits: 0,
      createdAt: new Date().toISOString()
    };
    const updated = [newRule, ...rules];
    setStored(STORAGE_KEYS.CUSTOM_RULES, updated);
    return newRule;
  },

  deleteCustomRule(id: string): void {
    const rules = this.getCustomRules().filter(r => r.id !== id);
    setStored(STORAGE_KEYS.CUSTOM_RULES, rules);
  },

  // GitHub Repos
  getGitHubRepos(): GitHubRepo[] {
    return getStored<GitHubRepo[]>(STORAGE_KEYS.GITHUB_REPOS, INITIAL_GITHUB_REPOS);
  },

  toggleRepoConnection(id: string): GitHubRepo[] {
    const repos = this.getGitHubRepos();
    const repo = repos.find(r => r.id === id);
    if (repo) {
      repo.isConnected = !repo.isConnected;
      setStored(STORAGE_KEYS.GITHUB_REPOS, repos);
    }
    return repos;
  },

  toggleRepoAutoReview(id: string): GitHubRepo[] {
    const repos = this.getGitHubRepos();
    const repo = repos.find(r => r.id === id);
    if (repo) {
      repo.autoReviewPr = !repo.autoReviewPr;
      setStored(STORAGE_KEYS.GITHUB_REPOS, repos);
    }
    return repos;
  },

  // User Profile
  getUserProfile(): UserProfile {
    const profile = getStored<UserProfile>(STORAGE_KEYS.USER_PROFILE, INITIAL_USER);
    // Ensure authoritative name, email & animated male chatbot avatar are synchronized
    if (
      profile.name !== 'Vootla Rakesh Reddy' ||
      profile.email !== 'vootlarakeshreddy123@gmail.com' ||
      profile.avatarUrl.includes('unsplash.com')
    ) {
      profile.name = 'Vootla Rakesh Reddy';
      profile.email = 'vootlarakeshreddy123@gmail.com';
      profile.avatarUrl = MALE_AI_CHATBOT_AVATAR;
      setStored(STORAGE_KEYS.USER_PROFILE, profile);
    }
    return profile;
  },

  updateUserProfile(updatedData: Partial<UserProfile>): UserProfile {
    const profile = this.getUserProfile();
    const updated = { ...profile, ...updatedData };
    setStored(STORAGE_KEYS.USER_PROFILE, updated);
    return updated;
  },

  // Export review as standard JSON matching requested specification
  getReviewJSON(review: CodeReview): ReviewResponseJSON {
    const syntaxFindings = review.findings.filter(f => 
      f.category === 'SYNTAX_ERRORS' || f.category === 'syntax'
    );
    const hasSyntaxErrors = syntaxFindings.length > 0;
    const syntaxErrorMsg = hasSyntaxErrors 
      ? syntaxFindings.map(f => f.explanation).join(' ') 
      : 'No syntax errors detected.';

    let crit = 0, high = 0, med = 0, low = 0, info = 0;
    review.findings.forEach(f => {
      const sev = (f.severity || '').toString().toUpperCase();
      if (sev === 'CRITICAL') crit++;
      else if (sev === 'HIGH') high++;
      else if (sev === 'MEDIUM') med++;
      else if (sev === 'LOW') low++;
      else info++;
    });

    const formattedFindings = review.findings.map(f => {
      let catStr = (f.category || '').toString().toUpperCase();
      if (catStr === 'BUG') catStr = 'BUGS_RUNTIME_ERRORS';
      if (catStr === 'SYNTAX') catStr = 'SYNTAX_ERRORS';
      if (catStr === 'SECURITY') catStr = 'SECURITY_ISSUES';
      if (catStr === 'QUALITY') catStr = 'CODE_QUALITY';
      if (catStr === 'DEBUG') catStr = 'DEBUG_DEVELOPMENT_ARTIFACTS';

      let sevStr = (f.severity || '').toString().toUpperCase();
      if (sevStr === 'SUGGESTION') sevStr = 'INFO';

      return {
        category: catStr,
        severity: sevStr,
        title: f.title,
        line: f.lineNumber,
        problematic_code: f.codeSnippet,
        explanation: f.explanation,
        recommended_fix: f.recommendedFix
      };
    });

    let summaryText = "No significant issues detected.";
    if (formattedFindings.length > 0) {
      const highOrCrit = crit + high;
      if (highOrCrit > 0) {
        summaryText = `Identified ${highOrCrit} high-priority issue(s) requiring remediation.`;
      } else {
        summaryText = `Code passed static checks with ${formattedFindings.length} non-critical observation(s).`;
      }
    }

    const syntaxErrorsFormatted = formattedFindings.filter(f => f.category === 'SYNTAX_ERRORS');

    return {
      overall_score: review.overallScore,
      summary: summaryText,
      syntax_status: {
        errors_found: hasSyntaxErrors,
        message: syntaxErrorMsg
      },
      complexity: review.complexity,
      score_breakdown: review.scoreBreakdown,
      optimizations: review.optimizations,
      security_analysis: review.securityAnalysis,
      performance_analysis: review.performanceAnalysis,
      maintainability_analysis: review.maintainabilityAnalysis,
      code_quality_analysis: review.codeQualityAnalysis,
      code_smells: review.codeSmells,
      syntax_errors: syntaxErrorsFormatted,
      findings: formattedFindings,
      statistics: {
        critical: crit,
        high,
        medium: med,
        low,
        info
      }
    };
  },

  async requestAiFix(
    code: string,
    language: Language,
    finding: Finding
  ): Promise<{ fixedSnippet: string; explanation: string; diffPatch?: string }> {
    try {
      const targetUrl = getApiUrl('/api/fix');
      const resp = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, finding })
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.warn('Failed to call /api/fix, using client fallback:', e);
    }
    return {
      fixedSnippet: finding.recommendedFix || finding.recommended_fix || finding.codeSnippet,
      explanation: finding.explanation || 'Applied suggested correction for this finding.'
    };
  }
};

// Helper function to detect issues dynamically following the 8-step pipeline
function generateMockFindings(code: string, language: Language): Finding[] {
  const lines = code.split('\n');
  const findings: Finding[] = [];

  // Track identifiers defined in scope
  const definedVars = new Set<string>([
    // Built-in functions and identifiers
    'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'sum', 'max', 'min', 'abs', 'open', 'type', 'isinstance', 'input', 'super', 'zip', 'enumerate', 'filter', 'map', 'sorted', 'any', 'all', 'slice', 'getattr', 'setattr', 'hasattr', 'id', 'hex', 'bin', 'oct', 'ord', 'chr', 'repr', 'dir', 'vars', 'help', 'eval', 'exec', 'Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError', 'NameError', 'ZeroDivisionError',
    'console', 'process', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Promise', 'Set', 'Map', 'RegExp', 'Date', 'Error', 'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'window', 'document', 'fetch'
  ]);

  const assignedVarValues = new Map<string, string>();

  // Pass 1: Scope construction
  lines.forEach((line) => {
    const clean = line.trim();
    if (!clean || clean.startsWith('#') || clean.startsWith('//')) return;

    // Python function header e.g. def calculate_price(price, tax):
    const pyDefMatch = clean.match(/^def\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)/);
    if (pyDefMatch) {
      definedVars.add(pyDefMatch[1]);
      const params = pyDefMatch[2].split(',').map(p => p.trim().split('=')[0].trim()).filter(Boolean);
      params.forEach(p => definedVars.add(p));
    }

    // JS/TS function header
    const jsFuncMatch = clean.match(/^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)/);
    if (jsFuncMatch) {
      definedVars.add(jsFuncMatch[1]);
      const params = jsFuncMatch[2].split(',').map(p => p.trim().split('=')[0].trim()).filter(Boolean);
      params.forEach(p => definedVars.add(p));
    }

    // Class header
    const classMatch = clean.match(/^(?:class|export\s+class)\s+([a-zA-Z_]\w*)/);
    if (classMatch) {
      definedVars.add(classMatch[1]);
    }

    // Imports
    const importMatch = clean.match(/^(?:import|from)\s+([a-zA-Z_]\w*)/);
    if (importMatch) {
      definedVars.add(importMatch[1]);
    }

    // Variable assignment e.g. total = price + tax or let total = ... or const x = 0
    const assignMatch = clean.match(/^(?:let|const|var)?\s*([a-zA-Z_]\w*)\s*=\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1].trim();
      const valExpr = assignMatch[2].trim().replace(/;$/, '');
      definedVars.add(varName);
      assignedVarValues.set(varName, valExpr);
    }
  });

  // Pass 2: 8-Stage Analysis Pipeline
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const cleanLine = line.trim();
    if (!cleanLine || cleanLine.startsWith('#') || cleanLine.startsWith('//')) return;

    // -------------------------------------------------------------
    // STEP 1 — SYNTAX ERRORS
    // -------------------------------------------------------------
    const openParens = (cleanLine.match(/\(/g) || []).length;
    const closeParens = (cleanLine.match(/\)/g) || []).length;
    const openBrackets = (cleanLine.match(/\[/g) || []).length;
    const closeBrackets = (cleanLine.match(/\]/g) || []).length;
    const quotes = (cleanLine.match(/"/g) || []).length;

    if (openParens > closeParens && !cleanLine.endsWith(';') && !cleanLine.endsWith(':')) {
      findings.push({
        id: `f_gen_${lineNum}_syntax_p`,
        lineNumber: lineNum,
        category: 'SYNTAX_ERRORS',
        severity: 'HIGH',
        title: 'Syntax Error: Missing Closing Parenthesis',
        explanation: `Syntax error on line ${lineNum}: Expected closing parenthesis ')'.`,
        codeSnippet: cleanLine,
        recommendedFix: `${cleanLine})`,
        status: 'open'
      });
      return;
    }

    if (openBrackets > closeBrackets && !cleanLine.endsWith(';')) {
      findings.push({
        id: `f_gen_${lineNum}_syntax_b`,
        lineNumber: lineNum,
        category: 'SYNTAX_ERRORS',
        severity: 'HIGH',
        title: 'Syntax Error: Unmatched Bracket',
        explanation: `Syntax error on line ${lineNum}: Expected closing bracket ']'.`,
        codeSnippet: cleanLine,
        recommendedFix: `${cleanLine}]`,
        status: 'open'
      });
      return;
    }

    if (quotes % 2 !== 0) {
      findings.push({
        id: `f_gen_${lineNum}_syntax_q`,
        lineNumber: lineNum,
        category: 'SYNTAX_ERRORS',
        severity: 'HIGH',
        title: 'Syntax Error: Unterminated String Literal',
        explanation: `Syntax error on line ${lineNum}: String literal is missing a closing quote.`,
        codeSnippet: cleanLine,
        recommendedFix: `${cleanLine}"`,
        status: 'open'
      });
      return;
    }

    // -------------------------------------------------------------
    // STEP 2 — DEFINITE RUNTIME ERRORS
    // -------------------------------------------------------------

    // Undefined variable check (e.g. return final_total)
    const retMatch = cleanLine.match(/^return\s+([a-zA-Z_]\w*)$/);
    if (retMatch) {
      const targetVar = retMatch[1];
      if (!definedVars.has(targetVar) && !['None', 'True', 'False', 'null', 'undefined'].includes(targetVar)) {
        findings.push({
          id: `f_gen_${lineNum}_undef_var`,
          lineNumber: lineNum,
          category: 'BUGS_RUNTIME_ERRORS',
          severity: 'HIGH',
          title: 'Undefined Variable',
          explanation: `The variable '${targetVar}' has not been defined. Executing this statement will raise a NameError.`,
          codeSnippet: cleanLine,
          recommendedFix: `Return 'total' or define '${targetVar}' before using it.`,
          status: 'open'
        });
      }
    }

    // Division or Modulo by Zero
    const divMatch = cleanLine.match(/([a-zA-Z_]\w*|\d+)\s*[\/%]\s*([a-zA-Z_]\w*|\d+)/);
    if (divMatch) {
      const divisor = divMatch[2];
      const isZeroLiteral = divisor === '0';
      const isZeroVar = assignedVarValues.get(divisor) === '0';

      if (isZeroLiteral || isZeroVar) {
        findings.push({
          id: `f_gen_${lineNum}_zero_div`,
          lineNumber: lineNum,
          category: 'BUGS_RUNTIME_ERRORS',
          severity: 'HIGH',
          title: 'Division by Zero',
          explanation: `The value of '${divisor}' is known to be zero, so this operation will raise ZeroDivisionError.`,
          codeSnippet: cleanLine,
          recommendedFix: `Check that '${divisor}' is not zero before performing the division.`,
          status: 'open'
        });
      }
    }

    // Index Out of Bounds
    const arrayIndexMatch = cleanLine.match(/([a-zA-Z_]\w*)\s*\[\s*(\d+)\s*\]/);
    if (arrayIndexMatch) {
      const arrName = arrayIndexMatch[1];
      const idx = parseInt(arrayIndexMatch[2], 10);
      const arrVal = assignedVarValues.get(arrName);
      if (arrVal && arrVal.startsWith('[') && arrVal.endsWith(']')) {
        const elems = arrVal.slice(1, -1).split(',').filter(e => e.trim().length > 0);
        if (idx >= elems.length) {
          findings.push({
            id: `f_gen_${lineNum}_oob`,
            lineNumber: lineNum,
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: 'Index Out of Bounds',
            explanation: `Accessing index ${idx} on list '${arrName}' of length ${elems.length} will cause an IndexError at runtime.`,
            codeSnippet: cleanLine,
            recommendedFix: `Verify index is within valid range (0 to ${elems.length - 1}).`,
            status: 'open'
          });
        }
      }
    }

    // -------------------------------------------------------------
    // STEP 3 — LOGICAL BUGS
    // -------------------------------------------------------------
    if (cleanLine.includes('if (') && cleanLine.includes(' = ') && !cleanLine.includes(' == ') && !cleanLine.includes(' === ') && !cleanLine.includes(' >= ') && !cleanLine.includes(' <= ')) {
      findings.push({
        id: `f_gen_${lineNum}_assign_cond`,
        lineNumber: lineNum,
        category: 'BUGS_RUNTIME_ERRORS',
        severity: 'HIGH',
        title: 'Assignment in Conditional Expression',
        explanation: 'Using single assignment operator `=` instead of equality check `==` or `===` in conditional statement.',
        codeSnippet: cleanLine,
        recommendedFix: 'Use `==` or `===` for comparison.',
        status: 'open'
      });
    }

    // -------------------------------------------------------------
    // STEP 4 — SECURITY VULNERABILITIES
    // -------------------------------------------------------------
    if (cleanLine.match(/SELECT.*WHERE.*['"].*\+/i) || cleanLine.match(/f"SELECT.*{/i) || (cleanLine.match(/sqlite3\.connect/i) && cleanLine.includes('+'))) {
      findings.push({
        id: `f_gen_${lineNum}_sql`,
        lineNumber: lineNum,
        category: 'SECURITY_ISSUES',
        severity: 'CRITICAL',
        title: 'SQL Injection Risk',
        explanation: 'Dynamic string concatenation in SQL statements permits query manipulation. Use parametrized queries with placeholders.',
        codeSnippet: cleanLine,
        recommendedFix: 'Use bind variables or ORM parameter binding.',
        diffPatch: `- ${cleanLine}\n+ query = "SELECT * FROM table WHERE col = ?"\n+ cursor.execute(query, (user_val,))`,
        status: 'open'
      });
    } else if (cleanLine.includes('dangerouslySetInnerHTML') || cleanLine.includes('innerHTML =')) {
      findings.push({
        id: `f_gen_${lineNum}_xss`,
        lineNumber: lineNum,
        category: 'SECURITY_ISSUES',
        severity: 'CRITICAL',
        title: 'XSS Vulnerability via DOM Injection',
        explanation: 'Directly inserting unescaped HTML content into the DOM exposes users to Cross-Site Scripting.',
        codeSnippet: cleanLine,
        recommendedFix: 'Sanitize content with DOMPurify before setting raw HTML.',
        status: 'open'
      });
    } else if (cleanLine.match(/secret|password|api_key|token/i) && cleanLine.match(/['"][a-zA-Z0-9_\-]{8,}['"]/)) {
      findings.push({
        id: `f_gen_${lineNum}_secret`,
        lineNumber: lineNum,
        category: 'SECURITY_ISSUES',
        severity: 'HIGH',
        title: 'Hardcoded Secret Credential',
        explanation: 'Sensitive credentials embedded directly in source files can be leaked via version control repositories.',
        codeSnippet: cleanLine,
        recommendedFix: 'Move secrets into environment variables (`process.env` / `os.environ`).',
        status: 'open'
      });
    }

    // -------------------------------------------------------------
    // STEP 5 — PERFORMANCE
    // -------------------------------------------------------------
    if (cleanLine.includes('for ') && code.includes('for ') && index > 0 && lines[index - 1].trim().startsWith('for ')) {
      findings.push({
        id: `f_gen_${lineNum}_nested_loop`,
        lineNumber: lineNum,
        category: 'PERFORMANCE',
        severity: 'MEDIUM',
        title: 'Nested Loop O(N^2) Performance Overhead',
        explanation: 'Deeply nested iteration over dynamic collections causes quadratic time complexity.',
        codeSnippet: cleanLine,
        recommendedFix: 'Refactor using a hash map or indexed lookup table.',
        status: 'open'
      });
    }

    // -------------------------------------------------------------
    // STEP 7 — DEBUG / DEVELOPMENT ARTIFACTS
    // -------------------------------------------------------------
    // PRINT STATEMENT RULE: print() is valid code. It is NOT a syntax error, bug, or vulnerability.
    if (cleanLine.startsWith('print(') || cleanLine.startsWith('console.log(') || cleanLine.startsWith('System.out.println') || cleanLine.startsWith('fmt.Println')) {
      findings.push({
        id: `f_gen_${lineNum}_debug`,
        lineNumber: lineNum,
        category: 'DEBUG_DEVELOPMENT_ARTIFACTS',
        severity: 'LOW',
        title: 'Possible Leftover Debug Output',
        explanation: `${cleanLine} is valid ${language === 'python' ? 'Python' : 'code'}. It is not a syntax error and not a bug. It may be leftover debugging output.`,
        codeSnippet: cleanLine,
        recommendedFix: language === 'python' ? 'import logging\nlogging.info(...)' : 'console.debug(...);',
        status: 'open'
      });
    }
  });

  // PRIORITY SORTING RULE:
  // 1. CRITICAL
  // 2. HIGH
  // 3. MEDIUM
  // 4. LOW
  // 5. INFO
  const SEVERITY_WEIGHTS: Record<string, number> = {
    CRITICAL: 1,
    critical: 1,
    HIGH: 2,
    high: 2,
    MEDIUM: 3,
    medium: 3,
    LOW: 4,
    low: 4,
    INFO: 5,
    info: 5,
    suggestion: 5
  };

  findings.sort((a, b) => {
    const wA = SEVERITY_WEIGHTS[a.severity] || 99;
    const wB = SEVERITY_WEIGHTS[b.severity] || 99;
    if (wA !== wB) return wA - wB;
    return a.lineNumber - b.lineNumber;
  });

  return findings;
}
