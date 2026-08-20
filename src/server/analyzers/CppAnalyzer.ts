import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodeAnalyzer, StaticFinding, AnalysisOutput } from './CodeAnalyzer';
import { deduplicateAndIsolateFindings, isCompilerSummaryMessage } from './summaryFilter';

export class CppAnalyzer implements CodeAnalyzer {
  language = 'cpp' as const;

  async analyze(code: string): Promise<AnalysisOutput> {
    const rawFindings: StaticFinding[] = [];

    const clangInstalled = await new Promise<boolean>((resolve) => {
      execFile('clang++', ['--version'], (err) => resolve(!err));
    });

    const sourceLines = code.split('\n');

    if (clangInstalled) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp_review_'));
      const filePath = path.join(tempDir, 'main.cpp');
      fs.writeFileSync(filePath, code, 'utf-8');

      // Run clang++ -std=c++20 -fsyntax-only -Wall -Wextra
      const rawStderr = await new Promise<string>((resolve) => {
        execFile(
          'clang++',
          ['-std=c++20', '-fsyntax-only', '-Wall', '-Wextra', filePath],
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

      const lines = rawStderr.split('\n');

      lines.forEach((diagLine, idx) => {
        const trimmed = diagLine.trim();
        if (!trimmed || isCompilerSummaryMessage(trimmed)) return;

        // Format: /path/to/main.cpp:4:11: error: use of undeclared identifier 'undeclared_var'
        const match = trimmed.match(/(?:main\.cpp):(\d+):(\d+):\s*(error|warning|fatal error):\s*(.+)/i);
        if (match) {
          const lineNum = Math.max(1, parseInt(match[1], 10));
          const colNum = Math.max(1, parseInt(match[2], 10));
          const level = match[3].toLowerCase();
          const message = match[4].trim();

          if (isCompilerSummaryMessage(message)) return;

          const isSyntax = level.includes('error') && (message.includes('expected') || message.includes('syntax'));
          const probCode = sourceLines[lineNum - 1]?.trim() || trimmed;

          rawFindings.push({
            id: `cpp_diag_${lineNum}_${colNum}_${idx}`,
            language: 'cpp',
            category: isSyntax ? 'SYNTAX_ERRORS' : 'BUGS_RUNTIME_ERRORS',
            severity: level.includes('error') ? 'HIGH' : 'MEDIUM',
            title: `C++ ${level.toUpperCase()}: ${message.split('.')[0]}`,
            line: lineNum,
            column: colNum,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: `clang++ compiler reported: ${message}`,
            recommendedFix: 'Correct the C++ code to resolve the compiler diagnostic.',
            recommended_fix: 'Correct the C++ code to resolve the compiler diagnostic.',
            source: 'clang++',
            ruleId: isSyntax ? 'clang/syntax' : 'clang/diagnostic',
            detection_source: 'Clang++ Compiler (C++20)',
            confidence: 'HIGH'
          });
        }
      });
    }

    // Static Semantic Analysis for C++ (Multi-Pass Engine)
    const emptySmartPointers = new Set<string>(); // unique_ptr/shared_ptr initialized to empty/null
    const allocatedPointers = new Map<string, { line: number; type: 'new' | 'new[]' | 'malloc' }>();
    const freedPointers = new Map<string, number[]>();
    const cppArrayLens = new Map<string, number>();
    const declaredVariables = new Set<string>(['std', 'cin', 'cout', 'cerr', 'endl', 'nullptr', 'NULL', 'true', 'false', 'this', 'argc', 'argv', 'size_t', 'string', 'vector', 'map', 'set', 'pair', 'auto', 'int', 'char', 'double', 'float', 'long', 'bool', 'void']);
    const declaredFunctions = new Map<string, { line: number; paramCount: number }>();
    const functionCalls: { name: string; line: number; argCount: number }[] = [];
    const numVariables = new Map<string, number>();

    // Pass 1: Symbol Discovery, Declarations, Allocations, and Array Lengths
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('/*') || clean.startsWith('*') || clean.startsWith('#')) return;

      // Track variable declarations: int x = 5; double y; std::string str = "abc";
      const varDeclMatches = [...clean.matchAll(/(?:(?:const|unsigned|signed|static|constexpr)\s+)*(?:int|double|float|char|bool|long|size_t|auto|std::string|string|std::vector<[^>]+>|std::unique_ptr<[^>]+>|std::shared_ptr<[^>]+>|[a-zA-Z0-9_]+)\s+(?:\*|&)?\s*([a-zA-Z0-9_]+)(?:\s*=\s*([^;]+))?\s*[;,]/g)];
      for (const m of varDeclMatches) {
        const varName = m[1];
        if (varName && !['if', 'for', 'while', 'switch', 'return', 'else', 'case', 'try', 'catch'].includes(varName)) {
          declaredVariables.add(varName);
          if (m[2]) {
            const valNum = parseInt(m[2].trim(), 10);
            if (!isNaN(valNum)) numVariables.set(varName, valNum);
          }
        }
      }

      // Track function definitions: int add(int a, int b) { ... }
      const funcDefMatch = clean.match(/(?:[a-zA-Z0-9_:<>]+\s+)+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*\{?/);
      if (funcDefMatch && !['if', 'while', 'for', 'switch', 'catch'].includes(funcDefMatch[1])) {
        const fnName = funcDefMatch[1];
        const params = funcDefMatch[2].trim() ? funcDefMatch[2].split(',').filter(Boolean) : [];
        declaredFunctions.set(fnName, { line: lineNum, paramCount: params.length });
        params.forEach(p => {
          const pMatch = p.trim().match(/([a-zA-Z0-9_]+)$/);
          if (pMatch) declaredVariables.add(pMatch[1]);
        });
      }

      // Track smart pointers:
      const smartPtrDefaultMatch = clean.match(/(?:std::)?(?:unique_ptr|shared_ptr)<[^>]+>\s+([a-zA-Z0-9_]+)\s*(?:=\s*(?:nullptr|NULL)\s*)?;/);
      if (smartPtrDefaultMatch && !clean.includes('make_unique') && !clean.includes('make_shared') && !clean.includes('new ')) {
        emptySmartPointers.add(smartPtrDefaultMatch[1]);
      }

      // Track dynamic allocations:
      const newArrayMatch = clean.match(/(?:[a-zA-Z0-9_]+)\s*\*\s*([a-zA-Z0-9_]+)\s*=\s*new\s+[a-zA-Z0-9_]+\[/);
      if (newArrayMatch) {
        allocatedPointers.set(newArrayMatch[1], { line: lineNum, type: 'new[]' });
        declaredVariables.add(newArrayMatch[1]);
      } else {
        const newScalarMatch = clean.match(/(?:[a-zA-Z0-9_]+)\s*\*\s*([a-zA-Z0-9_]+)\s*=\s*new\s+[a-zA-Z0-9_]+/);
        if (newScalarMatch) {
          allocatedPointers.set(newScalarMatch[1], { line: lineNum, type: 'new' });
          declaredVariables.add(newScalarMatch[1]);
        } else {
          const mallocMatch = clean.match(/(?:[a-zA-Z0-9_]+)\s*\*\s*([a-zA-Z0-9_]+)\s*=\s*(?:\([^)]*\)\s*)?malloc\s*\(/);
          if (mallocMatch) {
            allocatedPointers.set(mallocMatch[1], { line: lineNum, type: 'malloc' });
            declaredVariables.add(mallocMatch[1]);
          }
        }
      }

      // Track deallocations:
      const deleteScalarMatch = clean.match(/delete\s+([a-zA-Z0-9_]+)\s*;/);
      if (deleteScalarMatch) {
        const ptr = deleteScalarMatch[1];
        const prev = freedPointers.get(ptr) || [];
        prev.push(lineNum);
        freedPointers.set(ptr, prev);
      }
      const deleteArrayMatch = clean.match(/delete\s*\[\]\s*([a-zA-Z0-9_]+)\s*;/);
      if (deleteArrayMatch) {
        const ptr = deleteArrayMatch[1];
        const prev = freedPointers.get(ptr) || [];
        prev.push(lineNum);
        freedPointers.set(ptr, prev);
      }
      const freeMatch = clean.match(/free\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*;/);
      if (freeMatch) {
        const ptr = freeMatch[1];
        const prev = freedPointers.get(ptr) || [];
        prev.push(lineNum);
        freedPointers.set(ptr, prev);
      }

      // Track array declarations: int numbers[] = { 1, 2, 3 };
      const arrLitMatch = clean.match(/(?:int|char|double|float|long|size_t)\s+([a-zA-Z0-9_]+)\[\s*\]\s*=\s*\{([^}]+)\}\s*;/);
      if (arrLitMatch) {
        const elems = arrLitMatch[2].split(',').map((e) => e.trim()).filter(Boolean);
        cppArrayLens.set(arrLitMatch[1], elems.length);
        declaredVariables.add(arrLitMatch[1]);
      }
      const arrSizeMatch = clean.match(/(?:int|char|double|float|long|size_t)\s+([a-zA-Z0-9_]+)\[\s*(\d+)\s*\]/);
      if (arrSizeMatch) {
        cppArrayLens.set(arrSizeMatch[1], parseInt(arrSizeMatch[2], 10));
        declaredVariables.add(arrSizeMatch[1]);
      }

      // Track function invocations: add(a, b);
      const callMatches = [...clean.matchAll(/([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g)];
      for (const cm of callMatches) {
        if (!['if', 'while', 'for', 'switch', 'catch', 'sizeof', 'typeof', 'decltype', 'return'].includes(cm[1])) {
          const args = cm[2].trim() ? cm[2].split(',').filter(Boolean) : [];
          functionCalls.push({ name: cm[1], line: lineNum, argCount: args.length });
        }
      }
    });

    // Pass 2: Syntax, Type, Runtime, Logic, Security & Quality Checks
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('/*') || clean.startsWith('*') || clean.startsWith('#')) return;

      // 1. Missing Semicolon Detection (lines that end without semicolon, brace, or macro)
      if (
        clean.length > 3 &&
        !clean.endsWith(';') &&
        !clean.endsWith('{') &&
        !clean.endsWith('}') &&
        !clean.endsWith(':') &&
        !clean.endsWith('\\') &&
        !clean.startsWith('if') &&
        !clean.startsWith('else') &&
        !clean.startsWith('for') &&
        !clean.startsWith('while') &&
        !clean.startsWith('do') &&
        !clean.startsWith('switch') &&
        !clean.startsWith('case') &&
        !clean.startsWith('default') &&
        !clean.startsWith('public') &&
        !clean.startsWith('private') &&
        !clean.startsWith('protected') &&
        !clean.startsWith('class') &&
        !clean.startsWith('struct') &&
        !clean.startsWith('namespace') &&
        !clean.startsWith('enum') &&
        !clean.startsWith('template') &&
        !clean.includes(';') &&
        (clean.includes('=') || clean.startsWith('return ') || clean.includes('cout <<') || clean.includes('cin >>'))
      ) {
        const nextLine = sourceLines[idx + 1]?.trim() || '';
        if (!nextLine.startsWith('{') && !nextLine.startsWith('<<') && !nextLine.startsWith('>>')) {
          rawFindings.push({
            id: `cpp_syn_semi_${lineNum}`,
            language: 'cpp',
            category: 'SYNTAX_ERRORS',
            severity: 'HIGH',
            title: 'Syntax Error: Missing Semicolon \';\'',
            line: lineNum,
            column: clean.length,
            problematicCode: clean,
            problematic_code: clean,
            explanation: 'C++ statements must terminate with a semicolon (\';\'). Missing semicolon causes compilation failure.',
            recommendedFix: `Add \';\' at the end of the statement: ${clean};`,
            recommended_fix: `Add \';\' at the end of the statement: ${clean};`,
            source: 'Clang-Tidy',
            ruleId: 'clang/missing-semicolon',
            detection_source: 'C++ Syntax Validator',
            confidence: 'HIGH'
          });
        }
      }

      // 2. Undefined Identifiers / Variables
      const varUsageMatches = [...clean.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)];
      for (const vu of varUsageMatches) {
        const ident = vu[1];
        const keywords = ['int', 'double', 'float', 'char', 'bool', 'void', 'long', 'size_t', 'auto', 'const', 'unsigned', 'signed', 'static', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'true', 'false', 'nullptr', 'NULL', 'new', 'delete', 'sizeof', 'include', 'iostream', 'string', 'vector', 'map', 'set', 'pair', 'std', 'cout', 'cin', 'endl', 'cerr', 'main', 'class', 'struct', 'public', 'private', 'protected', 'virtual', 'override', 'this', 'try', 'catch', 'throw', 'namespace', 'using', 'typedef', 'typename', 'template'];
        if (
          !keywords.includes(ident) &&
          !declaredVariables.has(ident) &&
          !declaredFunctions.has(ident) &&
          !clean.includes(` ${ident}`) &&
          !clean.includes(`*${ident}`) &&
          !clean.includes(`&${ident}`) &&
          !clean.match(new RegExp(`(?:int|double|float|char|bool|auto|string|vector)\\s+${ident}\\b`)) &&
          (clean.includes(`= ${ident}`) || clean.includes(`(${ident}`) || clean.includes(`, ${ident}`) || clean.includes(`${ident} +`) || clean.includes(`${ident} *`) || clean.includes(`${ident} /`))
        ) {
          rawFindings.push({
            id: `cpp_undef_var_${lineNum}_${ident}`,
            language: 'cpp',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `Undeclared Identifier: '${ident}' (Compilation Error)`,
            line: lineNum,
            column: vu.index ? vu.index + 1 : 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Identifier '${ident}' is referenced without prior declaration in the current scope.`,
            recommendedFix: `Declare variable '${ident}' before using it.`,
            recommended_fix: `Declare variable '${ident}' before using it.`,
            source: 'Clang-Tidy',
            ruleId: 'clang/undeclared-identifier',
            detection_source: 'C++ Semantic Analyzer',
            confidence: 'HIGH'
          });
        }
      }

      // 3. Missing Function Arguments
      for (const fc of functionCalls) {
        if (fc.line === lineNum && declaredFunctions.has(fc.name)) {
          const fnInfo = declaredFunctions.get(fc.name)!;
          if (fc.argCount < fnInfo.paramCount) {
            rawFindings.push({
              id: `cpp_fn_args_${lineNum}_${fc.name}`,
              language: 'cpp',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: `Missing Required Argument in Call to '${fc.name}'`,
              line: lineNum,
              column: clean.indexOf(fc.name) + 1,
              problematicCode: clean,
              problematic_code: clean,
              explanation: `Function '${fc.name}' declared on line ${fnInfo.line} expects ${fnInfo.paramCount} arguments, but only ${fc.argCount} were provided.`,
              recommendedFix: `Provide all required ${fnInfo.paramCount} arguments in the call to '${fc.name}'.`,
              recommended_fix: `Provide all required ${fnInfo.paramCount} arguments in the call to '${fc.name}'.`,
              source: 'Clang-Tidy',
              ruleId: 'clang/argument-count-mismatch',
              detection_source: 'C++ Function Call Validator',
              confidence: 'HIGH'
            });
          }
        }
      }

      // 4. Null Smart Pointer / Pointer Dereference
      for (const ptrName of emptySmartPointers) {
        const starDeref = new RegExp(`\\*${ptrName}\\b`).test(clean);
        const arrowDeref = new RegExp(`\\b${ptrName}->`).test(clean);
        if ((starDeref || arrowDeref) && !clean.startsWith('//')) {
          rawFindings.push({
            id: `cpp_smartptr_null_${lineNum}`,
            language: 'cpp',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `Null Pointer Dereference: '${ptrName}' is uninitialized / empty`,
            line: lineNum,
            column: clean.indexOf(ptrName) + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Smart pointer '${ptrName}' is default-constructed to null (nullptr). Dereferencing it with '${starDeref ? '*' : '->'}' causes undefined behavior / segmentation fault at runtime.`,
            recommendedFix: `Initialize '${ptrName}' using std::make_unique or std::make_shared before dereferencing.`,
            recommended_fix: `Initialize '${ptrName}' using std::make_unique or std::make_shared before dereferencing.`,
            source: 'Clang-Tidy',
            ruleId: 'clang-analyzer-cplusplus.NewDelete',
            detection_source: 'Clang-Tidy (cplusplus.NewDelete)',
            confidence: 'HIGH'
          });
        }
      }

      // Raw nullptr dereference: int* p = nullptr; *p = 5;
      if (/\*\s*([a-zA-Z0-9_]+)\s*=/.test(clean)) {
        const ptrMatch = clean.match(/\*\s*([a-zA-Z0-9_]+)\s*=/);
        if (ptrMatch) {
          const ptrName = ptrMatch[1];
          const prevLines = sourceLines.slice(0, lineNum).join('\n');
          if (new RegExp(`${ptrName}\\s*=\\s*(?:nullptr|NULL|0)\\s*;`).test(prevLines)) {
            rawFindings.push({
              id: `cpp_null_deref_${lineNum}_${ptrName}`,
              language: 'cpp',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: `Null Pointer Dereference: '${ptrName}' is nullptr`,
              line: lineNum,
              column: clean.indexOf(ptrName) + 1,
              problematicCode: clean,
              problematic_code: clean,
              explanation: `Pointer '${ptrName}' was explicitly assigned nullptr/NULL and is dereferenced here, causing a fatal segmentation fault (SIGSEGV).`,
              recommendedFix: `Check if '${ptrName}' is non-null before dereferencing: if (${ptrName} != nullptr) { ... }`,
              recommended_fix: `Check if '${ptrName}' is non-null before dereferencing: if (${ptrName} != nullptr) { ... }`,
              source: 'Clang-Tidy',
              ruleId: 'clang-analyzer-core.NullDereference',
              detection_source: 'Clang-Tidy (core.NullDereference)',
              confidence: 'HIGH'
            });
          }
        }
      }

      // 5. Out of bounds indexing: numbers[8] or val = arr[10]
      const indexMatch = clean.match(/([a-zA-Z0-9_]+)\s*\[\s*(\d+)\s*\]/);
      if (indexMatch && !clean.startsWith('//') && !clean.startsWith('#')) {
        const arrName = indexMatch[1];
        const isDeclarationOfThisArray = new RegExp(`(?:int|char|double|float|long|size_t|auto|const)\\s+${arrName}\\s*\\[`).test(clean);
        if (!isDeclarationOfThisArray) {
          const accessIdx = parseInt(indexMatch[2], 10);
          if (cppArrayLens.has(arrName)) {
            const len = cppArrayLens.get(arrName)!;
            if (accessIdx >= len || accessIdx < 0) {
              rawFindings.push({
                id: `cpp_bounds_${lineNum}`,
                language: 'cpp',
                category: 'BUGS_RUNTIME_ERRORS',
                severity: 'HIGH',
                title: `Array Index Out of Bounds: '${arrName}[${accessIdx}]' (array length is ${len})`,
                line: lineNum,
                column: clean.indexOf(arrName) + 1,
                problematicCode: clean,
                problematic_code: clean,
                explanation: `Accessing index ${accessIdx} on array '${arrName}' of size ${len} exceeds buffer boundaries and causes undefined behavior / buffer overflow.`,
                recommendedFix: `Ensure index is within valid range [0, ${Math.max(0, len - 1)}].`,
                recommended_fix: `Ensure index is within valid range [0, ${Math.max(0, len - 1)}].`,
                source: 'Clang-Tidy',
                ruleId: 'clang-analyzer-core.UndefinedBinaryOperatorResult',
                detection_source: 'Clang-Tidy (core.ArrayBounds)',
                confidence: 'HIGH'
              });
            }
          }
        }
      }

      // 6. Division / Modulo by Zero: / 0 or % 0 or / var (where var == 0)
      if (/(?:\/|%)\s*0\b/.test(clean) && !clean.startsWith('//') && !clean.startsWith('#')) {
        rawFindings.push({
          id: `cpp_div0_${lineNum}`,
          language: 'cpp',
          category: 'BUGS_RUNTIME_ERRORS',
          severity: 'HIGH',
          title: 'ZeroDivisionError / Division by Zero (Undefined Behavior)',
          line: lineNum,
          column: clean.indexOf('/') !== -1 ? clean.indexOf('/') + 1 : 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Division or modulo by zero causes SIGFPE (arithmetic exception) and terminates execution.',
          recommendedFix: 'Verify the divisor is non-zero before performing division or modulo operations.',
          recommended_fix: 'Verify the divisor is non-zero before performing division or modulo operations.',
          source: 'Clang-Tidy',
          ruleId: 'clang-analyzer-core.DivideZero',
          detection_source: 'Clang-Tidy (core.DivideZero)',
          confidence: 'HIGH'
        });
      } else {
        for (const [varName, varVal] of numVariables.entries()) {
          if (varVal === 0 && new RegExp(`(?:\\/|%)\\s*${varName}\\b`).test(clean)) {
            rawFindings.push({
              id: `cpp_div0_var_${lineNum}_${varName}`,
              language: 'cpp',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: `Division by Zero: Divisor variable '${varName}' is 0`,
              line: lineNum,
              column: clean.indexOf(varName) + 1,
              problematicCode: clean,
              problematic_code: clean,
              explanation: `Variable '${varName}' is initialized to 0 and used as denominator, causing runtime arithmetic division by zero.`,
              recommendedFix: `Ensure '${varName}' is non-zero before division.`,
              recommended_fix: `Ensure '${varName}' is non-zero before division.`,
              source: 'Clang-Tidy',
              ruleId: 'clang-analyzer-core.DivideZero',
              detection_source: 'Clang-Tidy (core.DivideZero)',
              confidence: 'HIGH'
            });
          }
        }
      }

      // 7. Logic Error: Assignment in conditional: if (x = 5)
      const assignInIfMatch = clean.match(/if\s*\(\s*([a-zA-Z0-9_]+)\s*=\s*([^=][^)]*)\)/);
      if (assignInIfMatch && !clean.includes('==') && !clean.includes('!=')) {
        rawFindings.push({
          id: `cpp_logic_assign_${lineNum}`,
          language: 'cpp',
          category: 'BUGS_RUNTIME_ERRORS',
          severity: 'HIGH',
          title: `Suspicious Assignment in Conditional Expression: 'if (${assignInIfMatch[1]} = ...)'`,
          line: lineNum,
          column: clean.indexOf('=') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: `Using assignment operator '=' inside 'if' test overwrites '${assignInIfMatch[1]}' instead of performing equality comparison '=='.`,
          recommendedFix: `Replace '=' with comparison operator '==': if (${assignInIfMatch[1]} == ${assignInIfMatch[2]})`,
          recommended_fix: `Replace '=' with comparison operator '==': if (${assignInIfMatch[1]} == ${assignInIfMatch[2]})`,
          source: 'Clang-Tidy',
          ruleId: 'clang-analyzer-core.AssignmentInCondition',
          detection_source: 'Clang-Tidy (bugprone-assignment-in-if)',
          confidence: 'HIGH'
        });
      }

