import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface PythonResolution {
  executable: string;
  args: string[];
  version: string;
  isAvailable: boolean;
}

let cachedPythonResolution: PythonResolution | null = null;

/**
 * Checks whether a candidate command or file path is a valid Python executable.
 * Avoids Microsoft Store WindowsApps reparse-point aliases that fail when not installed from Store.
 */
function verifyPythonCandidate(candidate: string, defaultArgs: string[] = []): { valid: boolean; version: string } {
  // Reject WindowsApps fake redirect stubs on Windows
  if (process.platform === 'win32' && candidate.toLowerCase().includes('windowsapps')) {
    return { valid: false, version: '' };
  }

  try {
    const result = spawnSync(candidate, [...defaultArgs, '--version'], {
      timeout: 4000,
      encoding: 'utf-8',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (result.status === 0) {
      const output = `${result.stdout || ''} ${result.stderr || ''}`.trim();
      if (output.toLowerCase().includes('python')) {
        return { valid: true, version: output };
      }
    }
  } catch {
    // Execution failed
  }

  return { valid: false, version: '' };
}

/**
 * Scans standard Windows installation directories for Python executables.
 */
function findWindowsPythonPaths(): string[] {
  const candidates: string[] = [];

  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env['LOCALAPPDATA'] || '';
  const appData = process.env['APPDATA'] || '';

  // Scan Program Files directories for Python3* folders
  [programFiles, programFilesX86].forEach((baseDir) => {
    if (baseDir && fs.existsSync(baseDir)) {
      try {
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && /^Python3\d*(-64|_64)?$/i.test(entry.name)) {
            const exePath = path.join(baseDir, entry.name, 'python.exe');
            if (fs.existsSync(exePath) && !candidates.includes(exePath)) {
              candidates.push(exePath);
            }
          }
        }
      } catch {
        // Directory access error
      }
    }
  });

  // Scan LocalAppData / AppData directories: %LOCALAPPDATA%\Programs\Python\Python3*
  [localAppData, appData].forEach((userBase) => {
    if (userBase) {
      const pyRoot = path.join(userBase, 'Programs', 'Python');
      if (fs.existsSync(pyRoot)) {
        try {
          const entries = fs.readdirSync(pyRoot, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && /^Python3\d*(-64|_64)?$/i.test(entry.name)) {
              const exePath = path.join(pyRoot, entry.name, 'python.exe');
              if (fs.existsSync(exePath) && !candidates.includes(exePath)) {
                candidates.push(exePath);
              }
            }
          }
        } catch {
          // Directory access error
        }
      }
    }
  });

  // Specific common fallback paths on Windows including Python 3.14
  const knownPaths = [
    'C:\\Program Files\\Python314\\python.exe',
    'C:\\Program Files\\Python314-64\\python.exe',
    'C:\\Program Files (x86)\\Python314\\python.exe',
    'C:\\Python314\\python.exe',
    'C:\\Python314-64\\python.exe',
    'C:\\Program Files\\Python313\\python.exe',
    'C:\\Program Files\\Python313-64\\python.exe',
    'C:\\Python313\\python.exe',
    'C:\\Program Files\\Python312\\python.exe',
    'C:\\Python312\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Program Files\\Python310\\python.exe',
    'C:\\Python310\\python.exe'
  ];

  for (const kp of knownPaths) {
    if (fs.existsSync(kp) && !candidates.includes(kp)) {
      candidates.push(kp);
    }
  }

  return candidates;
}

/**
 * Resolves the active Python executable across Windows, macOS, and Linux.
 * Respects the `PYTHON_EXECUTABLE` environment variable.
 */
export function resolvePythonExecutable(forceRefresh = false): PythonResolution {
  if (cachedPythonResolution && !forceRefresh) {
    return cachedPythonResolution;
  }

  const isWin = process.platform === 'win32';

  // 1. Check environment variable override
  const envPython = process.env.PYTHON_EXECUTABLE?.trim();
  if (envPython) {
    const verified = verifyPythonCandidate(envPython);
    if (verified.valid) {
      cachedPythonResolution = {
        executable: envPython,
        args: [],
        version: verified.version,
        isAvailable: true
      };
      return cachedPythonResolution;
    }
  }

  // 2. Candidate list based on OS
  const candidateList: { cmd: string; args: string[] }[] = [];

  if (isWin) {
    // Check virtual environments in project directory or env
    if (process.env.VIRTUAL_ENV) {
      const venvPy = path.join(process.env.VIRTUAL_ENV, 'Scripts', 'python.exe');
      if (fs.existsSync(venvPy)) candidateList.push({ cmd: venvPy, args: [] });
    }
    const localVenv1 = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(localVenv1)) candidateList.push({ cmd: localVenv1, args: [] });
    const localVenv2 = path.join(process.cwd(), 'venv', 'Scripts', 'python.exe');
    if (fs.existsSync(localVenv2)) candidateList.push({ cmd: localVenv2, args: [] });

    // Windows Python launcher py.exe with specific version flags
    candidateList.push({ cmd: 'py.exe', args: ['-3.14'] });
    candidateList.push({ cmd: 'py', args: ['-3.14'] });
    candidateList.push({ cmd: 'py.exe', args: ['-3'] });
    candidateList.push({ cmd: 'py', args: ['-3'] });
    // Check python.exe and python in PATH
    candidateList.push({ cmd: 'python.exe', args: [] });
    candidateList.push({ cmd: 'python', args: [] });

    // Add discovered file paths on Windows
    const discoveredPaths = findWindowsPythonPaths();
    for (const p of discoveredPaths) {
      candidateList.push({ cmd: p, args: [] });
    }
  } else {
    // Check virtual environments in project directory or env
    if (process.env.VIRTUAL_ENV) {
      const venvPy = path.join(process.env.VIRTUAL_ENV, 'bin', 'python3');
      if (fs.existsSync(venvPy)) candidateList.push({ cmd: venvPy, args: [] });
    }
    const localVenv1 = path.join(process.cwd(), '.venv', 'bin', 'python3');
    if (fs.existsSync(localVenv1)) candidateList.push({ cmd: localVenv1, args: [] });
    const localVenv2 = path.join(process.cwd(), 'venv', 'bin', 'python3');
    if (fs.existsSync(localVenv2)) candidateList.push({ cmd: localVenv2, args: [] });

    // Linux / macOS candidates
    candidateList.push({ cmd: 'python3', args: [] });
    candidateList.push({ cmd: 'python', args: [] });
    candidateList.push({ cmd: '/usr/bin/python3', args: [] });
    candidateList.push({ cmd: '/usr/local/bin/python3', args: [] });
    candidateList.push({ cmd: '/opt/homebrew/bin/python3', args: [] });
  }

  // Test candidates in order
  for (const candidate of candidateList) {
    const verified = verifyPythonCandidate(candidate.cmd, candidate.args);
    if (verified.valid) {
      cachedPythonResolution = {
        executable: candidate.cmd,
        args: candidate.args,
        version: verified.version,
        isAvailable: true
      };
      return cachedPythonResolution;
    }
  }

  // Python not available
  cachedPythonResolution = {
    executable: isWin ? 'python.exe' : 'python3',
    args: [],
    version: 'Unavailable',
    isAvailable: false
  };

  return cachedPythonResolution;
}
