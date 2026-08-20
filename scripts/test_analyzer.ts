import { spawnSync } from 'child_process';
import path from 'path';
import { resolvePythonExecutable } from '../src/server/utils/pythonResolver';
import { AnalyzerRegistry } from '../src/server/analyzers/AnalyzerRegistry';
import { deduplicateAndIsolateFindings } from '../src/server/analyzers/summaryFilter';
import { JavaScriptAnalyzer } from '../src/server/analyzers/JavaScriptAnalyzer';
import { TypeScriptAnalyzer } from '../src/server/analyzers/TypeScriptAnalyzer';
import { HtmlAnalyzer } from '../src/server/analyzers/HtmlAnalyzer';
import { JavaAnalyzer } from '../src/server/analyzers/JavaAnalyzer';
import { CppAnalyzer } from '../src/server/analyzers/CppAnalyzer';
import { GoAnalyzer } from '../src/server/analyzers/GoAnalyzer';
import { RustAnalyzer } from '../src/server/analyzers/RustAnalyzer';
import { CSharpAnalyzer } from '../src/server/analyzers/CSharpAnalyzer';
import { PHPAnalyzer } from '../src/server/analyzers/PHPAnalyzer';
import { RubyAnalyzer } from '../src/server/analyzers/RubyAnalyzer';
import { getApiUrl } from '../src/services/reviewService';
import { safeExtractAndParseJSON } from '../src/server/aiService';

interface TestCase {
  name: string;
  code: string;
  expectedCategory: string;
  expectedSeverity: string;
  expectedTitleSubstring: string;
  expectedSource?: string;
}

const TEST_CASES: TestCase[] = [
  {
    name: '1. Syntax Error (Python AST)',
    code: 'def calculate(\n    return 42',
    expectedCategory: 'SYNTAX_ERRORS',
    expectedSeverity: 'HIGH',
    expectedTitleSubstring: 'Syntax Error',
    expectedSource: 'AST'
  },
  {
    name: '2. Undefined Variable (Pyflakes / Ruff)',
    code: 'def calculate():\n    return unknown_variable',
    expectedCategory: 'BUGS_RUNTIME_ERRORS',
    expectedSeverity: 'HIGH',
    expectedTitleSubstring: 'Undefined',
    expectedSource: 'Pyflakes'
  },
  {
    name: '3. Division by Zero (Python AST)',
    code: 'a = 10\nb = 0\nresult = a / b',
    expectedCategory: 'BUGS_RUNTIME_ERRORS',
    expectedSeverity: 'HIGH',
    expectedTitleSubstring: 'ZeroDivisionError',
    expectedSource: 'AST'
  },
  {
    name: '4. Invalid List Index (Python AST)',
    code: 'numbers = [10, 20, 30]\nvalue = numbers[10]',
    expectedCategory: 'BUGS_RUNTIME_ERRORS',
    expectedSeverity: 'HIGH',
    expectedTitleSubstring: 'Index',
    expectedSource: 'AST'
  },
  {
    name: '5. Wrong Function Arguments (Python AST)',
    code: 'def add(a, b):\n    return a + b\nresult = add(10)',
    expectedCategory: 'BUGS_RUNTIME_ERRORS',
    expectedSeverity: 'HIGH',
    expectedTitleSubstring: 'Missing Required Argument',
    expectedSource: 'AST'
  },
  {
    name: '6. Type Error (Python AST / mypy)',
    code: 'name = "Rakesh"\nage = 20\nresult = name + age',
    expectedCategory: 'BUGS_RUNTIME_ERRORS',
    expectedSeverity: 'HIGH',
    expectedTitleSubstring: 'TypeError',
    expectedSource: 'AST'
  },
  {
    name: '7. Command Injection (Bandit B602)',
    code: 'import subprocess\ncommand = input("Cmd: ")\nsubprocess.run(command, shell=True)',
    expectedCategory: 'SECURITY_ISSUES',
    expectedSeverity: 'CRITICAL',
    expectedTitleSubstring: 'Command Injection',
    expectedSource: 'Bandit'
  },
  {
    name: '8. Dangerous eval() (Bandit B307)',
    code: 'user_input = input("Expr: ")\nresult = eval(user_input)',
    expectedCategory: 'SECURITY_ISSUES',
    expectedSeverity: 'CRITICAL',
    expectedTitleSubstring: 'eval',
    expectedSource: 'Bandit'
  },
  {
    name: '9. Infinite Loop (Python AST Control Flow)',
    code: 'counter = 0\nwhile counter < 10:\n    print(counter)',
    expectedCategory: 'BUGS_RUNTIME_ERRORS',
    expectedSeverity: 'HIGH',
    expectedTitleSubstring: 'Infinite Loop',
    expectedSource: 'AST'
  },
  {
    name: '10. Debug Artifact (Explicit debug marker)',
    code: 'result = 42\nprint("DEBUG:", result)',
    expectedCategory: 'DEBUG_DEVELOPMENT_ARTIFACTS',
    expectedSeverity: 'LOW',
    expectedTitleSubstring: 'Debug Output',
    expectedSource: 'AST'
  },
  {
    name: '11. Valid Print Statement (Clean Code - No false positive)',
    code: 'print("Hello World")',
    expectedCategory: 'NONE',
    expectedSeverity: 'NONE',
    expectedTitleSubstring: 'NONE'
  },
  {
    name: '12. Clean Function (No Errors)',
    code: 'def greet(name: str) -> str:\n    return "Hello " + str(name)\nprint(greet("World"))',
    expectedCategory: 'NONE',
    expectedSeverity: 'NONE',
    expectedTitleSubstring: 'NONE'
  }
];