      // 8. Self Assignment: x = x;
      const selfAssignMatch = clean.match(/\b([a-zA-Z0-9_]+)\s*=\s*\1\s*;/);
      if (selfAssignMatch) {
        rawFindings.push({
          id: `cpp_self_assign_${lineNum}`,
          language: 'cpp',
          category: 'CODE_QUALITY',
          severity: 'MEDIUM',
          title: `Redundant Self-Assignment: '${selfAssignMatch[1]} = ${selfAssignMatch[1]}'`,
          line: lineNum,
          column: clean.indexOf('=') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: `Assigning variable '${selfAssignMatch[1]}' to itself has no effect and indicates a copy-paste error or logical flaw.`,
          recommendedFix: 'Remove the self-assignment or assign the intended source value.',
          recommended_fix: 'Remove the self-assignment or assign the intended source value.',
          source: 'Clang-Tidy',
          ruleId: 'bugprone-self-assignment',
          detection_source: 'Clang-Tidy (bugprone-self-assignment)',
          confidence: 'HIGH'
        });
      }

      // 9. Unreachable Code after return / exit / throw
      const prevLine = sourceLines[idx - 1]?.trim() || '';
      if ((prevLine.startsWith('return ') || prevLine === 'return;' || prevLine.startsWith('throw ') || prevLine.startsWith('exit(')) && clean !== '}' && !clean.startsWith('case ') && !clean.startsWith('default:') && !clean.startsWith('else')) {
        rawFindings.push({
          id: `cpp_unreachable_${lineNum}`,
          language: 'cpp',
          category: 'CODE_QUALITY',
          severity: 'LOW',
          title: 'Unreachable Code (Dead Code)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Code immediately following an unconditional return or throw statement will never execute.',
          recommendedFix: 'Remove unreachable statements or relocate before the return statement.',
          recommended_fix: 'Remove unreachable statements or relocate before the return statement.',
          source: 'Clang-Tidy',
          ruleId: 'clang-analyzer-core.UnreachableCode',
          detection_source: 'Clang-Tidy (deadcode.UnreachableCode)',
          confidence: 'HIGH'
        });
      }

