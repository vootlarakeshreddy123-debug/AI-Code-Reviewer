import { CodeAnalyzer, StaticFinding, AnalysisOutput } from './CodeAnalyzer';
import { deduplicateAndIsolateFindings } from './summaryFilter';
import * as htmlparser2 from 'htmlparser2';
import * as HTMLHintModule from 'htmlhint';

function getHTMLHint(): any {
  if (typeof (HTMLHintModule as any).verify === 'function') return HTMLHintModule;
  if ((HTMLHintModule as any).HTMLHint && typeof (HTMLHintModule as any).HTMLHint.verify === 'function') return (HTMLHintModule as any).HTMLHint;
  if ((HTMLHintModule as any).default && typeof (HTMLHintModule as any).default.verify === 'function') return (HTMLHintModule as any).default;
  if ((HTMLHintModule as any).default?.HTMLHint && typeof (HTMLHintModule as any).default.HTMLHint.verify === 'function') return (HTMLHintModule as any).default.HTMLHint;
  return HTMLHintModule;
}

export class HtmlAnalyzer implements CodeAnalyzer {
  language = 'html' as const;

  async analyze(code: string): Promise<AnalysisOutput> {
    const rawFindings: StaticFinding[] = [];
    const lines = code.split('\n');

    // 1. HTMLHint Engine Check
    try {
      const hint = getHTMLHint();
      if (typeof hint?.verify === 'function') {
        const messages = hint.verify(code, {
          'tag-pair': true,
          'tag-self-close': false,
          'tagname-lowercase': true,
          'attr-lowercase': true,
          'attr-value-double-quotes': false,
          'doctype-first': false,
          'id-unique': true,
          'src-not-empty': true,
          'alt-require': true,
          'href-abs-or-rel': false
        });

        if (Array.isArray(messages)) {
          messages.forEach((msg: any, idx: number) => {
            const lineNum = Math.max(1, msg.line || 1);
            const colNum = Math.max(1, msg.col || 1);
            const probCode = lines[lineNum - 1]?.trim() || '';

            const isError = msg.type === 'error';
            const ruleId = msg.rule?.id || 'html-syntax';

            rawFindings.push({
              id: `html_hint_${lineNum}_${idx}`,
              language: 'html',
              category: isError ? 'SYNTAX_ERRORS' : 'CODE_QUALITY',
              severity: isError ? 'HIGH' : 'LOW',
              title: `HTML Structure Issue: ${msg.message}`,
              line: lineNum,
              column: colNum,
              problematicCode: probCode,
              problematic_code: probCode,
              explanation: `HTML validator found: ${msg.message} (Rule: ${ruleId}).`,
              recommendedFix: 'Correct the HTML markup tag structure to satisfy HTML5 standards.',
              recommended_fix: 'Correct the HTML markup tag structure to satisfy HTML5 standards.',
              source: 'HTMLHint',
              ruleId,
              detection_source: `HTMLHint Validator (${ruleId})`,
              confidence: 'HIGH'
            });
          });
        }
      }
    } catch (e) {
      console.warn('HTMLHint verification notice:', e);
    }

    // 2. htmlparser2 AST for Security & Semantic Hierarchy & Tag Pairing
    try {
      const seenIds = new Set<string>();
      const tagStack: { name: string; line: number }[] = [];
      const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

      const parser = new htmlparser2.Parser(
        {
          onopentag(name, attribs) {
            const lowerName = name.toLowerCase();
            const currentLineIdx = lines.findIndex((l) => l.toLowerCase().includes(`<${lowerName}`));
            const lineNum = currentLineIdx !== -1 ? currentLineIdx + 1 : 1;

            if (!voidElements.has(lowerName)) {
              tagStack.push({ name: lowerName, line: lineNum });
            }

            // Check missing alt attribute on <img> tags
            if (lowerName === 'img' && !('alt' in attribs)) {
              rawFindings.push({
                id: `html_img_alt_${lineNum}`,
                language: 'html',
                category: 'CODE_QUALITY',
                severity: 'LOW',
                title: 'Missing alt attribute on <img> tag',
                line: lineNum,
                column: 1,
                problematicCode: lines[lineNum - 1]?.trim() || '<img ...>',
                problematic_code: lines[lineNum - 1]?.trim() || '<img ...>',
                explanation: 'The <img> element is missing an "alt" attribute. Alt text provides essential descriptions for screen readers and search engines.',
                recommendedFix: 'Add a descriptive "alt" attribute to the <img> tag (e.g. alt="User profile photo") or alt="" if decorative.',
                recommended_fix: 'Add a descriptive "alt" attribute to the <img> tag (e.g. alt="User profile photo") or alt="" if decorative.',
                source: 'HTMLHint',
                ruleId: 'alt-require',
                detection_source: 'WCAG / HTML Accessibility Validator',
                confidence: 'HIGH'
              });
            }

            // Check duplicate IDs
            if (attribs.id) {
              if (seenIds.has(attribs.id)) {
                rawFindings.push({
                  id: `html_dup_id_${attribs.id}_${lineNum}`,
                  language: 'html',
                  category: 'BUGS_RUNTIME_ERRORS',
                  severity: 'MEDIUM',
                  title: `Duplicate HTML element ID '#${attribs.id}'`,
                  line: lineNum,
                  column: 1,
                  problematicCode: lines[lineNum - 1]?.trim() || `<${name} id="${attribs.id}">`,
                  explanation: `The id attribute value '${attribs.id}' is used more than once in the document. IDs must be unique.`,
                  recommendedFix: `Ensure all elements have unique IDs or use class names instead.`,
                  source: 'HTMLHint',
                  ruleId: 'id-unique',
                  detection_source: 'HTML5 DOM Validator',
                  confidence: 'HIGH'
                });
              } else {
                seenIds.add(attribs.id);
              }
            }

            // Check target="_blank" without rel="noopener noreferrer" (Reverse Tabnabbing)
            if (lowerName === 'a' && attribs.target === '_blank') {
              const rel = (attribs.rel || '').toLowerCase();
              if (!rel.includes('noopener') && !rel.includes('noreferrer')) {
                rawFindings.push({
                  id: `html_sec_tabnabbing_${lineNum}`,
                  language: 'html',
                  category: 'SECURITY_ISSUES',
                  severity: 'HIGH',
                  title: 'Reverse Tabnabbing Vulnerability (target="_blank" without rel="noopener")',
                  line: lineNum,
                  column: 1,
                  problematicCode: lines[lineNum - 1]?.trim() || '<a target="_blank" ...>',
                  problematic_code: lines[lineNum - 1]?.trim() || '<a target="_blank" ...>',
                  explanation: 'Opening external links with target="_blank" allows the opened page to access window.opener, enabling phishing and malicious redirection.',
                  recommendedFix: 'Add rel="noopener noreferrer" to all <a> tags with target="_blank".',
                  recommended_fix: 'Add rel="noopener noreferrer" to all <a> tags with target="_blank".',
                  source: 'Security Audit',
                  ruleId: 'security/tabnabbing',
                  detection_source: 'OWASP / HTML Security Validator',
                  confidence: 'HIGH'
                });
              }
            }

            // Inline JavaScript handlers (onclick, onload, onerror)
            Object.keys(attribs).forEach((attr) => {
              if (attr.toLowerCase().startsWith('on') && attr.length > 2) {
                rawFindings.push({
                  id: `html_sec_inline_js_${lineNum}_${attr}`,
                  language: 'html',
                  category: 'SECURITY_ISSUES',
                  severity: 'HIGH',
                  title: `Inline JavaScript Event Handler (${attr})`,
                  line: lineNum,
                  column: 1,
                  problematicCode: lines[lineNum - 1]?.trim() || `<${name} ${attr}="...">`,
                  explanation: `Inline event handlers violate Content Security Policy (CSP) and increase vulnerability to XSS attacks.`,
                  recommendedFix: `Remove the inline '${attr}' handler and bind event listeners via external JavaScript.`,
                  source: 'HTMLHint',
                  ruleId: 'security/no-inline-script-handler',
                  detection_source: 'W3C / CSP Security Validator',
                  confidence: 'HIGH'
                });
              }

              // javascript: pseudo-protocol in href / src
              if ((attr === 'href' || attr === 'src') && attribs[attr].trim().toLowerCase().startsWith('javascript:')) {
                rawFindings.push({
                  id: `html_sec_js_url_${lineNum}`,
                  language: 'html',
                  category: 'SECURITY_ISSUES',
                  severity: 'CRITICAL',
                  title: 'Dangerous javascript: Pseudo-Protocol in URL',
                  line: lineNum,
                  column: 1,
                  problematicCode: lines[lineNum - 1]?.trim() || `<${name} ${attr}="${attribs[attr]}">`,
                  explanation: `Using javascript: in href or src attributes allows arbitrary script execution (DOM XSS).`,
                  recommendedFix: 'Use valid HTTP(S) URLs or bind event handlers safely with addEventListener.',
                  source: 'HTMLHint',
                  ruleId: 'security/no-javascript-url',
                  detection_source: 'W3C / CSP Security Validator',
                  confidence: 'HIGH'
                });
              }

              // Insecure mixed content: http:// in script/iframe src
              if ((lowerName === 'script' || lowerName === 'iframe') && attr === 'src' && attribs[attr].toLowerCase().startsWith('http://')) {
                rawFindings.push({
                  id: `html_sec_mixed_content_${lineNum}`,
                  language: 'html',
                  category: 'SECURITY_ISSUES',
                  severity: 'HIGH',
                  title: 'Insecure Mixed Content Resource (HTTP)',
                  line: lineNum,
                  column: 1,
                  problematicCode: lines[lineNum - 1]?.trim() || `<${name} src="${attribs[attr]}">`,
                  problematic_code: lines[lineNum - 1]?.trim() || `<${name} src="${attribs[attr]}">`,
                  explanation: `Loading script or iframe resources over insecure HTTP opens the page to Man-in-the-Middle (MitM) script injection.`,
                  recommendedFix: 'Load resources strictly over HTTPS (https://...).',
                  recommended_fix: 'Load resources strictly over HTTPS (https://...).',
                  source: 'Security Audit',
                  ruleId: 'security/mixed-content',
                  detection_source: 'W3C HTTPS Security Validator',
                  confidence: 'HIGH'
                });
              }
            });
          },
          onclosetag(name) {
            const lowerName = name.toLowerCase();
            if (!voidElements.has(lowerName)) {
              if (tagStack.length > 0 && tagStack[tagStack.length - 1].name === lowerName) {
                tagStack.pop();
              }
            }
          }
        },
        { decodeEntities: true }
      );

      parser.write(code);
      parser.end();

      // Check unclosed tags
      if (tagStack.length > 0) {
        tagStack.forEach((unclosed) => {
          const lineNum = unclosed.line || 1;
          const probCode = lines[lineNum - 1]?.trim() || `<${unclosed.name}>`;
          rawFindings.push({
            id: `html_unclosed_${unclosed.name}_${lineNum}`,
            language: 'html',
            category: 'SYNTAX_ERRORS',
            severity: 'HIGH',
            title: `Unclosed HTML tag <${unclosed.name}>`,
            line: lineNum,
            column: 1,
            problematicCode: probCode,
            problematic_code: probCode,
            explanation: `The HTML tag <${unclosed.name}> opened on line ${lineNum} is missing a corresponding closing </${unclosed.name}> tag.`,
            recommendedFix: `Add closing </${unclosed.name}> tag to properly close the element.`,
            recommended_fix: `Add closing </${unclosed.name}> tag to properly close the element.`,
            source: 'HTML Parser',
            ruleId: 'html-tag-pair',
            detection_source: 'HTML5 Parser (Tag Pairing)',
            confidence: 'HIGH'
          });
        });
      }
    } catch (e) {
      console.warn('htmlparser2 parsing notice:', e);
    }

    const isolatedFindings = deduplicateAndIsolateFindings(rawFindings, 'html');

    return {
      status: 'FULLY_SUPPORTED',
      message: 'HTML5 (HTMLHint + HTML5 DOM Validator)',
      findings: isolatedFindings
    };
  }
}
