import { Language } from '../../types';
import { StaticFinding } from './CodeAnalyzer';

/**
 * Filter out compiler summary messages that are not source-level line diagnostics.
 */
export function isCompilerSummaryMessage(message?: string): boolean {
  if (!message || typeof message !== 'string') return false;
  const msg = message.trim();
  if (!msg) return false;

  const summaryPatterns = [
    /aborting due to \d+ previous errors?/i,
    /aborting due to previous error/i,
    /could not compile/i,
    /compilation failed/i,
    /build failed/i,
    /^\s*\d+\s+errors?\s+generated\.?/i,
    /^\s*\d+\s+warnings?\s+generated\.?/i,
    /^\s*\d+\s+errors?\s*$/i,
    /^\s*\d+\s+warnings?\s*$/i,
    /^Some errors have detailed explanations/i,
    /^For more information about an error/i,
    /^Errors parsing/i,
    /^#\s+[a-zA-Z0-9_\-\.\/]+$/,
    /^note: module requires/i,
    /^exit status \d+/i,
    /^\s*\^\s*$/,
    /^\s*\d+\s+error and \d+ warning/i
  ];

  return summaryPatterns.some((pattern) => pattern.test(msg));
}

/**
 * Generate a precise semantic issue key for finding deduplication.
 * Only exact duplicates on the same location/variable/rule will produce the same key.
 */
