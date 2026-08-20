import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodeAnalyzer, StaticFinding, AnalysisOutput } from './CodeAnalyzer';
import { deduplicateAndIsolateFindings, isCompilerSummaryMessage } from './summaryFilter';

export class JavaAnalyzer implements CodeAnalyzer {
  language = 'java' as const;

  async analyze(code: string): Promise<AnalysisOutput> {
    const rawFindings: StaticFinding[] = [];

    const javaInstalled = await new Promise<boolean>((resolve) => {
      execFile('javac', ['-version'], (err) => resolve(!err));
    });

    const sourceLines = code.split('\n');

    // ------------------------------------------------------------------------
    // 1. JAVA COMPILER INTEGRATION (javac -Xlint:all)
    // ------------------------------------------------------------------------
    if (javaInstalled) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'java_review_'));

      // Extract public class name or default to Snippet
      const classMatch = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
      const className = classMatch ? classMatch[1] : 'Snippet';
      const filePath = path.join(tempDir, `${className}.java`);

      let finalCode = code;
      let wrapped = false;
      if (!code.includes('class ') && !code.includes('interface ') && !code.includes('enum ') && !code.includes('record ')) {
        finalCode = `public class ${className} {\n  public static void main(String[] args) {\n${code}\n  }\n}`;
        wrapped = true;
      }

      fs.writeFileSync(filePath, finalCode, 'utf-8');

      const rawStderr = await new Promise<string>((resolve) => {
        execFile('javac', ['-Xlint:all', `${className}.java`], { cwd: tempDir, timeout: 15000 }, (_err, _stdout, stderr) => {
          resolve(stderr || '');
        });
      });

      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }

      const lines = rawStderr.split('\n');

      lines.forEach((diagLine, idx) => {
        const trimmed = diagLine.trim();
        if (!trimmed || isCompilerSummaryMessage(trimmed)) return;

        // Format: Snippet.java:3: error: cannot find symbol
        const match = trimmed.match(/(?:[A-Za-z0-9_]+\.java):(\d+):\s*(error|warning):\s*(.+)/i);
        if (match) {
          let lineNum = parseInt(match[1], 10);
          if (wrapped && lineNum > 2) {
            lineNum -= 2;
          }
          lineNum = Math.max(1, Math.min(lineNum, sourceLines.length));

          const level = match[2].toLowerCase();
          const message = match[3].trim();
          if (isCompilerSummaryMessage(message)) return;

          const isSyntax =
            message.toLowerCase().includes('expected') ||
            message.toLowerCase().includes('syntax') ||
            message.toLowerCase().includes('unclosed') ||
            message.toLowerCase().includes('illegal start');

          const probCode = sourceLines[lineNum - 1]?.trim() || trimmed;

          rawFindings.push({
            id: `javac_diag_${lineNum}_${idx}`,
            language: 'java',
            category: isSyntax ? 'SYNTAX_ERRORS' : 'BUGS_RUNTIME_ERRORS',
            severity: level === 'error' ? 'HIGH' : 'MEDIUM',
            title: `Java ${level === 'error' ? 'Compiler Error' : 'Compiler Warning'}: ${message.split('.')[0]}`,
            line: lineNum,
            column: 1,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: `javac compiler reported: ${message}`,
            recommendedFix: 'Correct the Java type definitions, syntax, or method signatures.',
            recommended_fix: 'Correct the Java type definitions, syntax, or method signatures.',
            source: 'javac',
            ruleId: isSyntax ? 'javac/syntax' : 'javac/compiler-error',
            detection_source: 'Java Compiler (javac -Xlint:all)',
            confidence: 'HIGH'
          });
        }
      });
    }

    // ------------------------------------------------------------------------
    // 2. STATIC SEMANTIC ANALYSIS & SECURITY ENGINE
    // ------------------------------------------------------------------------
    const nullVars = new Set<string>();
    const emptyCollections = new Set<string>();
    const javaArrayLens = new Map<string, number>();
    const javaNumVars = new Map<string, number>();
    const javaStringVars = new Map<string, string>();
    const javaMethodDivisors = new Map<string, { divisorArgIndex: number }>();
    const openedResources = new Map<string, { line: number; type: string }>();
    const closedResources = new Set<string>();

    // Structural Brace Tracking
    let openBraces = 0;
    let closeBraces = 0;

    // Pass 1: Symbol discovery & state tracking
    sourceLines.forEach((line, idx) => {
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('*') || clean.startsWith('/*')) return;

      // Count braces
      for (const ch of line) {
        if (ch === '{') openBraces++;
        if (ch === '}') closeBraces++;
      }

      // Methods that divide by a parameter
      const methodMatch = clean.match(/(?:public|private|protected|static|\s)+\s+[a-zA-Z0-9_<>[\]]+\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (methodMatch) {
        const methodName = methodMatch[1];
        const params = methodMatch[2].split(',').map((p) => p.trim().split(/\s+/).pop()).filter(Boolean);
        for (let j = idx; j < Math.min(sourceLines.length, idx + 20); j++) {
          const bodyLine = sourceLines[j];
          for (let pIdx = 0; pIdx < params.length; pIdx++) {
            const pName = params[pIdx];
            if (pName && new RegExp(`[\\/\\%]\\s*${pName}\\b`).test(bodyLine)) {
              javaMethodDivisors.set(methodName, { divisorArgIndex: pIdx });
              break;
            }
          }
          if (bodyLine.includes('}')) break;
        }
      }

      // Track variable = null
      const nullMatch = clean.match(/(?:[a-zA-Z0-9_<>[\]]+\s+)?([a-zA-Z0-9_]+)\s*=\s*null\s*;/);
      if (nullMatch) {
        nullVars.add(nullMatch[1]);
      }

      // Track empty collection initialization:
      // List<String> list = new ArrayList<>();
      const emptyListMatch = clean.match(/(?:List|ArrayList|LinkedList|Set|HashSet|Vector|Collection|Queue|Deque)<[^>]*>\s+([a-zA-Z0-9_]+)\s*=\s*new\s+[A-Za-z0-9_]+<.*?>\(\s*\)\s*;/);
      if (emptyListMatch) {
        emptyCollections.add(emptyListMatch[1]);
      }

      // Track array initialization:
      // int[] arr = new int[3];
      const arrNewMatch = clean.match(/(?:[a-zA-Z0-9_]+\[\])\s+([a-zA-Z0-9_]+)\s*=\s*new\s+[a-zA-Z0-9_]+\[(\d+)\]\s*;/);
      if (arrNewMatch) {
        javaArrayLens.set(arrNewMatch[1], parseInt(arrNewMatch[2], 10));
      }
      const arrLitMatch = clean.match(/(?:[a-zA-Z0-9_]+\[\])\s+([a-zA-Z0-9_]+)\s*=\s*\{([^}]+)\}\s*;/);
      if (arrLitMatch) {
        const elems = arrLitMatch[2].split(',').map((e) => e.trim()).filter(Boolean);
        javaArrayLens.set(arrLitMatch[1], elems.length);
      }

      // Track integer constants
      const numMatch = clean.match(/(?:int|long|short|byte)\s+([a-zA-Z0-9_]+)\s*=\s*(-?\d+)\s*;/);
      if (numMatch) {
        javaNumVars.set(numMatch[1], parseInt(numMatch[2], 10));
      }

      // Track string variables: String s = "abc";
      const strMatch = clean.match(/String\s+([a-zA-Z0-9_]+)\s*=\s*"([^"]*)"\s*;/);
      if (strMatch) {
        javaStringVars.set(strMatch[1], strMatch[2]);
      }

      // Track unclosed resource allocations (Streams, Connections, Readers)
      const resourceAllocMatch = clean.match(/(?:FileInputStream|FileOutputStream|FileReader|FileWriter|BufferedReader|BufferedWriter|Scanner|Connection|Statement|PreparedStatement|ResultSet|Socket|ServerSocket)\s+([a-zA-Z0-9_]+)\s*=\s*new\s+([a-zA-Z0-9_]+)\s*\(/);
      if (resourceAllocMatch && !clean.includes('try (') && !clean.includes('try(')) {
        openedResources.set(resourceAllocMatch[1], { line: idx + 1, type: resourceAllocMatch[2] });
      }

      // Track resource.close()
      const closeMatch = clean.match(/([a-zA-Z0-9_]+)\s*\.\s*close\s*\(\s*\)\s*;/);
      if (closeMatch) {
        closedResources.add(closeMatch[1]);
      }
    });

    // Check for Mismatched Braces (Syntax error)
    if (openBraces !== closeBraces) {
      const errLine = sourceLines.length;
      rawFindings.push({
        id: `java_ast_brace_mismatch`,
        language: 'java',
        category: 'SYNTAX_ERRORS',
        severity: 'HIGH',
        title: `Syntax Error: Mismatched Curly Braces (${openBraces} opened vs ${closeBraces} closed)`,
        line: errLine,
        column: 1,
        problematicCode: sourceLines[errLine - 1]?.trim() || '}',
        problematic_code: sourceLines[errLine - 1]?.trim() || '}',
        explanation: `The Java source file has unbalanced curly braces: ${openBraces} opening '{' vs ${closeBraces} closing '}'. This causes a compilation failure.`,
        recommendedFix: 'Ensure all opening braces "{" have a matching closing brace "}".',
        recommended_fix: 'Ensure all opening braces "{" have a matching closing brace "}".',
        source: 'Java AST Parser',
        ruleId: 'java/syntax/unbalanced-braces',
        detection_source: 'Java Syntax Checker',
        confidence: 'HIGH'
      });
    }

    // Pass 2: Line-by-line semantic inspection
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();

      if (!clean || clean.startsWith('//') || clean.startsWith('/*') || clean.startsWith('*')) return;

      // ----------------------------------------------------------------------
      // A. SYNTAX & COMPILATION CHECKS
      // ----------------------------------------------------------------------

      // Missing Semicolon Check: lines ending without semicolon or brace
      if (
        !clean.endsWith(';') &&
        !clean.endsWith('{') &&
        !clean.endsWith('}') &&
        !clean.endsWith(':') &&
        !clean.startsWith('@') &&
        !clean.startsWith('//') &&
        !clean.startsWith('import ') &&
        !clean.startsWith('package ') &&
        !clean.startsWith('public class') &&
        !clean.startsWith('class ') &&
        !clean.startsWith('interface ') &&
        !clean.startsWith('enum ') &&
        !clean.startsWith('/*') &&
        !clean.endsWith('*/') &&
        !clean.startsWith('if (') &&
        !clean.startsWith('for (') &&
        !clean.startsWith('while (') &&
        !clean.startsWith('switch (') &&
        !clean.startsWith('catch (') &&
        !clean.startsWith('try') &&
        !clean.startsWith('else') &&
        /(?:int|long|double|float|String|boolean|char|var|[A-Z][a-zA-Z0-9_]*)\s+[a-zA-Z0-9_]+\s*=/i.test(clean)
      ) {
        // Only trigger if next line is not a continuation line
        const nextLine = (sourceLines[idx + 1] || '').trim();
        if (!nextLine.startsWith('+') && !nextLine.startsWith('.') && !nextLine.startsWith(';') && !nextLine.startsWith(')')) {
          rawFindings.push({
            id: `java_ast_missing_semi_${lineNum}`,
            language: 'java',
            category: 'SYNTAX_ERRORS',
            severity: 'HIGH',
            title: `Syntax Error: Missing Semicolon (';' expected)`,
            line: lineNum,
            column: clean.length,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Java statements must terminate with a semicolon ';'. Line ${lineNum} is missing ';'.`,
            recommendedFix: `Add a semicolon ';' to the end of line ${lineNum}.`,
            recommended_fix: `Add a semicolon ';' to the end of line ${lineNum}.`,
            source: 'Java AST Parser',
            ruleId: 'java/syntax/missing-semicolon',
            detection_source: 'Java Syntax Checker',
            confidence: 'HIGH'
          });
        }
      }

      // Incompatible Type Assignment (e.g. int x = "hello"; or String s = 123;)
      const intToStrMatch = clean.match(/\b(?:int|long|short|byte)\s+([a-zA-Z0-9_]+)\s*=\s*"([^"]*)"\s*;/);
      if (intToStrMatch) {
        rawFindings.push({
          id: `java_ast_type_mismatch_${lineNum}`,
          language: 'java',
          category: 'BUGS_RUNTIME_ERRORS',
          severity: 'HIGH',
          title: `Incompatible Types: String cannot be converted to numeric type`,
          line: lineNum,
          column: clean.indexOf(intToStrMatch[1]) + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: `Variable '${intToStrMatch[1]}' is declared as a primitive number but is assigned a String literal ("${intToStrMatch[2]}"). Java requires explicit parsing via Integer.parseInt().`,
          recommendedFix: `Assign an integer value or parse the string using Integer.parseInt("${intToStrMatch[2]}").`,
          recommended_fix: `Assign an integer value or parse the string using Integer.parseInt("${intToStrMatch[2]}").`,
          source: 'SpotBugs',
          ruleId: 'javac/incompatible-types',
          detection_source: 'Java Type Checker',
          confidence: 'HIGH'
        });
      }

      const strToIntMatch = clean.match(/\bString\s+([a-zA-Z0-9_]+)\s*=\s*(\d+)\s*;/);
      if (strToIntMatch) {
        rawFindings.push({
          id: `java_ast_str_type_mismatch_${lineNum}`,
          language: 'java',
          category: 'BUGS_RUNTIME_ERRORS',
          severity: 'HIGH',
          title: `Incompatible Types: int cannot be converted to java.lang.String`,
          line: lineNum,
          column: clean.indexOf(strToIntMatch[1]) + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: `Variable '${strToIntMatch[1]}' is declared as String but is assigned integer literal ${strToIntMatch[2]}.`,
          recommendedFix: `Wrap in quotes ("${strToIntMatch[2]}") or use String.valueOf(${strToIntMatch[2]}).`,
          recommended_fix: `Wrap in quotes ("${strToIntMatch[2]}") or use String.valueOf(${strToIntMatch[2]}).`,
          source: 'SpotBugs',
          ruleId: 'javac/incompatible-types',
          detection_source: 'Java Type Checker',
          confidence: 'HIGH'
        });
      }

      // Invalid Cast (e.g. (String) 123)
      const badCastMatch = clean.match(/\(\s*(?:String)\s*\)\s*(\d+)/);
      if (badCastMatch) {
        rawFindings.push({
          id: `java_ast_bad_cast_${lineNum}`,
          language: 'java',
          category: 'BUGS_RUNTIME_ERRORS',
          severity: 'HIGH',
          title: `ClassCastException / Invalid Cast: Cannot cast primitive int to java.lang.String`,
          line: lineNum,
          column: clean.indexOf('(') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: `Inconvertible types: primitive int cannot be cast directly to java.lang.String.`,
          recommendedFix: `Use String.valueOf(...) instead of casting.`,
          recommended_fix: `Use String.valueOf(...) instead of casting.`,
          source: 'SpotBugs',
          ruleId: 'javac/inconvertible-types',
          detection_source: 'Java Type Checker',
          confidence: 'HIGH'
        });
      }

      // ----------------------------------------------------------------------
      // B. RUNTIME BUGS (NPE, Div by zero, OOB, Infinite loops, NumberFormatException)
      // ----------------------------------------------------------------------

      // 1. Guaranteed NullPointerException
      for (const varName of nullVars) {
        const derefRegex = new RegExp(`\\b${varName}\\s*\\.\\s*([a-zA-Z0-9_]+)`);
        const derefMatch = clean.match(derefRegex);
        if (derefMatch) {
          const accessedMember = derefMatch[1];
          rawFindings.push({
            id: `java_ast_npe_${lineNum}`,
            language: 'java',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `NullPointerException: Calling .${accessedMember}() on null '${varName}'`,
            line: lineNum,
            column: clean.indexOf(varName) + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Variable '${varName}' is initialized to null. Calling '${varName}.${accessedMember}()' will throw a NullPointerException at runtime.`,
            recommendedFix: `Initialize '${varName}' with a non-null object, or add a null check ('if (${varName} != null) ...') before invoking methods.`,
            recommended_fix: `Initialize '${varName}' with a non-null object, or add a null check ('if (${varName} != null) ...') before invoking methods.`,
            source: 'SpotBugs',
            ruleId: 'NP_NULL_ON_SOME_PATH',
            detection_source: 'Java Static Analysis / SpotBugs (NP_NULL_ON_SOME_PATH)',
            confidence: 'HIGH'
          });
        }
      }

      // 2. IndexOutOfBoundsException on Empty List
      for (const listName of emptyCollections) {
        const getMatch = clean.match(new RegExp(`\\b${listName}\\s*\\.\\s*get\\s*\\(\\s*(\\d+)\\s*\\)`));
        if (getMatch) {
          const getIdx = parseInt(getMatch[1], 10);
          rawFindings.push({
            id: `java_ast_ioob_${lineNum}`,
            language: 'java',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `IndexOutOfBoundsException: Accessing index ${getIdx} on empty '${listName}'`,
            line: lineNum,
            column: clean.indexOf(listName) + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Collection '${listName}' was instantiated empty and has no elements added. Calling '${listName}.get(${getIdx})' will throw IndexOutOfBoundsException: Index ${getIdx} out of bounds for length 0.`,
            recommendedFix: `Ensure elements are added to '${listName}' or check '!${listName}.isEmpty()' before accessing elements.`,
            recommended_fix: `Ensure elements are added to '${listName}' or check '!${listName}.isEmpty()' before accessing elements.`,
            source: 'SpotBugs',
            ruleId: 'RV_CHECK_COMPARE_INDEX_OUT_OF_BOUNDS',
            detection_source: 'Java Static Analysis / SpotBugs',
            confidence: 'HIGH'
          });
        }
      }

      // 3. Array Index Out of Bounds
      const arrAccessMatch = clean.match(/([a-zA-Z0-9_]+)\s*\[\s*(\d+)\s*\]/);
      if (arrAccessMatch) {
        const arrName = arrAccessMatch[1];
        const accessIdx = parseInt(arrAccessMatch[2], 10);
        if (javaArrayLens.has(arrName)) {
          const len = javaArrayLens.get(arrName)!;
          if (accessIdx >= len || accessIdx < 0) {
            rawFindings.push({
              id: `java_ast_arr_ioob_${lineNum}`,
              language: 'java',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: `ArrayIndexOutOfBoundsException: Index ${accessIdx} out of bounds for length ${len}`,
              line: lineNum,
              column: clean.indexOf(arrName) + 1,
              problematicCode: clean,
              problematic_code: clean,
              explanation: `Array '${arrName}' has length ${len}. Accessing '${arrName}[${accessIdx}]' throws ArrayIndexOutOfBoundsException at runtime.`,
              recommendedFix: `Ensure the index is within 0 to ${Math.max(0, len - 1)}.`,
              recommended_fix: `Ensure the index is within 0 to ${Math.max(0, len - 1)}.`,
              source: 'SpotBugs',
              ruleId: 'SIC_INDEX_OUT_OF_BOUNDS',
              detection_source: 'Java Static Analysis Engine',
              confidence: 'HIGH'
            });
          }
        }
      }

      // 4. Division by Zero in method calls & expressions
      for (const [methodName, info] of javaMethodDivisors.entries()) {
        const callRegex = new RegExp(`\\b${methodName}\\s*\\(([^)]*)\\)`);
        const callMatch = clean.match(callRegex);
        if (callMatch) {
          const args = callMatch[1].split(',').map((a) => a.trim());
          if (args.length > info.divisorArgIndex) {
            const passedArg = args[info.divisorArgIndex];
            const isZero = passedArg === '0' || javaNumVars.get(passedArg) === 0;
            if (isZero) {
              rawFindings.push({
                id: `java_ast_div0_call_${lineNum}`,
                language: 'java',
                category: 'BUGS_RUNTIME_ERRORS',
                severity: 'HIGH',
                title: `ArithmeticException: / by zero in '${methodName}' call`,
                line: lineNum,
                column: clean.indexOf(methodName) + 1,
                problematicCode: clean,
                problematic_code: clean,
                explanation: `Method '${methodName}' divides by parameter index ${info.divisorArgIndex + 1}, but is passed 0 on line ${lineNum}. This throws java.lang.ArithmeticException: / by zero at runtime.`,
                recommendedFix: `Ensure argument '${passedArg}' passed to '${methodName}' is non-zero.`,
                recommended_fix: `Ensure argument '${passedArg}' passed to '${methodName}' is non-zero.`,
                source: 'SpotBugs',
                ruleId: 'DB_DIV_BY_ZERO',
                detection_source: 'Java Static Analysis (SpotBugs)',
                confidence: 'HIGH'
              });
            }
          }
        }
      }

      const directDivMatch = clean.match(/([a-zA-Z0-9_]+)\s*[\/\%]\s*([a-zA-Z0-9_]+)/);
      if (directDivMatch) {
        const divisor = directDivMatch[2];
        if (divisor === '0' || javaNumVars.get(divisor) === 0) {
          rawFindings.push({
            id: `java_ast_div0_direct_${lineNum}`,
            language: 'java',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: 'ArithmeticException: / by zero',
            line: lineNum,
            column: clean.indexOf('/') + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Division by zero (${divisor}) throws java.lang.ArithmeticException: / by zero at runtime.`,
            recommendedFix: 'Validate that the divisor is non-zero before division.',
            recommended_fix: 'Validate that the divisor is non-zero before division.',
            source: 'SpotBugs',
            ruleId: 'DB_DIV_BY_ZERO',
            detection_source: 'Java Static Analysis Engine',
            confidence: 'HIGH'
          });
        }
      }

      // 5. NumberFormatException in Integer.parseInt("non_numeric")
      const parseIntMatch = clean.match(/(?:Integer|Long|Short|Byte)\.parse[A-Za-z]+\s*\(\s*"([^"]*)"\s*\)/);
      if (parseIntMatch) {
        const literalVal = parseIntMatch[1];
        if (!/^-?\d+$/.test(literalVal)) {
          rawFindings.push({
            id: `java_ast_num_format_${lineNum}`,
            language: 'java',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `NumberFormatException: For input string "${literalVal}"`,
            line: lineNum,
            column: clean.indexOf('parse') + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Parsing non-numeric string literal "${literalVal}" throws java.lang.NumberFormatException at runtime.`,
            recommendedFix: `Ensure string passed to parseInt contains only valid digits or wrap in a try-catch block.`,
            recommended_fix: `Ensure string passed to parseInt contains only valid digits or wrap in a try-catch block.`,
            source: 'SpotBugs',
            ruleId: 'NP_NUMBER_FORMAT_EXCEPTION',
            detection_source: 'Java Static Analysis Engine',
            confidence: 'HIGH'
          });
        }
      }

      // 6. Infinite Loop Detection: while(true) with no break or while (counter < 10) where counter is never modified
      if (/while\s*\(\s*(?:true|1\s*==\s*1)\s*\)/.test(clean)) {
        // Check if loop body has break or return
        let hasBreak = false;
        for (let j = idx; j < Math.min(sourceLines.length, idx + 25); j++) {
          if (/\b(?:break|return|throw|System\.exit)\b/.test(sourceLines[j])) {
            hasBreak = true;
            break;
          }
          if (sourceLines[j].includes('}') && j > idx + 1) break;
        }
        if (!hasBreak) {
          rawFindings.push({
            id: `java_ast_inf_loop_${lineNum}`,
            language: 'java',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: 'Potential Infinite Loop (while (true) without termination)',
            line: lineNum,
            column: clean.indexOf('while') + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: 'The loop condition is always true and the loop body does not contain any break, return, or exit statements.',
            recommendedFix: 'Add a termination condition or a break statement inside the loop.',
            recommended_fix: 'Add a termination condition or a break statement inside the loop.',
            source: 'PMD',
            ruleId: 'WhileLoopMustUseBraces',
            detection_source: 'Java Control Flow Analyzer',
            confidence: 'HIGH'
          });
        }
      }

      const whileCounterMatch = clean.match(/while\s*\(\s*([a-zA-Z0-9_]+)\s*<\s*(\d+)\s*\)/);
      if (whileCounterMatch) {
        const loopVar = whileCounterMatch[1];
        let varModified = false;
        for (let j = idx + 1; j < Math.min(sourceLines.length, idx + 20); j++) {
          const bodyLine = sourceLines[j];
          if (
            new RegExp(`\\b${loopVar}\\s*\\+\\+`).test(bodyLine) ||
            new RegExp(`\\+\\+\\s*${loopVar}\\b`).test(bodyLine) ||
            new RegExp(`\\b${loopVar}\\s*\\+=`).test(bodyLine) ||
            new RegExp(`\\b${loopVar}\\s*=`).test(bodyLine) ||
            /\b(?:break|return|throw)\b/.test(bodyLine)
          ) {
            varModified = true;
            break;
          }
          if (bodyLine.includes('}')) break;
        }
        if (!varModified) {
          rawFindings.push({
            id: `java_ast_inf_counter_${lineNum}`,
            language: 'java',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `Potential Infinite Loop: Variable '${loopVar}' is never incremented`,
            line: lineNum,
            column: clean.indexOf('while') + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `The while loop depends on '${loopVar} < ${whileCounterMatch[2]}', but '${loopVar}' is never incremented or modified in the loop body, causing an infinite loop.`,
            recommendedFix: `Increment '${loopVar}' (e.g. ${loopVar}++) inside the loop body.`,
            recommended_fix: `Increment '${loopVar}' (e.g. ${loopVar}++) inside the loop body.`,
            source: 'SpotBugs',
            ruleId: 'IL_INFINITE_LOOP',
            detection_source: 'Java Control Flow Analyzer',
            confidence: 'HIGH'
          });
        }
      }

      // 7. String comparison using == instead of .equals()
      const stringCompMatch = clean.match(/(?:if|while)\s*\(\s*([a-zA-Z0-9_]+)\s*==\s*(?:"[^"]*"|[a-zA-Z0-9_]+)\s*\)/);
      if (stringCompMatch) {
        const varName = stringCompMatch[1];
        if (javaStringVars.has(varName) || clean.includes('"')) {
          rawFindings.push({
            id: `java_ast_str_eq_${lineNum}`,
            language: 'java',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `String Comparison Using '==' (Reference Equality instead of Value Equality)`,
            line: lineNum,
            column: clean.indexOf('==') + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `In Java, '==' compares object memory references, not string content. This causes false comparison results for different String instances with identical text.`,
            recommendedFix: `Use '${varName}.equals(...)', 'Objects.equals(...)', or '"expected".equals(${varName})' instead of '=='.`,
            recommended_fix: `Use '${varName}.equals(...)', 'Objects.equals(...)', or '"expected".equals(${varName})' instead of '=='.`,
            source: 'SpotBugs',
            ruleId: 'ES_COMPARING_STRINGS_WITH_EQ',
            detection_source: 'SpotBugs (ES_COMPARING_STRINGS_WITH_EQ)',
            confidence: 'HIGH'
          });
        }
      }

      // ----------------------------------------------------------------------
      // C. SECURITY VULNERABILITIES
      // ----------------------------------------------------------------------

      // 1. SQL Injection via Statement / PreparedStatement concatenation
      if (
        (/\.executeQuery\s*\(\s*["'].*?\+/i.test(clean) ||
          /\.executeUpdate\s*\(\s*["'].*?\+/i.test(clean) ||
          /\.execute\s*\(\s*["'].*?\+/i.test(clean) ||
          /createQuery\s*\(\s*["'].*?\+/i.test(clean) ||
          /createNativeQuery\s*\(\s*["'].*?\+/i.test(clean)) &&
        /SELECT|INSERT|UPDATE|DELETE|FROM|WHERE/i.test(clean)
      ) {
        rawFindings.push({
          id: `java_sec_sqli_${lineNum}`,
          language: 'java',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'SQL Injection Vulnerability (Concatenated JDBC Query)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Concatenating untrusted variables directly into raw SQL queries creates severe SQL Injection vulnerabilities.',
          recommendedFix: 'Use PreparedStatement with parameterized placeholders (?) instead of dynamic string concatenation.',
          recommended_fix: 'Use PreparedStatement with parameterized placeholders (?) instead of dynamic string concatenation.',
          source: 'SpotBugs',
          ruleId: 'SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE',
          detection_source: 'SpotBugs Security (SQL_NONCONSTANT_STRING_PASSED_TO_EXECUTE)',
          confidence: 'HIGH'
        });
      }

      // 2. Command Injection / Unsafe Runtime.exec() / ProcessBuilder
      if (/Runtime\.getRuntime\(\)\.exec\s*\(/i.test(clean) || /new\s+ProcessBuilder\s*\(/i.test(clean)) {
        rawFindings.push({
          id: `java_sec_cmd_exec_${lineNum}`,
          language: 'java',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Command Injection / Unsafe OS Process Execution',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Executing system commands via Runtime.getRuntime().exec() or ProcessBuilder with concatenated parameters allows arbitrary OS Command Injection.',
          recommendedFix: 'Avoid invoking OS commands directly. If necessary, use ProcessBuilder with strict argument array separation and input whitelisting.',
          recommended_fix: 'Avoid invoking OS commands directly. If necessary, use ProcessBuilder with strict argument array separation and input whitelisting.',
          source: 'SpotBugs',
          ruleId: 'COMMAND_INJECTION',
          detection_source: 'SpotBugs / PMD Security Rules',
          confidence: 'HIGH'
        });
      }

      // 3. Unsafe Deserialization (ObjectInputStream.readObject / XMLDecoder)
      if (/\.readObject\s*\(\s*\)/.test(clean) && (/ObjectInputStream/i.test(code) || /XMLDecoder/i.test(code))) {
        rawFindings.push({
          id: `java_sec_deserialization_${lineNum}`,
          language: 'java',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Unsafe Deserialization (ObjectInputStream.readObject / XMLDecoder)',
          line: lineNum,
          column: clean.indexOf('readObject') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Deserializing untrusted byte streams using ObjectInputStream.readObject() allows arbitrary Remote Code Execution (RCE) via gadget chains.',
          recommendedFix: 'Use safe serialization formats such as JSON (Jackson / Gson) or implement ObjectInputFilter (JEP 290) to whitelist permitted classes.',
          recommended_fix: 'Use safe serialization formats such as JSON (Jackson / Gson) or implement ObjectInputFilter (JEP 290) to whitelist permitted classes.',
          source: 'SpotBugs',
          ruleId: 'OBJECT_DESERIALIZATION',
          detection_source: 'SpotBugs Security (OBJECT_DESERIALIZATION)',
          confidence: 'HIGH'
        });
      }

      // 4. Weak Cryptography (MD5, SHA-1, DES, ECB Cipher mode)
      const weakCryptoMatch = clean.match(/MessageDigest\.getInstance\s*\(\s*["'](MD5|SHA-1|SHA1)["']\s*\)/i);
      if (weakCryptoMatch) {
        rawFindings.push({
          id: `java_sec_weak_hash_${lineNum}`,
          language: 'java',
          category: 'SECURITY_ISSUES',
          severity: 'HIGH',
          title: `Weak Cryptographic Hash Algorithm: ${weakCryptoMatch[1].toUpperCase()}`,
          line: lineNum,
          column: clean.indexOf('getInstance') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: `${weakCryptoMatch[1].toUpperCase()} is cryptographically broken and vulnerable to collision attacks. It must not be used for security or hashing sensitive data.`,
          recommendedFix: 'Use secure hashing algorithms such as SHA-256 (MessageDigest.getInstance("SHA-256")) or password hashing functions like Argon2 / BCrypt.',
          recommended_fix: 'Use secure hashing algorithms such as SHA-256 (MessageDigest.getInstance("SHA-256")) or password hashing functions like Argon2 / BCrypt.',
          source: 'SpotBugs',
          ruleId: 'WEAK_MESSAGE_DIGEST_MD5',
          detection_source: 'SpotBugs Security (WEAK_MESSAGE_DIGEST)',
          confidence: 'HIGH'
        });
      }

      const weakCipherMatch = clean.match(/Cipher\.getInstance\s*\(\s*["']([^"']+)["']\s*\)/i);
      if (weakCipherMatch) {
        const cipherName = weakCipherMatch[1];
        if (/DES\b|DESede\b|RC4\b|ECB/i.test(cipherName)) {
          rawFindings.push({
            id: `java_sec_weak_cipher_${lineNum}`,
            language: 'java',
            category: 'SECURITY_ISSUES',
            severity: 'CRITICAL',
            title: `Insecure Encryption Cipher / Mode: ${cipherName}`,
            line: lineNum,
            column: clean.indexOf('getInstance') + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `The cipher configuration '${cipherName}' uses a broken algorithm (DES) or insecure Electronic Codebook (ECB) mode, which leaks plaintext patterns.`,
            recommendedFix: 'Use AES in GCM mode: Cipher.getInstance("AES/GCM/NoPadding") with a secure Initialization Vector (IV).',
            recommended_fix: 'Use AES in GCM mode: Cipher.getInstance("AES/GCM/NoPadding") with a secure Initialization Vector (IV).',
            source: 'SpotBugs',
            ruleId: 'CIPHER_INTEGRITY',
            detection_source: 'SpotBugs Security (CIPHER_INTEGRITY)',
            confidence: 'HIGH'
          });
        }
      }

      // 5. Insecure Random Number Generation
      if (/new\s+Random\s*\(\s*\)/.test(clean) && /(?:token|password|secret|key|salt|nonce|session)/i.test(code)) {
        rawFindings.push({
          id: `java_sec_insecure_random_${lineNum}`,
          language: 'java',
          category: 'SECURITY_ISSUES',
          severity: 'HIGH',
          title: 'Insecure Random Number Generator (java.util.Random used for security tokens)',
          line: lineNum,
          column: clean.indexOf('Random') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'java.util.Random uses a linear congruential formula that is predictable. It is not cryptographically secure.',
          recommendedFix: 'Use java.security.SecureRandom for generating tokens, passwords, and cryptographic keys.',
          recommended_fix: 'Use java.security.SecureRandom for generating tokens, passwords, and cryptographic keys.',
          source: 'SpotBugs',
          ruleId: 'PREDICTABLE_RANDOM',
          detection_source: 'SpotBugs Security (PREDICTABLE_RANDOM)',
          confidence: 'HIGH'
        });
      }

      // 6. Hardcoded Credentials / Passwords / API Keys
      if (/(?:password|secretKey|apiKey|authToken|jwtSecret|user_password|db_pass)\s*=\s*["'][^"']{4,}["']/i.test(clean)) {
        rawFindings.push({
          id: `java_sec_secret_${lineNum}`,
          language: 'java',
          category: 'SECURITY_ISSUES',
          severity: 'HIGH',
          title: 'Hardcoded Secret / Password in Source Code',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Hardcoding secrets, API keys, or passwords inside Java source files risks exposing credentials in version control.',
          recommendedFix: 'Externalize credentials using environment variables (System.getenv("API_KEY")) or a secrets vault.',
          recommended_fix: 'Externalize credentials using environment variables (System.getenv("API_KEY")) or a secrets vault.',
          source: 'PMD',
          ruleId: 'HardCodedCryptoKey',
          detection_source: 'PMD Security Rules (HardCodedCryptoKey)',
          confidence: 'HIGH'
        });
      }

      // 7. Path Traversal in File Operations
      if (
        (/new\s+(?:File|FileInputStream|FileOutputStream|FileReader|FileWriter)\s*\(/i.test(clean) ||
          /Paths\.get\s*\(/i.test(clean)) &&
        /(?:request|userInput|param|path|\+)/i.test(clean) &&
        !clean.includes('new File("static') &&
        !clean.includes('new File("src')
      ) {
        if (clean.includes('+')) {
          rawFindings.push({
            id: `java_sec_path_traversal_${lineNum}`,
            language: 'java',
            category: 'SECURITY_ISSUES',
            severity: 'HIGH',
            title: 'Potential Path Traversal in File Construction',
            line: lineNum,
            column: 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: 'Constructing File paths using dynamic string concatenation allows Path Traversal attacks (e.g. "../../../etc/passwd").',
            recommendedFix: 'Validate and canonicalize file paths with Path.normalize() and ensure the target file resides within the intended base directory.',
            recommended_fix: 'Validate and canonicalize file paths with Path.normalize() and ensure the target file resides within the intended base directory.',
            source: 'SpotBugs',
            ruleId: 'PATH_TRAVERSAL_IN',
            detection_source: 'SpotBugs Security (PATH_TRAVERSAL_IN)',
            confidence: 'HIGH'
          });
        }
      }

      // 8. XXE Vulnerability (XML Parsers)
      if (/DocumentBuilderFactory\.newInstance\s*\(\s*\)/i.test(clean) || /SAXParserFactory\.newInstance\s*\(\s*\)/i.test(clean)) {
        if (!code.includes('disallow-doctype-decl')) {
          rawFindings.push({
            id: `java_sec_xxe_${lineNum}`,
            language: 'java',
            category: 'SECURITY_ISSUES',
            severity: 'HIGH',
            title: 'XML External Entity (XXE) Vulnerability',
            line: lineNum,
            column: 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: 'XML parser instantiated without disabling external entity resolution (DOCTYPE / external entities), leaving the application vulnerable to XXE attacks.',
            recommendedFix: 'Disable DTD processing: factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);',
            recommended_fix: 'Disable DTD processing: factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);',
            source: 'SpotBugs',
            ruleId: 'XXE_DOCUMENT',
            detection_source: 'SpotBugs Security (XXE_DOCUMENT)',
            confidence: 'HIGH'
          });
        }
      }

      // ----------------------------------------------------------------------
      // D. CODE QUALITY & BEST PRACTICES
      // ----------------------------------------------------------------------

      // 1. Empty Catch Block
      if (/catch\s*\([^)]+\)\s*\{\s*\}/.test(clean) || (clean.startsWith('catch') && clean.endsWith('{') && (sourceLines[idx + 1] || '').trim() === '}')) {
        rawFindings.push({
          id: `java_qual_empty_catch_${lineNum}`,
          language: 'java',
          category: 'CODE_QUALITY',
          severity: 'MEDIUM',
          title: 'Empty Catch Block (Exception Swallowed)',
          line: lineNum,
          column: clean.indexOf('catch') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Empty catch blocks silently suppress exceptions, hiding runtime errors, null pointers, or I/O failures and complicating debugging.',
          recommendedFix: 'Log the exception (e.g. logger.error("Operation failed", e)) or handle the recovery flow appropriately.',
          recommended_fix: 'Log the exception (e.g. logger.error("Operation failed", e)) or handle the recovery flow appropriately.',
          source: 'PMD',
          ruleId: 'EmptyCatchBlock',
          detection_source: 'PMD Rules (EmptyCatchBlock)',
          confidence: 'HIGH'
        });
      }

      // 2. Resource Leak: Unclosed I/O Stream or Database Connection
      for (const [varName, info] of openedResources.entries()) {
        if (info.line === lineNum && !closedResources.has(varName)) {
          rawFindings.push({
            id: `java_qual_resource_leak_${lineNum}`,
            language: 'java',
            category: 'CODE_QUALITY',
            severity: 'HIGH',
            title: `Potential Resource Leak: '${varName}' (${info.type}) is never closed`,
            line: lineNum,
            column: clean.indexOf(varName) + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Resource '${varName}' of type '${info.type}' is opened outside of try-with-resources and is never closed, leading to file descriptor or connection exhaustion.`,
            recommendedFix: `Use Java try-with-resources: 'try (${info.type} ${varName} = new ${info.type}(...)) { ... }' to ensure automatic cleanup.`,
            recommended_fix: `Use Java try-with-resources: 'try (${info.type} ${varName} = new ${info.type}(...)) { ... }' to ensure automatic cleanup.`,
            source: 'SpotBugs',
            ruleId: 'OBL_UNSATISFIED_OBLIGATION',
            detection_source: 'SpotBugs (OBL_UNSATISFIED_OBLIGATION)',
            confidence: 'HIGH'
          });
        }
      }

      // ----------------------------------------------------------------------
      // E. PERFORMANCE CHECKS
      // ----------------------------------------------------------------------

      // 1. String Concatenation in Loops (+ or += inside for/while)
      if (/(?:for|while)\s*\(/.test(clean)) {
        for (let j = idx + 1; j < Math.min(sourceLines.length, idx + 15); j++) {
          const loopLine = sourceLines[j].trim();
          if (/([a-zA-Z0-9_]+)\s*\+=\s*(?:[a-zA-Z0-9_"]+)/.test(loopLine) || /([a-zA-Z0-9_]+)\s*=\s*\1\s*\+\s*/.test(loopLine)) {
            rawFindings.push({
              id: `java_perf_str_concat_${j + 1}`,
              language: 'java',
              category: 'PERFORMANCE',
              severity: 'LOW',
              title: 'Inefficient String Concatenation Inside Loop',
              line: j + 1,
              column: 1,
              problematicCode: loopLine,
              problematic_code: loopLine,
              explanation: 'Concatenating Strings inside a loop creates a new String and StringBuilder instance per iteration, resulting in O(N²) memory copying.',
              recommendedFix: 'Instantiate a StringBuilder outside the loop and use .append() inside the loop body.',
              recommended_fix: 'Instantiate a StringBuilder outside the loop and use .append() inside the loop body.',
              source: 'SpotBugs',
              ruleId: 'SBSC_USE_STRINGBUFFER_CONCATENATION',
              detection_source: 'SpotBugs Performance (SBSC_USE_STRINGBUFFER_CONCATENATION)',
              confidence: 'HIGH'
            });
            break;
          }
          if (loopLine.includes('}')) break;
        }
      }

      // 2. Inefficient Legacy Collection Usage (Vector, Hashtable)
      if (/new\s+Vector\s*<.*?>\s*\(/.test(clean)) {
        rawFindings.push({
          id: `java_perf_vector_${lineNum}`,
          language: 'java',
          category: 'PERFORMANCE',
          severity: 'LOW',
          title: 'Legacy Synchronized Collection: Vector used instead of ArrayList',
          line: lineNum,
          column: clean.indexOf('Vector') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Vector synchronizes every single method invocation, introducing unnecessary lock contention overhead in single-threaded contexts.',
          recommendedFix: 'Use ArrayList instead of Vector for unsynchronized collections.',
          recommended_fix: 'Use ArrayList instead of Vector for unsynchronized collections.',
          source: 'PMD',
          ruleId: 'UseArrayListInsteadOfVector',
          detection_source: 'PMD Performance Rules',
          confidence: 'HIGH'
        });
      }
    });

    const isolatedFindings = deduplicateAndIsolateFindings(rawFindings, 'java');

    return {
      status: 'FULLY_SUPPORTED',
      message: javaInstalled
        ? 'Java 21 (javac -Xlint:all + SpotBugs/PMD Rules)'
        : 'Java Static Semantic, Security & PMD Engine',
      findings: isolatedFindings
    };
  }
}
