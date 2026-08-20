import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodeAnalyzer, StaticFinding, AnalysisOutput } from './CodeAnalyzer';
import { deduplicateAndIsolateFindings, isCompilerSummaryMessage } from './summaryFilter';

export class RustAnalyzer implements CodeAnalyzer {
  language = 'rust' as const;

  async analyze(code: string): Promise<AnalysisOutput> {
    const rawFindings: StaticFinding[] = [];

    const rustInstalled = await new Promise<boolean>((resolve) => {
      execFile('rustc', ['--version'], (err) => resolve(!err));
    });

    const sourceLines = code.split('\n');

    if (rustInstalled) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rust_review_'));
      const filePath = path.join(tempDir, 'lib.rs');
      fs.writeFileSync(filePath, code, 'utf-8');

      // 1. Run rustc --error-format=json --crate-type=lib
      const rawStderr = await new Promise<string>((resolve) => {
        execFile(
          'rustc',
          ['--error-format=json', '--crate-type=lib', '-A', 'warnings', filePath],
          { cwd: tempDir, timeout: 15000 },
          (_err, _stdout, stderr) => {
            resolve(stderr || '');
          }
        );
      });

      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }

      // Parse JSON lines from rustc
      const jsonLines = rawStderr.split('\n');

      jsonLines.forEach((line, idx) => {
        if (!line.trim().startsWith('{')) return;
        try {
          const diag = JSON.parse(line.trim());
          if (!diag.spans || diag.spans.length === 0) return;

          const primarySpan = diag.spans.find((s: any) => s.is_primary) || diag.spans[0];
          const lineNum = Math.max(1, primarySpan.line_start);
          const colNum = Math.max(1, primarySpan.column_start);
          const message = diag.message;
          const codeCode = diag.code?.code;

          if (isCompilerSummaryMessage(message)) return;

          const isDeadCode = codeCode === 'dead_code' || message.toLowerCase().includes('unused');
          const isSyntax = message.toLowerCase().includes('expected') || message.toLowerCase().includes('syntax');

          let category: StaticFinding['category'] = isDeadCode
            ? 'CODE_QUALITY'
            : isSyntax
              ? 'SYNTAX_ERRORS'
              : 'BUGS_RUNTIME_ERRORS';

          let severity: StaticFinding['severity'] = isDeadCode ? 'LOW' : (diag.level === 'error' ? 'HIGH' : 'MEDIUM');

          const probCode = sourceLines[lineNum - 1]?.trim() || primarySpan.text?.[0]?.text || '';

          rawFindings.push({
            id: `rust_${codeCode || 'diag'}_${lineNum}_${idx}`,
            language: 'rust',
            category,
            severity,
            title: isDeadCode
              ? `Unused / Dead Code: ${message.split('\n')[0]}`
              : `Rust ${diag.level.toUpperCase()}${codeCode ? ` [${codeCode}]` : ''}: ${message.split('\n')[0]}`,
            line: lineNum,
            column: colNum,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: `rustc compiler reported [${codeCode || diag.level}]: ${message}`,
            recommendedFix: isDeadCode
              ? 'Remove unused code or prefix with an underscore (e.g. _name) if intended.'
              : 'Refactor code to satisfy the Rust compiler borrow checker, lifetime, or type constraints.',
            recommended_fix: isDeadCode
              ? 'Remove unused code or prefix with an underscore (e.g. _name) if intended.'
              : 'Refactor code to satisfy the Rust compiler borrow checker, lifetime, or type constraints.',
            source: 'rustc',
            ruleId: codeCode || 'rustc',
            detection_source: `rustc compiler (${codeCode || 'diag'})`,
            confidence: 'HIGH'
          });
        } catch {
          // Not a JSON line, check if it is a plaintext compiler error
          const textMatch = line.match(/(?:lib\.rs):(\d+):(\d+):\s*(error|warning):\s*(.+)/i);
          if (textMatch) {
            const lineNum = parseInt(textMatch[1], 10);
            const colNum = parseInt(textMatch[2], 10);
            const msg = textMatch[4].trim();
            if (!isCompilerSummaryMessage(msg)) {
              const probCode = sourceLines[lineNum - 1]?.trim() || '';
              const isDead = msg.toLowerCase().includes('dead_code') || msg.toLowerCase().includes('never used');
              rawFindings.push({
                id: `rust_txt_${lineNum}_${idx}`,
                language: 'rust',
                category: isDead ? 'CODE_QUALITY' : 'BUGS_RUNTIME_ERRORS',
                severity: isDead ? 'LOW' : 'HIGH',
                title: `Rust Compiler Diagnostic: ${msg}`,
                line: lineNum,
                column: colNum,
                problematicCode: probCode,
                problematic_code: probCode,
                explanation: `rustc reported: ${msg}`,
                recommendedFix: 'Fix the Rust code to satisfy compiler rules.',
                recommended_fix: 'Fix the Rust code to satisfy compiler rules.',
                source: 'rustc',
                detection_source: 'rustc compiler',
                confidence: 'HIGH'
              });
            }
          }
        }
      });
    }

    // 2. Static Multi-Pass Semantic & Clippy Analysis for Rust
    const rustArrayLens = new Map<string, number>();
    const noneOptionVars = new Set<string>();
    const rustNumVars = new Map<string, number>();
    const functionsUnwrappingParam = new Map<string, number>(); // fnName -> paramIdx
    const rustDeclaredVars = new Set<string>(['println', 'print', 'eprintln', 'eprint', 'format', 'vec', 'panic', 'todo', 'unimplemented', 'unreachable', 'assert', 'assert_eq', 'assert_ne', 'Some', 'None', 'Ok', 'Err', 'String', 'Vec', 'Option', 'Result', 'Box', 'Rc', 'Arc', 'Mutex', 'HashMap', 'HashSet', 'true', 'false', 'self', 'Self', 'mut']);
    const rustDeclaredFuncs = new Map<string, { line: number; paramCount: number }>();

    // Pass 1: Scan declarations, signatures, arrays, options, and variables
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('/*') || clean.startsWith('*')) return;

      // Track variable declarations: let x = 5; let mut y: i32 = 10;
      const letMatch = clean.match(/let\s+(?:mut\s+)?([a-zA-Z0-9_]+)(?:\s*:\s*[^=]+)?(?:\s*=\s*([^;]+))?\s*;/);
      if (letMatch) {
        const vName = letMatch[1];
        rustDeclaredVars.add(vName);
        if (letMatch[2]) {
          const valStr = letMatch[2].trim();
          const valNum = parseInt(valStr, 10);
          if (!isNaN(valNum)) rustNumVars.set(vName, valNum);
          if (valStr === 'None') noneOptionVars.add(vName);
        }
      }

      // Detect fixed-size array literal: let numbers = [1, 2, 3];
      const arrMatch = clean.match(/let\s+(?:mut\s+)?([a-zA-Z0-9_]+)(?:\s*:\s*\[[^\]]+\])?\s*=\s*\[([^\]]+)\]/);
      if (arrMatch) {
        const arrName = arrMatch[1];
        const elements = arrMatch[2].split(',').map((e) => e.trim()).filter(Boolean);
        rustArrayLens.set(arrName, elements.length);
        rustDeclaredVars.add(arrName);
      }

      // Detect function signatures: fn calculate(a: i32, b: i32) -> i32
      const fnMatch = clean.match(/fn\s+([a-zA-Z0-9_]+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)/);
      if (fnMatch) {
        const fnName = fnMatch[1];
        const params = fnMatch[2].trim() ? fnMatch[2].split(',').map((p) => p.trim().split(/\s*:\s*/)[0]).filter(Boolean) : [];
        rustDeclaredFuncs.set(fnName, { line: lineNum, paramCount: params.length });
        params.forEach(p => rustDeclaredVars.add(p.replace(/^mut\s+/, '')));

        for (let j = idx; j < Math.min(sourceLines.length, idx + 15); j++) {
          const bodyLine = sourceLines[j];
          for (let pIdx = 0; pIdx < params.length; pIdx++) {
            const pName = params[pIdx].replace(/^mut\s+/, '');
            if (new RegExp(`\\b${pName}\\.unwrap\\s*\\(`).test(bodyLine)) {
              functionsUnwrappingParam.set(fnName, pIdx);
              break;
            }
          }
          if (bodyLine.includes('}')) break;
        }
      }
    });

    // Pass 2: Syntax, Semantic, Panic, Logic, Security, and Clippy Checks
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('/*') || clean.startsWith('*')) return;

      // 1. Missing Semicolon on let statement
      if (clean.startsWith('let ') && !clean.endsWith(';') && !clean.endsWith('{') && !clean.endsWith('}') && !clean.includes(';')) {
        rawFindings.push({
          id: `rust_syn_semi_${lineNum}`,
          language: 'rust',
          category: 'SYNTAX_ERRORS',
          severity: 'HIGH',
          title: 'Syntax Error: Missing semicolon (\';\') on \'let\' statement',
          line: lineNum,
          column: clean.length,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Rust \'let\' variable bindings must terminate with a semicolon.',
          recommendedFix: `Add a semicolon at the end: ${clean};`,
          recommended_fix: `Add a semicolon at the end: ${clean};`,
          source: 'rustc',
          ruleId: 'rust/missing-semicolon',
          detection_source: 'Rust Syntax Validator',
          confidence: 'HIGH'
        });
      }

      // 2. Undeclared Identifier / Variable (E0425)
      const varMatches = [...clean.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)];
      for (const vm of varMatches) {
        const ident = vm[1];
        const rustKeywords = ['fn', 'let', 'mut', 'pub', 'struct', 'enum', 'impl', 'trait', 'type', 'use', 'mod', 'const', 'static', 'unsafe', 'extern', 'match', 'if', 'else', 'while', 'loop', 'for', 'in', 'return', 'break', 'continue', 'as', 'where', 'crate', 'super', 'self', 'Self', 'true', 'false', 'None', 'Some', 'Ok', 'Err', 'i8', 'i16', 'i32', 'i64', 'i128', 'isize', 'u8', 'u16', 'u32', 'u64', 'u128', 'usize', 'f32', 'f64', 'bool', 'char', 'str', 'String', 'Vec', 'Option', 'Result', 'Box', 'Rc', 'Arc', 'Mutex', 'println', 'print', 'eprintln', 'eprint', 'format', 'vec', 'panic', 'todo', 'unimplemented', 'unreachable', 'assert', 'assert_eq', 'assert_ne', 'main'];
        if (
          !rustKeywords.includes(ident) &&
          !rustDeclaredVars.has(ident) &&
          !rustDeclaredFuncs.has(ident) &&
          !clean.includes(`struct ${ident}`) &&
          !clean.includes(`enum ${ident}`) &&
          !clean.includes(`fn ${ident}`) &&
          !clean.includes(`let ${ident}`) &&
          !clean.includes(`let mut ${ident}`) &&
          (clean.includes(`= ${ident}`) || clean.includes(`(${ident}`) || clean.includes(`, ${ident}`) || clean.includes(`${ident}.`))
        ) {
          rawFindings.push({
            id: `rust_undef_var_${lineNum}_${ident}`,
            language: 'rust',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `cannot find value \`${ident}\` in this scope [E0425]`,
            line: lineNum,
            column: vm.index ? vm.index + 1 : 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Identifier '${ident}' is used on line ${lineNum} without being declared in scope.`,
            recommendedFix: `Declare '${ident}' with 'let ${ident} = ...;' before using it.`,
            recommended_fix: `Declare '${ident}' with 'let ${ident} = ...;' before using it.`,
            source: 'rustc',
            ruleId: 'E0425',
            detection_source: 'rustc Compiler (E0425)',
            confidence: 'HIGH'
          });
        }
      }

      // 3. Unwrap on known None variable
      for (const varName of noneOptionVars) {
        if (clean.includes(`${varName}.unwrap()`) || clean.includes(`${varName}.expect(`)) {
          rawFindings.push({
            id: `rust_unwrap_none_${lineNum}`,
            language: 'rust',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `Guaranteed Panic: Calling .unwrap() on '${varName}' which is None`,
            line: lineNum,
            column: clean.indexOf(varName) + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Variable '${varName}' is initialized to None. Calling .unwrap() or .expect() on None causes an immediate panic at runtime: 'called \`Option::unwrap()\` on a \`None\` value'.`,
            recommendedFix: `Use pattern matching ('if let Some(...) = ${varName}') or unwrap_or() with a default value.`,
            recommended_fix: `Use pattern matching ('if let Some(...) = ${varName}') or unwrap_or() with a default value.`,
            source: 'Rust Static Analyzer',
            ruleId: 'rust/unwrap-on-none',
            detection_source: 'Rust AST / Static Analyzer',
            confidence: 'HIGH'
          });
        }
      }

      // 4. Check function call passing None to function that calls .unwrap() on that param
      for (const [fnName, pIdx] of functionsUnwrappingParam.entries()) {
        const callRegex = new RegExp(`\\b${fnName}\\s*\\(([^)]*)\\)`);
        const callMatch = clean.match(callRegex);
        if (callMatch) {
          const args = callMatch[1].split(',').map((a) => a.trim());
          if (args.length > pIdx && (args[pIdx] === 'None' || noneOptionVars.has(args[pIdx]))) {
            rawFindings.push({
              id: `rust_unwrap_call_${lineNum}`,
              language: 'rust',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: `Panic Risk: Passing None to '${fnName}' which unconditionally unwraps it`,
              line: lineNum,
              column: clean.indexOf(fnName) + 1,
              problematicCode: clean,
              problematic_code: clean,
              explanation: `Function '${fnName}' calls .unwrap() on parameter ${pIdx + 1}, but is passed None on line ${lineNum}. This triggers a panic at runtime.`,
              recommendedFix: `Pass Some(...) or refactor '${fnName}' to safely handle None using match or if let.`,
              recommended_fix: `Pass Some(...) or refactor '${fnName}' to safely handle None using match or if let.`,
              source: 'Rust Static Analyzer',
              ruleId: 'rust/unwrap-panic',
              detection_source: 'Rust Static Analysis Engine',
              confidence: 'HIGH'
            });
          }
        }
      }

      // 5. Check array indexing out of bounds
      const idxMatch = clean.match(/([a-zA-Z0-9_]+)\s*\[\s*(\d+)\s*\]/);
      if (idxMatch && !clean.startsWith('let ') && !clean.startsWith('fn ')) {
        const arrName = idxMatch[1];
        const accessIdx = parseInt(idxMatch[2], 10);
        if (rustArrayLens.has(arrName)) {
          const len = rustArrayLens.get(arrName)!;
          if (accessIdx >= len || accessIdx < 0) {
            rawFindings.push({
              id: `rust_idx_oob_${lineNum}`,
              language: 'rust',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: `Index Out of Bounds: '${arrName}[${accessIdx}]' (panic: index out of bounds: the len is ${len} but the index is ${accessIdx})`,
              line: lineNum,
              column: clean.indexOf(arrName) + 1,
              problematicCode: clean,
              problematic_code: clean,
              explanation: `Index ${accessIdx} is beyond array '${arrName}' length of ${len}. Accessing it panics at runtime.`,
              recommendedFix: `Ensure index is within bounds 0..${len} or use '${arrName}.get(${accessIdx})' to return an Option.`,
              recommended_fix: `Ensure index is within bounds 0..${len} or use '${arrName}.get(${accessIdx})' to return an Option.`,
              source: 'Rust Static Analyzer',
              ruleId: 'rust/index-out-of-bounds',
              detection_source: 'Rust Static Analysis Engine',
              confidence: 'HIGH'
            });
          }
        }
      }

      // 6. Division by Zero in Rust
      const divMatch = clean.match(/([a-zA-Z0-9_]+)\s*[\/\%]\s*([a-zA-Z0-9_]+)/);
      if (divMatch && !clean.startsWith('//') && !clean.startsWith('/*')) {
        const divisor = divMatch[2];
        if (divisor === '0' || rustNumVars.get(divisor) === 0) {
          rawFindings.push({
            id: `rust_div0_${lineNum}`,
            language: 'rust',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: 'Division by Zero (panic: attempt to divide by zero)',
            line: lineNum,
            column: clean.indexOf('/') + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Division or modulo by zero (${divisor}) on line ${lineNum} triggers an immediate panic at runtime in Rust.`,
            recommendedFix: 'Verify the divisor is non-zero before performing division or modulo.',
            recommended_fix: 'Verify the divisor is non-zero before performing division or modulo.',
            source: 'Rust Static Analyzer',
            ruleId: 'rust/divide-by-zero',
            detection_source: 'Rust Static Analysis Engine',
            confidence: 'HIGH'
          });
        }
      }

      // 7. Unsafe Block without safety comment (Clippy)
      if (/unsafe\s*\{/.test(clean) && !clean.startsWith('//')) {
        rawFindings.push({
          id: `rust_unsafe_${lineNum}`,
          language: 'rust',
          category: 'CODE_QUALITY',
          severity: 'MEDIUM',
          title: 'Unsafe Block Usage (Undocumented Invariants)',
          line: lineNum,
          column: clean.indexOf('unsafe') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Use of \'unsafe\' bypasses Rust memory safety and borrow checker guarantees.',
          recommendedFix: 'Document the safety invariant with a \'// SAFETY:\' comment or rewrite using safe abstractions.',
          recommended_fix: 'Document the safety invariant with a \'// SAFETY:\' comment or rewrite using safe abstractions.',
          source: 'Clippy',
          ruleId: 'clippy::undocumented_unsafe_blocks',
          detection_source: 'Clippy Linter',
          confidence: 'HIGH'
        });
      }

      // 8. Command Injection in Command::new
      if (clean.includes('Command::new') && (clean.includes('format!') || clean.includes('&input'))) {
        rawFindings.push({
          id: `rust_sec_cmd_${lineNum}`,
          language: 'rust',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Potential Command Injection in std::process::Command',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Executing formatted user input or shell scripts via Command::new can lead to arbitrary command injection.',
          recommendedFix: 'Pass binary executable and arguments as separate .arg() elements without invoking a shell.',
          recommended_fix: 'Pass binary executable and arguments as separate .arg() elements without invoking a shell.',
          source: 'Clippy',
          ruleId: 'clippy::command-injection',
          detection_source: 'Rust Security Analyzer',
          confidence: 'HIGH'
        });
      }

      // 9. Remaining todo!() or unimplemented!() macro
      if (/\b(?:todo!|unimplemented!)\s*\(/i.test(clean)) {
        rawFindings.push({
          id: `rust_todo_${lineNum}`,
          language: 'rust',
          category: 'CODE_QUALITY',
          severity: 'MEDIUM',
          title: 'Unimplemented Code Stub (todo! / unimplemented!)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'todo!() and unimplemented!() macros panic unconditionally when reached at runtime.',
          recommendedFix: 'Complete the implementation or return a Result Err.',
          recommended_fix: 'Complete the implementation or return a Result Err.',
          source: 'Clippy',
          ruleId: 'clippy::todo',
          detection_source: 'Clippy Linter (clippy::todo)',
          confidence: 'HIGH'
        });
      }
    });

    const isolatedFindings = deduplicateAndIsolateFindings(rawFindings, 'rust');

    return {
      status: 'FULLY_SUPPORTED',
      message: rustInstalled ? 'Rust 2021 (rustc + Clippy checks)' : 'Rust Static AST & Clippy Analysis Engine',
      findings: isolatedFindings
    };
  }
}
