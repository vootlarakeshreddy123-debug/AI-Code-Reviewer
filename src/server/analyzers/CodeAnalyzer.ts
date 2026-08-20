import { Language, IssueCategory, FindingType } from '../../types';

export interface StaticFinding {
  id: string;
  language: Language;
  category:
    | 'SYNTAX_ERRORS'
    | 'BUGS_RUNTIME_ERRORS'
    | 'SECURITY_ISSUES'
    | 'PERFORMANCE'
    | 'CODE_QUALITY'
    | 'DEBUG_DEVELOPMENT_ARTIFACTS'
    | 'STYLE'
    | 'INFO';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  line: number;
  column: number;
  problematicCode: string;
  problematic_code?: string;
  explanation: string;
  recommendedFix: string;
  recommended_fix?: string;
  diffPatch?: string;
  source: string;
  ruleId?: string;
  detection_source?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  findingType?: FindingType;
  whyThisMatters?: string;
  beforeCode?: string;
  afterCode?: string;
  beforeComplexity?: string;
  afterComplexity?: string;
  lineNumber?: number;
}

export interface AnalysisOutput {
  status: 'FULLY_SUPPORTED' | 'ANALYZER_UNAVAILABLE' | 'PARTIAL_SUPPORT';
  message?: string;
  findings: StaticFinding[];
}

export interface CodeAnalyzer {
  language: Language;
  analyze(code: string): Promise<AnalysisOutput>;
}
