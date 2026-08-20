import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodeAnalyzer, StaticFinding, AnalysisOutput } from './CodeAnalyzer';
import { deduplicateAndIsolateFindings, isCompilerSummaryMessage } from './summaryFilter';

export class GoAnalyzer implements CodeAnalyzer {
  language = 'go' as const;

  async analyze(code: string): Promise<AnalysisOutput> {
    const rawFindings: StaticFinding[] = [];

    const goInstalled = await new Promise<boolean>((resolve) => {
      execFile('go', ['version'], (err) => resolve(!err));
    });

    const sourceLines = code.split('\n');

    if (goInstalled) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go_review_'));
      const filePath = path.join(tempDir, 'main.go');
      const goModPath = path.join(tempDir, 'go.mod');

      fs.writeFileSync(filePath, code, 'utf-8');
      fs.writeFileSync(goModPath, 'module reviewcode\n\ngo 1.22\n', 'utf-8');

      // 1. Run go build -o /dev/null .
      const buildStderr = await new Promise<string>((resolve) => {
        execFile('go', ['build', '-o', '/dev/null', '.'], { cwd: tempDir, timeout: 15000 }, (_err, stdout, stderr) => {
          resolve(`${stdout}\n${stderr}`);
        });
      });

      // 2. If build succeeds or has warnings, run go vet .
      let vetStderr = '';
      if (!buildStderr.includes('syntax error') && !buildStderr.includes('undefined:')) {
        vetStderr = await new Promise<string>((resolve) => {
          execFile('go', ['vet', '.'], { cwd: tempDir, timeout: 15000 }, (_err, stdout, stderr) => {
            resolve(`${stdout}\n${stderr}`);
          });
        });
      }

      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }

      const lines = `${buildStderr}\n${vetStderr}`.split('\n');