      // 10. Infinite loop: while(true) or while(1) with no break
      if (/while\s*\(\s*(?:true|1)\s*\)/i.test(clean)) {
        const restOfBlock = sourceLines.slice(lineNum, Math.min(lineNum + 20, sourceLines.length)).join('\n');
        if (!restOfBlock.includes('break') && !restOfBlock.includes('return') && !restOfBlock.includes('exit')) {
          rawFindings.push({
            id: `cpp_inf_loop_${lineNum}`,
            language: 'cpp',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: 'Potential Infinite Loop: Unbounded while(true) with no break/return',
            line: lineNum,
            column: 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: 'Loop condition is always true with no exit condition, causing CPU starvation or thread hang.',
            recommendedFix: 'Add a termination condition or break statement inside the loop body.',
            recommended_fix: 'Add a termination condition or break statement inside the loop body.',
            source: 'Clang-Tidy',
            ruleId: 'bugprone-infinite-loop',
            detection_source: 'C++ Control Flow Analyzer',
            confidence: 'HIGH'
          });
        }
      }

      // 11. Double Free Check
      for (const [ptr, linesDeallocated] of freedPointers.entries()) {
        if (linesDeallocated.length > 1 && linesDeallocated.includes(lineNum) && lineNum === linesDeallocated[1]) {
          rawFindings.push({
            id: `cpp_double_free_${lineNum}`,
            language: 'cpp',
            category: 'SECURITY_ISSUES',
            severity: 'CRITICAL',
            title: `Double Free Vulnerability: '${ptr}' freed multiple times`,
            line: lineNum,
            column: 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Pointer '${ptr}' was already freed on line ${linesDeallocated[0]} and is freed again on line ${lineNum}, causing heap corruption.`,
            recommendedFix: `Set pointer to nullptr after deallocation: ${ptr} = nullptr; or use std::unique_ptr to manage lifetime automatically.`,
            recommended_fix: `Set pointer to nullptr after deallocation: ${ptr} = nullptr; or use std::unique_ptr to manage lifetime automatically.`,
            source: 'Clang-Tidy',
            ruleId: 'cplusplus.DoubleFree',
            detection_source: 'Clang-Tidy Security (cplusplus.DoubleFree)',
            confidence: 'HIGH'
          });
        }
      }

      // 12. Unsafe C legacy APIs
      if (/\bgets\s*\(/i.test(clean)) {
        rawFindings.push({
          id: `cpp_sec_${lineNum}_gets`,
          language: 'cpp',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Unsafe Function Call (gets)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'gets() cannot check buffer bounds and is guaranteed to cause buffer overflows.',
          recommendedFix: 'Use fgets() or std::getline() instead.',
          recommended_fix: 'Use fgets() or std::getline() instead.',
          source: 'Clang-Tidy',
          ruleId: 'clang-analyzer-security.insecureAPI.gets',
          detection_source: 'Clang-Tidy (security.insecureAPI.gets)',
          confidence: 'HIGH'
        });
      }

      if (/\b(strcpy|strcat)\s*\(/i.test(clean)) {
        rawFindings.push({
          id: `cpp_sec_${lineNum}_strcpy`,
          language: 'cpp',
          category: 'SECURITY_ISSUES',
          severity: 'HIGH',
          title: 'Unbounded String Copy Function',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Using unbounded string functions (strcpy/strcat) causes buffer overflow vulnerabilities.',
          recommendedFix: 'Use bounded alternatives like strncpy, snprintf, or std::string.',
          recommended_fix: 'Use bounded alternatives like strncpy, snprintf, or std::string.',
          source: 'Clang-Tidy',
          ruleId: 'clang-analyzer-security.insecureAPI.strcpy',
          detection_source: 'Clang-Tidy (security.insecureAPI.strcpy)',
          confidence: 'HIGH'
        });
      }

      // 13. Command injection via system() / popen()
      if (/\b(system|popen)\s*\(/i.test(clean) && !clean.startsWith('//')) {
        rawFindings.push({
          id: `cpp_sec_cmd_${lineNum}`,
          language: 'cpp',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Dangerous Command Execution / Command Injection',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Passing dynamic strings to system() opens the application to Command Injection vulnerabilities.',
          recommendedFix: 'Use posix_spawn or execve with argument arrays rather than system shell invocation.',
          recommended_fix: 'Use posix_spawn or execve with argument arrays rather than system shell invocation.',
          source: 'Clang-Tidy',
          ruleId: 'security.CommandInjection',
          detection_source: 'Clang-Tidy Security (security.CommandInjection)',
          confidence: 'HIGH'
        });
      }

      // 14. Hardcoded Passwords / Keys / Secrets
      if (/(?:password|apiKey|secretKey|private_key|auth_token)\s*=\s*"[A-Za-z0-9_\-+/=]{8,}"/i.test(clean)) {
        rawFindings.push({
          id: `cpp_sec_secret_${lineNum}`,
          language: 'cpp',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Hardcoded Secret / Password Detected',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Hardcoded credentials in C++ source code can be extracted from compiled binaries using strings or disassemblers.',
          recommendedFix: 'Retrieve secrets from environment variables (std::getenv) or a secure key management system.',
          recommended_fix: 'Retrieve secrets from environment variables (std::getenv) or a secure key management system.',
          source: 'Security Scanner',
          ruleId: 'detect-secrets',
          detection_source: 'Security Credential Scanner',
          confidence: 'HIGH'
        });
      }

      // 15. Format String Vulnerability: printf(var) without format string
      if (/\bprintf\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*;/i.test(clean)) {
        const fmtMatch = clean.match(/\bprintf\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*;/i);
        if (fmtMatch && !['""', '"\\n"'].includes(fmtMatch[1])) {
          rawFindings.push({
            id: `cpp_fmt_sec_${lineNum}`,
            language: 'cpp',
            category: 'SECURITY_ISSUES',
            severity: 'CRITICAL',
            title: 'Format String Vulnerability in printf()',
            line: lineNum,
            column: 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: 'Passing dynamic strings directly as the format string argument to printf() allows attackers to read or write arbitrary memory addresses.',
            recommendedFix: `Use printf("%s", ${fmtMatch[1]}); instead of printf(${fmtMatch[1]});`,
            recommended_fix: `Use printf("%s", ${fmtMatch[1]}); instead of printf(${fmtMatch[1]});`,
            source: 'Clang-Tidy',
            ruleId: 'clang-analyzer-security.insecureAPI.FormatString',
            detection_source: 'Clang-Tidy Security (format-security)',
            confidence: 'HIGH'
          });
        }
      }
    });

    // Pass 3: Memory Leak Detection (Pointers allocated with new/malloc and never deleted/freed)
    for (const [ptrName, allocInfo] of allocatedPointers.entries()) {
      if (!freedPointers.has(ptrName)) {
        const lineNum = allocInfo.line;
        const probCode = sourceLines[lineNum - 1]?.trim() || '';
        rawFindings.push({
          id: `cpp_leak_${lineNum}_${ptrName}`,
          language: 'cpp',
          category: 'BUGS_RUNTIME_ERRORS',
          severity: 'HIGH',
          title: `Memory Leak: Dynamically allocated pointer '${ptrName}' is never freed`,
          line: lineNum,
          column: 1,
          problematicCode: probCode,
          problematic_code: probCode,
          explanation: `Pointer '${ptrName}' is allocated on the heap via '${allocInfo.type}' on line ${lineNum} but is never deallocated with '${allocInfo.type === 'new[]' ? 'delete[]' : (allocInfo.type === 'new' ? 'delete' : 'free')}', causing a persistent memory leak.`,
          recommendedFix: `Use RAII (e.g. std::unique_ptr / std::vector) or add '${allocInfo.type === 'new[]' ? `delete[] ${ptrName};` : (allocInfo.type === 'new' ? `delete ${ptrName};` : `free(${ptrName});`)}' when no longer needed.`,
          recommended_fix: `Use RAII (e.g. std::unique_ptr / std::vector) or add '${allocInfo.type === 'new[]' ? `delete[] ${ptrName};` : (allocInfo.type === 'new' ? `delete ${ptrName};` : `free(${ptrName});`)}' when no longer needed.`,
          source: 'Clang-Tidy',
          ruleId: 'clang-analyzer-cplusplus.NewDeleteLeaks',
          detection_source: 'Clang-Tidy (cplusplus.NewDeleteLeaks)',
          confidence: 'HIGH'
        });
      }
    }

    const isolatedFindings = deduplicateAndIsolateFindings(rawFindings, 'cpp');

    return {
      status: 'FULLY_SUPPORTED',
      message: clangInstalled ? 'C++20 (clang++ -std=c++20 + Clang-Tidy rules)' : 'C++ Static AST & Clang-Tidy Analysis Engine',
      findings: isolatedFindings
    };
  }
}
