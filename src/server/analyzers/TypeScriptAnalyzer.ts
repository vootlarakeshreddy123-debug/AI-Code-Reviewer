import ts from 'typescript';
import fs from 'fs';
import path from 'path';
import { CodeAnalyzer, StaticFinding, AnalysisOutput } from './CodeAnalyzer';
import { deduplicateAndIsolateFindings } from './summaryFilter';

export class TypeScriptAnalyzer implements CodeAnalyzer {
  language = 'typescript' as const;

  async analyze(code: string): Promise<AnalysisOutput> {
    const rawFindings: StaticFinding[] = [];
    const lines = code.split('\n');

    // 1. TypeScript Compiler API: Syntactic & Semantic Diagnostics
    try {
      const isReact = /import\s+.*React|from\s+['"]react['"]|<[A-Z][a-zA-Z0-9]*\b|<[a-z]+[\s>]|className=|useState|useEffect/i.test(code);
      const filename = isReact ? 'snippet.tsx' : 'snippet.ts';
      const sourceFile = ts.createSourceFile(
        filename,
        code,
        ts.ScriptTarget.Latest,
        true,
        isReact ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );

      const defaultLibPath = ts.getDefaultLibFilePath({ target: ts.ScriptTarget.ES2022 });

      const host: ts.CompilerHost = {
        getSourceFile: (fileName: string) => {
          if (fileName === filename) return sourceFile;
          if (fs.existsSync(fileName)) {
            try {
              const fileContent = fs.readFileSync(fileName, 'utf8');
              return ts.createSourceFile(fileName, fileContent, ts.ScriptTarget.Latest, true);
            } catch {
              return undefined;
            }
          }
          return undefined;
        },
        getDefaultLibFileName: () => defaultLibPath,
        writeFile: () => {},
        getCurrentDirectory: () => process.cwd(),
        getDirectories: () => [],
        getCanonicalFileName: (f: string) => f,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        fileExists: (f: string) => f === filename || fs.existsSync(f),
        readFile: (f: string) => (f === filename ? code : fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
      };

      const program = ts.createProgram(
        [filename],
        {
          noEmit: true,
          strict: true,
          noImplicitAny: false,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: isReact ? ts.JsxEmit.ReactJSX : undefined,
          lib: ['lib.es2022.d.ts', 'lib.dom.d.ts']
        },
        host
      );

      const syntacticDiagnostics = program.getSyntacticDiagnostics(sourceFile);
      const semanticDiagnostics = program.getSemanticDiagnostics(sourceFile);
      const allDiagnostics = [...syntacticDiagnostics, ...semanticDiagnostics];

      allDiagnostics.forEach((diag, idx) => {
        if (diag.category === ts.DiagnosticCategory.Error || diag.category === ts.DiagnosticCategory.Warning) {
          const lineAndChar = diag.file
            ? diag.file.getLineAndCharacterOfPosition(diag.start || 0)
            : { line: 0, character: 0 };
          const lineNum = Math.max(1, lineAndChar.line + 1);
          const colNum = Math.max(1, lineAndChar.character + 1);
          const message = typeof diag.messageText === 'string' ? diag.messageText : diag.messageText.messageText;

          // Filter out missing ambient third-party modules in standalone snippets
          if (diag.code === 2307 && (message.includes('react') || message.includes('lodash') || message.includes('axios') || message.includes('express'))) {
            return;
          }

          const probCode = lines[lineNum - 1]?.trim() || '';
          const isSyntax = diag.category === ts.DiagnosticCategory.Error && (diag.code >= 1000 && diag.code <= 1499);
          const isTypeMismatch = diag.code === 2322 || diag.code === 2345 || diag.code === 2339;

          let category: StaticFinding['category'] = 'BUGS_RUNTIME_ERRORS';
          if (isSyntax) category = 'SYNTAX_ERRORS';
          else if (isTypeMismatch) category = 'BUGS_RUNTIME_ERRORS';

          rawFindings.push({
            id: `ts_comp_${diag.code}_${lineNum}_${idx}`,
            language: 'typescript',
            category,
            severity: isSyntax ? 'HIGH' : 'HIGH',
            title: `TS${diag.code}: ${message.split('.')[0]}`,
            line: lineNum,
            column: colNum,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: `TypeScript Compiler diagnostic TS${diag.code}: ${message}`,
            recommendedFix: isTypeMismatch
              ? 'Update the type annotation or value to match the expected type schema.'
              : 'Correct the TypeScript code to satisfy compiler constraints.',
            recommended_fix: isTypeMismatch
              ? 'Update the type annotation or value to match the expected type schema.'
              : 'Correct the TypeScript code to satisfy compiler constraints.',
            source: 'TypeScript Compiler',
            ruleId: `TS${diag.code}`,
            detection_source: `TypeScript Compiler (TS${diag.code})`,
            confidence: 'HIGH'
          });
        }
      });
    } catch (err: any) {
      console.warn('TypeScript Compiler API execution notice:', err);
    }

    // 2. TypeScript / React Deep AST Security, Reliability & Quality Analysis
    try {
      const astSource = ts.createSourceFile('snippet.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

      const assignedValues = new Map<string, number>();
      const arrayLengths = new Map<string, number>();
      const nullableVars = new Set<string>();

      const visit = (node: ts.Node) => {
        // Track variable values and types
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          const varName = node.name.text;
          if (node.initializer) {
            if (ts.isNumericLiteral(node.initializer)) {
              assignedValues.set(varName, Number(node.initializer.text));
            } else if (ts.isArrayLiteralExpression(node.initializer)) {
              arrayLengths.set(varName, node.initializer.elements.length);
            } else if (node.initializer.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(node.initializer) && node.initializer.text === 'undefined')) {
              nullableVars.add(varName);
            }
          }
        }

        // Division by Zero
        if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.SlashToken || node.operatorToken.kind === ts.SyntaxKind.PercentToken)) {
          let isZero = false;
          let divisor = '';
          if (ts.isNumericLiteral(node.right) && Number(node.right.text) === 0) {
            isZero = true;
            divisor = '0';
          } else if (ts.isIdentifier(node.right) && assignedValues.get(node.right.text) === 0) {
            isZero = true;
            divisor = node.right.text;
          }

          if (isZero) {
            const { line, character } = astSource.getLineAndCharacterOfPosition(node.getStart());
            const lineNum = line + 1;
            const probCode = lines[line]?.trim() || '';
            rawFindings.push({
              id: `ts_ast_div0_${lineNum}`,
              language: 'typescript',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: 'Division by Zero (produces Infinity / NaN)',
              line: lineNum,
              column: character + 1,
              problematicCode: probCode,
              problematic_code: probCode,
              explanation: `Division by zero (${divisor}) results in Infinity or NaN at runtime.`,
              recommendedFix: 'Add a non-zero guard check prior to performing division.',
              recommended_fix: 'Add a non-zero guard check prior to performing division.',
              source: 'AST',
              ruleId: 'no-division-by-zero',
              detection_source: 'TypeScript AST Analyzer',
              confidence: 'HIGH'
            });
          }
        }

        // Array Index Out of Bounds on fixed array literals
        if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
          const arrName = node.expression.text;
          const knownLen = arrayLengths.get(arrName);
          if (knownLen !== undefined && ts.isNumericLiteral(node.argumentExpression)) {
            const idxVal = Number(node.argumentExpression.text);
            if (idxVal >= knownLen || idxVal < 0) {
              const { line, character } = astSource.getLineAndCharacterOfPosition(node.getStart());
              const lineNum = line + 1;
              const probCode = lines[line]?.trim() || '';
              rawFindings.push({
                id: `ts_ast_bounds_${lineNum}`,
                language: 'typescript',
                category: 'BUGS_RUNTIME_ERRORS',
                severity: 'HIGH',
                title: `Index Out of Bounds: Array '${arrName}' has length ${knownLen}`,
                line: lineNum,
                column: character + 1,
                problematicCode: probCode,
                problematic_code: probCode,
                explanation: `Attempted to access index [${idxVal}] on array '${arrName}' initialized with only ${knownLen} elements. Returns undefined and risks TypeError.`,
                recommendedFix: `Ensure index is within bounds (0 to ${knownLen - 1}), or check array length before accessing.`,
                recommended_fix: `Ensure index is within bounds (0 to ${knownLen - 1}), or check array length before accessing.`,
                source: 'AST',
                ruleId: 'array-bounds',
                detection_source: 'TypeScript AST Analyzer',
                confidence: 'HIGH'
              });
            }
          }
        }

        // Null / Undefined Dereference
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
          const targetVar = node.expression.text;
          if (nullableVars.has(targetVar)) {
            const { line, character } = astSource.getLineAndCharacterOfPosition(node.getStart());
            const lineNum = line + 1;
            const probCode = lines[line]?.trim() || '';
            rawFindings.push({
              id: `ts_ast_null_deref_${lineNum}`,
              language: 'typescript',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: `TypeError: Cannot read properties of ${targetVar} (null/undefined dereference)`,
              line: lineNum,
              column: character + 1,
              problematicCode: probCode,
              problematic_code: probCode,
              explanation: `Variable '${targetVar}' was initialized to null or undefined. Accessing .${node.name.text} will throw a runtime TypeError: Cannot read properties of null.`,
              recommendedFix: `Use optional chaining: ${targetVar}?.${node.name.text} or add a null check before dereferencing.`,
              recommended_fix: `Use optional chaining: ${targetVar}?.${node.name.text} or add a null check before dereferencing.`,
              source: 'AST',
              ruleId: 'null-dereference',
              detection_source: 'TypeScript AST Analyzer',
              confidence: 'HIGH'
            });
          }
        }

