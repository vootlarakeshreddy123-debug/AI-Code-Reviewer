import { Language } from '../../types';
import { CodeAnalyzer } from './CodeAnalyzer';
import { PythonAnalyzer } from './PythonAnalyzer';
import { TypeScriptAnalyzer } from './TypeScriptAnalyzer';
import { JavaScriptAnalyzer } from './JavaScriptAnalyzer';
import { GoAnalyzer } from './GoAnalyzer';
import { RustAnalyzer } from './RustAnalyzer';
import { JavaAnalyzer } from './JavaAnalyzer';
import { CppAnalyzer } from './CppAnalyzer';
import { CSharpAnalyzer } from './CSharpAnalyzer';
import { PHPAnalyzer } from './PHPAnalyzer';
import { RubyAnalyzer } from './RubyAnalyzer';
import { HtmlAnalyzer } from './HtmlAnalyzer';

export class AnalyzerRegistry {
  private static pythonAnalyzer = new PythonAnalyzer();
  private static tsAnalyzer = new TypeScriptAnalyzer();
  private static jsAnalyzer = new JavaScriptAnalyzer();
  private static goAnalyzer = new GoAnalyzer();
  private static rustAnalyzer = new RustAnalyzer();
  private static javaAnalyzer = new JavaAnalyzer();
  private static cppAnalyzer = new CppAnalyzer();
  private static csharpAnalyzer = new CSharpAnalyzer();
  private static phpAnalyzer = new PHPAnalyzer();
  private static rubyAnalyzer = new RubyAnalyzer();
  private static htmlAnalyzer = new HtmlAnalyzer();

  public static normalizeLanguage(language: string): Language {
    const lang = (language || '').toLowerCase().trim();

    if (lang === 'python' || lang === 'py' || lang === 'python3') return 'python';
    if (lang === 'typescript' || lang === 'ts' || lang === 'tsx') return 'typescript';
    if (lang === 'javascript' || lang === 'js' || lang === 'jsx') return 'javascript';
    if (lang === 'go' || lang === 'golang') return 'go';
    if (lang === 'rust' || lang === 'rs') return 'rust';
    if (lang === 'java') return 'java';
    if (lang === 'cpp' || lang === 'c++' || lang === 'cxx' || lang === 'c') return 'cpp';
    if (lang === 'csharp' || lang === 'c#' || lang === 'cs' || lang === 'dotnet') return 'csharp';
    if (lang === 'php') return 'php';
    if (lang === 'ruby' || lang === 'rb') return 'ruby';
    if (lang === 'html' || lang === 'htm') return 'html';

    return 'python';
  }

  public static getAnalyzer(language: string): CodeAnalyzer {
    const canonical = this.normalizeLanguage(language);

    switch (canonical) {
      case 'python':
        return this.pythonAnalyzer;
      case 'typescript':
        return this.tsAnalyzer;
      case 'javascript':
        return this.jsAnalyzer;
      case 'go':
        return this.goAnalyzer;
      case 'rust':
        return this.rustAnalyzer;
      case 'java':
        return this.javaAnalyzer;
      case 'cpp':
        return this.cppAnalyzer;
      case 'csharp':
        return this.csharpAnalyzer;
      case 'php':
        return this.phpAnalyzer;
      case 'ruby':
        return this.rubyAnalyzer;
      case 'html':
        return this.htmlAnalyzer;
      default:
        return this.pythonAnalyzer;
    }
  }

  public static getSupportedLanguages(): {
    id: Language;
    label: string;
    analyzerName: string;
    tools: string[];
  }[] {
    return [
      {
        id: 'python',
        label: 'Python 3.12',
        analyzerName: 'Python AST / Pyflakes / Bandit / Ruff / mypy',
        tools: ['AST', 'Pyflakes', 'Bandit', 'Ruff', 'mypy']
      },
      {
        id: 'typescript',
        label: 'TypeScript / React',
        analyzerName: 'TypeScript Compiler API / ESLint / AST',
        tools: ['TypeScript Compiler', 'AST', 'ESLint']
      },
      {
        id: 'javascript',
        label: 'JavaScript (Node.js)',
        analyzerName: 'JavaScript Parser / AST / ESLint',
        tools: ['JavaScript Parser', 'AST', 'ESLint']
      },
      {
        id: 'go',
        label: 'Go 1.22',
        analyzerName: 'Go Compiler (go build) / go vet / gosec',
        tools: ['go build', 'go vet', 'gosec']
      },
      {
        id: 'rust',
        label: 'Rust 2021',
        analyzerName: 'rustc compiler / Borrow Checker / Clippy',
        tools: ['rustc', 'Borrow Checker', 'Clippy']
      },
      {
        id: 'java',
        label: 'Java 21',
        analyzerName: 'javac compiler / SpotBugs / PMD',
        tools: ['javac', 'SpotBugs', 'PMD']
      },
      {
        id: 'cpp',
        label: 'C++20',
        analyzerName: 'clang++ compiler (C++20) / Clang-Tidy',
        tools: ['clang++', 'Clang-Tidy']
      },
      {
        id: 'csharp',
        label: 'C# / .NET 8',
        analyzerName: 'Roslyn Compiler / .NET Analyzers',
        tools: ['dotnet', 'Roslyn']
      },
      {
        id: 'php',
        label: 'PHP 8.3',
        analyzerName: 'php -l syntax / PHPStan Security',
        tools: ['php -l', 'PHPStan']
      },
      {
        id: 'ruby',
        label: 'Ruby 3.3',
        analyzerName: 'ruby -c syntax / RuboCop Security',
        tools: ['ruby -c', 'RuboCop']
      },
      {
        id: 'html',
        label: 'HTML',
        analyzerName: 'HTMLHint / htmlparser2 Validator',
        tools: ['HTMLHint', 'htmlparser2', 'DOM Validator']
      }
    ];
  }
}