      lines.forEach((diagLine, idx) => {
        const trimmed = diagLine.trim();
        if (!trimmed || isCompilerSummaryMessage(trimmed)) return;

        // Format: ./main.go:6:15: undefined: undefinedVar
        const match = trimmed.match(/(?:\.\/)?(?:main\.go|snippet\.go):(\d+)(?::(\d+))?:\s*(.+)/i);
        if (match) {
          const lineNum = Math.max(1, parseInt(match[1], 10));
          const colNum = match[2] ? Math.max(1, parseInt(match[2], 10)) : 1;
          let message = match[3].trim();

          if (!message || isCompilerSummaryMessage(message)) return;

          const isSyntax = message.toLowerCase().includes('syntax error') || message.toLowerCase().includes('expected');
          const isUndefined = message.toLowerCase().includes('undefined');

          let category: StaticFinding['category'] = isSyntax ? 'SYNTAX_ERRORS' : 'BUGS_RUNTIME_ERRORS';
          const probCode = sourceLines[lineNum - 1]?.trim() || trimmed;

          rawFindings.push({
            id: `go_diag_${lineNum}_${colNum}_${idx}`,
            language: 'go',
            category,
            severity: 'HIGH',
            title: `Go Diagnostic: ${message.split('\n')[0]}`,
            line: lineNum,
            column: colNum,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: `Go compiler reported: ${message}`,
            recommendedFix: isUndefined
              ? 'Declare and initialize the variable/type before referencing it.'
              : 'Fix the Go code structure to satisfy compiler rules.',
            recommended_fix: isUndefined
              ? 'Declare and initialize the variable/type before referencing it.'
              : 'Fix the Go code structure to satisfy compiler rules.',
            source: 'Go Compiler',
            ruleId: isSyntax ? 'go/syntax' : (isUndefined ? 'go/undefined' : 'go/typecheck'),
            detection_source: 'Go Compiler (go build)',
            confidence: 'HIGH'
          });
        }
      });
    }

    // 3. Static Multi-Pass Semantic Analysis for Go
    const arrayLens = new Map<string, number>();
    const varValues = new Map<string, number>();
    const funcDivisors = new Map<string, { divisorArgIndex: number; line: number }>();
    const nilPointerVars = new Set<string>();
    const goDeclaredVars = new Set<string>(['fmt', 'os', 'log', 'errors', 'strings', 'strconv', 'time', 'sync', 'context', 'http', 'json', 'io', 'math', 'true', 'false', 'nil', 'iota', 'string', 'int', 'int64', 'int32', 'byte', 'rune', 'float64', 'float32', 'bool', 'error', 'make', 'len', 'cap', 'append', 'new', 'delete', 'panic', 'recover', 'close']);
    const goDeclaredFuncs = new Map<string, { line: number; paramCount: number }>();
    const goFuncCalls: { name: string; line: number; argCount: number }[] = [];

    // Pass 1: Gather function signatures, variables, slices, pointers
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('/*') || clean.startsWith('*')) return;

      // Track variable declarations: x := 10, var x int = 5, var x = "abc"
      const shortVarMatch = clean.match(/([a-zA-Z0-9_]+)\s*:=\s*(.+)/);
      if (shortVarMatch && !clean.startsWith('if ') && !clean.startsWith('for ')) {
        const vName = shortVarMatch[1];
        goDeclaredVars.add(vName);
        const valNum = parseInt(shortVarMatch[2].trim(), 10);
        if (!isNaN(valNum)) varValues.set(vName, valNum);
      }

      const varMatch = clean.match(/var\s+([a-zA-Z0-9_]+)(?:\s+[a-zA-Z0-9_\[\]*]+)?(?:\s*=\s*(.+))?/);
      if (varMatch) {
        const vName = varMatch[1];
        goDeclaredVars.add(vName);
        if (varMatch[2]) {
          const valNum = parseInt(varMatch[2].trim(), 10);
          if (!isNaN(valNum)) varValues.set(vName, valNum);
        }
      }

      // Detect function that divides by an argument:
      const funcMatch = clean.match(/func\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const paramsStr = funcMatch[2].trim();
        const params = paramsStr ? paramsStr.split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean) : [];
        goDeclaredFuncs.set(funcName, { line: lineNum, paramCount: params.length });
        params.forEach(p => goDeclaredVars.add(p));

        for (let j = idx; j < Math.min(sourceLines.length, idx + 15); j++) {
          const bodyLine = sourceLines[j];
          for (let pIdx = 0; pIdx < params.length; pIdx++) {
            const paramName = params[pIdx];
            const divRegex = new RegExp(`[\\/\\%]\\s*${paramName}\\b`);
            if (divRegex.test(bodyLine)) {
              funcDivisors.set(funcName, { divisorArgIndex: pIdx, line: lineNum });
              break;
            }
          }
          if (bodyLine.includes('}')) break;
        }
      }

      // Track slice / array declarations:
      const sliceLitMatch = clean.match(/([a-zA-Z0-9_]+)\s*:?=\s*(?:\[\d*\]|\[\.\.\.\])\s*[a-zA-Z0-9_]+\s*\{([^}]*)\}/);
      if (sliceLitMatch) {
        const arrName = sliceLitMatch[1];
        const elements = sliceLitMatch[2].split(',').map((e) => e.trim()).filter(Boolean);
        arrayLens.set(arrName, elements.length);
        goDeclaredVars.add(arrName);
      }

      const makeMatch = clean.match(/([a-zA-Z0-9_]+)\s*:?=\s*make\(\s*(?:\[\][a-zA-Z0-9_]+)\s*,\s*(\d+)\s*\)/);
      if (makeMatch) {
        arrayLens.set(makeMatch[1], parseInt(makeMatch[2], 10));
        goDeclaredVars.add(makeMatch[1]);
      }

      const arrDeclMatch = clean.match(/var\s+([a-zA-Z0-9_]+)\s+\[(\d+)\]\s*[a-zA-Z0-9_]+/);
      if (arrDeclMatch) {
        arrayLens.set(arrDeclMatch[1], parseInt(arrDeclMatch[2], 10));
        goDeclaredVars.add(arrDeclMatch[1]);
      }

      // Track uninitialized pointer: var ptr *int or var user *User
      const nilPtrMatch = clean.match(/var\s+([a-zA-Z0-9_]+)\s+\*[a-zA-Z0-9_]+/);
      if (nilPtrMatch && !clean.includes('=')) {
        nilPointerVars.add(nilPtrMatch[1]);
        goDeclaredVars.add(nilPtrMatch[1]);
      }

      // Track function calls:
      const callMatches = [...clean.matchAll(/([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g)];
      for (const cm of callMatches) {
        if (!['if', 'for', 'switch', 'select', 'return', 'make', 'len', 'cap', 'append', 'new', 'delete', 'panic', 'recover', 'close'].includes(cm[1])) {
          const args = cm[2].trim() ? cm[2].split(',').filter(Boolean) : [];
          goFuncCalls.push({ name: cm[1], line: lineNum, argCount: args.length });
        }
      }
    });

    // Pass 2: Syntax, Semantic, Runtime, Security, Logic & Quality Analysis
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('/*') || clean.startsWith('*')) return;

      // 1. Missing package clause
      if (idx === 0 && !clean.startsWith('package ') && !code.includes('package ')) {
        rawFindings.push({
          id: `go_syn_pkg_${lineNum}`,
          language: 'go',
          category: 'SYNTAX_ERRORS',
          severity: 'HIGH',
          title: 'Syntax Error: Missing \'package\' declaration',
          line: 1,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Every Go source file must begin with a package clause (e.g. \'package main\').',
          recommendedFix: 'Add \'package main\' at line 1 of the file.',
          recommended_fix: 'Add \'package main\' at line 1 of the file.',
          source: 'Go Compiler',
          ruleId: 'go/syntax-package',
          detection_source: 'Go Syntax Validator',
          confidence: 'HIGH'
        });
      }

      // 2. Undeclared Identifier / Variable (undefined: ident)
      const varUsageMatches = [...clean.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)];
      for (const vu of varUsageMatches) {
        const ident = vu[1];
        const goKeywords = ['package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface', 'map', 'chan', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'goto', 'fallthrough', 'defer', 'go', 'select', 'true', 'false', 'nil', 'iota', 'string', 'int', 'int64', 'int32', 'int16', 'int8', 'uint', 'uint64', 'uint32', 'uint16', 'uint8', 'uintptr', 'byte', 'rune', 'float64', 'float32', 'complex128', 'complex64', 'bool', 'error', 'make', 'len', 'cap', 'append', 'new', 'delete', 'panic', 'recover', 'close', 'fmt', 'os', 'log', 'errors', 'strings', 'strconv', 'time', 'sync', 'context', 'http', 'json', 'io', 'math', 'main'];
        if (
          !goKeywords.includes(ident) &&
          !goDeclaredVars.has(ident) &&
          !goDeclaredFuncs.has(ident) &&
          !clean.includes(`func ${ident}`) &&
          !clean.includes(`type ${ident}`) &&
          !clean.includes(`${ident} :=`) &&
          !clean.includes(`var ${ident}`) &&
          (clean.includes(`= ${ident}`) || clean.includes(`(${ident}`) || clean.includes(`, ${ident}`) || clean.includes(`${ident}.`))
        ) {
          rawFindings.push({
            id: `go_undef_var_${lineNum}_${ident}`,
            language: 'go',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `undefined: ${ident} (Go Compiler Error)`,
            line: lineNum,
            column: vu.index ? vu.index + 1 : 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Identifier '${ident}' is used without prior declaration in this package or imported scope.`,
            recommendedFix: `Declare variable '${ident}' (e.g. ${ident} := ...) before using it.`,
            recommended_fix: `Declare variable '${ident}' (e.g. ${ident} := ...) before using it.`,
            source: 'Go Compiler',
            ruleId: 'go/undefined-identifier',
            detection_source: 'Go Semantic Analyzer (go build)',
            confidence: 'HIGH'
          });
        }
      }

      // 3. Division by Zero: Call site passing 0 to function that divides by that arg
      for (const [fnName, info] of funcDivisors.entries()) {
        const callRegex = new RegExp(`\\b${fnName}\\s*\\(([^)]*)\\)`);
        const callMatch = clean.match(callRegex);
        if (callMatch) {
          const args = callMatch[1].split(',').map((a) => a.trim());
          if (args.length > info.divisorArgIndex) {
            const passedArg = args[info.divisorArgIndex];
            const isZero = passedArg === '0' || varValues.get(passedArg) === 0;
            if (isZero) {
              rawFindings.push({
                id: `go_ast_${lineNum}_div0_call`,
                language: 'go',
                category: 'BUGS_RUNTIME_ERRORS',
                severity: 'HIGH',
                title: `Division by Zero in Call to '${fnName}' (panic: runtime error: integer divide by zero)`,
                line: lineNum,
                column: clean.indexOf(fnName) + 1,
                problematicCode: clean,
                problematic_code: clean,
                explanation: `Function '${fnName}' divides by argument index ${info.divisorArgIndex + 1}, but is passed 0 on line ${lineNum}. This triggers a runtime panic in Go.`,
                recommendedFix: `Ensure argument '${passedArg}' passed to '${fnName}' is non-zero.`,
                recommended_fix: `Ensure argument '${passedArg}' passed to '${fnName}' is non-zero.`,
                source: 'Go Static Analyzer',
                ruleId: 'go/div-by-zero',
                detection_source: 'Go Static Analysis Engine',
                confidence: 'HIGH'
              });
            }
          }
        }
      }

      // Direct division by zero: a / 0 or a % 0
      const directDivMatch = clean.match(/([a-zA-Z0-9_]+)\s*[\/\%]\s*([a-zA-Z0-9_]+)/);
      if (directDivMatch && !clean.startsWith('//') && !clean.startsWith('/*')) {
        const divisor = directDivMatch[2];
        if (divisor === '0' || varValues.get(divisor) === 0) {
          rawFindings.push({
            id: `go_ast_${lineNum}_div0_direct`,
            language: 'go',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: 'Division by Zero (panic: runtime error: integer divide by zero)',
            line: lineNum,
            column: clean.indexOf('/') + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Division or modulo by zero (${divisor}) on line ${lineNum} triggers a runtime panic in Go.`,
            recommendedFix: 'Validate that the divisor is non-zero before dividing.',
            recommended_fix: 'Validate that the divisor is non-zero before dividing.',
            source: 'Go Static Analyzer',
            ruleId: 'go/div-by-zero',
            detection_source: 'Go Static Analysis Engine',
            confidence: 'HIGH'
          });
        }
      }

      // 4. Index Out of Range: e.g. values[5]
      const indexMatch = clean.match(/([a-zA-Z0-9_]+)\s*\[\s*(\d+)\s*\]/);
      if (indexMatch && !clean.startsWith('var ') && !clean.startsWith('type ')) {
        const arrName = indexMatch[1];
        const accessIdx = parseInt(indexMatch[2], 10);
        if (arrayLens.has(arrName)) {
          const len = arrayLens.get(arrName)!;
          if (accessIdx >= len || accessIdx < 0) {
            rawFindings.push({
              id: `go_ast_${lineNum}_idx_oob`,
              language: 'go',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: `Index Out of Range: '${arrName}[${accessIdx}]' (panic: runtime error: index out of range [${accessIdx}] with length ${len})`,
              line: lineNum,
              column: clean.indexOf(arrName) + 1,
              problematicCode: clean,
              problematic_code: clean,
              explanation: `Accessing index ${accessIdx} on collection '${arrName}' of length ${len} triggers an index-out-of-range runtime panic in Go.`,
              recommendedFix: `Ensure index is within bounds (0 to ${Math.max(0, len - 1)}).`,
              recommended_fix: `Ensure index is within bounds (0 to ${Math.max(0, len - 1)}).`,
              source: 'Go Static Analyzer',
              ruleId: 'go/index-out-of-bounds',
              detection_source: 'Go Static Analysis Engine',
              confidence: 'HIGH'
            });
          }
        }
      }

      // 5. Nil pointer dereference: *ptr or ptr.Field
      for (const ptr of nilPointerVars) {
        if ((new RegExp(`\\*${ptr}\\b`).test(clean) || new RegExp(`\\b${ptr}\\.[a-zA-Z0-9_]+`).test(clean)) && !clean.startsWith('var ')) {
          rawFindings.push({
            id: `go_ast_${lineNum}_nil_deref`,
            language: 'go',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `Nil Pointer Dereference: '${ptr}' is uninitialized nil pointer`,
            line: lineNum,
            column: clean.indexOf(ptr) + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Dereferencing uninitialized nil pointer '${ptr}' causes a runtime panic (panic: runtime error: invalid memory address or nil pointer dereference).`,
            recommendedFix: `Initialize '${ptr}' with new() or allocate a struct instance before dereferencing.`,
            recommended_fix: `Initialize '${ptr}' with new() or allocate a struct instance before dereferencing.`,
            source: 'Go Static Analyzer',
            ruleId: 'go/nil-pointer-deref',
            detection_source: 'Go Static Analysis Engine',
            confidence: 'HIGH'
          });
        }
      }

      // 6. Unchecked Error return (e.g. f, _ := os.Open(...) or result, _ := ...)
      if (/[a-zA-Z0-9_]+\s*,\s*_\s*:?=\s*(?:os\.Open|os\.Create|http\.Get|json\.Unmarshal|strconv\.Atoi|db\.Query)/i.test(clean)) {
        rawFindings.push({
          id: `go_err_ignored_${lineNum}`,
          language: 'go',
          category: 'CODE_QUALITY',
          severity: 'MEDIUM',
          title: 'Ignored Error Return Value (Errcheck)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Blank identifier \'_\' is used to discard an error return value, preventing error recovery.',
          recommendedFix: 'Capture the error (e.g. err) and check \'if err != nil { return err }\'.',
          recommended_fix: 'Capture the error (e.g. err) and check \'if err != nil { return err }\'.',
          source: 'errcheck',
          ruleId: 'go/errcheck',
          detection_source: 'Go Error Handling Linter (errcheck)',
          confidence: 'HIGH'
        });
      }

      // 7. SQL Injection in database/sql
      if (/(?:db\.Query|db\.Exec|db\.QueryRow)\s*\(\s*(?:fmt\.Sprintf|["'].*?\+)/i.test(clean)) {
        rawFindings.push({
          id: `go_sec_${lineNum}_sqli`,
          language: 'go',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'SQL Injection in database/sql query',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Concatenating strings or formatting SQL queries with fmt.Sprintf opens the database to SQL Injection attacks.',
          recommendedFix: 'Use parameterized queries with placeholder arguments: db.Query("SELECT ... WHERE id = ?", id).',
          recommended_fix: 'Use parameterized queries with placeholder arguments: db.Query("SELECT ... WHERE id = ?", id).',
          source: 'gosec',
          ruleId: 'G201',
          detection_source: 'gosec Security Scanner (G201)',
          confidence: 'HIGH'
        });
      }

      // 8. Security: exec.Command with formatted string
      if (clean.includes('exec.Command') && (clean.includes('fmt.Sprintf') || clean.includes('+'))) {
        rawFindings.push({
          id: `go_sec_${lineNum}_rce`,
          language: 'go',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Command Injection in os/exec',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Concatenating untrusted inputs into exec.Command can lead to Command Injection.',
          recommendedFix: 'Pass command arguments as separate discrete string arguments to exec.Command().',
          recommended_fix: 'Pass command arguments as separate discrete string arguments to exec.Command().',
          source: 'gosec',
          ruleId: 'G204',
          detection_source: 'gosec (G204)',
          confidence: 'HIGH'
        });
      }

      // 9. Security: Hardcoded token / secret
      if (/(?:api_key|secret_key|password|jwt_secret)\s*:?=\s*["'][a-zA-Z0-9_\-]{8,}["']/i.test(clean)) {
        rawFindings.push({
          id: `go_sec_${lineNum}_secret`,
          language: 'go',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Hardcoded Secret / Token in Source',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Hardcoding secrets in Go source files exposes credentials in version control.',
          recommendedFix: 'Load secrets from environment variables (os.Getenv) or a secrets manager.',
          recommended_fix: 'Load secrets from environment variables (os.Getenv) or a secrets manager.',
          source: 'gosec',
          ruleId: 'G101',
          detection_source: 'gosec (G101)',
          confidence: 'HIGH'
        });
      }

      // 10. Weak Cryptography: md5.New() or sha1.New()
      if (/md5\.New\(\)|sha1\.New\(\)/.test(clean)) {
        rawFindings.push({
          id: `go_sec_crypto_${lineNum}`,
          language: 'go',
          category: 'SECURITY_ISSUES',
          severity: 'HIGH',
          title: 'Weak Cryptographic Hash (MD5 / SHA1)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Use of weak cryptographic primitives (crypto/md5 or crypto/sha1) is vulnerable to collision attacks.',
          recommendedFix: 'Use crypto/sha256 or crypto/sha512 instead.',
          recommended_fix: 'Use crypto/sha256 or crypto/sha512 instead.',
          source: 'gosec',
          ruleId: 'G401',
          detection_source: 'gosec (G401)',
          confidence: 'HIGH'
        });
      }
    });

    const isolatedFindings = deduplicateAndIsolateFindings(rawFindings, 'go');

    return {
      status: 'FULLY_SUPPORTED',
      message: goInstalled ? 'Go 1.22 (go build + go vet + gosec)' : 'Go Static AST & Semantic Analysis Engine',
      findings: isolatedFindings
    };
  }
}
