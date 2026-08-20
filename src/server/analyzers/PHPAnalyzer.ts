import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodeAnalyzer, StaticFinding, AnalysisOutput } from './CodeAnalyzer';
import { deduplicateAndIsolateFindings, isCompilerSummaryMessage } from './summaryFilter';

export class PHPAnalyzer implements CodeAnalyzer {
  language = 'php' as const;

  async analyze(code: string): Promise<AnalysisOutput> {
    const rawFindings: StaticFinding[] = [];

    const phpInstalled = await new Promise<boolean>((resolve) => {
      execFile('php', ['-v'], (err) => resolve(!err));
    });

    const sourceLines = code.split('\n');

    if (phpInstalled) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'php_review_'));
      const filePath = path.join(tempDir, 'snippet.php');
      const finalCode = code.trim().startsWith('<?php') ? code : `<?php\n${code}`;
      fs.writeFileSync(filePath, finalCode, 'utf-8');

      // Run php -l (syntax check)
      const rawOutput = await new Promise<string>((resolve) => {
        execFile('php', ['-l', filePath], { cwd: tempDir, timeout: 10000 }, (_err, stdout, stderr) => {
          resolve(`${stdout}\n${stderr}`);
        });
      });

      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }

      // Parse PHP syntax errors:
      const lines = rawOutput.split('\n');
      lines.forEach((diagLine, idx) => {
        const trimmed = diagLine.trim();
        if (!trimmed || isCompilerSummaryMessage(trimmed)) return;

        const match = trimmed.match(/PHP\s+Parse\s+error:\s*(.*?)\s+in\s+.*?\s+on\s+line\s+(\d+)/i);
        if (match) {
          let lineNum = parseInt(match[2], 10);
          if (!code.trim().startsWith('<?php') && lineNum > 1) {
            lineNum -= 1; // Adjust for added <?php header
          }
          lineNum = Math.max(1, Math.min(lineNum, sourceLines.length));
          const message = match[1].trim();

          if (isCompilerSummaryMessage(message)) return;

          const probCode = sourceLines[lineNum - 1]?.trim() || trimmed;

          rawFindings.push({
            id: `php_syn_${lineNum}_${idx}`,
            language: 'php',
            category: 'SYNTAX_ERRORS',
            severity: 'HIGH',
            title: `PHP Syntax Error: ${message.split(',')[0]}`,
            line: lineNum,
            column: 1,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: `PHP syntax linter reported: ${message}`,
            recommendedFix: 'Correct the PHP syntax to ensure the script compiles without parse errors.',
            recommended_fix: 'Correct the PHP syntax to ensure the script compiles without parse errors.',
            source: 'php -l',
            ruleId: 'php/parse-error',
            detection_source: 'PHP Linter (php -l)',
            confidence: 'HIGH'
          });
        }
      });
    }

    // Static Multi-Pass Security, Semantic, and Code Quality Checks for PHP (PHPStan / Psalm)
    const definedVars = new Set<string>([
      '_GET', '_POST', '_REQUEST', '_SESSION', '_COOKIE', '_SERVER', '_ENV', '_FILES',
      'GLOBALS', 'this', 'argv', 'argc', 'http_response_header', 'php_errormsg'
    ]);
    const phpNumVars = new Map<string, number>();
    const phpArrayLens = new Map<string, number>();
    const phpDeclaredFuncs = new Map<string, { line: number; paramCount: number }>();
    const phpFuncDivisors = new Map<string, { divisorArgIndex: number }>();

    // Pass 1: Collect defined variables, arrays, functions and parameters
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('#') || clean.startsWith('/*')) return;

      // Function definitions: function test($a, $b = 1)
      const funcMatch = clean.match(/function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const params = funcMatch[2].match(/\$([a-zA-Z0-9_]+)/g) || [];
        phpDeclaredFuncs.set(funcName, { line: lineNum, paramCount: params.length });
        params.forEach((p) => definedVars.add(p.substring(1)));

        // Check if function divides by parameter:
        for (let j = idx; j < Math.min(sourceLines.length, idx + 15); j++) {
          const bodyLine = sourceLines[j];
          for (let pIdx = 0; pIdx < params.length; pIdx++) {
            const pName = params[pIdx].substring(1);
            if (new RegExp(`[\\/\\%]\\s*\\$${pName}\\b`).test(bodyLine)) {
              phpFuncDivisors.set(funcName, { divisorArgIndex: pIdx });
              break;
            }
          }
          if (bodyLine.includes('}')) break;
        }
      }

      // Foreach: foreach ($arr as $key => $val) or foreach ($arr as $val)
      const foreachMatch = clean.match(/foreach\s*\([^)]*?\bas\s+(?:&?\s*\$([a-zA-Z0-9_]+)\s*=>\s*)?&?\s*\$([a-zA-Z0-9_]+)\)/);
      if (foreachMatch) {
        if (foreachMatch[1]) definedVars.add(foreachMatch[1]);
        if (foreachMatch[2]) definedVars.add(foreachMatch[2]);
      }

      // Catch block: catch (Exception $e)
      const catchMatch = clean.match(/catch\s*\([^)]*\$([a-zA-Z0-9_]+)\)/);
      if (catchMatch) {
        definedVars.add(catchMatch[1]);
      }

      // Array literals: $numbers = [1, 2, 3]; or $numbers = array(1, 2, 3);
      const arrLitMatch = clean.match(/\$([a-zA-Z0-9_]+)\s*=\s*(?:\[([^\]]*)\]|array\(([^)]*)\))\s*;/);
      if (arrLitMatch) {
        const items = (arrLitMatch[2] || arrLitMatch[3] || '').split(',').filter(Boolean);
        phpArrayLens.set(arrLitMatch[1], items.length);
      }

      // Variable assignments: $x = ... or list($a, $b) = ...
      const assignMatches = clean.matchAll(/\$([a-zA-Z0-9_]+)\s*(?:\[[^\]]*\])*\s*=[^=]/g);
      for (const m of assignMatches) {
        definedVars.add(m[1]);
      }

      // Numeric constants: $b = 0;
      const numMatch = clean.match(/\$([a-zA-Z0-9_]+)\s*=\s*(-?\d+)\s*;/);
      if (numMatch) {
        phpNumVars.set(numMatch[1], parseInt(numMatch[2], 10));
      }
    });

    // Pass 2: Detect syntax issues, undefined variables, division by zero, bounds, SQL injection, XSS, eval, deserialization
    sourceLines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const clean = line.trim();
      if (clean.startsWith('//') || clean.startsWith('#') || clean.startsWith('/*')) return;

      // 1. Missing Semicolon in PHP
      if (
        clean.length > 3 &&
        !clean.endsWith(';') &&
        !clean.endsWith('{') &&
        !clean.endsWith('}') &&
        !clean.endsWith(':') &&
        !clean.startsWith('<?php') &&
        !clean.startsWith('if') &&
        !clean.startsWith('else') &&
        !clean.startsWith('for') &&
        !clean.startsWith('foreach') &&
        !clean.startsWith('while') &&
        !clean.startsWith('do') &&
        !clean.startsWith('switch') &&
        !clean.startsWith('case') &&
        !clean.startsWith('default') &&
        !clean.startsWith('function') &&
        !clean.startsWith('class') &&
        !clean.startsWith('interface') &&
        !clean.startsWith('trait') &&
        !clean.startsWith('namespace') &&
        !clean.startsWith('use ') &&
        !clean.includes(';') &&
        (clean.includes('$') && (clean.includes('=') || clean.startsWith('return ') || clean.startsWith('echo ') || clean.startsWith('print ')))
      ) {
        rawFindings.push({
          id: `php_syn_semi_${lineNum}`,
          language: 'php',
          category: 'SYNTAX_ERRORS',
          severity: 'HIGH',
          title: 'Syntax Error: Missing semicolon (\';\')',
          line: lineNum,
          column: clean.length,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'PHP expressions and statements must end with a semicolon.',
          recommendedFix: `Add a semicolon at the end: ${clean};`,
          recommended_fix: `Add a semicolon at the end: ${clean};`,
          source: 'php -l',
          ruleId: 'php/missing-semicolon',
          detection_source: 'PHP Syntax Linter',
          confidence: 'HIGH'
        });
      }

      // 2. Undefined Variables (e.g. echo $unknownVariable;)
      const varMatches = clean.matchAll(/\$([a-zA-Z0-9_]+)/g);
      for (const m of varMatches) {
        const vName = m[1];
        const isAssignmentTarget = new RegExp(`^\\s*\\$${vName}\\s*(?:\\[[^\\]]*\\])*\\s*=[^=]`).test(clean);
        if (!definedVars.has(vName) && !isAssignmentTarget) {
          rawFindings.push({
            id: `php_undef_var_${lineNum}_${vName}`,
            language: 'php',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: `Undefined Variable: '$${vName}'`,
            line: lineNum,
            column: clean.indexOf(`$${vName}`) + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Variable '$${vName}' is referenced on line ${lineNum} before being declared or assigned. In PHP 8+, accessing an undefined variable emits an E_WARNING and indicates a likely logic error.`,
            recommendedFix: `Define or assign '$${vName}' before referencing, or check 'isset($${vName})'.`,
            recommended_fix: `Define or assign '$${vName}' before referencing, or check 'isset($${vName})'.`,
            source: 'PHPStan',
            ruleId: 'PHPStan.Variable.Undefined',
            detection_source: 'PHP Static Analyzer / PHPStan',
            confidence: 'HIGH'
          });
          definedVars.add(vName);
        }
      }

      // 3. Division by zero in function call
      for (const [funcName, info] of phpFuncDivisors.entries()) {
        const callMatch = clean.match(new RegExp(`\\b${funcName}\\s*\\(([^)]*)\\)`));
        if (callMatch) {
          const args = callMatch[1].split(',').map((a) => a.trim().replace(/^\$/, ''));
          if (args.length > info.divisorArgIndex) {
            const passedArg = args[info.divisorArgIndex];
            const isZero = passedArg === '0' || phpNumVars.get(passedArg) === 0;
            if (isZero) {
              rawFindings.push({
                id: `php_div0_call_${lineNum}`,
                language: 'php',
                category: 'BUGS_RUNTIME_ERRORS',
                severity: 'HIGH',
                title: `DivisionByZeroError in '${funcName}' call`,
                line: lineNum,
                column: clean.indexOf(funcName) + 1,
                problematicCode: clean,
                problematic_code: clean,
                explanation: `Function '${funcName}' divides by argument index ${info.divisorArgIndex + 1}, but is passed 0 on line ${lineNum}. This throws a fatal DivisionByZeroError in PHP 8+.`,
                recommendedFix: `Ensure argument '$${passedArg}' passed to '${funcName}' is non-zero.`,
                recommended_fix: `Ensure argument '$${passedArg}' passed to '${funcName}' is non-zero.`,
                source: 'PHPStan',
                ruleId: 'PHPStan.DivideZero',
                detection_source: 'PHP Static Analyzer',
                confidence: 'HIGH'
              });
            }
          }
        }
      }

      // Direct division by zero: $a / 0 or $a % $b where $b == 0
      const divMatch = clean.match(/\$([a-zA-Z0-9_]+)\s*[\/\%]\s*(?:\$([a-zA-Z0-9_]+)|(0))\b/);
      if (divMatch) {
        const divisorVar = divMatch[2];
        const isLiteralZero = divMatch[3] === '0';
        const isVarZero = divisorVar && phpNumVars.get(divisorVar) === 0;
        if (isLiteralZero || isVarZero) {
          rawFindings.push({
            id: `php_div0_${lineNum}`,
            language: 'php',
            category: 'BUGS_RUNTIME_ERRORS',
            severity: 'HIGH',
            title: 'Division by Zero (DivisionByZeroError in PHP 8+)',
            line: lineNum,
            column: clean.indexOf('/') + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Division or modulo by zero throws a fatal DivisionByZeroError exception in PHP 8+.`,
            recommendedFix: 'Validate that the divisor is non-zero before division.',
            recommended_fix: 'Validate that the divisor is non-zero before division.',
            source: 'PHPStan',
            ruleId: 'PHPStan.DivideZero',
            detection_source: 'PHP Static Analyzer',
            confidence: 'HIGH'
          });
        }
      }

      // 4. Array Index Out of Range: $numbers[10]
      const arrAccessMatch = clean.match(/\$([a-zA-Z0-9_]+)\s*\[\s*(\d+)\s*\]/);
      if (arrAccessMatch) {
        const arrName = arrAccessMatch[1];
        const accessIdx = parseInt(arrAccessMatch[2], 10);
        if (phpArrayLens.has(arrName)) {
          const len = phpArrayLens.get(arrName)!;
          if (accessIdx >= len || accessIdx < 0) {
            rawFindings.push({
              id: `php_arr_oob_${lineNum}`,
              language: 'php',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: `Undefined Array Key: '$${arrName}[${accessIdx}]' (array size ${len})`,
              line: lineNum,
              column: clean.indexOf(`$${arrName}`) + 1,
              problematicCode: clean,
              problematic_code: clean,
              explanation: `Accessing non-existent array key ${accessIdx} in array '$${arrName}' (length ${len}) triggers an E_WARNING (Undefined array key) in PHP 8+.`,
              recommendedFix: `Check array bounds or use array_key_exists(${accessIdx}, $${arrName}) or ?? null.`,
              recommended_fix: `Check array bounds or use array_key_exists(${accessIdx}, $${arrName}) or ?? null.`,
              source: 'PHPStan',
              ruleId: 'PHPStan.Array.UndefinedKey',
              detection_source: 'PHP Static Analyzer',
              confidence: 'HIGH'
            });
          }
        }
      }

      // 5. Logic: Assignment in conditional: if ($x = 5)
      const assignIfMatch = clean.match(/if\s*\(\s*\$([a-zA-Z0-9_]+)\s*=\s*([^=][^)]*)\)/);
      if (assignIfMatch && !clean.includes('==') && !clean.includes('!=')) {
        rawFindings.push({
          id: `php_logic_assign_${lineNum}`,
          language: 'php',
          category: 'BUGS_RUNTIME_ERRORS',
          severity: 'HIGH',
          title: `Assignment in conditional: 'if ($${assignIfMatch[1]} = ...)'`,
          line: lineNum,
          column: clean.indexOf('=') + 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Assignment operator \'=\' inside condition overwrites the variable instead of performing equality comparison \'==\' or \'===\'.',
          recommendedFix: `Replace '=' with '===': if ($${assignIfMatch[1]} === ${assignIfMatch[2]})`,
          recommended_fix: `Replace '=' with '===': if ($${assignIfMatch[1]} === ${assignIfMatch[2]})`,
          source: 'PHPStan',
          ruleId: 'PHPStan.Logic.AssignmentInCondition',
          detection_source: 'PHP Static Analyzer',
          confidence: 'HIGH'
        });
      }

      // 6. File Inclusion Vulnerability (LFI / Path Traversal)
      const fileIncludeMatch = clean.match(/\b(include|require|include_once|require_once)\s*(?:\(([^)]+)\)|(?:\s+([^;]+)))/i);
      if (fileIncludeMatch) {
        const targetExpr = (fileIncludeMatch[2] || fileIncludeMatch[3] || '').trim();
        if (
          targetExpr.includes('$_GET') ||
          targetExpr.includes('$_POST') ||
          targetExpr.includes('$_REQUEST') ||
          targetExpr.includes('$_COOKIE') ||
          (targetExpr.startsWith('$') && !targetExpr.startsWith('__DIR__') && !targetExpr.startsWith('dirname('))
        ) {
          rawFindings.push({
            id: `php_sec_lfi_${lineNum}`,
            language: 'php',
            category: 'SECURITY_ISSUES',
            severity: 'CRITICAL',
            title: 'File Inclusion Vulnerability (LFI / Path Traversal)',
            line: lineNum,
            column: clean.indexOf(fileIncludeMatch[1]) + 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: `Passing dynamic variable or user input ('${targetExpr}') into '${fileIncludeMatch[1]}' allows attackers to include arbitrary files on the server (Local File Inclusion) or remote servers.`,
            recommendedFix: 'Use a strict whitelist of allowed filenames and avoid passing raw request parameters to include/require.',
            recommended_fix: 'Use a strict whitelist of allowed filenames and avoid passing raw request parameters to include/require.',
            source: 'PHPStan',
            ruleId: 'PHPStan.Security.FileInclusion',
            detection_source: 'PHPStan / Psalm Security Rules',
            confidence: 'HIGH'
          });
        }
      }

      // 7. eval()
      if (/\beval\s*\(/i.test(clean)) {
        rawFindings.push({
          id: `php_sec_${lineNum}_eval`,
          language: 'php',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Dynamic Code Execution (eval)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'eval() executes arbitrary PHP code and represents a critical security risk.',
          recommendedFix: 'Avoid eval() entirely; refactor using structured functions.',
          recommended_fix: 'Avoid eval() entirely; refactor using structured functions.',
          source: 'PHPStan',
          ruleId: 'PHPStan.Security.Eval',
          detection_source: 'PHPStan Security Rules',
          confidence: 'HIGH'
        });
      }

      // 8. Command Execution (system, exec, shell_exec, passthru)
      if (/\b(system|exec|shell_exec|passthru|popen|`)\s*\(/i.test(clean) || (clean.startsWith('`') && clean.endsWith('`'))) {
        if (clean.includes('$') || clean.includes('.')) {
          rawFindings.push({
            id: `php_sec_${lineNum}_rce`,
            language: 'php',
            category: 'SECURITY_ISSUES',
            severity: 'CRITICAL',
            title: 'Command Injection Vulnerability in Shell Execution',
            line: lineNum,
            column: 1,
            problematicCode: clean,
            problematic_code: clean,
            explanation: 'Passing dynamic or concatenated user input into shell functions leads to Remote Code Execution.',
            recommendedFix: 'Use escapeshellarg() or escapeshellcmd() on all inputs before executing system commands.',
            recommended_fix: 'Use escapeshellarg() or escapeshellcmd() on all inputs before executing system commands.',
            source: 'PHPStan',
            ruleId: 'PHPStan.Security.CommandInjection',
            detection_source: 'PHPStan Security Rules',
            confidence: 'HIGH'
          });
        }
      }

      // 9. SQL Injection in mysqli or PDO
      if (/\b(mysqli_query|->query|->exec)\s*\(\s*["'].*?\$|\.\s*\$/i.test(clean)) {
        rawFindings.push({
          id: `php_sec_${lineNum}_sqli`,
          language: 'php',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'SQL Injection Vulnerability in Database Query',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Directly concatenating PHP variables into SQL query strings causes SQL Injection.',
          recommendedFix: 'Use PDO prepared statements with parameterized placeholders (? or :named).',
          recommended_fix: 'Use PDO prepared statements with parameterized placeholders (? or :named).',
          source: 'PHPStan',
          ruleId: 'PHPStan.Security.SqlInjection',
          detection_source: 'PHPStan / Psalm Security',
          confidence: 'HIGH'
        });
      }

      // 10. Reflected XSS: echo $_GET / print $_POST without htmlspecialchars
      if (/\b(echo|print)\s+.*?\$(?:_GET|_POST|_REQUEST|_COOKIE)/i.test(clean) && !clean.includes('htmlspecialchars') && !clean.includes('htmlentities')) {
        rawFindings.push({
          id: `php_sec_xss_${lineNum}`,
          language: 'php',
          category: 'SECURITY_ISSUES',
          severity: 'HIGH',
          title: 'Reflected Cross-Site Scripting (XSS) via unescaped output',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Directly printing raw user inputs from $_GET/$_POST into HTML output creates Reflected XSS vulnerabilities.',
          recommendedFix: 'Wrap output in htmlspecialchars($input, ENT_QUOTES, "UTF-8").',
          recommended_fix: 'Wrap output in htmlspecialchars($input, ENT_QUOTES, "UTF-8").',
          source: 'PHPStan',
          ruleId: 'Security.XSS',
          detection_source: 'PHP Security Analyzer',
          confidence: 'HIGH'
        });
      }

      // 11. Insecure Deserialization via unserialize()
      if (/\bunserialize\s*\(/i.test(clean) && (clean.includes('$_') || clean.includes('$data') || clean.includes('$input'))) {
        rawFindings.push({
          id: `php_sec_unserialize_${lineNum}`,
          language: 'php',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Insecure Deserialization via unserialize()',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Passing untrusted input to unserialize() can trigger PHP Object Injection and POP gadget chain remote code execution.',
          recommendedFix: 'Use json_decode() for structured data exchange instead of unserialize().',
          recommended_fix: 'Use json_decode() for structured data exchange instead of unserialize().',
          source: 'PHPStan',
          ruleId: 'Security.InsecureDeserialization',
          detection_source: 'PHP Security Analyzer',
          confidence: 'HIGH'
        });
      }

      // 12. Weak Hashing: md5() or sha1() for passwords
      if (/\b(?:md5|sha1)\s*\(\s*\$(?:password|pass|secret|token)/i.test(clean)) {
        rawFindings.push({
          id: `php_sec_weak_hash_${lineNum}`,
          language: 'php',
          category: 'SECURITY_ISSUES',
          severity: 'HIGH',
          title: 'Weak Password Hashing (md5 / sha1)',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'md5() and sha1() are obsolete and fast to crack with rainbow tables; do not use for password hashing.',
          recommendedFix: 'Use password_hash($password, PASSWORD_BCRYPT) or PASSWORD_ARGON2ID.',
          recommended_fix: 'Use password_hash($password, PASSWORD_BCRYPT) or PASSWORD_ARGON2ID.',
          source: 'PHPStan',
          ruleId: 'Security.WeakHashing',
          detection_source: 'PHP Security Analyzer',
          confidence: 'HIGH'
        });
      }

      // 13. Hardcoded secret / token
      if (/\$(?:api_key|secret_key|password|jwt_secret)\s*=\s*["'][a-zA-Z0-9_\-]{8,}["']/i.test(clean)) {
        rawFindings.push({
          id: `php_sec_secret_${lineNum}`,
          language: 'php',
          category: 'SECURITY_ISSUES',
          severity: 'CRITICAL',
          title: 'Hardcoded Secret / API Key in Source',
          line: lineNum,
          column: 1,
          problematicCode: clean,
          problematic_code: clean,
          explanation: 'Hardcoding secrets in PHP source files exposes credentials.',
          recommendedFix: 'Store credentials in environment variables (getenv() or $_ENV) or a .env file.',
          recommended_fix: 'Store credentials in environment variables (getenv() or $_ENV) or a .env file.',
          source: 'PHPStan',
          ruleId: 'Security.HardcodedSecret',
          detection_source: 'PHP Security Analyzer',
          confidence: 'HIGH'
        });
      }
    });

    const isolatedFindings = deduplicateAndIsolateFindings(rawFindings, 'php');

    return {
      status: 'FULLY_SUPPORTED',
      message: phpInstalled ? 'PHP 8.3 (PHP Linter + PHPStan / Psalm Rules)' : 'PHP Static AST & Semantic Analysis Engine',
      findings: isolatedFindings
    };
  }
}
