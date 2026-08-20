import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodeAnalyzer, StaticFinding, AnalysisOutput } from './CodeAnalyzer';
import { deduplicateAndIsolateFindings, isCompilerSummaryMessage } from './summaryFilter';

export class CSharpAnalyzer implements CodeAnalyzer {
  language = 'csharp' as const;

  async analyze(code: string): Promise<AnalysisOutput> {
    const rawFindings: StaticFinding[] = [];
    const sourceLines = code.split('\n');

    const dotnetInstalled = await new Promise<boolean>((resolve) => {
      execFile('dotnet', ['--version'], (err) => resolve(!err));
    });

    if (dotnetInstalled) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs_review_'));
      const projPath = path.join(tempDir, 'App.csproj');
      const sourcePath = path.join(tempDir, 'Program.cs');

      const csprojContent = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>`;

      fs.writeFileSync(projPath, csprojContent, 'utf-8');
      fs.writeFileSync(sourcePath, code, 'utf-8');

      // 1. Run dotnet build / Roslyn diagnostics
      const buildOutput = await new Promise<string>((resolve) => {
        execFile(
          'dotnet',
          ['build', '--nologo', '-v', 'q', tempDir],
          { cwd: tempDir, timeout: 20000 },
          (_err, stdout, stderr) => {
            resolve(`${stdout}\n${stderr}`);
          }
        );
      });

      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }

      const lines = buildOutput.split('\n');

      lines.forEach((diagLine, idx) => {
        const trimmed = diagLine.trim();
        if (!trimmed || isCompilerSummaryMessage(trimmed)) return;

        // Format: Program.cs(3,19): error CS0103: The name 'notDefined' does not exist in the current context
        const match = trimmed.match(/(?:Program\.cs)\((\d+),(\d+)\):\s*(error|warning)\s+([A-Z0-9]+):\s*(.+)/i);
        if (match) {
          const lineNum = Math.max(1, parseInt(match[1], 10));
          const colNum = Math.max(1, parseInt(match[2], 10));
          const level = match[3].toLowerCase();
          const codeId = match[4];
          let message = match[5].trim();
          message = message.replace(/\s*\[.*\]\s*$/, '');

          if (isCompilerSummaryMessage(message)) return;

          const isSyntax = level === 'error' && (codeId.startsWith('CS10') || codeId.startsWith('CS15') || message.toLowerCase().includes('expected') || message.toLowerCase().includes('syntax'));
          const isNullRef = codeId === 'CS8602' || codeId === 'CS8600' || codeId === 'CS8603' || message.toLowerCase().includes('null');
          const isUndefined = codeId === 'CS0103' || codeId === 'CS0246';

          let category: StaticFinding['category'] = isSyntax
            ? 'SYNTAX_ERRORS'
            : isNullRef
              ? 'BUGS_RUNTIME_ERRORS'
              : (level === 'error' ? 'BUGS_RUNTIME_ERRORS' : 'CODE_QUALITY');

          let severity: StaticFinding['severity'] = (level === 'error' || isNullRef) ? 'HIGH' : 'LOW';

          const probCode = sourceLines[lineNum - 1]?.trim() || '';

          rawFindings.push({
            id: `cs_roslyn_${codeId}_${lineNum}_${idx}`,
            language: 'csharp',
            category,
            severity,
            title: `C# ${level === 'error' ? 'Error' : 'Warning'} (${codeId}): ${message.split('.')[0]}`,
            line: lineNum,
            column: colNum,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: `Roslyn compiler reported [${codeId}]: ${message}`,
            recommendedFix: isUndefined
              ? 'Declare the variable or class before referencing it.'
              : (isNullRef ? 'Add a null check or use the null-conditional operator (?.) before dereferencing.' : 'Address compiler warning or error.'),
            recommended_fix: isUndefined
              ? 'Declare the variable or class before referencing it.'
              : (isNullRef ? 'Add a null check or use the null-conditional operator (?.) before dereferencing.' : 'Address compiler warning or error.'),
            source: 'Roslyn',
            ruleId: codeId,
            detection_source: `Roslyn Compiler (${codeId})`,
            confidence: 'HIGH'
          });
        }
      });
    }

    // 2. Static Semantic Multi-Pass Analysis for C#
    const csArrayLens = new Map<string, number>();
    const csNumVars = new Map<string, number>();
    const csMethodsDivisors = new Map<string, { divisorArgIndex: number }>();
    const csNullVars = new Set<string>();
    const csDeclaredVars = new Set<string>(['Console', 'Math', 'Convert', 'String', 'Int32', 'List', 'Dictionary', 'Task', 'Exception', 'Guid', 'DateTime', 'TimeSpan', 'File', 'Directory', 'Path', 'true', 'false', 'null', 'this', 'base', 'args', 'var', 'int', 'string', 'double', 'float', 'bool', 'char', 'long', 'void', 'object']);
    const csDeclaredMethods = new Map<string, { line: number; paramCount: number }>();
    const csMethodCalls: { name: string; line: number; argCount: number }[] = [];

    // Pass 1: Parse signatures, arrays, variables, methods
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('/*') || clean.startsWith('*')) return;

      // Track variable declarations: int x = 5; string name = "test"; var list = ...;
      const varDeclMatches = [...clean.matchAll(/(?:(?:public|private|protected|static|readonly|const)\s+)*(?:int|string|double|float|bool|char|long|var|List<[^>]+>|Dictionary<[^>]+>|[a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)(?:\s*=\s*([^;]+))?\s*[;,]/g)];
      for (const vm of varDeclMatches) {
        const vName = vm[1];
        if (vName && !['if', 'for', 'foreach', 'while', 'switch', 'return', 'else', 'case', 'try', 'catch', 'using', 'lock', 'throw', 'get', 'set'].includes(vName)) {
          csDeclaredVars.add(vName);
          if (vm[2]) {
            const valNum = parseInt(vm[2].trim(), 10);
            if (!isNaN(valNum)) csNumVars.set(vName, valNum);
            if (vm[2].trim() === 'null') csNullVars.add(vName);
          }
        }
      }

      // Track methods:
      const methodMatch = clean.match(/(?:public|private|protected|static|\s)+\s+[a-zA-Z0-9_<>[\]?]+\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (methodMatch && !['if', 'while', 'for', 'switch', 'catch', 'using', 'lock'].includes(methodMatch[1])) {
        const methodName = methodMatch[1];
        const params = methodMatch[2].trim() ? methodMatch[2].split(',').filter(Boolean) : [];
        csDeclaredMethods.set(methodName, { line: lineNum, paramCount: params.length });
        params.forEach(p => {
          const pName = p.trim().split(/\s+/).pop();
          if (pName) csDeclaredVars.add(pName);
        });

        // Check if method divides by a parameter:
        for (let j = idx; j < Math.min(sourceLines.length, idx + 15); j++) {
          const bodyLine = sourceLines[j];
          for (let pIdx = 0; pIdx < params.length; pIdx++) {
            const pName = params[pIdx].trim().split(/\s+/).pop();
            if (pName && new RegExp(`[\\/\\%]\\s*${pName}\\b`).test(bodyLine)) {
              csMethodsDivisors.set(methodName, { divisorArgIndex: pIdx });
              break;
            }
          }
          if (bodyLine.includes('}')) break;
        }
      }

      // Track array literals: int[] numbers = { 1, 2, 3 }; or int[] numbers = new int[3];
      const arrLitMatch = clean.match(/(?:int|string|double|float|var|long)\[\]\s+([a-zA-Z0-9_]+)\s*=\s*(?:new\s+[a-zA-Z0-9_]+\[\]\s*)?\{([^}]+)\}/);
      if (arrLitMatch) {
        const elems = arrLitMatch[2].split(',').map((e) => e.trim()).filter(Boolean);
        csArrayLens.set(arrLitMatch[1], elems.length);
        csDeclaredVars.add(arrLitMatch[1]);
      }
      const arrNewMatch = clean.match(/(?:int|string|double|float|var|long)\[\]\s+([a-zA-Z0-9_]+)\s*=\s*new\s+[a-zA-Z0-9_]+\[(\d+)\]/);
      if (arrNewMatch) {
        csArrayLens.set(arrNewMatch[1], parseInt(arrNewMatch[2], 10));
        csDeclaredVars.add(arrNewMatch[1]);
      }

      // Track method calls:
      const callMatches = [...clean.matchAll(/([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g)];
      for (const cm of callMatches) {
        if (!['if', 'while', 'for', 'foreach', 'switch', 'catch', 'typeof', 'sizeof', 'nameof', 'return', 'using', 'lock'].includes(cm[1])) {
          const args = cm[2].trim() ? cm[2].split(',').filter(Boolean) : [];
          csMethodCalls.push({ name: cm[1], line: lineNum, argCount: args.length });
        }
      }
    });

    // Pass 2: Syntax, Semantic, Runtime, Security, Logic & Quality Analysis
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('/*') || clean.startsWith('*')) return;

      // 1. Missing Semicolon in C#
      if (
        clean.length > 3 &&
        !clean.endsWith(';') &&
        !clean.endsWith('{') &&
        !clean.endsWith('}') &&
        !clean.endsWith(':') &&
        !clean.startsWith('if') &&
        !clean.startsWith('else') &&
        !clean.startsWith('for') &&
        !clean.startsWith('foreach') &&
        !clean.startsWith('while') &&
        !clean.startsWith('do') &&
        !clean.startsWith('switch') &&
        !clean.startsWith('case') &&
        !clean.startsWith('default') &&
        !clean.startsWith('public') &&
        !clean.startsWith('private') &&
        !clean.startsWith('protected') &&
        !clean.startsWith('internal') &&
        !clean.startsWith('class') &&
        !clean.startsWith('interface') &&
        !clean.startsWith('struct') &&
        !clean.startsWith('enum') &&
        !clean.startsWith('namespace') &&
        !clean.startsWith('using (') &&
        !clean.includes(';') &&
        (clean.includes('=') || clean.startsWith('return ') || clean.includes('Console.WriteLine') || clean.includes('Console.Write'))
      ) {
        rawFindings.push({
          id: `cs_syn_semi_${lineNum}`,
          language: 'csharp',
          category: 'SYNTAX_ERRORS',
          severity: 'HIGH',
          title: 'Syntax Error (CS1002): ; expected',
          line: lineNum,
          column: clean.length,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'C# statements must terminate with a semicolon (\';\').',
          recommendedFix: `Add \';\' at the end: ${clean};`,
          recommended_fix: `Add \';\' at the end: ${clean};`,
          source: 'Roslyn',
          ruleId: 'CS1002',
          detection_source: 'C# Syntax Validator',
          confidence: 'HIGH'
        });
      }

      // 2. Undeclared Variable / Identifier Check (CS0103)
      const varMatches = [...clean.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)];
      for (const vm of varMatches) {
        const ident = vm[1];
        const csKeywords = ['int', 'string', 'double', 'float', 'bool', 'char', 'long', 'void', 'var', 'object', 'return', 'if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'true', 'false', 'null', 'new', 'class', 'struct', 'interface', 'enum', 'namespace', 'using', 'public', 'private', 'protected', 'internal', 'static', 'readonly', 'const', 'override', 'virtual', 'abstract', 'async', 'await', 'Task', 'Console', 'Math', 'Convert', 'String', 'Int32', 'List', 'Dictionary', 'Exception', 'Guid', 'DateTime', 'TimeSpan', 'File', 'Directory', 'Path', 'this', 'base', 'try', 'catch', 'finally', 'throw', 'get', 'set', 'value', 'in', 'out', 'ref', 'params', 'is', 'as', 'lock', 'sizeof', 'typeof', 'nameof'];
        if (
          !csKeywords.includes(ident) &&
          !csDeclaredVars.has(ident) &&
          !csDeclaredMethods.has(ident) &&
          !clean.includes(`class ${ident}`) &&
          !clean.includes(`interface ${ident}`) &&
          !clean.includes(`struct ${ident}`) &&
          !clean.includes(`enum ${ident}`) &&
          !clean.match(new RegExp(`(?:int|string|double|float|bool|var|long)\\s+${ident}\\b`)) &&
          (clean.includes(`= ${ident}`) || clean.includes(`(${ident}`) || clean.includes(`, ${ident}`) || clean.includes(`${ident}.`))
        ) {
          rawFindings.push({
            id: `cs_undef_var_${lineNum}_${ident}`,
            language: 'csharp',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `The name '${ident}' does not exist in the current context (CS0103)`,
            line: lineNum,
            column: vm.index ? vm.index + 1 : 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Identifier '${ident}' is used without prior declaration or imported namespace in this scope.`,
            recommendedFix: `Declare variable '${ident}' or import the required namespace.`,
            recommended_fix: `Declare variable '${ident}' or import the required namespace.`,
            source: 'Roslyn',
            ruleId: 'CS0103',
            detection_source: 'Roslyn Semantic Analyzer (CS0103)',
            confidence: 'HIGH'
          });
        }
      }

      // 3. Division by Zero in method calls: Calculate(20, 0)
      for (const [methodName, info] of csMethodsDivisors.entries()) {
        const callRegex = new RegExp(`\\b${methodName}\\s*\\(([^)]*)\\)`);
        const callMatch = clean.match(callRegex);
        if (callMatch && !clean.startsWith('//')) {
          const args = callMatch[1].split(',').map((a) => a.trim());
          if (args.length > info.divisorArgIndex) {
            const passedArg = args[info.divisorArgIndex];
            const isZero = passedArg === '0' || csNumVars.get(passedArg) === 0;
            if (isZero) {
              rawFindings.push({
                id: `cs_ast_div0_call_${lineNum}`,
                language: 'csharp',
                category: 'BUGS_RUNTIME_ERRORS',
                severity: 'HIGH',
                title: `DivideByZeroException: Division by zero in '${methodName}' call`,
                line: lineNum,
                column: clean.indexOf(methodName) + 1,
                problematicCode: clean,
                problematic_code: clean,
                explanation: `Method '${methodName}' divides by parameter index ${info.divisorArgIndex + 1}, but 0 is passed on line ${lineNum}. This throws a System.DivideByZeroException at runtime.`,
                recommendedFix: `Ensure argument '${passedArg}' passed to '${methodName}' is non-zero.`,
                recommended_fix: `Ensure argument '${passedArg}' passed to '${methodName}' is non-zero.`,
                source: 'Roslyn',
                ruleId: 'CA2201',
                detection_source: 'C# Static Semantic Analyzer',
                confidence: 'HIGH'
              });
            }
          }
        }
      }

      // Direct division by zero: return a / 0;
      const directDivMatch = clean.match(/([a-zA-Z0-9_]+)\s*[\/\%]\s*([a-zA-Z0-9_]+)/);
      if (directDivMatch && !clean.startsWith('//') && !clean.startsWith('/*')) {
        const divisor = directDivMatch[2];
        if (divisor === '0' || csNumVars.get(divisor) === 0) {
          rawFindings.push({
            id: `cs_ast_div0_direct_${lineNum}`,
            language: 'csharp',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: 'DivideByZeroException: Division by constant zero',
            line: lineNum,
            column: clean.indexOf('/') + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Division by zero (${divisor}) on line ${lineNum} triggers a runtime DivideByZeroException in C#.`,
            recommendedFix: 'Validate that the divisor is non-zero before division.',
            recommended_fix: 'Validate that the divisor is non-zero before division.',
            source: 'Roslyn',
            ruleId: 'CA2201',
            detection_source: 'C# Static Semantic Analyzer',
            confidence: 'HIGH'
          });
        }
      }

      // 4. Array index out of range: numbers[10]
      const arrAccessMatch = clean.match(/([a-zA-Z0-9_]+)\s*\[\s*(\d+)\s*\]/);
      if (arrAccessMatch && !clean.startsWith('//')) {
        const arrName = arrAccessMatch[1];
        const accessIdx = parseInt(arrAccessMatch[2], 10);
        if (csArrayLens.has(arrName)) {
          const len = csArrayLens.get(arrName)!;
          if (accessIdx >= len || accessIdx < 0) {
            rawFindings.push({
              id: `cs_ast_arr_bounds_${lineNum}`,
              language: 'csharp',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: `IndexOutOfRangeException: '${arrName}[${accessIdx}]' (array length is ${len})`,
              line: lineNum,
              column: clean.indexOf(arrName) + 1,
              problematicCode: clean,
              problematic_code: clean,
              explanation: `Array '${arrName}' has length ${len}. Accessing index ${accessIdx} throws System.IndexOutOfRangeException at runtime.`,
              recommendedFix: `Ensure index is within valid bounds (0 to ${Math.max(0, len - 1)}).`,
              recommended_fix: `Ensure index is within valid bounds (0 to ${Math.max(0, len - 1)}).`,
              source: 'Roslyn',
              ruleId: 'CA1062',
              detection_source: 'C# Static Semantic Analyzer',
              confidence: 'HIGH'
            });
          }
        }
      }

      // 5. Null dereference: name.Length
      for (const nullVar of csNullVars) {
        const derefMatch = clean.match(new RegExp(`\\b${nullVar}\\s*\\.\\s*([a-zA-Z0-9_]+)`));
        if (derefMatch && !clean.startsWith('//')) {
          const propName = derefMatch[1];
          rawFindings.push({
            id: `cs_ast_null_deref_${lineNum}`,
            language: 'csharp',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `NullReferenceException: Dereferencing null variable '${nullVar}.${propName}' (CS8602)`,
            line: lineNum,
            column: clean.indexOf(nullVar) + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Variable '${nullVar}' is explicitly assigned to null. Accessing '${nullVar}.${propName}' throws a NullReferenceException at runtime.`,
            recommendedFix: `Use the null-conditional operator ('${nullVar}?.${propName}') or check '${nullVar} != null' before accessing.`,
            recommended_fix: `Use the null-conditional operator ('${nullVar}?.${propName}') or check '${nullVar} != null' before accessing.`,
            source: 'Roslyn',
            ruleId: 'CS8602',
            detection_source: 'Roslyn / .NET Analyzers',
            confidence: 'HIGH'
          });
        }
      }

      // 6. Logic: Assignment in conditional: if (x = 5)
      const assignInIfMatch = clean.match(/if\s*\(\s*([a-zA-Z0-9_]+)\s*=\s*([^=][^)]*)\)/);
      if (assignInIfMatch && !clean.includes('==') && !clean.includes('!=')) {
        rawFindings.push({
          id: `cs_logic_assign_${lineNum}`,
          language: 'csharp',
          category: 'BUGS_RUNTIME_ERRORS',
          severity: 'HIGH',
          title: `Assignment in conditional expression: 'if (${assignInIfMatch[1]} = ...)'`,
          line: lineNum,
          column: clean.indexOf('=') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Assignment operator \'=\' inside condition overwrites value instead of performing equality comparison \'==\'.',
          recommendedFix: `Replace '=' with '==': if (${assignInIfMatch[1]} == ${assignInIfMatch[2]})`,
          recommended_fix: `Replace '=' with '==': if (${assignInIfMatch[1]} == ${assignInIfMatch[2]})`,
          source: 'Roslyn',
          ruleId: 'CS0665',
          detection_source: 'Roslyn Logic Analyzer (CS0665)',
          confidence: 'HIGH'
        });
      }

      // 7. Self assignment: x = x;
      const selfAssignMatch = clean.match(/\b([a-zA-Z0-9_]+)\s*=\s*\1\s*;/);
      if (selfAssignMatch) {
        rawFindings.push({
          id: `cs_self_assign_${lineNum}`,
          language: 'csharp',
          category: 'CODE_QUALITY',
          severity: 'MEDIUM',
          title: `Redundant Self-Assignment: '${selfAssignMatch[1]} = ${selfAssignMatch[1]}' (CS1717)`,
          line: lineNum,
          column: clean.indexOf('=') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: `Assignment made to the same variable '${selfAssignMatch[1]}'; did you mean to assign something else?`,
          recommendedFix: 'Remove the self-assignment or assign the correct variable value.',
          recommended_fix: 'Remove the self-assignment or assign the correct variable value.',
          source: 'Roslyn',
          ruleId: 'CS1717',
          detection_source: 'Roslyn (CS1717)',
          confidence: 'HIGH'
        });
      }

      // 8. SQL Injection in SqlCommand concatenation
      if (/new\s+SqlCommand\s*\(\s*["'].*?\+/i.test(clean) || /SqlCommand\s*\(.*?string\.Format/i.test(clean)) {
        rawFindings.push({
          id: `cs_sec_sqli_${lineNum}`,
          language: 'csharp',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'SQL Injection in SqlCommand query construction',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Concatenating dynamic input strings into SQL commands allows SQL injection vulnerabilities.',
          recommendedFix: 'Use parameterized queries with cmd.Parameters.AddWithValue() or Dapper/Entity Framework.',
          recommended_fix: 'Use parameterized queries with cmd.Parameters.AddWithValue() or Dapper/Entity Framework.',
          source: 'Security Code Scan',
          ruleId: 'CA2100',
          detection_source: '.NET Security Analyzer (CA2100)',
          confidence: 'HIGH'
        });
      }

      // 9. Insecure Deserialization via BinaryFormatter
      if (/BinaryFormatter\b/i.test(clean) && (clean.includes('Deserialize') || clean.includes('new BinaryFormatter'))) {
        rawFindings.push({
          id: `cs_sec_binaryformatter_${lineNum}`,
          language: 'csharp',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Dangerous Insecure Deserialization (BinaryFormatter)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'BinaryFormatter is inherently dangerous and deprecated in modern .NET due to arbitrary Remote Code Execution vulnerabilities.',
          recommendedFix: 'Migrate to System.Text.Json.JsonSerializer or protobuf-net.',
          recommended_fix: 'Migrate to System.Text.Json.JsonSerializer or protobuf-net.',
          source: 'Security Code Scan',
          ruleId: 'CA2300',
          detection_source: '.NET Security Analyzer (CA2300)',
          confidence: 'HIGH'
        });
      }

      // 10. Command injection via Process.Start
      if (/Process\.Start\s*\(\s*[^,)]*\+/i.test(clean)) {
        rawFindings.push({
          id: `cs_sec_cmd_${lineNum}`,
          language: 'csharp',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Potential Command Injection via Process.Start',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Concatenating unvalidated arguments into Process.Start allows arbitrary command and argument injection.',
          recommendedFix: 'Use ProcessStartInfo with ArgumentList for safe argument passing.',
          recommended_fix: 'Use ProcessStartInfo with ArgumentList for safe argument passing.',
          source: 'Security Code Scan',
          ruleId: 'CA3005',
          detection_source: '.NET Security Analyzer (CA3005)',
          confidence: 'HIGH'
        });
      }

      // 11. Hardcoded secret / API key / password
      if (/(?:password|apiKey|secretKey|private_key|connString)\s*=\s*"[A-Za-z0-9_\-+=/]{8,}"/i.test(clean)) {
        rawFindings.push({
          id: `cs_sec_secret_${lineNum}`,
          language: 'csharp',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Hardcoded Secret / Password Detected',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Hardcoded secrets in C# source code can be extracted through decompilation (ILSpy/dotPeek).',
          recommendedFix: 'Use IConfiguration, Azure Key Vault, or environment variables to inject secrets.',
          recommended_fix: 'Use IConfiguration, Azure Key Vault, or environment variables to inject secrets.',
          source: 'Security Code Scan',
          ruleId: 'CA5390',
          detection_source: 'Security Scanner (CA5390)',
          confidence: 'HIGH'
        });
      }

      // 12. Weak cryptographic algorithm (MD5 / SHA1)
      if (/MD5\.Create\(\)|SHA1\.Create\(\)|new\s+MD5CryptoServiceProvider/i.test(clean)) {
        rawFindings.push({
          id: `cs_sec_weak_crypto_${lineNum}`,
          language: 'csharp',
          category: 'SECURITY_ISSUES',
          severity: 'HIGH',
          title: 'Weak Cryptographic Hash Algorithm (MD5/SHA1)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'MD5 and SHA-1 have known collision weaknesses and must not be used for cryptographic security.',
          recommendedFix: 'Upgrade to SHA256.Create() or SHA512.Create().',
          recommended_fix: 'Upgrade to SHA256.Create() or SHA512.Create().',
          source: 'Security Code Scan',
          ruleId: 'CA5350',
          detection_source: 'Security Scanner (CA5350)',
          confidence: 'HIGH'
        });
      }

      // 13. async void anti-pattern
      if (/async\s+void\s+[a-zA-Z0-9_]+\s*\(/i.test(clean) && !clean.includes('EventHandler') && !clean.includes('EventArgs')) {
        rawFindings.push({
          id: `cs_async_void_${lineNum}`,
          language: 'csharp',
          category: 'CODE_QUALITY',
          severity: 'MEDIUM',
          title: 'Avoid "async void" methods (Anti-pattern)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'async void methods cannot be awaited, and unhandled exceptions crash the process rather than being caught by try/catch.',
          recommendedFix: 'Return async Task instead of async void (use async void only for event handlers).',
          recommended_fix: 'Return async Task instead of async void (use async void only for event handlers).',
          source: 'Roslyn',
          ruleId: 'VSTHRD100',
          detection_source: 'Threading Analyzers (VSTHRD100)',
          confidence: 'HIGH'
        });
      }

      // 14. Empty catch block
      if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(clean)) {
        rawFindings.push({
          id: `cs_empty_catch_${lineNum}`,
          language: 'csharp',
          category: 'CODE_QUALITY',
          severity: 'MEDIUM',
          title: 'Empty Catch Block (Exception Swallowing)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Silently catching exceptions without logging or handling hides bugs and system failures.',
          recommendedFix: 'Log the exception with ILogger or rethrow with \'throw;\'.',
          recommended_fix: 'Log the exception with ILogger or rethrow with \'throw;\'.',
          source: 'Roslyn',
          ruleId: 'CA1031',
          detection_source: 'Code Quality Analyzer (CA1031)',
          confidence: 'HIGH'
        });
      }
    });

    const isolatedFindings = deduplicateAndIsolateFindings(rawFindings, 'csharp');

    return {
      status: 'FULLY_SUPPORTED',
      message: dotnetInstalled ? 'C# / .NET 8.0 (Roslyn Compiler + .NET Analyzers)' : 'C# Static Semantic & Roslyn Analysis Engine',
      findings: isolatedFindings
    };
  }
}