        // Security: eval() or new Function()
        if (ts.isCallExpression(node)) {
          if (ts.isIdentifier(node.expression) && node.expression.text === 'eval') {
            const { line, character } = astSource.getLineAndCharacterOfPosition(node.getStart());
            const lineNum = line + 1;
            const probCode = lines[line]?.trim() || '';
            rawFindings.push({
              id: `ts_sec_eval_${lineNum}`,
              language: 'typescript',
              category: 'SECURITY_ISSUES',
              severity: 'CRITICAL',
              title: 'Unsafe Dynamic Code Execution (eval)',
              line: lineNum,
              column: character + 1,
              problematicCode: probCode,
              problematic_code: probCode,
              explanation: 'eval() executes arbitrary strings as code in the current scope, leading to severe Code Injection / Remote Code Execution.',
              recommendedFix: 'Refactor to avoid eval(); use JSON.parse() or dedicated typed parsers.',
              recommended_fix: 'Refactor to avoid eval(); use JSON.parse() or dedicated typed parsers.',
              source: 'ESLint',
              ruleId: 'no-eval',
              detection_source: 'ESLint Security (no-eval)',
              confidence: 'HIGH'
            });
          }

          // Command Injection: exec, execSync
          if (ts.isPropertyAccessExpression(node.expression) && ['exec', 'execSync', 'spawnSync'].includes(node.expression.name.text)) {
            const { line, character } = astSource.getLineAndCharacterOfPosition(node.getStart());
            const lineNum = line + 1;
            const probCode = lines[line]?.trim() || '';
            rawFindings.push({
              id: `ts_sec_cmd_${lineNum}`,
              language: 'typescript',
              category: 'SECURITY_ISSUES',
              severity: 'CRITICAL',
              title: 'Potential Command Injection via child_process execution',
              line: lineNum,
              column: character + 1,
              problematicCode: probCode,
              problematic_code: probCode,
              explanation: 'Executing system commands without parameter separation allows arbitrary shell command injection.',
              recommendedFix: 'Use execFile or spawn with argument arrays: execFile("cmd", ["arg1", "arg2"]).',
              recommended_fix: 'Use execFile or spawn with argument arrays: execFile("cmd", ["arg1", "arg2"]).',
              source: 'ESLint',
              ruleId: 'security/detect-child-process',
              detection_source: 'Node.js Security Analyzer',
              confidence: 'HIGH'
            });
          }
        }