async function runTests() {
  console.log('===================================================');
  console.log('  RUNNING AUTOMATED CODE REVIEWER TEST SUITE       ');
  console.log('===================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Python Analyzer Tests
  const pyResolution = resolvePythonExecutable();
  console.log(`Python Resolution: Executable: "${pyResolution.executable}", Available: ${pyResolution.isAvailable}, Version: "${pyResolution.version}"\n`);

  if (!pyResolution.isAvailable) {
    console.error('❌ [FATAL] Python executable was not detected on this system.');
    process.exit(1);
  }

  const scriptPath = path.resolve(process.cwd(), 'scripts', 'python_analyzer.py');

  TEST_CASES.forEach((tc) => {
    try {
      const runArgs = [...pyResolution.args, scriptPath];
      const result = spawnSync(pyResolution.executable, runArgs, {
        input: tc.code,
        encoding: 'utf-8',
        timeout: 15000,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      });

      if (result.error) {
        throw result.error;
      }

      const outputRaw = result.stdout || '';
      if (!outputRaw.trim()) {
        throw new Error(`Empty stdout returned. Stderr: ${result.stderr || 'none'}`);
      }

      const findings = JSON.parse(outputRaw.trim());

      if (tc.expectedCategory === 'NONE') {
        const errorFindings = findings.filter((f: any) =>
          ['CRITICAL', 'HIGH', 'MEDIUM'].includes(f.severity) &&
          f.category !== 'DEBUG_DEVELOPMENT_ARTIFACTS' &&
          f.category !== 'STYLE'
        );
        if (errorFindings.length === 0) {
          console.log(`✅ [PASS] ${tc.name}`);
          passed++;
        } else {
          console.error(`❌ [FAIL] ${tc.name}: Expected 0 error findings, got:`, errorFindings);
          failed++;
        }
      } else {
        const match = findings.find((f: any) =>
          f.category === tc.expectedCategory &&
          f.severity === tc.expectedSeverity &&
          f.title.toLowerCase().includes(tc.expectedTitleSubstring.toLowerCase())
        );

        if (match) {
          console.log(`✅ [PASS] ${tc.name} -> Source: [${match.source}] | "${match.title}" (${match.severity})`);
          passed++;
        } else {
          console.error(`❌ [FAIL] ${tc.name}: Could not find expected match in findings:`, findings);
          failed++;
        }
      }
    } catch (e: any) {
      console.error(`❌ [ERROR] ${tc.name}: Test execution error:`, e.message);
      failed++;
    }
  });

  // 2. JavaScript Analyzer Unit Test
  try {
    const jsAnalyzer = new JavaScriptAnalyzer();
    const jsRes = await jsAnalyzer.analyze('const x = null;\nx.foo();');
    const hasNpe = jsRes.findings.some((f) => f.category === 'BUGS_RUNTIME_ERRORS' && f.title.includes('TypeError'));
    if (hasNpe) {
      console.log('✅ [PASS] 13. JavaScript Null Dereference Detection');
      passed++;
    } else {
      console.error('❌ [FAIL] 13. JavaScript Null Dereference Detection');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 13. JavaScript Test:', e.message);
    failed++;
  }

  // 3. TypeScript Analyzer Unit Test
  try {
    const tsAnalyzer = new TypeScriptAnalyzer();
    const tsRes = await tsAnalyzer.analyze('const num: number = "hello";');
    const hasTypeErr = tsRes.findings.some((f) => f.ruleId?.includes('TS2322'));
    if (hasTypeErr) {
      console.log('✅ [PASS] 14. TypeScript Type Mismatch Detection (TS2322)');
      passed++;
    } else {
      console.error('❌ [FAIL] 14. TypeScript Type Mismatch Detection');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 14. TypeScript Test:', e.message);
    failed++;
  }

  // 4. HTML Analyzer Unit Test
  try {
    const htmlAnalyzer = new HtmlAnalyzer();
    const htmlRes = await htmlAnalyzer.analyze('<div><span>Unclosed');
    const hasHtmlErr = htmlRes.findings.length > 0;
    if (hasHtmlErr) {
      console.log('✅ [PASS] 15. HTML Unclosed Tag Detection');
      passed++;
    } else {
      console.error('❌ [FAIL] 15. HTML Unclosed Tag Detection');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 15. HTML Test:', e.message);
    failed++;
  }

  // 5. Registry Language Normalization Test
  try {
    const py = AnalyzerRegistry.normalizeLanguage('py' as any);
    const ts = AnalyzerRegistry.normalizeLanguage('ts' as any);
    const cpp = AnalyzerRegistry.normalizeLanguage('c++' as any);
    const cs = AnalyzerRegistry.normalizeLanguage('c#' as any);
    if (py === 'python' && ts === 'typescript' && cpp === 'cpp' && cs === 'csharp') {
      console.log('✅ [PASS] 16. AnalyzerRegistry Language Normalization');
      passed++;
    } else {
      console.error('❌ [FAIL] 16. AnalyzerRegistry Language Normalization');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 16. Normalization Test:', e.message);
    failed++;
  }

  // 6. Language Isolation / summaryFilter Test
  try {
    const mixedFindings: any[] = [
      { id: '1', language: 'python', category: 'SYNTAX_ERRORS', severity: 'HIGH', title: 'Python error', source: 'AST' },
      { id: '2', language: 'javascript', category: 'SYNTAX_ERRORS', severity: 'HIGH', title: 'JS error', source: 'ESLint' }
    ];
    const isolated = deduplicateAndIsolateFindings(mixedFindings, 'python');
    if (isolated.length === 1 && isolated[0].language === 'python') {
      console.log('✅ [PASS] 17. Multi-Language Isolation & Deduplication');
      passed++;
    } else {
      console.error('❌ [FAIL] 17. Multi-Language Isolation & Deduplication');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 17. Isolation Test:', e.message);
    failed++;
  }

  // 7. Java Analyzer Test
  try {
    const javaAnalyzer = new JavaAnalyzer();
    const javaRes = await javaAnalyzer.analyze('public class Main { String s = null; void run() { s.length(); } }');
    if (javaRes && Array.isArray(javaRes.findings)) {
      console.log(`✅ [PASS] 18. Java Analyzer (${javaRes.status})`);
      passed++;
    } else {
      console.error('❌ [FAIL] 18. Java Analyzer returned invalid output');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 18. Java Test:', e.message);
    failed++;
  }

  // 8. C++ Analyzer Test
  try {
    const cppAnalyzer = new CppAnalyzer();
    const cppRes = await cppAnalyzer.analyze('#include <iostream>\nint main() { char* buf = new char[10]; strcpy(buf, "hello"); }');
    if (cppRes && Array.isArray(cppRes.findings)) {
      console.log(`✅ [PASS] 19. C++ Analyzer (${cppRes.status})`);
      passed++;
    } else {
      console.error('❌ [FAIL] 19. C++ Analyzer returned invalid output');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 19. C++ Test:', e.message);
    failed++;
  }

  // 9. Go Analyzer Test
  try {
    const goAnalyzer = new GoAnalyzer();
    const goRes = await goAnalyzer.analyze('package main\nimport "fmt"\nfunc main() { var p *int; fmt.Println(*p) }');
    if (goRes && Array.isArray(goRes.findings)) {
      console.log(`✅ [PASS] 20. Go Analyzer (${goRes.status})`);
      passed++;
    } else {
      console.error('❌ [FAIL] 20. Go Analyzer returned invalid output');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 20. Go Test:', e.message);
    failed++;
  }

  // 10. Rust Analyzer Test
  try {
    const rustAnalyzer = new RustAnalyzer();
    const rustRes = await rustAnalyzer.analyze('fn main() { let opt: Option<i32> = None; println!("{}", opt.unwrap()); }');
    if (rustRes && Array.isArray(rustRes.findings)) {
      console.log(`✅ [PASS] 21. Rust Analyzer (${rustRes.status})`);
      passed++;
    } else {
      console.error('❌ [FAIL] 21. Rust Analyzer returned invalid output');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 21. Rust Test:', e.message);
    failed++;
  }

  // 11. C# Analyzer Test
  try {
    const csAnalyzer = new CSharpAnalyzer();
    const csRes = await csAnalyzer.analyze('using System;\nclass Program { static void Main() { string s = null; Console.WriteLine(s.Length); } }');
    if (csRes && Array.isArray(csRes.findings)) {
      console.log(`✅ [PASS] 22. C# Analyzer (${csRes.status})`);
      passed++;
    } else {
      console.error('❌ [FAIL] 22. C# Analyzer returned invalid output');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 22. C# Test:', e.message);
    failed++;
  }

  // 12. PHP Analyzer Test
  try {
    const phpAnalyzer = new PHPAnalyzer();
    const phpRes = await phpAnalyzer.analyze('<?php\n$script = "echo 1;";\neval($script);\n?>');
    if (phpRes && Array.isArray(phpRes.findings)) {
      console.log(`✅ [PASS] 23. PHP Analyzer (${phpRes.status})`);
      passed++;
    } else {
      console.error('❌ [FAIL] 23. PHP Analyzer returned invalid output');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 23. PHP Test:', e.message);
    failed++;
  }

  // 13. Ruby Analyzer Test
  try {
    const rubyAnalyzer = new RubyAnalyzer();
    const rubyRes = await rubyAnalyzer.analyze('def evaluate_expression(expr)\n  eval(expr)\nend');
    if (rubyRes && Array.isArray(rubyRes.findings)) {
      console.log(`✅ [PASS] 24. Ruby Analyzer (${rubyRes.status})`);
      passed++;
    } else {
      console.error('❌ [FAIL] 24. Ruby Analyzer returned invalid output');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 24. Ruby Test:', e.message);
    failed++;
  }

  // 14. Error Resilience (Empty Code)
  try {
    const jsAnalyzer = new JavaScriptAnalyzer();
    const emptyRes = await jsAnalyzer.analyze('');
    if (emptyRes && Array.isArray(emptyRes.findings)) {
      console.log('✅ [PASS] 25. Empty Code Input Resilience');
      passed++;
    } else {
      console.error('❌ [FAIL] 25. Empty Code Input Handling');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 25. Empty Input Test:', e.message);
    failed++;
  }

  // 15. Exact 5-Error Count Test
  try {
    const code5 = `
def fn_five(user_id, untrusted_code):
    v1 = undefined_name_test
    v2 = 10 / 0
    v3 = [1, 2][50]
    v4 = "msg: " + 99
    eval(untrusted_code)
`;
    const runArgs = [...pyResolution.args, scriptPath];
    const res5 = spawnSync(pyResolution.executable, runArgs, {
      input: code5,
      encoding: 'utf-8',
      timeout: 15000
    });
    const parsed5 = JSON.parse((res5.stdout || '').trim());
    if (parsed5.length === 5) {
      console.log(`✅ [PASS] 26. Exact 5 Genuine Errors Detected (${parsed5.length}/5)`);
      passed++;
    } else {
      console.error(`❌ [FAIL] 26. Expected 5 genuine errors, got ${parsed5.length}:`, parsed5);
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 26. 5-Error Test:', e.message);
    failed++;
  }

  // 16. Exact 10-Error Count Test
  try {
    const code10 = `
import subprocess
import hashlib
import sqlite3

def add(x, y):
    return x + y

def check_ten(user_id, untrusted_code, user_input):
    v1 = undefined_variable_abc
    v2 = 100 / 0
    lst = [1, 2]
    v3 = lst[99]
    v4 = "count: " + 42
    v5 = add(10)
    subprocess.run("rm -rf " + user_input, shell=True)
    eval(untrusted_code)
    counter = 0
    while counter < 5:
        print("stuck")
    db = sqlite3.connect(":memory:")
    cur = db.cursor()
    sql = f"SELECT * FROM users WHERE id = '{user_id}'"
    cur.execute(sql)
    pw_hash = hashlib.md5(b"secret").hexdigest()
`;
    const runArgs = [...pyResolution.args, scriptPath];
    const res10 = spawnSync(pyResolution.executable, runArgs, {
      input: code10,
      encoding: 'utf-8',
      timeout: 15000
    });
    const parsed10 = JSON.parse((res10.stdout || '').trim());
    if (parsed10.length === 10) {
      console.log(`✅ [PASS] 27. Exact 10 Genuine Errors Detected (${parsed10.length}/10)`);
      passed++;
    } else {
      console.error(`❌ [FAIL] 27. Expected 10 genuine errors, got ${parsed10.length}:`, parsed10);
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 27. 10-Error Test:', e.message);
    failed++;
  }

  // 17. Determinism Test (Multiple runs of the exact same code return identical results)
  try {
    const codeDet = `
def det_check(val):
    a = undef_var_1
    b = 10 / 0
    c = [1, 2][9]
    return a + b + c
`;
    const runArgs = [...pyResolution.args, scriptPath];
    const resA = spawnSync(pyResolution.executable, runArgs, { input: codeDet, encoding: 'utf-8' });
    const resB = spawnSync(pyResolution.executable, runArgs, { input: codeDet, encoding: 'utf-8' });
    const parsedA = JSON.parse((resA.stdout || '').trim());
    const parsedB = JSON.parse((resB.stdout || '').trim());
    if (parsedA.length === parsedB.length && JSON.stringify(parsedA) === JSON.stringify(parsedB)) {
      console.log(`✅ [PASS] 28. Deterministic Analysis Output (${parsedA.length} findings identical across runs)`);
      passed++;
    } else {
      console.error('❌ [FAIL] 28. Non-deterministic analysis output across identical runs');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 28. Determinism Test:', e.message);
    failed++;
  }

  // 18. Deduplication Precision Test (Only duplicate of same defect merged; distinct preserved)
  try {
    const duplicateList: any[] = [
      { id: '1', language: 'python', category: 'BUGS_RUNTIME_ERRORS', severity: 'HIGH', title: "Undefined Variable: 'x'", line: 5, column: 1, source: 'AST' },
      { id: '2', language: 'python', category: 'BUGS_RUNTIME_ERRORS', severity: 'HIGH', title: "Undefined Variable: 'x'", line: 5, column: 1, source: 'Pyflakes' },
      { id: '3', language: 'python', category: 'SECURITY_ISSUES', severity: 'CRITICAL', title: 'SQL Injection Vulnerability in Database Query', line: 10, column: 1, source: 'AST' },
      { id: '4', language: 'python', category: 'SECURITY_ISSUES', severity: 'HIGH', title: 'Insecure Cryptographic Hash Algorithm (MD5)', line: 10, column: 15, source: 'AST' }
    ];
    const deduped = deduplicateAndIsolateFindings(duplicateList, 'python');
    // Expect 3 findings (items 1 & 2 merged into 1; items 3 & 4 both preserved because one is SQLi and one is crypto hash)
    if (deduped.length === 3) {
      console.log('✅ [PASS] 29. Precision Deduplication (Duplicate merged to 1, distinct issues on same line preserved)');
      passed++;
    } else {
      console.error(`❌ [FAIL] 29. Deduplication failed: Expected 3 findings, got ${deduped.length}:`, deduped);
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 29. Deduplication Test:', e.message);
    failed++;
  }

  // 19. Exact 20-Error Count Test (No arbitrary capping, truncation, or omission)
  try {
    const code20 = `
import subprocess
import hashlib
import sqlite3

def sub_fn(a, b):
    return a - b

def test_twenty(user_input, cmd_str, code_str, query_id):
    # 1. Undefined var 1
    e1 = undef_var_one
    # 2. Undefined var 2
    e2 = undef_var_two
    # 3. Div by 0
    e3 = 100 / 0
    # 4. Mod by 0
    e4 = 50 % 0
    # 5. List index out of range
    e5 = [10, 20][100]
    # 6. Type error
    e6 = "val: " + 999
    # 7. Missing arg
    e7 = sub_fn(10)
    # 8. Too many args
    e8 = sub_fn(1, 2, 3)
    # 9. Command injection
    subprocess.run("ping " + cmd_str, shell=True)
    # 10. Dangerous eval
    eval(code_str)
    # 11. Dangerous exec
    exec(code_str)
    # 12. Infinite loop
    c1 = 0
    while c1 < 10:
        pass
    # 13. SQL injection
    db = sqlite3.connect(":memory:")
    c = db.cursor()
    sql_q = f"SELECT * FROM accounts WHERE id = '{query_id}'"
    c.execute(sql_q)
    # 14. Weak MD5 hash
    h1 = hashlib.md5(b"test").hexdigest()
    # 15. Weak SHA1 hash
    h2 = hashlib.sha1(b"test").hexdigest()
    # 16. Hardcoded password
    user_password = "supersecretpassword123"
    # 17. Hardcoded api key
    api_key = "sk_live_1234567890abcdef"
    # 18. Comparison with literal using is
    is_five = user_input is 5
    # 19. Mutable default in nested fn
    def inner_fn(mut_arg=[]):
        pass
    # 20. Another undefined var
    e20 = undef_final_item
`;
    const runArgs = [...pyResolution.args, scriptPath];
    const res20 = spawnSync(pyResolution.executable, runArgs, {
      input: code20,
      encoding: 'utf-8',
      timeout: 15000
    });
    const parsed20 = JSON.parse((res20.stdout || '').trim());
    if (parsed20.length === 20) {
      console.log(`✅ [PASS] 30. Exact 20 Genuine Errors Detected without Capping (${parsed20.length}/20)`);
      passed++;
    } else {
      console.error(`❌ [FAIL] 30. Expected 20 genuine errors, got ${parsed20.length}:`, parsed20);
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 30. 20-Error Test:', e.message);
    failed++;
  }

  // 20. Regression TEST A (KeyError Detection on Missing Dictionary Key)
  try {
    const testACode = `data = {"name": "Rakesh"}\nprint(data["age"])`;
    const runArgs = [...pyResolution.args, scriptPath];
    const resA = spawnSync(pyResolution.executable, runArgs, {
      input: testACode,
      encoding: 'utf-8',
      timeout: 15000
    });
    const parsedA = JSON.parse((resA.stdout || '').trim());
    const hasKeyError = parsedA.some(
      (f: any) =>
        f.category === 'BUGS_RUNTIME_ERRORS' &&
        (f.title.includes('KeyError') || f.title.includes("'age'")) &&
        f.line === 2
    );

    if (parsedA.length === 1 && hasKeyError) {
      console.log(`✅ [PASS] 31. Regression TEST A: Exactly 1 genuine error (KeyError: 'age') detected`);
      passed++;
    } else {
      console.error(`❌ [FAIL] 31. Regression TEST A failed. Expected 1 KeyError, got ${parsedA.length}:`, parsedA);
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 31. Regression TEST A:', e.message);
    failed++;
  }

  // 21. Regression TEST B (4 Independent Runtime Errors: KeyError, NameError, IndexError, ZeroDivisionError)
  try {
    const testBCode = `data = {"name": "Rakesh"}\nprint(data["age"])\nprint(undefined_value)\nprint([1, 2, 3][10])\nprint(10 / 0)`;
    const runArgs = [...pyResolution.args, scriptPath];
    const resB = spawnSync(pyResolution.executable, runArgs, {
      input: testBCode,
      encoding: 'utf-8',
      timeout: 15000
    });
    const parsedB = JSON.parse((resB.stdout || '').trim());
    const hasKeyErr = parsedB.some((f: any) => f.title.includes('KeyError'));
    const hasNameErr = parsedB.some((f: any) => f.title.includes('Undefined') || f.title.includes('NameError'));
    const hasIndexErr = parsedB.some((f: any) => f.title.includes('Index'));
    const hasDiv0 = parsedB.some((f: any) => f.title.includes('ZeroDivision') || f.title.includes('Division by Zero'));

    if (parsedB.length === 4 && hasKeyErr && hasNameErr && hasIndexErr && hasDiv0) {
      console.log(`✅ [PASS] 32. Regression TEST B: Exactly 4 genuine errors detected (KeyError, NameError, IndexError, ZeroDivisionError)`);
      passed++;
    } else {
      console.error(`❌ [FAIL] 32. Regression TEST B failed. Expected 4 errors (KeyError, NameError, IndexError, ZeroDivisionError), got ${parsedB.length}:`, parsedB);
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 32. Regression TEST B:', e.message);
    failed++;
  }

  // 22. Regression TEST C (Program containing 10 independently detectable errors)
  try {
    const testCCode = `
import subprocess
import hashlib

def helper(a, b):
    return a + b

# 1. KeyError
user_dict = {"name": "Alice"}
print(user_dict["email"])

# 2. NameError
print(non_existent_symbol)

# 3. IndexError
items = [1, 2, 3]
print(items[50])

# 4. ZeroDivisionError
quotient = 100 / 0

# 5. TypeError
label = "Total: " + 42

# 6. Missing required argument
res_help = helper(5)

# 7. Command injection
subprocess.run("rm -rf " + str(user_dict), shell=True)

# 8. Dangerous eval
eval("2 + 2")

# 9. Insecure Hash
weak_h = hashlib.md5(b"secret").hexdigest()

# 10. Hardcoded secret
auth_token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"
`;
    const runArgs = [...pyResolution.args, scriptPath];
    const resC = spawnSync(pyResolution.executable, runArgs, {
      input: testCCode,
      encoding: 'utf-8',
      timeout: 15000
    });
    const parsedC = JSON.parse((resC.stdout || '').trim());
    if (parsedC.length === 10) {
      console.log(`✅ [PASS] 33. Regression TEST C: Exactly 10 independently detectable errors reported (10/10)`);
      passed++;
    } else {
      console.error(`❌ [FAIL] 33. Regression TEST C failed. Expected 10 errors, got ${parsedC.length}:`, parsedC);
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 33. Regression TEST C:', e.message);
    failed++;
  }

  // 23. Full Pipeline Verification (Python -> AnalyzerRegistry -> Deduplication -> Output format)
  try {
    const pipelineCode = `data = {"name": "Rakesh"}\nprint(data["age"])`;
    const analyzer = AnalyzerRegistry.getAnalyzer('python');
    const result = await analyzer.analyze(pipelineCode);
    const isolatedFindings = result.findings;

    const keyErrorFinding = isolatedFindings.find(
      (f) =>
        f.language === 'python' &&
        f.category === 'BUGS_RUNTIME_ERRORS' &&
        f.severity === 'HIGH' &&
        f.line === 2 &&
        f.title.includes('KeyError') &&
        Boolean(f.explanation) &&
        Boolean(f.recommendedFix || f.recommended_fix)
    );

    if (keyErrorFinding && isolatedFindings.length === 1) {
      console.log(`✅ [PASS] 34. Full Pipeline Verification: KeyError preserved through registry and deduplication with all required fields`);
      passed++;
    } else {
      console.error('❌ [FAIL] 34. Full Pipeline Verification failed:', isolatedFindings);
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 34. Pipeline Verification:', e.message);
    failed++;
  }

  // 17. JavaScript Multi-Error Detection (Step 7 Verification)
  try {
    const jsAnalyzer = new JavaScriptAnalyzer();
    const jsSnippet = `
function divide(a, b) {
    return a / b;
}
function processData(data) {
    const password = "admin123";
    const username = data.username;
    const query = "SELECT * FROM users WHERE name = '" + username + "'";
    console.log(missingVariable);
    const value = JSON.parse("invalid-json");
    const user = null;
    console.log(user.name);
    const result = divide(10, 0);
    const items = [1, 2, 3];
    console.log(items[10]);
    eval("console.log('dangerous')");
    while (true) {
        console.log("Running");
    }
}
processData({});
`;
    const res = await jsAnalyzer.analyze(jsSnippet);
    const hasSecret = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && f.title.includes('Secret'));
    const hasSqli = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && f.title.includes('SQL Injection'));
    const hasUndef = res.findings.some((f) => f.title.includes('missingVariable'));
    const hasJson = res.findings.some((f) => f.title.includes('JSON.parse'));
    const hasNull = res.findings.some((f) => f.title.includes('Cannot read properties of null'));
    const hasDiv0 = res.findings.some((f) => f.title.includes('Division by Zero'));
    const hasOob = res.findings.some((f) => f.title.includes('Index Out of Bounds'));
    const hasEval = res.findings.some((f) => f.title.includes('eval'));
    const hasLoop = res.findings.some((f) => f.title.includes('Infinite Loop'));

    if (hasSecret && hasSqli && hasUndef && hasJson && hasNull && hasDiv0 && hasOob && hasEval && hasLoop) {
      console.log(`✅ [PASS] 35. JavaScript Full Diagnostic Suite (All 9 expected errors detected)`);
      passed++;
    } else {
      console.error(`❌ [FAIL] 35. JavaScript Suite missing findings:`, {
        hasSecret, hasSqli, hasUndef, hasJson, hasNull, hasDiv0, hasOob, hasEval, hasLoop
      });
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 35. JavaScript Multi-Error Test:', e.message);
    failed++;
  }

  // 18. Ruby Analyzer Diagnostics & Status Test
  try {
    const rubyAnalyzer = new RubyAnalyzer();
    const rubySnippet = `
eval("puts 'malicious code'")
system("rm -rf " + user_input)
User.where("name = '#{params[:name]}'")
`;
    const res = await rubyAnalyzer.analyze(rubySnippet);
    const hasEval = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && f.title.includes('eval'));
    const hasRce = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && f.title.includes('Command Injection'));
    const hasSqli = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && f.title.includes('SQL Injection'));

    if (hasEval && hasRce && hasSqli && (res.status === 'FULLY_SUPPORTED' || res.status === 'ANALYZER_UNAVAILABLE')) {
      console.log(`✅ [PASS] 36. Ruby Analyzer Suite (Status: ${res.status}, Detected all 3 security flaws)`);
      passed++;
    } else {
      console.error('❌ [FAIL] 36. Ruby Analyzer Suite failed:', res);
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 36. Ruby Test:', e.message);
    failed++;
  }

  // 19. HTML Analyzer Diagnostics Test
  try {
    const htmlAnalyzer = new HtmlAnalyzer();
    const htmlSnippet = `
<div>
  <img src="avatar.jpg">
  <button onclick="alert('clicked')">Click</button>
  <a href="javascript:void(0)">Link</a>
  <span>Unclosed span
</div>
`;
    const res = await htmlAnalyzer.analyze(htmlSnippet);
    const hasAlt = res.findings.some((f) => f.title.includes('alt') || f.ruleId === 'alt-require');
    const hasInline = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && f.title.includes('Inline JavaScript'));
    const hasJsUrl = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && f.title.includes('javascript:'));
    const hasUnclosed = res.findings.some((f) => f.category === 'SYNTAX_ERRORS' && (f.title.includes('Unclosed') || f.title.includes('Tag must be paired') || f.ruleId === 'tag-pair'));

    if (hasAlt && hasInline && hasJsUrl && hasUnclosed) {
      console.log(`✅ [PASS] 37. HTML Analyzer Suite (Detected alt, inline JS, javascript: url, unclosed tag)`);
      passed++;
    } else {
      console.error('❌ [FAIL] 37. HTML Analyzer Suite failed:', res.findings);
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 37. HTML Test:', e.message);
    failed++;
  }

  // 20. Java Analyzer Comprehensive 15-Scenario Test
  try {
    const javaAnalyzer = new JavaAnalyzer();
    const javaComprehensiveSnippet = `
import java.io.*;
import java.security.*;
import javax.crypto.*;
import java.sql.*;

public class ComprehensiveJavaApp {
  public static void process(String userInput) {
    // 1. Syntax / Type mismatch
    int count = "invalid_string";
    
    // 2. Null pointer risk
    String nullStr = null;
    int len = nullStr.length();
    
    // 3. Array index out of bounds
    int[] items = new int[3];
    int oob = items[10];
    
    // 4. Division by zero
    int div0 = 100 / 0;
    
    // 5. Infinite loop
    int counter = 0;
    while (counter < 10) {
      System.out.println(counter);
    }
    
    // 6. Hardcoded password
    String password = "SuperSecretPassword123!";
    
    // 7. SQL Injection
    try {
      Connection conn = null;
      Statement stmt = conn.createStatement();
      stmt.executeQuery("SELECT * FROM users WHERE username = '" + userInput + "'");
    } catch (Exception e) {}
    
    // 8. Unsafe Runtime.exec()
    try {
      Runtime.getRuntime().exec("sh -c " + userInput);
    } catch (Exception e) {}
    
    // 9. Unsafe deserialization
    try {
      ByteArrayInputStream bais = new ByteArrayInputStream(new byte[0]);
      ObjectInputStream ois = new ObjectInputStream(bais);
      Object obj = ois.readObject();
    } catch (Exception e) {}
    
    // 10. Weak cryptography (MD5 & DES)
    try {
      MessageDigest md = MessageDigest.getInstance("MD5");
      Cipher c = Cipher.getInstance("DES/ECB/PKCS5Padding");
    } catch (Exception e) {}
    
    // 11. Resource leak
    FileInputStream fis = new FileInputStream("data.txt");
    
    // 12. Empty catch block
    try {
      int parsed = Integer.parseInt("abc");
    } catch (NumberFormatException nfe) {}
  }
}
`;
    const res = await javaAnalyzer.analyze(javaComprehensiveSnippet);
    const hasTypeMismatch = res.findings.some((f) => f.title.includes('Incompatible Types'));
    const hasNpe = res.findings.some((f) => f.title.includes('NullPointerException'));
    const hasBounds = res.findings.some((f) => f.title.includes('ArrayIndexOutOfBoundsException'));
    const hasDiv0 = res.findings.some((f) => f.title.includes('ArithmeticException'));
    const hasInfLoop = res.findings.some((f) => f.title.includes('Infinite Loop'));
    const hasSecret = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && f.title.includes('Hardcoded Secret'));
    const hasSqli = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && f.title.includes('SQL Injection'));
    const hasRce = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && f.title.includes('Command Injection'));
    const hasDeser = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && f.title.includes('Deserialization'));
    const hasWeakCrypto = res.findings.some((f) => f.category === 'SECURITY_ISSUES' && (f.title.includes('MD5') || f.title.includes('Cipher')));
    const hasLeak = res.findings.some((f) => f.title.includes('Resource Leak'));
    const hasEmptyCatch = res.findings.some((f) => f.title.includes('Empty Catch'));

    const allMatched =
      hasTypeMismatch &&
      hasNpe &&
      hasBounds &&
      hasDiv0 &&
      hasInfLoop &&
      hasSecret &&
      hasSqli &&
      hasRce &&
      hasDeser &&
      hasWeakCrypto &&
      hasLeak &&
      hasEmptyCatch;

    if (allMatched) {
      console.log(`✅ [PASS] 38. Java Comprehensive Suite (Detected all 12 key static, security, quality & runtime flaws)`);
      passed++;
    } else {
      console.error('❌ [FAIL] 38. Java Suite failed some checks:', {
        hasTypeMismatch,
        hasNpe,
        hasBounds,
        hasDiv0,
        hasInfLoop,
        hasSecret,
        hasSqli,
        hasRce,
        hasDeser,
        hasWeakCrypto,
        hasLeak,
        hasEmptyCatch,
        findings: res.findings
      });
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 38. Java Test:', e.message);
    failed++;
  }

  // 21. C++ Analyzer Semantic Checks
  try {
    const cppAnalyzer = new CppAnalyzer();
    const cppSnippet = `
int main() {
    int* data = new int[100];
    int arr[3] = {1, 2, 3};
    int val = arr[10];
    int div = 10 / 0;
    return 0;
}
`;
    const res = await cppAnalyzer.analyze(cppSnippet);
    const hasLeak = res.findings.some((f) => f.title.includes('Memory Leak'));
    const hasBounds = res.findings.some((f) => f.title.includes('Array Index Out of Bounds') || f.title.includes('Buffer Overflow'));
    const hasDiv0 = res.findings.some((f) => f.title.includes('Division by Zero'));

    if (hasLeak && hasBounds && hasDiv0) {
      console.log(`✅ [PASS] 39. C++ Static Analysis Suite (Memory Leak, Bounds, Div 0)`);
      passed++;
    } else {
      console.error('❌ [FAIL] 39. C++ Suite failed:', res.findings);
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 39. C++ Test:', e.message);
    failed++;
  }

  // 22. API Routing & getApiUrl Normalization Suite
  try {
    // Save original env
    const origEnv = process.env.VITE_API_BASE_URL;
    const globalAny = global as any;
    const origWindow = globalAny.window;

    let apiRoutingPassed = true;

    // Subtest 1: Unset / empty VITE_API_BASE_URL -> Same-origin relative path
    delete (import.meta as any).env?.VITE_API_BASE_URL;
    delete (import.meta as any).env?.VITE_API_URL;
    globalAny.window = undefined;
    if (getApiUrl('/api/review') !== '/api/review') {
      console.error('Subtest 1 failed: expected /api/review, got:', getApiUrl('/api/review'));
      apiRoutingPassed = false;
    }
    if (getApiUrl('/api/health') !== '/api/health') {
      console.error('Subtest 1b failed: expected /api/health, got:', getApiUrl('/api/health'));
      apiRoutingPassed = false;
    }
    if (getApiUrl('/api/languages') !== '/api/languages') {
      console.error('Subtest 1c failed: expected /api/languages, got:', getApiUrl('/api/languages'));
      apiRoutingPassed = false;
    }

    // Subtest 2: Base URL without /api (e.g. http://localhost:3000)
    globalAny.window = { __API_BASE_URL__: 'http://localhost:3000' };
    if (getApiUrl('/api/review') !== 'http://localhost:3000/api/review') {
      console.error('Subtest 2 failed: expected http://localhost:3000/api/review, got:', getApiUrl('/api/review'));
      apiRoutingPassed = false;
    }

    // Subtest 3: Base URL with trailing slash (e.g. http://localhost:3000/)
    globalAny.window = { __API_BASE_URL__: 'http://localhost:3000/' };
    if (getApiUrl('/api/review') !== 'http://localhost:3000/api/review') {
      console.error('Subtest 3 failed: expected http://localhost:3000/api/review, got:', getApiUrl('/api/review'));
      apiRoutingPassed = false;
    }

    // Subtest 4: Base URL with trailing /api (e.g. http://localhost:3000/api) -> MUST NOT produce /api/api/review
    globalAny.window = { __API_BASE_URL__: 'http://localhost:3000/api' };
    if (getApiUrl('/api/review') !== 'http://localhost:3000/api/review') {
      console.error('Subtest 4 failed: expected http://localhost:3000/api/review, got:', getApiUrl('/api/review'));
      apiRoutingPassed = false;
    }

    // Subtest 5: Base URL with trailing /api/ (e.g. http://localhost:3000/api/)
    globalAny.window = { __API_BASE_URL__: 'http://localhost:3000/api/' };
    if (getApiUrl('/api/review') !== 'http://localhost:3000/api/review') {
      console.error('Subtest 5 failed: expected http://localhost:3000/api/review, got:', getApiUrl('/api/review'));
      apiRoutingPassed = false;
    }

    // Subtest 6: Base URL is just '/api' or '/api/'
    globalAny.window = { __API_BASE_URL__: '/api' };
    if (getApiUrl('/api/review') !== '/api/review') {
      console.error('Subtest 6 failed: expected /api/review, got:', getApiUrl('/api/review'));
      apiRoutingPassed = false;
    }

    // Subtest 7: Guard against 0.0.0.0
    globalAny.window = { __API_BASE_URL__: 'http://0.0.0.0:3000' };
    if (getApiUrl('/api/review') !== '/api/review') {
      console.error('Subtest 7 failed: expected /api/review for 0.0.0.0, got:', getApiUrl('/api/review'));
      apiRoutingPassed = false;
    }

    // Cleanup
    globalAny.window = origWindow;

    if (apiRoutingPassed) {
      console.log(`✅ [PASS] 40. API Routing & getApiUrl Normalization (Guarantees no /api/api/* across all environments)`);
      passed++;
    } else {
      console.error('❌ [FAIL] 40. API Routing test failed');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 40. API Routing Test:', e.message);
    failed++;
  }

  // 41. Resilient AI JSON Parser & Recovery Suite
  try {
    let jsonPassed = true;

    // Subtest 1: Markdown wrapped JSON
    const mdJson = '```json\n{\n  "summary": "Clean code",\n  "score": 95\n}\n```';
    const parsed1 = safeExtractAndParseJSON<{ summary: string; score: number }>(mdJson);
    if (!parsed1 || parsed1.summary !== 'Clean code' || parsed1.score !== 95) {
      console.error('JSON Subtest 1 (Markdown wrapped) failed:', parsed1);
      jsonPassed = false;
    }

    // Subtest 2: Trailing commas in objects and arrays
    const trailingCommaJson = '{\n  "summary": "Fixed",\n  "items": [1, 2, 3,],\n  "score": 80,\n}';
    const parsed2 = safeExtractAndParseJSON<{ summary: string; items: number[]; score: number }>(trailingCommaJson);
    if (!parsed2 || parsed2.summary !== 'Fixed' || parsed2.items?.length !== 3) {
      console.error('JSON Subtest 2 (Trailing commas) failed:', parsed2);
      jsonPassed = false;
    }

    // Subtest 3: Raw unescaped newlines in string properties (e.g. beforeCode/afterCode)
    const rawNewlineJson = '{\n  "summary": "Multi\\nline",\n  "beforeCode": "function test() {\n  return 42;\n}"\n}';
    const parsed3 = safeExtractAndParseJSON<{ summary: string; beforeCode: string }>(rawNewlineJson);
    if (!parsed3 || !parsed3.beforeCode.includes('function test()')) {
      console.error('JSON Subtest 3 (Unescaped string newlines) failed:', parsed3);
      jsonPassed = false;
    }

    // Subtest 4: Non-JSON or broken text gracefully returns null without crashing
    const invalidText = 'This is not valid JSON at all: error occurred!';
    const parsed4 = safeExtractAndParseJSON(invalidText);
    if (parsed4 !== null) {
      console.error('JSON Subtest 4 (Invalid text) should return null, got:', parsed4);
      jsonPassed = false;
    }

    if (jsonPassed) {
      console.log(`✅ [PASS] 41. Resilient AI JSON Parser & Syntax Recovery Suite`);
      passed++;
    } else {
      console.error('❌ [FAIL] 41. Resilient AI JSON Parser test failed');
      failed++;
    }
  } catch (e: any) {
    console.error('❌ [ERROR] 41. AI JSON Parser Test:', e.message);
    failed++;
  }

  console.log('\n===================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (${passed + failed} TOTAL)`);
  console.log('===================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