function getFindingKey(f: StaticFinding): string {
  const line = Math.max(1, f.line || 1);
  const col = Math.max(1, f.column || 1);
  const text = `${f.title || ''} ${f.explanation || ''} ${f.ruleId || ''} ${f.problematicCode || ''}`.toLowerCase();

  // 1. Undefined variable / symbol
  if (text.includes('undefined') || text.includes('nameerror') || text.includes('cannot find symbol') || text.includes('undeclared identifier')) {
    const match = text.match(/['"`](.*?)['"`]/);
    const varName = match ? match[1].toLowerCase() : '';
    return `${line}_${varName ? `undef_${varName}` : `col_${col}_undef`}`;
  }

  // 2. Unused element
  if (text.includes('unused') || text.includes('f841') || text.includes('f401') || text.includes('dead_code')) {
    const match = text.match(/['"`](.*?)['"`]/);
    const varName = match ? match[1].toLowerCase() : '';
    return `${line}_${varName ? `unused_${varName}` : `col_${col}_unused`}`;
  }

  // 3. Division by zero
  if (text.includes('division by zero') || text.includes('zerodivision') || text.includes('divide by zero')) {
    return `${line}_${col}_div_by_zero`;
  }

  // 4. Index out of bounds
  if (text.includes('index out of') || text.includes('indexerror') || text.includes('out of range') || text.includes('indexoutofbounds')) {
    return `${line}_${col}_index_error`;
  }

  // 4b. KeyError / missing dictionary key
  if (text.includes('keyerror') || text.includes('missing dictionary key') || text.includes('ast_keyerr')) {
    const match = text.match(/['"`](.*?)['"`]/);
    const keyName = match ? match[1].toLowerCase() : '';
    return `${line}_${col}_keyerror_${keyName}`;
  }

  // 4c. AttributeError
  if (text.includes('attributeerror') || text.includes('has no attribute') || text.includes('ast_attr')) {
    const match = text.match(/['"`](.*?)['"`]/);
    const attrName = match ? match[1].toLowerCase() : '';
    return `${line}_${col}_attributeerror_${attrName}`;
  }

  // 4d. ValueError
  if (text.includes('valueerror') || text.includes('ast_val')) {
    return `${line}_${col}_valueerror`;
  }

  // 5. Null pointer / dereference
  if (text.includes('null pointer') || text.includes('nullpointer') || text.includes('cannot read propert') || text.includes('null dereference')) {
    return `${line}_${col}_null_dereference`;
  }

  // 6. Syntax error
  if (text.includes('syntax error') || text.includes('parse error')) {
    return `${line}_${col}_syntax_error`;
  }

  // 7. Security vulnerabilities
  if (f.category === 'SECURITY_ISSUES' || text.includes('security') || text.includes('injection') || text.includes('secret') || text.includes('crypto')) {
    let secType = 'vuln';
    if (text.includes('sql') || text.includes('sqli') || text.includes('b608')) secType = 'sqli';
    else if (text.includes('cmd') || text.includes('command') || text.includes('subprocess') || text.includes('shell') || text.includes('b602') || text.includes('b603')) secType = 'cmdi';
    else if (text.includes('eval') || text.includes('b307') || text.includes('exec')) secType = 'eval';
    else if (text.includes('secret') || text.includes('password') || text.includes('b105') || text.includes('b106')) secType = 'secret';
    else if (text.includes('md5') || text.includes('sha1') || text.includes('crypto') || text.includes('hash') || text.includes('b303') || text.includes('b324')) secType = 'crypto';
    const rule = f.ruleId ? f.ruleId.toLowerCase().replace(/[^a-z0-9_]/g, '') : '';
    return `${line}_${col}_sec_${rule || secType}`;
  }

  // 8. Function Arguments
  if (text.includes('missing required argument') || text.includes('too many arguments') || text.includes('ast_args')) {
    return `${line}_${col}_func_args_${(f.title || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)}`;
  }

  // 9. Mutable Default Argument
  if (text.includes('mutable default') || text.includes('ast_mut_def')) {
    return `${line}_${col}_mut_def`;
  }

  // 10. Identity Comparison with Literal
  if (text.includes('identity comparison') || text.includes('is literal') || text.includes('ast_is_lit')) {
    return `${line}_${col}_is_lit`;
  }

  // 11. Async Race Condition
  if (text.includes('shared mutable state') || text.includes('race condition') || text.includes('ast_async_race')) {
    return `${line}_${col}_async_race`;
  }

  // Default: line + column + normalized rule or title
  const token = (f.ruleId || f.title || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);
  return `${line}_${col}_${token}`;
}

/**
 * Deduplicate findings for a language:
 * 1. Strictly rejects any finding whose finding.language !== expectedLanguage
 * 2. Deduplicates ONLY exact duplicates referring to the exact same issue at the same location.
 * 3. Preserves all independent findings across different lines, columns, or problem categories.
 */
export function deduplicateAndIsolateFindings(
  findings: StaticFinding[],
  expectedLanguage: Language
): StaticFinding[] {
  if (!Array.isArray(findings)) return [];

  // Step 1: Strict cross-language isolation and summary rejection
  const isolated = findings.filter((f) => {
    if (!f || typeof f !== 'object') return false;
    if (f.language && f.language !== expectedLanguage) {
      console.warn(`[Isolation] Rejected finding with language ${f.language} for review of ${expectedLanguage}`);
      return false;
    }
    if (isCompilerSummaryMessage(f.title) || isCompilerSummaryMessage(f.explanation)) {
      return false;
    }
    return true;
  });

  // Step 2: Deduplication by precise key
  const seenKeys = new Map<string, StaticFinding>();

  for (const f of isolated) {
    f.language = expectedLanguage;
    const key = getFindingKey(f);

    if (!seenKeys.has(key)) {
      seenKeys.set(key, f);
    } else {
      const existing = seenKeys.get(key)!;
      // If current finding has higher severity or more detailed explanation, merge/upgrade
      const severityRank: Record<string, number> = {
        CRITICAL: 1,
        HIGH: 2,
        MEDIUM: 3,
        LOW: 4,
        INFO: 5
      };
      const curRank = severityRank[(f.severity || '').toUpperCase()] || 9;
      const exRank = severityRank[(existing.severity || '').toUpperCase()] || 9;

      if (curRank < exRank) {
        seenKeys.set(key, {
          ...existing,
          ...f,
          explanation: f.explanation || existing.explanation,
          recommendedFix: f.recommendedFix || existing.recommendedFix || f.recommended_fix || existing.recommended_fix,
          recommended_fix: f.recommendedFix || existing.recommendedFix || f.recommended_fix || existing.recommended_fix
        });
      }
    }
  }

  return Array.from(seenKeys.values()).sort((a, b) => {
    const lineDiff = (a.line || 1) - (b.line || 1);
    if (lineDiff !== 0) return lineDiff;
    return (a.column || 1) - (b.column || 1);
  });
}