        // Security: dangerouslySetInnerHTML without sanitization
        if (ts.isJsxAttribute(node) && (ts.isIdentifier(node.name) ? node.name.text : node.name.getText(astSource)) === 'dangerouslySetInnerHTML') {
          const { line, character } = astSource.getLineAndCharacterOfPosition(node.getStart());
          const lineNum = line + 1;
          const probCode = lines[line]?.trim() || '';
          rawFindings.push({
            id: `ts_sec_xss_${lineNum}`,
            language: 'typescript',
            category: 'SECURITY_ISSUES',
            severity: 'HIGH',
            title: 'Cross-Site Scripting (XSS) via dangerouslySetInnerHTML',
            line: lineNum,
            column: character + 1,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: 'Directly assigning unescaped or user-controlled HTML to dangerouslySetInnerHTML creates Cross-Site Scripting vulnerabilities.',
            recommendedFix: 'Sanitize HTML with DOMPurify before injecting, or use safe React JSX text children.',
            recommended_fix: 'Sanitize HTML with DOMPurify before injecting, or use safe React JSX text children.',
            source: 'ESLint',
            ruleId: 'react/no-danger',
            detection_source: 'ESLint React (react/no-danger)',
            confidence: 'HIGH'
          });
        }

        ts.forEachChild(node, visit);
      };

      visit(astSource);
    } catch (err: any) {
      console.warn('TypeScript AST analysis notice:', err);
    }

    // Line-level security regex checks for hardcoded credentials & tokens
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('/*')) return;

      // Hardcoded Secret Keys / Passwords
      if (/(?:apiKey|secretKey|password|jwtSecret|private_key)\s*[:=]\s*['"`]([A-Za-z0-9_\-+/=]{16,})['"`]/i.test(clean)) {
        if (!clean.includes('process.env') && !clean.includes('import.meta.env')) {
          rawFindings.push({
            id: `ts_sec_secret_${lineNum}`,
            language: 'typescript',
            category: 'SECURITY_ISSUES',
            severity: 'CRITICAL',
            title: 'Hardcoded Secret / API Key Detected',
            line: lineNum,
            column: 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: 'Hardcoded credentials or API keys committed to source code risk credential leakage in repositories and build artifacts.',
            recommendedFix: 'Extract secrets to environment variables (e.g. process.env.API_KEY or .env file).',
            recommended_fix: 'Extract secrets to environment variables (e.g. process.env.API_KEY or .env file).',
            source: 'Security Scanner',
            ruleId: 'detect-secrets',
            detection_source: 'Security Credential Scanner',
            confidence: 'HIGH'
          });
        }
      }
    });

    const isolatedFindings = deduplicateAndIsolateFindings(rawFindings, 'typescript');

    return {
      status: 'FULLY_SUPPORTED',
      message: 'TypeScript 5.x Compiler & Semantic Diagnostics + AST Engine',
      findings: isolatedFindings
    };
  }
}
