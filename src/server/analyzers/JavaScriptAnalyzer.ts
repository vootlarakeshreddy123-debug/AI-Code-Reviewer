import ts from 'typescript';
import { CodeAnalyzer, StaticFinding, AnalysisOutput } from './CodeAnalyzer';
import { deduplicateAndIsolateFindings } from './summaryFilter';

const JS_GLOBALS = new Set([
  'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date',
  'RegExp', 'Error', 'TypeError', 'SyntaxError', 'RangeError', 'ReferenceError',
  'Promise', 'Set', 'Map', 'WeakSet', 'WeakMap', 'Symbol', 'Reflect', 'Proxy',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'decodeURI', 'decodeURIComponent',
  'encodeURI', 'encodeURIComponent', 'process', 'require', 'module', 'exports',
  'global', 'globalThis', 'window', 'document', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'fetch', 'undefined', 'null', 'NaN', 'Infinity',
  'Buffer', '__dirname', '__filename', 'arguments', 'eval', 'escape', 'unescape'
]);

export class JavaScriptAnalyzer implements CodeAnalyzer {
  language = 'javascript' as const;

  async analyze(code: string): Promise<AnalysisOutput> {
    const rawFindings: StaticFinding[] = [];
    const lines = code.split('\n');

    // 1. TypeScript Transpiler / Syntactic Checker for JavaScript
    try {
      const transpileResult = ts.transpileModule(code, {
        compilerOptions: {
          target: ts.ScriptTarget.Latest,
          module: ts.ModuleKind.CommonJS,
          allowJs: true,
          checkJs: false,
          noEmit: false
        },
        reportDiagnostics: true
      });

      if (transpileResult.diagnostics && transpileResult.diagnostics.length > 0) {
        transpileResult.diagnostics.forEach((diag, idx) => {
          const lineAndChar = diag.file ? diag.file.getLineAndCharacterOfPosition(diag.start || 0) : { line: 0, character: 0 };
          const lineNum = Math.max(1, lineAndChar.line + 1);
          const colNum = Math.max(1, lineAndChar.character + 1);
          const probCode = lines[lineNum - 1]?.trim() || '';
          const message = typeof diag.messageText === 'string' ? diag.messageText : diag.messageText.messageText;

          rawFindings.push({
            id: `js_diag_${lineNum}_${idx}`,
            language: 'javascript',
            category: 'SYNTAX_ERRORS',
            severity: 'HIGH',
            title: `JavaScript Syntax Error: ${message.split('\n')[0]}`,
            line: lineNum,
            column: colNum,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: `JavaScript parser error (TS${diag.code}): ${message}`,
            recommendedFix: 'Correct JavaScript syntax to resolve parser error.',
            recommended_fix: 'Correct JavaScript syntax to resolve parser error.',
            source: 'ESLint',
            ruleId: 'no-syntax-error',
            detection_source: 'JavaScript Parser / Engine',
            confidence: 'HIGH'
          });
        });
      }
    } catch (e: any) {
      console.warn('JavaScript transpile error notice:', e);
    }

    // 2. Comprehensive AST Walk for JavaScript Node.js specific patterns
    try {
      const sourceFile = ts.createSourceFile('snippet.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      
      const assignedValues = new Map<string, any>();
      const nullOrUndefinedVars = new Map<string, 'null' | 'undefined'>();
      const arrayLengths = new Map<string, number>();
      const functionDivisors = new Map<string, { divisorParamIdx: number; paramNames: string[] }>();

      // Pass 1: Collect scopes, declarations, function signatures
      const declaredGlobals = new Set<string>(JS_GLOBALS);
      
      const collectDeclarations = (node: ts.Node) => {
        if (ts.isFunctionDeclaration(node) && node.name) {
          declaredGlobals.add(node.name.text);

          // Check if function divides by one of its parameters
          if (node.body && node.parameters.length > 0) {
            const paramNames = node.parameters.map((p) => p.name.getText(sourceFile));
            let divisorParamIdx = -1;

            const checkDiv = (inner: ts.Node) => {
              if (ts.isBinaryExpression(inner) && inner.operatorToken.kind === ts.SyntaxKind.SlashToken) {
                if (ts.isIdentifier(inner.right)) {
                  const rName = inner.right.text;
                  const pIdx = paramNames.indexOf(rName);
                  if (pIdx !== -1) {
                    divisorParamIdx = pIdx;
                  }
                }
              }
              ts.forEachChild(inner, checkDiv);
            };
            checkDiv(node.body);

            if (divisorParamIdx !== -1) {
              functionDivisors.set(node.name.text, { divisorParamIdx, paramNames });
            }
          }
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          declaredGlobals.add(node.name.text);
        }
        if (ts.isClassDeclaration(node) && node.name) {
          declaredGlobals.add(node.name.text);
        }
        ts.forEachChild(node, collectDeclarations);
      };
      collectDeclarations(sourceFile);

      // Pass 2: Analyze AST nodes
      const analyzeNode = (node: ts.Node, currentScope: Set<string>) => {
        let nodeScope = currentScope;

        // Function scope creation
        if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
          nodeScope = new Set(currentScope);
          node.parameters.forEach((param) => {
            if (ts.isIdentifier(param.name)) {
              nodeScope.add(param.name.text);
            }
          });
          // Also collect variables declared inside this function
          const collectLocals = (inner: ts.Node) => {
            if (ts.isVariableDeclaration(inner) && ts.isIdentifier(inner.name)) {
              nodeScope.add(inner.name.text);
            }
            if (ts.isFunctionDeclaration(inner) && inner.name) {
              nodeScope.add(inner.name.text);
            }
            if (ts.isCatchClause(inner) && inner.variableDeclaration && ts.isIdentifier(inner.variableDeclaration.name)) {
              nodeScope.add(inner.variableDeclaration.name.text);
            }
            if (!ts.isFunctionDeclaration(inner) && !ts.isFunctionExpression(inner) && !ts.isArrowFunction(inner)) {
              ts.forEachChild(inner, collectLocals);
            }
          };
          if (node.body) {
            collectLocals(node.body);
          }
        }

        // Track variable declarations and assignments
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          const varName = node.name.text;
          if (node.initializer) {
            if (ts.isNumericLiteral(node.initializer)) {
              assignedValues.set(varName, Number(node.initializer.text));
              nullOrUndefinedVars.delete(varName);
            } else if (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) {
              assignedValues.set(varName, node.initializer.text);
              nullOrUndefinedVars.delete(varName);
            } else if (node.initializer.kind === ts.SyntaxKind.NullKeyword) {
              nullOrUndefinedVars.set(varName, 'null');
            } else if (ts.isIdentifier(node.initializer) && node.initializer.text === 'undefined') {
              nullOrUndefinedVars.set(varName, 'undefined');
            } else if (ts.isArrayLiteralExpression(node.initializer)) {
              arrayLengths.set(varName, node.initializer.elements.length);
              nullOrUndefinedVars.delete(varName);
            }

            // Hardcoded Secret / Password Detection
            if (/password|secret_key|api_key|token|auth_token|jwt_secret/i.test(varName)) {
              if (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) {
                const val = node.initializer.text;
                if (val.length >= 4 && !val.startsWith('ENV_') && !val.startsWith('YOUR_')) {
                  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                  const lineNum = line + 1;
                  const probCode = lines[line]?.trim() || '';

                  rawFindings.push({
                    id: `js_ast_${lineNum}_secret`,
                    language: 'javascript',
                    category: 'SECURITY_ISSUES',
                    severity: 'HIGH',
                    title: 'Hardcoded Secret / Password Detected',
                    line: lineNum,
                    column: character + 1,
                    problematicCode: probCode,
                    problematic_code: probCode,
                    explanation: `Variable '${varName}' contains a plain-text credential or password on line ${lineNum}. Hardcoding secrets is a severe security hazard.`,
                    recommendedFix: 'Store credentials in environment variables (e.g., process.env.API_KEY) and access them securely.',
                    recommended_fix: 'Store credentials in environment variables (e.g., process.env.API_KEY) and access them securely.',
                    source: 'ESLint',
                    ruleId: 'no-hardcoded-credentials',
                    detection_source: 'ESLint Security (no-hardcoded-credentials)',
                    confidence: 'HIGH'
                  });
                }
              }
            }

            // SQL Injection Detection in string assignment
            const checkSqlInjection = (expr: ts.Expression) => {
              const exprText = expr.getText(sourceFile);
              if (/SELECT\s+.*FROM|INSERT\s+INTO|UPDATE\s+.*SET|DELETE\s+FROM/i.test(exprText) && (exprText.includes('+') || ts.isTemplateExpression(expr))) {
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                const lineNum = line + 1;
                const probCode = lines[line]?.trim() || '';

                rawFindings.push({
                  id: `js_ast_${lineNum}_sqli`,
                  language: 'javascript',
                  category: 'SECURITY_ISSUES',
                  severity: 'CRITICAL',
                  title: 'SQL Injection Vulnerability (Concatenated Query)',
                  line: lineNum,
                  column: character + 1,
                  problematicCode: probCode,
                  problematic_code: probCode,
                  explanation: 'Dynamic string concatenation in SQL statement allows SQL Injection attacks.',
                  recommendedFix: 'Use parameterized queries or prepared statements instead of string concatenation.',
                  recommended_fix: 'Use parameterized queries or prepared statements instead of string concatenation.',
                  source: 'ESLint',
                  ruleId: 'security/detect-sql-injection',
                  detection_source: 'ESLint Security (detect-sql-injection)',
                  confidence: 'HIGH'
                });
              }
            };
            checkSqlInjection(node.initializer);
          } else {
            nullOrUndefinedVars.set(varName, 'undefined');
          }
        }

        // Check for assignments (e.g. user = null)
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
          const varName = node.left.text;
          if (node.right.kind === ts.SyntaxKind.NullKeyword) {
            nullOrUndefinedVars.set(varName, 'null');
          } else if (ts.isIdentifier(node.right) && node.right.text === 'undefined') {
            nullOrUndefinedVars.set(varName, 'undefined');
          } else if (ts.isNumericLiteral(node.right)) {
            assignedValues.set(varName, Number(node.right.text));
            nullOrUndefinedVars.delete(varName);
          } else if (ts.isArrayLiteralExpression(node.right)) {
            arrayLengths.set(varName, node.right.elements.length);
            nullOrUndefinedVars.delete(varName);
          }
        }

        // Undefined variable detection (ReferenceError)
        if (ts.isIdentifier(node)) {
          const idName = node.text;
          const parent = node.parent;
          
          // Ensure node is being read/evaluated, not defined or a property access name
          const isDeclarationName = (parent && ts.isVariableDeclaration(parent) && parent.name === node) ||
            (parent && ts.isFunctionDeclaration(parent) && parent.name === node) ||
            (parent && ts.isParameter(parent) && parent.name === node) ||
            (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) ||
            (parent && ts.isPropertyAssignment(parent) && parent.name === node) ||
            (parent && ts.isMethodDeclaration(parent) && parent.name === node) ||
            (parent && ts.isCatchClause(parent));

          if (!isDeclarationName && !nodeScope.has(idName)) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            const lineNum = line + 1;
            const probCode = lines[line]?.trim() || '';

            rawFindings.push({
              id: `js_ast_${lineNum}_undef_${idName}`,
              language: 'javascript',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: `ReferenceError: ${idName} is not defined`,
              line: lineNum,
              column: character + 1,
              problematicCode: probCode,
              problematic_code: probCode,
              explanation: `Variable '${idName}' is referenced on line ${lineNum} before being declared or defined in scope. Accessing it throws ReferenceError at runtime.`,
              recommendedFix: `Declare '${idName}' (using const, let, or var) before referencing it.`,
              recommended_fix: `Declare '${idName}' (using const, let, or var) before referencing it.`,
              source: 'ESLint',
              ruleId: 'no-undef',
              detection_source: 'ESLint (no-undef)',
              confidence: 'HIGH'
            });
          }
        }

