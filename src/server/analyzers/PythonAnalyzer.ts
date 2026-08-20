import { execFile } from 'child_process';
import path from 'path';
import { CodeAnalyzer, StaticFinding, AnalysisOutput } from './CodeAnalyzer';
import { deduplicateAndIsolateFindings } from './summaryFilter';
import { resolvePythonExecutable } from '../utils/pythonResolver';

export class PythonAnalyzer implements CodeAnalyzer {
  language = 'python' as const;

  async analyze(code: string): Promise<AnalysisOutput> {
    const pyResolution = resolvePythonExecutable();

    if (!pyResolution.isAvailable) {
      return {
        status: 'ANALYZER_UNAVAILABLE',
        message: 'Python executable not detected on host. Set the PYTHON_EXECUTABLE environment variable or ensure Python is added to PATH.',
        findings: []
      };
    }

    return new Promise((resolve) => {
      const scriptPath = path.resolve(process.cwd(), 'scripts', 'python_analyzer.py');
      const processArgs = [...pyResolution.args, scriptPath];

      const pyProcess = execFile(
        pyResolution.executable,
        processArgs,
        {
          timeout: 15000,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024
        },
        (error, stdout, stderr) => {
          if (stderr && stderr.trim()) {
            console.warn('Python analyzer stderr notice:', stderr.trim());
          }

          if (stdout && stdout.trim()) {
            try {
              const rawFindings = JSON.parse(stdout.trim());
              if (Array.isArray(rawFindings)) {
                const findings: StaticFinding[] = rawFindings.map((f: any, idx: number) => ({
                  id: f.id || `py_tool_${f.line || 1}_${idx}`,
                  language: 'python',
                  category: f.category || 'CODE_QUALITY',
                  severity: f.severity || 'LOW',
                  title: f.title || 'Python Static Analysis Finding',
                  line: f.line || 1,
                  column: f.column || 1,
                  problematic_code: f.problematicCode || f.problematic_code || '',
                  problematicCode: f.problematicCode || f.problematic_code || '',
                  explanation: f.explanation || '',
                  recommended_fix: f.recommendedFix || f.recommended_fix || '',
                  recommendedFix: f.recommendedFix || f.recommended_fix || '',
                  source: f.source || 'Python AST',
                  ruleId: f.ruleId || f.code || f.source,
                  detection_source: f.detection_source || `${f.source || 'Python'} Static Analyzer`,
                  confidence: f.confidence || 'HIGH'
                }));

                const isolated = deduplicateAndIsolateFindings(findings, 'python');

                return resolve({
                  status: 'FULLY_SUPPORTED',
                  message: `${pyResolution.version || 'Python'} (AST + Pyflakes + Bandit + Ruff + mypy)`,
                  findings: isolated
                });
              }
            } catch (e) {
              console.error('Failed to parse Python analyzer output JSON:', stdout);
            }
          }

          if (error) {
            console.error('Python analyzer process execution error:', error);
            return resolve({
              status: 'ANALYZER_UNAVAILABLE',
              message: `Python engine notice: ${error.message}`,
              findings: []
            });
          }

          return resolve({
            status: 'FULLY_SUPPORTED',
            message: `${pyResolution.version || 'Python'} (AST + Pyflakes + Bandit + Ruff + mypy)`,
            findings: []
          });
        }
      );

      if (pyProcess.stdin) {
        pyProcess.stdin.write(code);
        pyProcess.stdin.end();
      }
    });
  }
}

