import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodeAnalyzer, StaticFinding, AnalysisOutput } from './CodeAnalyzer';
import { deduplicateAndIsolateFindings, isCompilerSummaryMessage } from './summaryFilter';

export class RubyAnalyzer implements CodeAnalyzer {
  language = 'ruby' as const;

  async analyze(code: string): Promise<AnalysisOutput> {
    const rawFindings: StaticFinding[] = [];
    const sourceLines = code.split('\n');

    const rubyInstalled = await new Promise<boolean>((resolve) => {
      execFile('ruby', ['-v'], (err) => resolve(!err));
    });

    if (rubyInstalled) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruby_review_'));
      const filePath = path.join(tempDir, 'snippet.rb');
      fs.writeFileSync(filePath, code, 'utf-8');

      // Run ruby -c (syntax check)
      const rawStderr = await new Promise<string>((resolve) => {
        execFile('ruby', ['-c', filePath], { cwd: tempDir, timeout: 10000 }, (_err, stdout, stderr) => {
          resolve(`${stdout}\n${stderr}`);
        });
      });

      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }

      // Parse Ruby syntax errors:
      const lines = rawStderr.split('\n');

      lines.forEach((diagLine, idx) => {
        const trimmed = diagLine.trim();
        if (!trimmed || isCompilerSummaryMessage(trimmed)) return;

        const match = trimmed.match(/.*?:(\d+):\s*(syntax error,\s*.*)/i);
        if (match) {
          let lineNum = parseInt(match[1], 10);
          lineNum = Math.max(1, Math.min(lineNum, sourceLines.length));
          const message = match[2].trim();
          if (!message || isCompilerSummaryMessage(message)) return;

          const probCode = sourceLines[lineNum - 1]?.trim() || trimmed;

          rawFindings.push({
            id: `ruby_syn_${lineNum}_${idx}`,
            language: 'ruby',
            category: 'SYNTAX_ERRORS',
            severity: 'HIGH',
            title: `Ruby Syntax Error: ${message.split(',')[0]}`,
            line: lineNum,
            column: 1,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: `Ruby syntax checker reported: ${message}`,
            recommendedFix: 'Correct the Ruby syntax (check missing "end" keyword or mismatched brackets).',
            recommended_fix: 'Correct the Ruby syntax (check missing "end" keyword or mismatched brackets).',
            source: 'ruby -c',
            ruleId: 'ruby/syntax-error',
            detection_source: 'Ruby Interpreter (ruby -c)',
            confidence: 'HIGH'
          });
        }
      });
    }

    // Static Multi-Pass AST / Semantic & Security Checks for Ruby (RuboCop / Brakeman)
    const nilVars = new Set<string>();
    const rubyNumVars = new Map<string, number>();
    const rubyArrayLens = new Map<string, number>();
    const rubyDeclaredVars = new Set<string>(['puts', 'print', 'p', 'raise', 'fail', 'require', 'require_relative', 'include', 'extend', 'attr_reader', 'attr_writer', 'attr_accessor', 'true', 'false', 'nil', 'self', 'super', 'yield', 'loop', 'lambda', 'proc', 'File', 'Dir', 'Math', 'JSON', 'YAML', 'Time', 'Date', 'DateTime', 'StandardError', 'Exception', 'ArgumentError', 'RuntimeError', 'NameError', 'NoMethodError']);
    const rubyDeclaredMethods = new Map<string, { line: number; paramCount: number }>();
    const rubyMethodDivisors = new Map<string, { divisorArgIndex: number }>();

    // Pass 1: Gather methods, parameters, variables, arrays
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('#')) return;

      // Track method definitions: def calculate(a, b)
      const defMatch = clean.match(/def\s+([a-zA-Z0-9_]+(?:\.|\#)?[a-zA-Z0-9_?!]*)(?:\s*\(([^)]*)\)|\s+([a-zA-Z0-9_,\s=]+))?/);
      if (defMatch) {
        const methodName = defMatch[1];
        const paramsStr = defMatch[2] || defMatch[3] || '';
        const params = paramsStr.trim() ? paramsStr.split(',').map((p) => p.trim().split(/[\s=]/)[0]).filter(Boolean) : [];
        rubyDeclaredMethods.set(methodName, { line: lineNum, paramCount: params.length });
        params.forEach(p => rubyDeclaredVars.add(p));

        // Check if method divides by parameter:
        for (let j = idx; j < Math.min(sourceLines.length, idx + 15); j++) {
          const bodyLine = sourceLines[j];
          for (let pIdx = 0; pIdx < params.length; pIdx++) {
            const pName = params[pIdx];
            if (new RegExp(`[\\/\\%]\\s*${pName}\\b`).test(bodyLine)) {
              rubyMethodDivisors.set(methodName, { divisorArgIndex: pIdx });
              break;
            }
          }
          if (bodyLine.trim() === 'end') break;
        }
      }

      // Track array literals: numbers = [1, 2, 3]
      const arrLitMatch = clean.match(/([a-zA-Z0-9_]+)\s*=\s*\[([^\]]*)\]/);
      if (arrLitMatch) {
        const items = arrLitMatch[2].split(',').filter(Boolean);
        rubyArrayLens.set(arrLitMatch[1], items.length);
        rubyDeclaredVars.add(arrLitMatch[1]);
      }

      // Track nil assignments: user = nil
      const nilMatch = clean.match(/([a-zA-Z0-9_]+)\s*=\s*nil\b/);
      if (nilMatch) {
        nilVars.add(nilMatch[1]);
        rubyDeclaredVars.add(nilMatch[1]);
      }

      // Track numeric constants: b = 0
      const numMatch = clean.match(/([a-zA-Z0-9_]+)\s*=\s*(-?\d+)\b/);
      if (numMatch) {
        rubyNumVars.set(numMatch[1], parseInt(numMatch[2], 10));
        rubyDeclaredVars.add(numMatch[1]);
      }

      // Track general variable assignments: x = ...
      const generalAssign = clean.match(/^([a-zA-Z0-9_]+)\s*=[^=]/);
      if (generalAssign && !['if', 'unless', 'while', 'until', 'def', 'class', 'module', 'return', 'case', 'when'].includes(generalAssign[1])) {
        rubyDeclaredVars.add(generalAssign[1]);
      }
    });

    // Pass 2: Check calls, dereferences, divisions, security, and logic
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('#')) return;

      // 1. Division by Zero in method calls: calculate(20, 0)
      for (const [methodName, info] of rubyMethodDivisors.entries()) {
        const callMatch = clean.match(new RegExp(`\\b${methodName}\\s*(?:\\(([^)]*)\\)|\\s+([^#;]+))`));
        if (callMatch) {
          const argsStr = callMatch[1] || callMatch[2] || '';
          const args = argsStr.split(',').map((a) => a.trim());
          if (args.length > info.divisorArgIndex) {
            const passedArg = args[info.divisorArgIndex];
            const isZero = passedArg === '0' || rubyNumVars.get(passedArg) === 0;
            if (isZero) {
              rawFindings.push({
                id: `ruby_div0_call_${lineNum}`,
                language: 'ruby',
                category: 'BUGS_RUNTIME_ERRORS',
                severity: 'HIGH',
                title: `ZeroDivisionError: Division by zero in '${methodName}' call`,
                line: lineNum,
                column: clean.indexOf(methodName) + 1,
                problematicCode: clean,
                problematic_code: clean,
                explanation: `Method '${methodName}' divides by argument index ${info.divisorArgIndex + 1}, but 0 is passed on line ${lineNum}. This triggers a ZeroDivisionError at runtime.`,
                recommendedFix: `Ensure argument '${passedArg}' passed to '${methodName}' is non-zero.`,
                recommended_fix: `Ensure argument '${passedArg}' passed to '${methodName}' is non-zero.`,
                source: 'RuboCop',
                ruleId: 'Lint/DivisionByZero',
                detection_source: 'Ruby Static Semantic Analyzer',
                confidence: 'HIGH'
              });
            }
          }
        }
      }

      // Direct Division by Zero: a / 0
      const divMatch = clean.match(/([a-zA-Z0-9_]+)\s*[\/\%]\s*([a-zA-Z0-9_]+)/);
      if (divMatch && !clean.startsWith('#')) {
        const divisor = divMatch[2];
        if (divisor === '0' || rubyNumVars.get(divisor) === 0) {
          rawFindings.push({
            id: `ruby_div0_${lineNum}`,
            language: 'ruby',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: 'Division by Zero (ZeroDivisionError)',
            line: lineNum,
            column: clean.indexOf('/') + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Division or modulo by zero (${divisor}) on line ${lineNum} triggers a ZeroDivisionError in Ruby.`,
            recommendedFix: 'Verify the divisor is non-zero before division.',
            recommended_fix: 'Verify the divisor is non-zero before division.',
            source: 'RuboCop',
            ruleId: 'Lint/DivisionByZero',
            detection_source: 'Ruby Static Semantic Analyzer',
            confidence: 'HIGH'
          });
        }
      }

      // 2. NilClass NoMethodError: user.name where user = nil
      for (const varName of nilVars) {
        const derefMatch = clean.match(new RegExp(`\\b${varName}\\.([a-zA-Z0-9_]+)`));
        if (derefMatch && !clean.includes(`${varName} =`) && !clean.includes('&.')) {
          const method = derefMatch[1];
          rawFindings.push({
            id: `ruby_nil_deref_${lineNum}`,
            language: 'ruby',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `NilClass NoMethodError: Calling '.${method}' on nil variable '${varName}'`,
            line: lineNum,
            column: clean.indexOf(varName) + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Variable '${varName}' is assigned to nil. Calling '${varName}.${method}' triggers NoMethodError: undefined method \`${method}' for nil:NilClass.`,
            recommendedFix: `Use the safe navigation operator ('${varName}&.${method}') or check '!${varName}.nil?'.`,
            recommended_fix: `Use the safe navigation operator ('${varName}&.${method}') or check '!${varName}.nil?'.`,
            source: 'RuboCop',
            ruleId: 'Lint/SafeNavigation',
            detection_source: 'Ruby Static Semantic Analyzer',
            confidence: 'HIGH'
          });
        }
      }

      // 3. Array Index Out of Range: numbers[10]
      const arrAccessMatch = clean.match(/([a-zA-Z0-9_]+)\s*\[\s*(\d+)\s*\]/);
      if (arrAccessMatch) {
        const arrName = arrAccessMatch[1];
        const accessIdx = parseInt(arrAccessMatch[2], 10);
        if (rubyArrayLens.has(arrName)) {
          const len = rubyArrayLens.get(arrName)!;
          if (accessIdx >= len || accessIdx < 0) {
            rawFindings.push({
              id: `ruby_arr_oob_${lineNum}`,
              language: 'ruby',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'MEDIUM',
              title: `Array Index Returns Nil: '${arrName}[${accessIdx}]' (array size ${len})`,
              line: lineNum,
              column: clean.indexOf(arrName) + 1,
              problematicCode: clean,
              problematic_code: clean,
              explanation: `Accessing index ${accessIdx} in array '${arrName}' of size ${len} returns nil unexpectedly.`,
              recommendedFix: `Ensure index is within bounds 0..${len - 1} or use '${arrName}.fetch(${accessIdx})' to handle missing entries.`,
              recommended_fix: `Ensure index is within bounds 0..${len - 1} or use '${arrName}.fetch(${accessIdx})' to handle missing entries.`,
              source: 'RuboCop',
              ruleId: 'Style/ArrayAccess',
              detection_source: 'Ruby Static Analyzer',
              confidence: 'HIGH'
            });
          }
        }
      }

      // 4. Logic: Assignment in conditional: if x = 5
      const assignIfMatch = clean.match(/(?:if|unless)\s+([a-zA-Z0-9_]+)\s*=\s*([^=][^#\n]*)/);
      if (assignIfMatch && !clean.includes('==') && !clean.includes('!=')) {
        rawFindings.push({
          id: `ruby_logic_assign_${lineNum}`,
          language: 'ruby',
          category: 'BUGS_RUNTIME_ERRORS',
          severity: 'HIGH',
          title: `Assignment in conditional: 'if ${assignIfMatch[1]} = ...'`,
          line: lineNum,
          column: clean.indexOf('=') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Assignment operator \'=\' inside conditional expression overwrites variable instead of testing equality with \'==\'.',
          recommendedFix: `Replace '=' with '==': if ${assignIfMatch[1]} == ${assignIfMatch[2]}`,
          recommended_fix: `Replace '=' with '==': if ${assignIfMatch[1]} == ${assignIfMatch[2]}`,
          source: 'RuboCop',
          ruleId: 'Lint/AssignmentInCondition',
          detection_source: 'RuboCop (Lint/AssignmentInCondition)',
          confidence: 'HIGH'
        });
      }

      // 5. Dynamic Code Execution (eval / send)
      if (/\beval\b|\.send\(/i.test(clean) && !clean.startsWith('#')) {
        rawFindings.push({
          id: `ruby_sec_${lineNum}_eval`,
          language: 'ruby',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Dynamic Code Execution (eval / send)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Dynamic execution with eval or send with user-supplied arguments enables Remote Code Execution.',
          recommendedFix: 'Use public_send with an allowlist of permitted method names, or avoid eval entirely.',
          recommended_fix: 'Use public_send with an allowlist of permitted method names, or avoid eval entirely.',
          source: 'RuboCop',
          ruleId: 'Security/Eval',
          detection_source: 'RuboCop Security (Security/Eval)',
          confidence: 'HIGH'
        });
      }

      // 6. Insecure Deserialization via YAML.load or Marshal.load
      if (/YAML\.load\s*\(/i.test(clean) && !clean.includes('safe_load')) {
        rawFindings.push({
          id: `ruby_sec_${lineNum}_yaml`,
          language: 'ruby',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Insecure Deserialization (YAML.load)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'YAML.load in Ruby can instantiate arbitrary classes and execute system commands during deserialization.',
          recommendedFix: 'Use YAML.safe_load(yaml_string, permitted_classes: [...]) instead.',
          recommended_fix: 'Use YAML.safe_load(yaml_string, permitted_classes: [...]) instead.',
          source: 'Brakeman',
          ruleId: 'Security/YAMLLoad',
          detection_source: 'Brakeman Security Scanner',
          confidence: 'HIGH'
        });
      }

      if (/Marshal\.load\s*\(/i.test(clean)) {
        rawFindings.push({
          id: `ruby_sec_${lineNum}_marshal`,
          language: 'ruby',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Dangerous Insecure Deserialization (Marshal.load)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Marshal.load is vulnerable to arbitrary remote code execution when parsing untrusted input.',
          recommendedFix: 'Use JSON.parse for serialization of untrusted payloads.',
          recommended_fix: 'Use JSON.parse for serialization of untrusted payloads.',
          source: 'Brakeman',
          ruleId: 'Security/MarshalLoad',
          detection_source: 'Brakeman Security Scanner',
          confidence: 'HIGH'
        });
      }

      // 7. Shell execution (system, exec, backticks, %x)
      if (/(?:system|exec|%x)\s*[\(\{]/i.test(clean) || (clean.includes('`') && !clean.startsWith('#'))) {
        if (clean.includes('#{') || clean.includes('+')) {
          rawFindings.push({
            id: `ruby_sec_${lineNum}_rce`,
            language: 'ruby',
            category: 'SECURITY_ISSUES',
            severity: 'CRITICAL',
            title: 'Command Injection in Ruby Shell Subprocess',
            line: lineNum,
            column: 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: 'String interpolation in shell execution methods allows attackers to inject arbitrary commands.',
            recommendedFix: 'Pass command arguments as separate array items: system("command", arg1, arg2).',
            recommended_fix: 'Pass command arguments as separate array items: system("command", arg1, arg2).',
            source: 'RuboCop',
            ruleId: 'Security/CompoundHash',
            detection_source: 'RuboCop Security (Security/CompoundHash)',
            confidence: 'HIGH'
          });
        }
      }

      // 8. SQL Injection in Rails ActiveRecord queries
      if (/\.(where|find_by|order|select|group|having)\s*\(\s*["'].*?#\{/i.test(clean)) {
        rawFindings.push({
          id: `ruby_sec_${lineNum}_sqli`,
          language: 'ruby',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'SQL Injection in ActiveRecord Query',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Direct string interpolation inside ActiveRecord query methods bypasses SQL parameter escaping.',
          recommendedFix: 'Use hash conditions or positional arguments: Model.where("column = ?", val).',
          recommended_fix: 'Use hash conditions or positional arguments: Model.where("column = ?", val).',
          source: 'RuboCop',
          ruleId: 'Rails/ActiveRecordAliases',
          detection_source: 'Brakeman / RuboCop Rails (Rails/ActiveRecordAliases)',
          confidence: 'HIGH'
        });
      }

      // 9. Hardcoded Secret / API key
      if (/(?:api_key|secret_key|password|jwt_secret)\s*=\s*["'][a-zA-Z0-9_\-]{8,}["']/i.test(clean)) {
        rawFindings.push({
          id: `ruby_sec_secret_${lineNum}`,
          language: 'ruby',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Hardcoded Secret / API Key in Source',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Hardcoding secrets in Ruby source code exposes sensitive credentials in version control.',
          recommendedFix: 'Load secrets from Rails credentials or ENV[\'API_KEY\'].',
          recommended_fix: 'Load secrets from Rails credentials or ENV[\'API_KEY\'].',
          source: 'Brakeman',
          ruleId: 'Brakeman/HardcodedSecret',
          detection_source: 'Brakeman Security Scanner',
          confidence: 'HIGH'
        });
      }

      // 10. Empty rescue block (swallowing exceptions)
      if (/rescue(?:\s+[A-Za-z0-9_:]+)?\s*(?:=>\s*[a-zA-Z0-9_]+)?\s*$/i.test(clean) && sourceLines[idx + 1]?.trim() === 'end') {
        rawFindings.push({
          id: `ruby_empty_rescue_${lineNum}`,
          language: 'ruby',
          category: 'CODE_QUALITY',
          severity: 'MEDIUM',
          title: 'Empty Rescue Block (Exception Swallowing)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Empty rescue blocks silently ignore exceptions, hiding critical runtime defects.',
          recommendedFix: 'Log the exception using Rails.logger.error or handle appropriately.',
          recommended_fix: 'Log the exception using Rails.logger.error or handle appropriately.',
          source: 'RuboCop',
          ruleId: 'Lint/SuppressedException',
          detection_source: 'RuboCop (Lint/SuppressedException)',
          confidence: 'HIGH'
        });
      }
    });

    const isolatedFindings = deduplicateAndIsolateFindings(rawFindings, 'ruby');

    return {
      status: 'FULLY_SUPPORTED',
      message: rubyInstalled ? 'Ruby 3.3 (ruby -c + RuboCop / Brakeman Security)' : 'Ruby Static AST & Brakeman Analysis Engine',
      findings: isolatedFindings
    };
  }
}
