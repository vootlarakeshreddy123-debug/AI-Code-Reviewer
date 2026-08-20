# 🤖 AI Code Reviewer
<p align="center">
  <img src="public/images/Screenshot 2026-08-16 171053.png" alt="AI-Code-Reviewer" width="800"/>
</p>

An intelligent full-stack **AI Code Review platform** that analyzes source code, detects errors, bugs, security vulnerabilities, performance problems, code-quality issues, and style violations, and provides clear explanations and recommended fixes.

The system combines **language-specific static analyzers** with an **AI reasoning and explanation layer** to provide detailed code reviews.

## 🚀 Features

* 🤖 AI-powered code analysis
* 🔍 Automatic bug and error detection
* 🛡️ Security vulnerability detection
* ⚡ Performance issue detection
* 🧹 Code-quality analysis
* 🎨 Style and convention checking
* 🐛 Runtime-error detection
* 📊 Severity-based findings
* 📍 Line-by-line error locations
* 💡 Recommended fixes
* 🔬 Language-specific analyzers
* 📈 Overall code-quality score
* 🧩 Analyzer status reporting
* 🔒 Strict language-analyzer isolation
* 📋 Detailed analysis reports
* 🌐 Localhost development support
* ☁️ Google AI Studio support
* 🚀 GitHub deployment support

## 🌐 Supported Languages

The project is designed to analyze multiple programming languages using their appropriate compiler, linter, or static-analysis tooling.

Currently tested languages include:

* Python
* JavaScript
* TypeScript
* Java
* C++
* C#
* Go
* Rust
* PHP
* HTML
* Ruby

Analyzer availability depends on whether the required language toolchain is installed and accessible in the deployment environment.

## 🛠️ Technology Stack

### Frontend

* React
* TypeScript
* Vite

### Backend

* Node.js
* Express
* TypeScript

### AI

* Gemini API
* Google AI Studio

### Static Analysis

Language-specific compiler and analyzer integrations are used where available.

Examples include:

* TypeScript compiler diagnostics
* Java compiler analysis
* Clang / Clang-Tidy
* .NET / Roslyn
* Go tooling
* Rust compiler / Clippy
* PHP static analysis
* HTML validation

## 📁 Project Structure

```text
AI-Code-Reviewer/
│
├── .github/
│
├── scripts/
│
├── src/
│   ├── server/
│   │   └── analyzers/
│   │       ├── AnalyzerRegistry
│   │       ├── CodeAnalyzer
│   │       └── language-specific analyzers
│   │
│   └── ...
│
├── .env.example
├── .gitignore
├── index.html
├── metadata.json
├── package.json
├── requirements.txt
├── server.ts
├── tsconfig.json
├── vite.config.ts
└── README.md
```

Live Demo

https://ai-code-reviewer-1hx0.onrender.com/api/review

## 🔗 Repository

**GitHub:**

https://github.com/vootlarakeshreddy123-debug/AI-Code-Reviewer


## 👨‍💻 Author

**Rakesh Reddy**

AI/ML Student

GitHub:
https://github.com/vootlarakeshreddy123-debug

---

⭐ If you find the project useful, consider giving the repository a star.