        // Null / Undefined Dereference
        if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
          if (ts.isIdentifier(node.expression)) {
            const baseVarName = node.expression.text;
            if (nullOrUndefinedVars.has(baseVarName)) {
              const state = nullOrUndefinedVars.get(baseVarName)!;
              const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
              const lineNum = line + 1;
              const probCode = lines[line]?.trim() || '';

              rawFindings.push({
                id: `js_ast_${lineNum}_null_deref`,
                language: 'javascript',
                category: 'BUGS_RUNTIME_ERRORS',
                severity: 'HIGH',
                title: `TypeError: Cannot read properties of ${state} (reading '${ts.isPropertyAccessExpression(node) ? node.name.text : 'property'}')`,
                line: lineNum,
                column: character + 1,
                problematicCode: probCode,
                problematic_code: probCode,
                explanation: `Variable '${baseVarName}' is explicitly initialized or assigned to ${state}. Accessing properties on ${state} will throw a TypeError at runtime.`,
                recommendedFix: `Initialize '${baseVarName}' with a valid object or use optional chaining (?.) before accessing properties.`,
                recommended_fix: `Initialize '${baseVarName}' with a valid object or use optional chaining (?.) before accessing properties.`,
                source: 'ESLint',
                ruleId: 'no-null-dereference',
                detection_source: 'JavaScript AST / Type Safety Engine',
                confidence: 'HIGH'
              });
            }
          }
        }

        // Invalid JSON.parse detection
        if (ts.isCallExpression(node)) {
          if (
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === 'JSON' &&
            node.expression.name.text === 'parse' &&
            node.arguments.length > 0
          ) {
            const firstArg = node.arguments[0];
            let jsonString: string | null = null;

            if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
              jsonString = firstArg.text;
            } else if (ts.isIdentifier(firstArg) && typeof assignedValues.get(firstArg.text) === 'string') {
              jsonString = assignedValues.get(firstArg.text);
            }

            if (jsonString !== null) {
              try {
                JSON.parse(jsonString);
              } catch (parseErr: any) {
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                const lineNum = line + 1;
                const probCode = lines[line]?.trim() || '';

                rawFindings.push({
                  id: `js_ast_${lineNum}_json_parse`,
                  language: 'javascript',
                  category: 'BUGS_RUNTIME_ERRORS',
                  severity: 'HIGH',
                  title: `SyntaxError in JSON.parse: ${parseErr.message}`,
                  line: lineNum,
                  column: character + 1,
                  problematicCode: probCode,
                  problematic_code: probCode,
                  explanation: `Calling JSON.parse with malformed JSON string ("${jsonString}") throws a runtime SyntaxError: ${parseErr.message}.`,
                  recommendedFix: 'Ensure JSON string conforms to valid JSON format (e.g. double-quoted keys and strings). Wrap in try-catch if dynamic.',
                  recommended_fix: 'Ensure JSON string conforms to valid JSON format (e.g. double-quoted keys and strings). Wrap in try-catch if dynamic.',
                  source: 'ESLint',
                  ruleId: 'valid-json-parse',
                  detection_source: 'JavaScript Runtime Analyzer',
                  confidence: 'HIGH'
                });
              }
            }
          }

          // Function call division by zero (e.g. divide(10, 0))
          if (ts.isIdentifier(node.expression)) {
            const fnName = node.expression.text;
            if (functionDivisors.has(fnName)) {
              const { divisorParamIdx } = functionDivisors.get(fnName)!;
              if (node.arguments.length > divisorParamIdx) {
                const argNode = node.arguments[divisorParamIdx];
                let isZero = false;
                if (ts.isNumericLiteral(argNode) && Number(argNode.text) === 0) {
                  isZero = true;
                } else if (ts.isIdentifier(argNode) && assignedValues.get(argNode.text) === 0) {
                  isZero = true;
                }

                if (isZero) {
                  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                  const lineNum = line + 1;
                  const probCode = lines[line]?.trim() || '';

                  rawFindings.push({
                    id: `js_ast_${lineNum}_fn_div0`,
                    language: 'javascript',
                    category: 'BUGS_RUNTIME_ERRORS',
                    severity: 'HIGH',
                    title: `Division by Zero in '${fnName}' Call`,
                    line: lineNum,
                    column: character + 1,
                    problematicCode: probCode,
                    problematic_code: probCode,
                    explanation: `Function '${fnName}' divides by parameter index ${divisorParamIdx + 1}. Calling it with 0 causes division by zero at runtime.`,
                    recommendedFix: `Pass a non-zero argument or add a zero guard inside '${fnName}'.`,
                    recommended_fix: `Pass a non-zero argument or add a zero guard inside '${fnName}'.`,
                    source: 'ESLint',
                    ruleId: 'no-division-by-zero',
                    detection_source: 'JavaScript AST Engine',
                    confidence: 'HIGH'
                  });
                }
              }
            }
          }
        }

        // Array Index Out of Range (for static arrays)
        if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
          const arrName = node.expression.text;
          if (arrayLengths.has(arrName) && node.argumentExpression && ts.isNumericLiteral(node.argumentExpression)) {
            const idx = Number(node.argumentExpression.text);
            const len = arrayLengths.get(arrName)!;
            if (idx >= len || idx < 0) {
              const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
              const lineNum = line + 1;
              const probCode = lines[line]?.trim() || '';

              rawFindings.push({
                id: `js_ast_${lineNum}_idx_oob`,
                language: 'javascript',
                category: 'BUGS_RUNTIME_ERRORS',
                severity: 'MEDIUM',
                title: `Array Index Out of Bounds: '${arrName}[${idx}]' (array length is ${len})`,
                line: lineNum,
                column: character + 1,
                problematicCode: probCode,
                problematic_code: probCode,
                explanation: `Accessing index ${idx} on array '${arrName}' of size ${len} evaluates to undefined and may lead to downstream runtime exceptions.`,
                recommendedFix: `Ensure index is within valid bounds (0 to ${len - 1}).`,
                recommended_fix: `Ensure index is within valid bounds (0 to ${len - 1}).`,
                source: 'ESLint',
                ruleId: 'array-bounds',
                detection_source: 'JavaScript AST Engine',
                confidence: 'HIGH'
              });
            }
          }
        }

        // Direct Division by Zero
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.SlashToken) {
          let isZero = false;
          let divisorName = '';

          if (ts.isNumericLiteral(node.right) && Number(node.right.text) === 0) {
            isZero = true;
            divisorName = '0';
          } else if (ts.isIdentifier(node.right) && assignedValues.get(node.right.text) === 0) {
            isZero = true;
            divisorName = node.right.text;
          }

          if (isZero) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            const lineNum = line + 1;
            const probCode = lines[line]?.trim() || '';

            rawFindings.push({
              id: `js_ast_${lineNum}_div0`,
              language: 'javascript',
              category: 'BUGS_RUNTIME_ERRORS',
              severity: 'HIGH',
              title: 'Division by Zero (produces Infinity / NaN)',
              line: lineNum,
              column: character + 1,
              problematicCode: probCode,
              problematic_code: probCode,
              explanation: `Division by zero (${divisorName}) results in Infinity or NaN at runtime.`,
              recommendedFix: `Guard against '${divisorName}' being zero before division.`,
              recommended_fix: `Guard against '${divisorName}' being zero before division.`,
              source: 'ESLint',
              ruleId: 'no-division-by-zero',
              detection_source: 'JavaScript AST Engine',
              confidence: 'HIGH'
            });
          }
        }

        // Infinite Loop Detection: while(true) or while(1) without break/return/throw
        if (ts.isWhileStatement(node)) {
          let isAlwaysTrue = false;
          if (node.expression.kind === ts.SyntaxKind.TrueKeyword) {
            isAlwaysTrue = true;
          } else if (ts.isNumericLiteral(node.expression) && Number(node.expression.text) !== 0) {
            isAlwaysTrue = true;
          }

          if (isAlwaysTrue) {
            let hasExit = false;
            const checkExit = (stmt: ts.Node) => {
              if (ts.isBreakStatement(stmt) || ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt)) {
                hasExit = true;
              }
              if (!hasExit) {
                ts.forEachChild(stmt, checkExit);
              }
            };
            checkExit(node.statement);

            if (!hasExit) {
              const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
              const lineNum = line + 1;
              const probCode = lines[line]?.trim() || '';

              rawFindings.push({
                id: `js_ast_${lineNum}_infinite_loop`,
                language: 'javascript',
                category: 'BUGS_RUNTIME_ERRORS',
                severity: 'HIGH',
                title: 'Infinite Loop Detected (while(true) without exit)',
                line: lineNum,
                column: character + 1,
                problematicCode: probCode,
                problematic_code: probCode,
                explanation: 'Loop runs indefinitely because the condition is constant true and no break, return, or throw statement terminates execution.',
                recommendedFix: 'Add a termination condition or break statement inside the loop.',
                recommended_fix: 'Add a termination condition or break statement inside the loop.',
                source: 'ESLint',
                ruleId: 'no-unreachable-loop',
                detection_source: 'JavaScript AST Control Flow Engine',
                confidence: 'HIGH'
              });
            }
          }
        }

        // Security: eval()
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'eval') {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          const lineNum = line + 1;
          const probCode = lines[line]?.trim() || '';

          rawFindings.push({
            id: `js_ast_${lineNum}_eval`,
            language: 'javascript',
            category: 'SECURITY_ISSUES',
            severity: 'CRITICAL',
            title: 'Unsafe Dynamic Code Execution (eval)',
            line: lineNum,
            column: character + 1,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: 'eval() is dangerous as it allows arbitrary code execution and injection vulnerabilities.',
            recommendedFix: 'Avoid eval(). Use structured parsers or JSON.parse().',
            recommended_fix: 'Avoid eval(). Use structured parsers or JSON.parse().',
            source: 'ESLint',
            ruleId: 'no-eval',
            detection_source: 'ESLint Security (no-eval)',
            confidence: 'HIGH'
          });
        }

        ts.forEachChild(node, (child) => analyzeNode(child, nodeScope));
      };

      analyzeNode(sourceFile, declaredGlobals);
    } catch (err: any) {
      console.warn('JavaScript AST analysis notice:', err);
    }

    const isolatedFindings = deduplicateAndIsolateFindings(rawFindings, 'javascript');

    return {
      status: 'FULLY_SUPPORTED',
      message: 'JavaScript / Node.js Engine (Parser + AST + ESLint Rules)',
      findings: isolatedFindings
    };
  }
}
