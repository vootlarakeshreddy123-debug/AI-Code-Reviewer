#!/usr/bin/env python3
"""
Real Established Python Code Analysis Engine
Combines:
  1. Python AST (Syntax parsing & Control-flow structure analysis)
  2. Ruff (Python linting, bug prevention, quality checks)
  3. Pyflakes (Undefined variables, unused imports)
  4. Bandit (Python security vulnerabilities)
  5. mypy (Static type checking)

Normalizes all findings into a uniform schema:
{
  "category": "SYNTAX_ERRORS | BUGS_RUNTIME_ERRORS | SECURITY_ISSUES | PERFORMANCE | CODE_QUALITY | DEBUG_DEVELOPMENT_ARTIFACTS | STYLE | INFO",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW | INFO",
  "title": str,
  "line": int,
  "column": int,
  "problematicCode": str,
  "explanation": str,
  "recommendedFix": str,
  "source": "AST | Ruff | Pyflakes | Bandit | mypy"
}
"""

import ast
import io
import json
import os
import re
import subprocess
import sys
import tempfile

def get_code_line(code_lines, line_num):
    if 1 <= line_num <= len(code_lines):
        return code_lines[line_num - 1].strip()
    return ""

def run_ast_analysis(code, code_lines):
    findings = []
    
    # 1. Syntax Parsing via ast.parse
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        line = e.lineno or 1
        col = e.offset or 1
        prob_code = get_code_line(code_lines, line) or (e.text.strip() if e.text else "")
        findings.append({
            "id": f"ast_syn_{line}_{col}",
            "category": "SYNTAX_ERRORS",
            "severity": "HIGH",
            "title": f"Syntax Error: {e.msg.capitalize()}",
            "line": line,
            "column": col,
            "problematicCode": prob_code,
            "problematic_code": prob_code,
            "explanation": f"Python AST parser syntax error on line {line}: {e.msg}.",
            "recommendedFix": "Fix syntax error to form valid Python code.",
            "recommended_fix": "Fix syntax error to form valid Python code.",
            "source": "AST",
            "detection_source": "Python AST Parser"
        })
        return findings, None

    # 2. Scope, Structural, Security, and Control Flow Visitor
    BUILTIN_NAMES = set(dir(__builtins__)) | {
        "__file__", "__name__", "__doc__", "__package__", "__spec__", "__loader__",
        "True", "False", "None", "NotImplemented", "Ellipsis"
    }

    # Pass 1: Collect module-level symbols
    module_globals = set()
    for top_node in getattr(tree, 'body', []):
        if isinstance(top_node, (ast.Import, ast.ImportFrom)):
            for alias in top_node.names:
                module_globals.add(alias.asname or alias.name.split('.')[0])
        elif isinstance(top_node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            module_globals.add(top_node.name)
        elif isinstance(top_node, ast.Assign):
            for t in top_node.targets:
                for sub in ast.walk(t):
                    if isinstance(sub, ast.Name):
                        module_globals.add(sub.id)
        elif isinstance(top_node, ast.AnnAssign) and isinstance(top_node.target, ast.Name):
            module_globals.add(top_node.target.id)

    class ComprehensiveVisitor(ast.NodeVisitor):
        def __init__(self):
            self.assigned_vars = {} # var_name -> literal_val / ast_node
            self.assigned_nodes = {} # var_name -> ast.Node
            self.functions = {}     # func_name -> {'req_args': int, 'total_args': int, 'has_varargs': bool}
            self.list_literals = {} # var_name -> list_length
            self.dict_literals = {} # var_name -> set(keys)
            self.scope_stack = [set(module_globals)]
            self.current_function = None # tracks if inside async function or regular function

        def current_scope(self):
            all_visible = set(BUILTIN_NAMES) | set(module_globals)
            for sc in self.scope_stack:
                all_visible.update(sc)
            return all_visible

        def visit_FunctionDef(self, node):
            old_fn = self.current_function
            self.current_function = node

            req_args = len(node.args.args) - len(node.args.defaults)
            total_args = len(node.args.args)
            has_varargs = node.args.vararg is not None
            self.functions[node.name] = {
                'req_args': req_args,
                'total_args': total_args,
                'has_varargs': has_varargs,
                'line': node.lineno
            }

            # Check if function performs division by a parameter (e.g. def divide(a, b): return a / b)
            for sub in ast.walk(node):
                if isinstance(sub, ast.BinOp) and isinstance(sub.op, (ast.Div, ast.FloorDiv, ast.Mod)):
                    if isinstance(sub.right, ast.Name):
                        for p_idx, p_arg in enumerate(node.args.args):
                            if p_arg.arg == sub.right.id:
                                self.functions[node.name]['divisor_param_idx'] = p_idx
                                self.functions[node.name]['divisor_param_name'] = p_arg.arg

            # Check for Mutable Default Arguments: def fn(x=[]) or def fn(x={})
            for default_node in (node.args.defaults + getattr(node.args, 'kw_defaults', [])):
                if default_node and isinstance(default_node, (ast.List, ast.Dict, ast.Set)):
                    def_line = default_node.lineno
                    def_col = default_node.col_offset + 1
                    prob_code = get_code_line(code_lines, def_line)
                    findings.append({
                        "id": f"ast_mut_def_{def_line}_{def_col}",
                        "category": "BUGS_RUNTIME_ERRORS",
                        "severity": "HIGH",
                        "title": "Mutable Default Argument Detected (Python Trap)",
                        "line": def_line,
                        "column": def_col,
                        "problematicCode": prob_code,
                        "problematic_code": prob_code,
                        "explanation": f"Function '{node.name}' uses a mutable default argument (list/dict/set). The default object is created once at function definition and shared across all calls, causing unexpected state mutations.",
                        "recommendedFix": "Use None as default value (e.g. arg=None) and initialize the mutable object inside the function body if arg is None.",
                        "recommended_fix": "Use None as default value (e.g. arg=None) and initialize the mutable object inside the function body if arg is None.",
                        "source": "AST",
                        "detection_source": "Python AST Structure Checker"
                    })

            # Create local scope for function
            local_scope = set()
            for arg in node.args.args:
                local_scope.add(arg.arg)
            for arg in node.args.kwonlyargs:
                local_scope.add(arg.arg)
            if node.args.vararg:
                local_scope.add(node.args.vararg.arg)
            if node.args.kwarg:
                local_scope.add(node.args.kwarg.arg)

            # Pre-collect local assigned names in function body
            for sub in ast.walk(node):
                if isinstance(sub, ast.Assign):
                    for t in sub.targets:
                        for target_name in ast.walk(t):
                            if isinstance(target_name, ast.Name):
                                local_scope.add(target_name.id)
                elif isinstance(sub, ast.AugAssign) and isinstance(sub.target, ast.Name):
                    local_scope.add(sub.target.id)
                elif isinstance(sub, ast.AnnAssign) and isinstance(sub.target, ast.Name):
                    local_scope.add(sub.target.id)
                elif isinstance(sub, ast.For) and isinstance(sub.target, ast.Name):
                    local_scope.add(sub.target.id)
                elif isinstance(sub, ast.ExceptHandler) and sub.name:
                    local_scope.add(sub.name)
                elif isinstance(sub, (ast.Import, ast.ImportFrom)):
                    for alias in sub.names:
                        local_scope.add(alias.asname or alias.name.split('.')[0])
                elif isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and sub is not node:
                    local_scope.add(sub.name)

            self.scope_stack.append(local_scope)
            self.generic_visit(node)
            self.scope_stack.pop()
            self.current_function = old_fn

        def visit_AsyncFunctionDef(self, node):
            old_fn = self.current_function
            self.current_function = node

            req_args = len(node.args.args) - len(node.args.defaults)
            total_args = len(node.args.args)
            has_varargs = node.args.vararg is not None
            self.functions[node.name] = {
                'req_args': req_args,
                'total_args': total_args,
                'has_varargs': has_varargs,
                'line': node.lineno
            }

            # Check for Mutable Default Arguments
            for default_node in (node.args.defaults + getattr(node.args, 'kw_defaults', [])):
                if default_node and isinstance(default_node, (ast.List, ast.Dict, ast.Set)):
                    def_line = default_node.lineno
                    def_col = default_node.col_offset + 1
                    prob_code = get_code_line(code_lines, def_line)
                    findings.append({
                        "id": f"ast_mut_def_{def_line}_{def_col}",
                        "category": "BUGS_RUNTIME_ERRORS",
                        "severity": "HIGH",
                        "title": "Mutable Default Argument Detected (Python Trap)",
                        "line": def_line,
                        "column": def_col,
                        "problematicCode": prob_code,
                        "problematic_code": prob_code,
                        "explanation": f"Async function '{node.name}' uses a mutable default argument. The default is shared across calls, causing cross-request state pollution.",
                        "recommendedFix": "Use None as default value and initialize inside function body.",
                        "recommended_fix": "Use None as default value and initialize inside function body.",
                        "source": "AST",
                        "detection_source": "Python AST Structure Checker"
                    })

            # Check for shared state mutation across await in async function without lock (Race Condition)
            has_await = any(isinstance(sub, ast.Await) for sub in ast.walk(node))
            global_vars_declared = set()
            for sub in ast.walk(node):
                if isinstance(sub, ast.Global):
                    for gname in sub.names:
                        global_vars_declared.add(gname)

            if has_await and global_vars_declared:
                line = node.lineno
                col = node.col_offset + 1
                prob_code = get_code_line(code_lines, line)
                findings.append({
                    "id": f"ast_async_race_{line}_{col}",
                    "category": "BUGS_RUNTIME_ERRORS",
                    "severity": "HIGH",
                    "title": "Shared Mutable State in Async Function Without Lock (Race Condition)",
                    "line": line,
                    "column": col,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"Async function '{node.name}' accesses global state ({', '.join(global_vars_declared)}) across await points without an asyncio.Lock. Concurrent requests will experience race conditions and inconsistent state.",
                    "recommendedFix": "Use an asyncio.Lock() or encapsulated atomic state repository to guard shared state modifications.",
                    "recommended_fix": "Use an asyncio.Lock() or encapsulated atomic state repository to guard shared state modifications.",
                    "source": "AST",
                    "detection_source": "Python AST Concurrency Analyzer"
                })

            # Create local scope for async function
            local_scope = set()
            for arg in node.args.args:
                local_scope.add(arg.arg)
            for arg in node.args.kwonlyargs:
                local_scope.add(arg.arg)
            if node.args.vararg:
                local_scope.add(node.args.vararg.arg)
            if node.args.kwarg:
                local_scope.add(node.args.kwarg.arg)

            for sub in ast.walk(node):
                if isinstance(sub, ast.Assign):
                    for t in sub.targets:
                        for target_name in ast.walk(t):
                            if isinstance(target_name, ast.Name):
                                local_scope.add(target_name.id)
                elif isinstance(sub, ast.AugAssign) and isinstance(sub.target, ast.Name):
                    local_scope.add(sub.target.id)
                elif isinstance(sub, ast.AnnAssign) and isinstance(sub.target, ast.Name):
                    local_scope.add(sub.target.id)
                elif isinstance(sub, ast.For) and isinstance(sub.target, ast.Name):
                    local_scope.add(sub.target.id)
                elif isinstance(sub, ast.ExceptHandler) and sub.name:
                    local_scope.add(sub.name)
                elif isinstance(sub, (ast.Import, ast.ImportFrom)):
                    for alias in sub.names:
                        local_scope.add(alias.asname or alias.name.split('.')[0])
                elif isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and sub is not node:
                    local_scope.add(sub.name)

            self.scope_stack.append(local_scope)
            self.generic_visit(node)
            self.scope_stack.pop()
            self.current_function = old_fn

        def visit_Name(self, node):
            if isinstance(node.ctx, ast.Load):
                var_name = node.id
                visible = self.current_scope()
                if var_name not in visible:
                    line = node.lineno
                    col = node.col_offset + 1
                    prob_code = get_code_line(code_lines, line)
                    findings.append({
                        "id": f"ast_undef_{line}_{col}_{var_name}",
                        "category": "BUGS_RUNTIME_ERRORS",
                        "severity": "HIGH",
                        "title": f"Undefined Variable: '{var_name}' (NameError)",
                        "line": line,
                        "column": col,
                        "problematicCode": prob_code,
                        "problematic_code": prob_code,
                        "explanation": f"Variable '{var_name}' is referenced on line {line} before being declared or imported. Accessing it will raise a NameError.",
                        "recommendedFix": f"Define '{var_name}' or import it before use.",
                        "recommended_fix": f"Define '{var_name}' or import it before use.",
                        "source": "AST",
                        "detection_source": "Python AST Semantic Analyzer"
                    })
            self.generic_visit(node)

        def visit_Assign(self, node):
            line = node.lineno
            col = node.col_offset + 1
            prob_code = get_code_line(code_lines, line)

            # Track variable values for zero division, bounds checks, and SQL injection analysis
            if len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                var_name = node.targets[0].id
                self.assigned_nodes[var_name] = node.value
                if isinstance(node.value, ast.Constant):
                    self.assigned_vars[var_name] = node.value.value
                elif isinstance(node.value, (ast.List, ast.Tuple)):
                    self.list_literals[var_name] = len(node.value.elts)
                elif isinstance(node.value, ast.Dict):
                    known_keys = set()
                    for k in node.value.keys:
                        if isinstance(k, ast.Constant):
                            known_keys.add(k.value)
                    self.dict_literals[var_name] = known_keys

                # Check for Hardcoded Secrets
                if re.search(r'(?i)(password|secret_key|api_key|token|auth_token|private_key|jwt_secret)', var_name):
                    if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                        secret_val = node.value.value.strip()
                        if len(secret_val) >= 4 and not secret_val.startswith("ENV_") and not secret_val.startswith("YOUR_"):
                            findings.append({
                                "id": f"ast_secret_{line}_{col}",
                                "category": "SECURITY_ISSUES",
                                "severity": "HIGH",
                                "title": "Hardcoded Secret / Password Detected",
                                "line": line,
                                "column": col,
                                "problematicCode": prob_code,
                                "problematic_code": prob_code,
                                "explanation": f"Potential hardcoded secret assigned to '{var_name}' on line {line}. Secrets should be stored in environment variables.",
                                "recommendedFix": "Use os.environ.get(...) or a secure secret manager instead of hardcoding credentials in source code.",
                                "recommended_fix": "Use os.environ.get(...) or a secure secret manager instead of hardcoding credentials in source code.",
                                "source": "AST",
                                "detection_source": "Python AST Security Analyzer"
                            })

            self.generic_visit(node)

        def visit_BinOp(self, node):
            line = node.lineno
            col = node.col_offset + 1
            prob_code = get_code_line(code_lines, line)

            # Division by Zero Check
            if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod)):
                is_zero = False
                divisor_repr = ""
                if isinstance(node.right, ast.Constant) and node.right.value == 0:
                    is_zero = True
                    divisor_repr = "0"
                elif isinstance(node.right, ast.Name):
                    val = self.assigned_vars.get(node.right.id)
                    if val == 0:
                        is_zero = True
                        divisor_repr = f"{node.right.id} (evaluated to 0)"

                if is_zero:
                    findings.append({
                        "id": f"ast_div0_{line}_{col}",
                        "category": "BUGS_RUNTIME_ERRORS",
                        "severity": "HIGH",
                        "title": "ZeroDivisionError / Division by Zero",
                        "line": line,
                        "column": col,
                        "problematicCode": prob_code,
                        "problematic_code": prob_code,
                        "explanation": f"Division or modulo by zero ({divisor_repr}) on line {line} causes ZeroDivisionError runtime exception.",
                        "recommendedFix": "Verify that the divisor is non-zero before performing division.",
                        "recommended_fix": "Verify that the divisor is non-zero before performing division.",
                        "source": "AST",
                        "detection_source": "Python AST Structure Analyzer"
                    })

            # Incompatible Types in Addition (e.g. str + int)
            if isinstance(node.op, ast.Add):
                left_type = None
                right_type = None
                
                if isinstance(node.left, ast.Constant):
                    left_type = type(node.left.value)
                elif isinstance(node.left, ast.Name) and node.left.id in self.assigned_vars:
                    left_type = type(self.assigned_vars[node.left.id])

                if isinstance(node.right, ast.Constant):
                    right_type = type(node.right.value)
                elif isinstance(node.right, ast.Name) and node.right.id in self.assigned_vars:
                    right_type = type(self.assigned_vars[node.right.id])

                if (left_type is str and right_type in (int, float)) or (left_type in (int, float) and right_type is str):
                    findings.append({
                        "id": f"ast_type_{line}_{col}",
                        "category": "BUGS_RUNTIME_ERRORS",
                        "severity": "HIGH",
                        "title": "TypeError: Incompatible Operand Types",
                        "line": line,
                        "column": col,
                        "problematicCode": prob_code,
                        "problematic_code": prob_code,
                        "explanation": f"Cannot concatenate string '{left_type.__name__}' with number '{right_type.__name__}'. This raises a TypeError at runtime.",
                        "recommendedFix": "Explicitly convert the number to string using str() or use f-string formatting.",
                        "recommended_fix": "Explicitly convert the number to string using str() or use f-string formatting.",
                        "source": "AST",
                        "detection_source": "Python AST Type Checker"
                    })

            self.generic_visit(node)

        def visit_Subscript(self, node):
            line = node.lineno
            col = node.col_offset + 1
            prob_code = get_code_line(code_lines, line)

            # Static List / Tuple Index Out of Range Check
            list_len = None
            target_name = "sequence"

            if isinstance(node.value, ast.Name) and node.value.id in self.list_literals:
                list_len = self.list_literals[node.value.id]
                target_name = f"'{node.value.id}'"
            elif isinstance(node.value, (ast.List, ast.Tuple)):
                list_len = len(node.value.elts)
                target_name = "list literal"
            elif isinstance(node.value, ast.Constant) and isinstance(node.value.value, (str, bytes)):
                list_len = len(node.value.value)
                target_name = "string literal"

            if list_len is not None:
                idx_val = None
                # Check constant integer index
                if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, int):
                    idx_val = node.slice.value
                elif hasattr(node.slice, 'value') and isinstance(node.slice.value, int): # python <= 3.8
                    idx_val = node.slice.value

                if idx_val is not None and (idx_val >= list_len or idx_val < -list_len):
                    findings.append({
                        "id": f"ast_idx_{line}_{col}",
                        "category": "BUGS_RUNTIME_ERRORS",
                        "severity": "HIGH",
                        "title": "IndexError / Index Out of Range",
                        "line": line,
                        "column": col,
                        "problematicCode": prob_code,
                        "problematic_code": prob_code,
                        "explanation": f"Accessing index {idx_val} on {target_name} (length {list_len}) raises an IndexError at runtime.",
                        "recommendedFix": f"Ensure index is within valid range (0 to {list_len - 1}).",
                        "recommended_fix": f"Ensure index is within valid range (0 to {list_len - 1}).",
                        "source": "AST",
                        "detection_source": "Python AST Runtime Checker"
                    })

            # Static Dictionary KeyError Check
            dict_keys = None
            dict_name = "dictionary"
            if isinstance(node.value, ast.Name) and node.value.id in self.dict_literals:
                dict_keys = self.dict_literals[node.value.id]
                dict_name = f"`{node.value.id}`"
            elif isinstance(node.value, ast.Dict):
                dict_keys = set()
                for k in node.value.keys:
                    if isinstance(k, ast.Constant):
                        dict_keys.add(k.value)
                dict_name = "dictionary literal"

            # Check if this subscript is a read access (not assignment target)
            is_load_access = not isinstance(getattr(node, 'ctx', None), ast.Store)
            if dict_keys is not None and is_load_access:
                accessed_key = None
                if isinstance(node.slice, ast.Constant):
                    accessed_key = node.slice.value
                elif hasattr(node.slice, 'value') and isinstance(getattr(node.slice, 'value'), (str, int, float, bool)):
                    accessed_key = node.slice.value

                if accessed_key is not None and accessed_key not in dict_keys:
                    keys_list = [repr(k) for k in sorted(list(dict_keys), key=lambda x: str(x))]
                    keys_disp = ", ".join(keys_list) if keys_list else "none"
                    clean_dict_name = dict_name.replace('`', '')
                    findings.append({
                        "id": f"ast_keyerr_{line}_{col}_{accessed_key}",
                        "category": "BUGS_RUNTIME_ERRORS",
                        "severity": "HIGH",
                        "title": f"KeyError: '{accessed_key}'",
                        "line": line,
                        "column": col,
                        "problematicCode": prob_code,
                        "problematic_code": prob_code,
                        "explanation": f"Dictionary {dict_name} contains the known key {keys_disp}, but the code accesses the missing key {accessed_key}, which raises KeyError at runtime.",
                        "recommendedFix": f"Ensure key '{accessed_key}' exists in dictionary before accessing, or use {clean_dict_name}.get('{accessed_key}') with a default value.",
                        "recommended_fix": f"Ensure key '{accessed_key}' exists in dictionary before accessing, or use {clean_dict_name}.get('{accessed_key}') with a default value.",
                        "source": "AST",
                        "detection_source": "Python AST Dictionary Checker"
                    })

            self.generic_visit(node)

        def visit_Attribute(self, node):
            line = node.lineno
            col = node.col_offset + 1
            prob_code = get_code_line(code_lines, line)
            attr = node.attr

            # 0. NoneType attribute access (e.g. number = None; number.upper() or None.foo)
            is_none = (isinstance(node.value, ast.Constant) and node.value.value is None) or (isinstance(node.value, ast.Name) and node.value.id in self.assigned_vars and self.assigned_vars[node.value.id] is None)
            if is_none:
                val_repr = "None" if isinstance(node.value, ast.Constant) else f"'{node.value.id}' (evaluated to None)"
                findings.append({
                    "id": f"ast_attr_none_{line}_{col}_{attr}",
                    "category": "BUGS_RUNTIME_ERRORS",
                    "severity": "HIGH",
                    "title": f"AttributeError: 'NoneType' object has no attribute '{attr}'",
                    "line": line,
                    "column": col,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"Expression {val_repr} on line {line} is None. Accessing attribute or method '.{attr}' raises AttributeError at runtime.",
                    "recommendedFix": f"Verify that the object is not None before accessing '.{attr}' (e.g. 'if obj is not None:').",
                    "recommended_fix": f"Verify that the object is not None before accessing '.{attr}' (e.g. 'if obj is not None:').",
                    "source": "AST",
                    "detection_source": "Python AST Null / None Dereference Analyzer"
                })

            # 1. str object invalid methods
            is_str = (isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)) or (isinstance(node.value, ast.Name) and isinstance(self.assigned_vars.get(node.value.id), str))
            if is_str and attr in ('append', 'add', 'push', 'pop', 'extend', 'insert', 'remove'):
                findings.append({
                    "id": f"ast_attr_{line}_{col}_{attr}",
                    "category": "BUGS_RUNTIME_ERRORS",
                    "severity": "HIGH",
                    "title": f"AttributeError: 'str' object has no attribute '{attr}'",
                    "line": line,
                    "column": col,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"String objects are immutable and do not have an '{attr}' method. Calling it raises an AttributeError at runtime.",
                    "recommendedFix": f"Strings do not support '.{attr}()'. Use string concatenation (+) or formatting.",
                    "recommended_fix": f"Strings do not support '.{attr}()'. Use string concatenation (+) or formatting.",
                    "source": "AST",
                    "detection_source": "Python AST Attribute Checker"
                })

            # 2. list object invalid methods
            is_list = isinstance(node.value, ast.List) or (isinstance(node.value, ast.Name) and node.value.id in self.list_literals)
            if is_list and attr in ('keys', 'values', 'items', 'add', 'push', 'has_key'):
                findings.append({
                    "id": f"ast_attr_{line}_{col}_{attr}",
                    "category": "BUGS_RUNTIME_ERRORS",
                    "severity": "HIGH",
                    "title": f"AttributeError: 'list' object has no attribute '{attr}'",
                    "line": line,
                    "column": col,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"List objects do not have a '{attr}' method. Calling it raises an AttributeError at runtime.",
                    "recommendedFix": f"Lists do not have '.{attr}()'. Use .append() or index access.",
                    "recommended_fix": f"Lists do not have '.{attr}()'. Use .append() or index access.",
                    "source": "AST",
                    "detection_source": "Python AST Attribute Checker"
                })

            # 3. dict object invalid methods
            is_dict = isinstance(node.value, ast.Dict) or (isinstance(node.value, ast.Name) and node.value.id in self.dict_literals)
            if is_dict and attr in ('append', 'extend', 'add', 'push', 'insert', 'remove'):
                findings.append({
                    "id": f"ast_attr_{line}_{col}_{attr}",
                    "category": "BUGS_RUNTIME_ERRORS",
                    "severity": "HIGH",
                    "title": f"AttributeError: 'dict' object has no attribute '{attr}'",
                    "line": line,
                    "column": col,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"Dictionary objects do not have a '{attr}' method. Calling it raises an AttributeError at runtime.",
                    "recommendedFix": f"Dictionaries do not support '.{attr}()'. Assign keys directly or use .update().",
                    "recommended_fix": f"Dictionaries do not support '.{attr}()'. Assign keys directly or use .update().",
                    "source": "AST",
                    "detection_source": "Python AST Attribute Checker"
                })

            # 4. tuple object invalid methods
            is_tuple = isinstance(node.value, ast.Tuple)
            if is_tuple and attr in ('append', 'extend', 'add', 'push', 'insert', 'remove', 'pop'):
                findings.append({
                    "id": f"ast_attr_{line}_{col}_{attr}",
                    "category": "BUGS_RUNTIME_ERRORS",
                    "severity": "HIGH",
                    "title": f"AttributeError: 'tuple' object has no attribute '{attr}'",
                    "line": line,
                    "column": col,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"Tuple objects are immutable and do not have an '{attr}' method. Calling it raises an AttributeError at runtime.",
                    "recommendedFix": f"Tuples are immutable. Convert to list if mutations are required.",
                    "recommended_fix": f"Tuples are immutable. Convert to list if mutations are required.",
                    "source": "AST",
                    "detection_source": "Python AST Attribute Checker"
                })

            # 5. number object invalid methods
            is_num = (isinstance(node.value, ast.Constant) and isinstance(node.value.value, (int, float))) or (isinstance(node.value, ast.Name) and isinstance(self.assigned_vars.get(node.value.id), (int, float)))
            if is_num and attr in ('length', 'size', 'append', 'push', 'keys', 'values'):
                findings.append({
                    "id": f"ast_attr_{line}_{col}_{attr}",
                    "category": "BUGS_RUNTIME_ERRORS",
                    "severity": "HIGH",
                    "title": f"AttributeError: numeric object has no attribute '{attr}'",
                    "line": line,
                    "column": col,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"Numeric types do not have a '{attr}' attribute. Accessing it raises an AttributeError at runtime.",
                    "recommendedFix": f"Remove invalid attribute access '.{attr}'.",
                    "recommended_fix": f"Remove invalid attribute access '.{attr}'.",
                    "source": "AST",
                    "detection_source": "Python AST Attribute Checker"
                })

            self.generic_visit(node)

        def visit_Call(self, node):
            line = node.lineno
            col = node.col_offset + 1
            prob_code = get_code_line(code_lines, line)

            # 1. Dangerous eval() call
            if isinstance(node.func, ast.Name) and node.func.id == 'eval':
                findings.append({
                    "id": f"ast_eval_{line}_{col}",
                    "category": "SECURITY_ISSUES",
                    "severity": "CRITICAL",
                    "title": "Dangerous eval() Code Execution",
                    "line": line,
                    "column": col,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"Dynamic evaluation with eval() on line {line} executes arbitrary Python code and enables Remote Code Execution (RCE) vulnerabilities.",
                    "recommendedFix": "Use ast.literal_eval() for safe literal parsing, or refactor to avoid dynamic evaluation.",
                    "recommended_fix": "Use ast.literal_eval() for safe literal parsing, or refactor to avoid dynamic evaluation.",
                    "source": "AST",
                    "detection_source": "Python AST Security Analyzer"
                })

            # 2. Dynamic exec() call
            elif isinstance(node.func, ast.Name) and node.func.id == 'exec':
                findings.append({
                    "id": f"ast_exec_{line}_{col}",
                    "category": "SECURITY_ISSUES",
                    "severity": "CRITICAL",
                    "title": "Dynamic Code Execution (exec)",
                    "line": line,
                    "column": col,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"Dynamic execution with exec() on line {line} allows execution of unverified strings as code.",
                    "recommendedFix": "Avoid using exec(). Implement logic using explicit functions and data structures.",
                    "recommended_fix": "Avoid using exec(). Implement logic using explicit functions and data structures.",
                    "source": "AST",
                    "detection_source": "Python AST Security Analyzer"
                })

            # 3. Command Injection via subprocess (shell=True) or os.system
            elif isinstance(node.func, ast.Attribute):
                attr_name = node.func.attr
                val_id = getattr(node.func.value, 'id', '')

                if val_id in ('subprocess', 'os') or attr_name in ('system', 'popen', 'run', 'Popen', 'call', 'check_output'):
                    # Check shell=True in kwargs
                    has_shell_true = False
                    for kw in node.keywords:
                        if kw.arg == 'shell':
                            if (isinstance(kw.value, ast.Constant) and kw.value.value is True) or (isinstance(kw.value, ast.Name) and kw.value.id == 'True'):
                                has_shell_true = True
                    
                    if attr_name in ('system', 'popen') or has_shell_true:
                        findings.append({
                            "id": f"ast_cmdi_{line}_{col}",
                            "category": "SECURITY_ISSUES",
                            "severity": "CRITICAL",
                            "title": "Command Injection / Unsafe Subprocess (shell=True)",
                            "line": line,
                            "column": col,
                            "problematicCode": prob_code,
                            "problematic_code": prob_code,
                            "explanation": f"Subprocess invocation on line {line} executes commands via the system shell (shell=True or os.system). If user-controlled input reaches this call, arbitrary shell commands can be executed.",
                            "recommendedFix": "Pass arguments as a list with shell=False (e.g. subprocess.run(['command', arg1, arg2], check=True)).",
                            "recommended_fix": "Pass arguments as a list with shell=False (e.g. subprocess.run(['command', arg1, arg2], check=True)).",
                            "source": "AST",
                            "detection_source": "Python AST Security Analyzer"
                        })

            # 4. Insecure Cryptographic Hash Algorithm (MD5 / SHA1)
            is_weak_hash = False
            hash_name = ""
            if isinstance(node.func, ast.Attribute):
                attr_name = node.func.attr
                val_id = getattr(node.func.value, 'id', '')
                if val_id in ('hashlib', 'Crypto', 'Crypto_Hash') and attr_name.lower() in ('md5', 'sha1'):
                    is_weak_hash = True
                    hash_name = attr_name.upper()
                elif attr_name.lower() == 'new' and val_id == 'hashlib' and node.args:
                    if isinstance(node.args[0], ast.Constant) and str(node.args[0].value).lower() in ('md5', 'sha1'):
                        is_weak_hash = True
                        hash_name = str(node.args[0].value).upper()

            if is_weak_hash:
                findings.append({
                    "id": f"ast_crypto_{line}_{col}",
                    "category": "SECURITY_ISSUES",
                    "severity": "HIGH",
                    "title": f"Insecure Cryptographic Hash Algorithm ({hash_name})",
                    "line": line,
                    "column": col,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"Use of weak hash algorithm '{hash_name}' on line {line} is vulnerable to collision attacks. It should not be used for security-critical contexts (passwords, tokens, HMACs).",
                    "recommendedFix": "Upgrade to a secure modern hashing algorithm such as SHA-256 (hashlib.sha256) or dedicated password hashing (bcrypt, argon2).",
                    "recommended_fix": "Upgrade to a secure modern hashing algorithm such as SHA-256 (hashlib.sha256) or dedicated password hashing (bcrypt, argon2).",
                    "source": "AST",
                    "detection_source": "Python AST Security Analyzer"
                })

            # 5. SQL Injection via Dynamic String Formatting in Query Execution
            is_sql_call = False
            if isinstance(node.func, ast.Attribute) and node.func.attr in ('execute', 'executemany', 'raw', 'query'):
                is_sql_call = True
            elif isinstance(node.func, ast.Name) and node.func.id in ('execute_sql', 'read_sql', 'raw_sql'):
                is_sql_call = True

            if is_sql_call and node.args:
                query_arg = node.args[0]
                is_dynamic_sql = False

                if isinstance(query_arg, ast.JoinedStr):
                    # f-string in SQL execute
                    is_dynamic_sql = True
                elif isinstance(query_arg, ast.BinOp) and isinstance(query_arg.op, (ast.Mod, ast.Add)):
                    # string % or string +
                    is_dynamic_sql = True
                elif isinstance(query_arg, ast.Call) and isinstance(query_arg.func, ast.Attribute) and query_arg.func.attr == 'format':
                    # "SELECT ...".format(...)
                    is_dynamic_sql = True
                elif isinstance(query_arg, ast.Name) and query_arg.id in self.assigned_nodes:
                    stored_node = self.assigned_nodes[query_arg.id]
                    if isinstance(stored_node, ast.JoinedStr):
                        is_dynamic_sql = True
                    elif isinstance(stored_node, ast.BinOp) and isinstance(stored_node.op, (ast.Mod, ast.Add)):
                        is_dynamic_sql = True
                    elif isinstance(stored_node, ast.Call) and isinstance(stored_node.func, ast.Attribute) and stored_node.func.attr == 'format':
                        is_dynamic_sql = True

                if is_dynamic_sql:
                    findings.append({
                        "id": f"ast_sqli_{line}_{col}",
                        "category": "SECURITY_ISSUES",
                        "severity": "CRITICAL",
                        "title": "SQL Injection Vulnerability in Database Query (CWE-89)",
                        "line": line,
                        "column": col,
                        "problematicCode": prob_code,
                        "problematic_code": prob_code,
                        "explanation": f"Database query execution on line {line} uses dynamic string interpolation (f-string, %, or .format()). This enables SQL Injection attacks when untrusted parameters are passed.",
                        "recommendedFix": "Use parameterized queries / prepared statements with placeholders (e.g. cursor.execute('SELECT * FROM tbl WHERE id = ?', (user_id,))) instead of string formatting.",
                        "recommended_fix": "Use parameterized queries / prepared statements with placeholders (e.g. cursor.execute('SELECT * FROM tbl WHERE id = ?', (user_id,))) instead of string formatting.",
                        "source": "AST",
                        "detection_source": "Python AST Security Analyzer"
                    })

            # Function Call Argument Count & Division by Zero Validation
            if isinstance(node.func, ast.Name) and node.func.id in self.functions:
                fn_info = self.functions[node.func.id]
                provided_args = len(node.args)

                # Check if this function divides by an argument and caller passed 0
                if 'divisor_param_idx' in fn_info:
                    d_idx = fn_info['divisor_param_idx']
                    if len(node.args) > d_idx:
                        arg_node = node.args[d_idx]
                        is_zero = False
                        if isinstance(arg_node, ast.Constant) and arg_node.value == 0:
                            is_zero = True
                        elif isinstance(arg_node, ast.Name) and self.assigned_vars.get(arg_node.id) == 0:
                            is_zero = True
                        if is_zero:
                            p_name = fn_info.get('divisor_param_name', 'arg')
                            findings.append({
                                "id": f"ast_fn_div0_{line}_{col}",
                                "category": "BUGS_RUNTIME_ERRORS",
                                "severity": "HIGH",
                                "title": f"ZeroDivisionError: Division by Zero in '{node.func.id}' Call",
                                "line": line,
                                "column": col,
                                "problematicCode": prob_code,
                                "problematic_code": prob_code,
                                "explanation": f"Function '{node.func.id}()' divides by parameter '{p_name}'. Calling it with 0 on line {line} causes a ZeroDivisionError runtime exception.",
                                "recommendedFix": f"Pass a non-zero value for '{p_name}' or add a zero-check inside '{node.func.id}'.",
                                "recommended_fix": f"Pass a non-zero value for '{p_name}' or add a zero-check inside '{node.func.id}'.",
                                "source": "AST",
                                "detection_source": "Python AST Interprocedural Analyzer"
                            })

                if not fn_info['has_varargs']:
                    if provided_args < fn_info['req_args']:
                        findings.append({
                            "id": f"ast_args_min_{line}_{col}",
                            "category": "BUGS_RUNTIME_ERRORS",
                            "severity": "HIGH",
                            "title": f"Missing Required Argument in Call to '{node.func.id}'",
                            "line": line,
                            "column": col,
                            "problematicCode": prob_code,
                            "problematic_code": prob_code,
                            "explanation": f"Function '{node.func.id}' requires at least {fn_info['req_args']} argument(s), but only {provided_args} provided.",
                            "recommendedFix": f"Provide all {fn_info['req_args']} required arguments when calling '{node.func.id}'.",
                            "recommended_fix": f"Provide all {fn_info['req_args']} required arguments when calling '{node.func.id}'.",
                            "source": "AST",
                            "detection_source": "Python AST Function Validator"
                        })
                    elif provided_args > fn_info['total_args']:
                        findings.append({
                            "id": f"ast_args_max_{line}_{col}",
                            "category": "BUGS_RUNTIME_ERRORS",
                            "severity": "HIGH",
                            "title": f"Too Many Arguments in Call to '{node.func.id}'",
                            "line": line,
                            "column": col,
                            "problematicCode": prob_code,
                            "problematic_code": prob_code,
                            "explanation": f"Function '{node.func.id}' takes {fn_info['total_args']} argument(s), but {provided_args} were given.",
                            "recommendedFix": f"Pass at most {fn_info['total_args']} arguments.",
                            "recommended_fix": f"Pass at most {fn_info['total_args']} arguments.",
                            "source": "AST",
                            "detection_source": "Python AST Function Validator"
                        })

            # Check for Debug print statements (ONLY if explicit debug markers are present)
            if isinstance(node.func, ast.Name) and node.func.id == 'print':
                has_debug_marker = False
                for arg in node.args:
                    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                        upper_val = arg.value.upper()
                        if any(marker in upper_val for marker in ['DEBUG', 'FIXME', 'TEMP', 'TEST:']):
                            has_debug_marker = True
                            break
                if has_debug_marker:
                    findings.append({
                        "id": f"ast_debug_{line}_{col}",
                        "category": "DEBUG_DEVELOPMENT_ARTIFACTS",
                        "severity": "LOW",
                        "title": "Possible Leftover Debug Output",
                        "line": line,
                        "column": col,
                        "problematicCode": prob_code,
                        "problematic_code": prob_code,
                        "explanation": f"Print statement on line {line} contains debug marker string. Remove or replace with structured logging for production.",
                        "recommendedFix": "Remove debug print statement before production deployment.",
                        "recommended_fix": "Remove debug print statement before production deployment.",
                        "source": "AST",
                        "detection_source": "Python AST Linter"
                    })

            # ValueError: Invalid literal conversion (int/float)
            if isinstance(node.func, ast.Name) and node.func.id in ('int', 'float') and node.args:
                arg = node.args[0]
                val_str = None
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    val_str = arg.value
                elif isinstance(arg, ast.Name) and isinstance(self.assigned_vars.get(arg.id), str):
                    val_str = self.assigned_vars.get(arg.id)

                if val_str is not None:
                    is_invalid = False
                    err_msg = ""
                    if node.func.id == 'int':
                        try:
                            int(val_str)
                        except ValueError:
                            is_invalid = True
                            err_msg = f"ValueError: invalid literal for int() with base 10: '{val_str}'"
                    elif node.func.id == 'float':
                        try:
                            float(val_str)
                        except ValueError:
                            is_invalid = True
                            err_msg = f"ValueError: could not convert string to float: '{val_str}'"

                    if is_invalid:
                        findings.append({
                            "id": f"ast_val_{line}_{col}_{node.func.id}",
                            "category": "BUGS_RUNTIME_ERRORS",
                            "severity": "HIGH",
                            "title": err_msg,
                            "line": line,
                            "column": col,
                            "problematicCode": prob_code,
                            "problematic_code": prob_code,
                            "explanation": f"Converting string '{val_str}' using {node.func.id}() raises a ValueError at runtime because the string does not represent a valid number.",
                            "recommendedFix": f"Validate that the string is numeric or wrap in a try/except ValueError block.",
                            "recommended_fix": f"Validate that the string is numeric or wrap in a try/except ValueError block.",
                            "source": "AST",
                            "detection_source": "Python AST Type Validator"
                        })

            self.generic_visit(node)

        def visit_While(self, node):
            line = node.lineno
            col = node.col_offset + 1
            prob_code = get_code_line(code_lines, line)

            # Check for while True: without any break, return, or raise in body
            if isinstance(node.test, ast.Constant) and node.test.value is True:
                has_exit = False
                for sub in ast.walk(node):
                    if isinstance(sub, (ast.Break, ast.Return, ast.Raise)):
                        has_exit = True
                        break
                if not has_exit:
                    findings.append({
                        "id": f"ast_loop_{line}_{col}",
                        "category": "BUGS_RUNTIME_ERRORS",
                        "severity": "HIGH",
                        "title": "Infinite Loop Detected (while True without exit)",
                        "line": line,
                        "column": col,
                        "problematicCode": prob_code,
                        "problematic_code": prob_code,
                        "explanation": f"Loop on line {line} runs indefinitely because condition is True and no break/return/raise statement exists in body.",
                        "recommendedFix": "Add a termination condition or break statement inside the loop.",
                        "recommended_fix": "Add a termination condition or break statement inside the loop.",
                        "source": "AST",
                        "detection_source": "Python AST Control Flow"
                    })

            # Check for while counter < N: where counter is never modified
            elif isinstance(node.test, ast.Compare) and isinstance(node.test.left, ast.Name):
                loop_var = node.test.left.id
                modified = False
                for sub in ast.walk(node):
                    if isinstance(sub, ast.Assign):
                        for target in sub.targets:
                            if isinstance(target, ast.Name) and target.id == loop_var:
                                modified = True
                    elif isinstance(sub, ast.AugAssign) and isinstance(sub.target, ast.Name) and sub.target.id == loop_var:
                        modified = True
                    elif isinstance(sub, (ast.Break, ast.Return, ast.Raise)):
                        modified = True
                
                if not modified:
                    findings.append({
                        "id": f"ast_loop_var_{line}_{col}",
                        "category": "BUGS_RUNTIME_ERRORS",
                        "severity": "HIGH",
                        "title": f"Potential Infinite Loop: Variable '{loop_var}' Not Modified",
                        "line": line,
                        "column": col,
                        "problematicCode": prob_code,
                        "problematic_code": prob_code,
                        "explanation": f"The condition variable '{loop_var}' in while loop on line {line} is never modified or incremented within the loop body.",
                        "recommendedFix": f"Update '{loop_var}' inside the loop body (e.g. {loop_var} += 1).",
                        "recommended_fix": f"Update '{loop_var}' inside the loop body (e.g. {loop_var} += 1).",
                        "source": "AST",
                        "detection_source": "Python AST Control Flow"
                    })

            self.generic_visit(node)

        def visit_Compare(self, node):
            line = node.lineno
            col = node.col_offset + 1
            prob_code = get_code_line(code_lines, line)

            # Check for 'is' / 'is not' with literal constants (e.g. x is 5, x is "hello")
            for op, comp in zip(node.ops, node.comparators):
                if isinstance(op, (ast.Is, ast.IsNot)):
                    # Check if either side is an integer, float, string, bytes, or list constant (excluding None, True, False)
                    is_literal_comp = False
                    for side in (node.left, comp):
                        if isinstance(side, ast.Constant) and side.value is not None and side.value is not True and side.value is not False:
                            is_literal_comp = True
                        elif isinstance(side, (ast.List, ast.Dict, ast.Set, ast.Tuple)):
                            is_literal_comp = True

                    if is_literal_comp:
                        op_str = "is" if isinstance(op, ast.Is) else "is not"
                        findings.append({
                            "id": f"ast_is_lit_{line}_{col}",
                            "category": "BUGS_RUNTIME_ERRORS",
                            "severity": "HIGH",
                            "title": f"Dangerous Identity Comparison ('{op_str}' with Literal)",
                            "line": line,
                            "column": col,
                            "problematicCode": prob_code,
                            "problematic_code": prob_code,
                            "explanation": f"Comparison with literal value on line {line} uses '{op_str}' (identity check) instead of '==' / '!=' (equality check). In Python, object identity is not guaranteed for literal values, leading to subtle bugs.",
                            "recommendedFix": f"Use '==' or '!=' to compare literal values instead of '{op_str}'.",
                            "recommended_fix": f"Use '==' or '!=' to compare literal values instead of '{op_str}'.",
                            "source": "AST",
                            "detection_source": "Python AST Comparison Checker"
                        })

            self.generic_visit(node)

    visitor = ComprehensiveVisitor()
    visitor.visit(tree)
    return findings, tree


# Cache resolved tool commands to avoid checking repeatedly
_TOOL_RUNNERS = {}

def resolve_tool_cmd(tool_name: str):
    """
    Resolves the command line arguments to run a Python tool in the active Python environment.
    Checks sys.executable -m <tool_name>, Scripts/bin directory, and PATH.
    """
    if tool_name in _TOOL_RUNNERS:
        return _TOOL_RUNNERS[tool_name]

    py_dir = os.path.dirname(sys.executable)
    candidates = [
        [sys.executable, "-m", tool_name],
        [os.path.join(py_dir, "Scripts", f"{tool_name}.exe")],
        [os.path.join(py_dir, "Scripts", tool_name)],
        [os.path.join(py_dir, "bin", tool_name)],
        [os.path.join(py_dir, f"{tool_name}.exe")],
        [os.path.join(py_dir, tool_name)],
        [f"{tool_name}.exe"],
        [tool_name]
    ]

    for cand in candidates:
        cmd_file = cand[0]
        try:
            if len(cand) >= 3 and cand[1] == "-m":
                test_proc = subprocess.run(
                    [sys.executable, "-m", tool_name, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=3
                )
                if test_proc.returncode in (0, 1, 2):
                    _TOOL_RUNNERS[tool_name] = cand
                    return cand
            elif os.path.isabs(cmd_file) and os.path.exists(cmd_file):
                _TOOL_RUNNERS[tool_name] = cand
                return cand
            else:
                test_proc = subprocess.run(
                    cand + ["--version"],
                    capture_output=True,
                    text=True,
                    timeout=3
                )
                if test_proc.returncode in (0, 1, 2):
                    _TOOL_RUNNERS[tool_name] = cand
                    return cand
        except Exception:
            continue

    _TOOL_RUNNERS[tool_name] = None
    return None


def run_pyflakes_analysis(temp_file_path, code_lines):
    findings = []
    
    # 1. Try in-process Python module import
    try:
        from pyflakes import api, reporter
        out_stream = io.StringIO()
        err_stream = io.StringIO()
        rep = reporter.Reporter(out_stream, err_stream)
        api.checkPath(temp_file_path, reporter=rep)
        output = out_stream.getvalue()
    except ImportError:
        # 2. Try running pyflakes via subprocess using resolved command
        runner = resolve_tool_cmd("pyflakes")
        if runner:
            try:
                proc = subprocess.run(
                    runner + [temp_file_path],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                output = proc.stdout or proc.stderr or ""
            except Exception as e:
                sys.stderr.write(f"Pyflakes execution warning: {e}\n")
                return findings
        else:
            sys.stderr.write("Pyflakes is not installed in the environment. Run: pip install -r requirements.txt\n")
            return findings
    except Exception as e:
        sys.stderr.write(f"Pyflakes execution warning: {e}\n")
        return findings

    for line in output.strip().splitlines():
        # Format: filename:line:col: message or filename:line: message
        parts = line.split(":")
        if len(parts) >= 3:
            try:
                line_no = int(parts[1])
                # Could be filename:line:col: msg or filename:line: msg
                if len(parts) >= 4 and parts[2].strip().isdigit():
                    col_no = int(parts[2])
                    msg = ":".join(parts[3:]).strip()
                else:
                    col_no = 1
                    msg = ":".join(parts[2:]).strip()

                prob_code = get_code_line(code_lines, line_no)

                category = "BUGS_RUNTIME_ERRORS"
                severity = "HIGH"
                title = "Static Analysis Finding"

                if "undefined name" in msg.lower():
                    category = "BUGS_RUNTIME_ERRORS"
                    severity = "HIGH"
                    var_match = re.search(r"undefined name '([^']+)'", msg)
                    var_name = var_match.group(1) if var_match else "variable"
                    title = f"Undefined Variable: '{var_name}' (NameError)"
                    explanation = f"Variable '{var_name}' is referenced on line {line_no} before being declared or imported. Accessing it will raise a NameError."
                    recommended_fix = f"Define '{var_name}' or import it before use."
                elif "imported but unused" in msg.lower():
                    category = "CODE_QUALITY"
                    severity = "LOW"
                    title = "Unused Import"
                    explanation = msg
                    recommended_fix = "Remove unused import."
                elif "assigned to but never used" in msg.lower():
                    category = "CODE_QUALITY"
                    severity = "LOW"
                    title = "Unused Local Variable"
                    explanation = msg
                    recommended_fix = "Remove or utilize the variable."
                elif "syntax" in msg.lower():
                    category = "SYNTAX_ERRORS"
                    severity = "HIGH"
                    title = "Syntax Error (Pyflakes)"
                    explanation = msg
                    recommended_fix = "Correct syntax error."
                else:
                    explanation = msg
                    recommended_fix = "Review and address the Pyflakes finding."

                findings.append({
                    "id": f"pyflakes_{line_no}_{col_no}_{len(findings)}",
                    "category": category,
                    "severity": severity,
                    "title": title,
                    "line": line_no,
                    "column": col_no,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": explanation,
                    "recommendedFix": recommended_fix,
                    "recommended_fix": recommended_fix,
                    "source": "Pyflakes",
                    "detection_source": "Pyflakes Static Analyzer"
                })
            except Exception:
                continue

    return findings


def run_bandit_analysis(temp_file_path, code_lines):
    findings = []
    runner = resolve_tool_cmd("bandit")
    if not runner:
        sys.stderr.write("Bandit is not installed in the environment. Run: pip install -r requirements.txt\n")
        return findings

    try:
        proc = subprocess.run(
            runner + ["-f", "json", "-q", temp_file_path],
            capture_output=True,
            text=True,
            timeout=15
        )
        if proc.stdout:
            data = json.loads(proc.stdout)
            for res in data.get("results", []):
                line_no = res.get("line_number", 1)
                test_id = res.get("test_id", "")
                issue_text = res.get("issue_text", "")
                bandit_sev = res.get("issue_severity", "MEDIUM").upper()
                prob_code = get_code_line(code_lines, line_no) or res.get("code", "").strip()

                # Map severity
                if bandit_sev == "HIGH":
                    sev = "CRITICAL"
                elif bandit_sev == "MEDIUM":
                    sev = "HIGH"
                else:
                    sev = "MEDIUM"

                title = f"Security Vulnerability: {issue_text}"
                if test_id == "B105" or test_id == "B106" or test_id == "B107":
                    title = "Hardcoded Secret / Password Detected"
                    sev = "HIGH"
                elif test_id == "B602" or test_id == "B603" or test_id == "B607":
                    title = "Command Injection / Unsafe Subprocess (shell=True)"
                    sev = "CRITICAL"
                elif test_id == "B307":
                    title = "Dangerous eval() Code Execution"
                    sev = "CRITICAL"
                elif test_id == "B608":
                    title = "Potential SQL Injection in String Query"
                    sev = "CRITICAL"

                findings.append({
                    "id": f"bandit_{line_no}_{test_id}_{len(findings)}",
                    "category": "SECURITY_ISSUES",
                    "severity": sev,
                    "title": title,
                    "line": line_no,
                    "column": 1,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"Bandit security scanner detected {test_id}: {issue_text} (Confidence: {res.get('issue_confidence', 'HIGH')}).",
                    "recommendedFix": "Refactor code to prevent security vulnerability. Avoid shell=True, dynamic eval(), and hardcoded credentials.",
                    "recommended_fix": "Refactor code to prevent security vulnerability. Avoid shell=True, dynamic eval(), and hardcoded credentials.",
                    "source": "Bandit",
                    "detection_source": f"Bandit Security Scanner ({test_id})"
                })
    except Exception as e:
        sys.stderr.write(f"Bandit execution warning: {e}\n")

    return findings


def run_ruff_analysis(temp_file_path, code_lines):
    findings = []
    runner = resolve_tool_cmd("ruff")
    if not runner:
        sys.stderr.write("Ruff is not installed in the environment. Run: pip install -r requirements.txt\n")
        return findings

    try:
        proc = subprocess.run(
            runner + ["check", "--output-format=json", "--no-cache", temp_file_path],
            capture_output=True,
            text=True,
            timeout=15
        )
        if proc.stdout:
            data = json.loads(proc.stdout)
            for item in data:
                code_id = item.get("code", "")
                msg = item.get("message", "")
                loc = item.get("location", {})
                line_no = loc.get("row", 1)
                col_no = loc.get("column", 1)
                prob_code = get_code_line(code_lines, line_no)

                # Category & Severity Mapping based on Ruff rule codes
                category = "CODE_QUALITY"
                severity = "LOW"
                title = f"Ruff Lint: {msg}"

                if code_id.startswith("F"):  # Pyflakes rule in Ruff
                    if code_id in ["F821", "F822", "F823"]:
                        category = "BUGS_RUNTIME_ERRORS"
                        severity = "HIGH"
                        title = f"Undefined Name: {msg}"
                    elif code_id in ["F841", "F401"]:
                        category = "CODE_QUALITY"
                        severity = "LOW"
                        title = f"Unused Element: {msg}"
                    elif code_id in ["F632", "F631"]:
                        category = "BUGS_RUNTIME_ERRORS"
                        severity = "HIGH"
                        title = f"Syntax / Logical Flaw: {msg}"
                elif code_id.startswith("E") or code_id.startswith("W"):  # Pycodestyle
                    category = "STYLE"
                    severity = "LOW"
                elif code_id.startswith("S"):  # Bandit rules in Ruff
                    category = "SECURITY_ISSUES"
                    severity = "HIGH"
                    title = f"Security Rule ({code_id}): {msg}"
                elif code_id.startswith("B"):  # Bugbear
                    category = "BUGS_RUNTIME_ERRORS"
                    severity = "MEDIUM"
                    title = f"Potential Bug ({code_id}): {msg}"

                fix_suggestion = "Review Ruff linter recommendation and refactor."
                if item.get("fix") and item["fix"].get("message"):
                    fix_suggestion = item["fix"]["message"]

                findings.append({
                    "id": f"ruff_{line_no}_{col_no}_{code_id}",
                    "category": category,
                    "severity": severity,
                    "title": title,
                    "line": line_no,
                    "column": col_no,
                    "problematicCode": prob_code,
                    "problematic_code": prob_code,
                    "explanation": f"Ruff rule {code_id}: {msg}",
                    "recommendedFix": fix_suggestion,
                    "recommended_fix": fix_suggestion,
                    "source": "Ruff",
                    "detection_source": f"Ruff Linter ({code_id})"
                })
    except Exception as e:
        sys.stderr.write(f"Ruff execution warning: {e}\n")

    return findings


def run_mypy_analysis(temp_file_path, code_lines):
    findings = []
    runner = resolve_tool_cmd("mypy")
    if not runner:
        sys.stderr.write("mypy is not installed in the environment. Run: pip install -r requirements.txt\n")
        return findings

    try:
        proc = subprocess.run(
            runner + ["--show-column-numbers", "--no-error-summary", "--hide-error-codes", "--no-incremental", "--cache-dir", os.path.join(tempfile.gettempdir(), ".mypy_cache"), temp_file_path],
            capture_output=True,
            text=True,
            timeout=15
        )
        if proc.stdout:
            for line in proc.stdout.strip().splitlines():
                parts = line.split(":")
                if len(parts) >= 4:
                    try:
                        line_no = int(parts[1])
                        col_no = int(parts[2])
                        msg = ":".join(parts[3:]).strip()
                        if "error:" in msg.lower():
                            clean_msg = re.sub(r"^error:\s*", "", msg, flags=re.IGNORECASE)
                            prob_code = get_code_line(code_lines, line_no)
                            findings.append({
                                "id": f"mypy_{line_no}_{col_no}_{len(findings)}",
                                "category": "BUGS_RUNTIME_ERRORS",
                                "severity": "HIGH",
                                "title": f"Type Error (mypy): {clean_msg}",
                                "line": line_no,
                                "column": col_no,
                                "problematicCode": prob_code,
                                "problematic_code": prob_code,
                                "explanation": f"mypy type checker found error on line {line_no}: {clean_msg}",
                                "recommendedFix": "Adjust variable types or use type annotations matching operations.",
                                "recommended_fix": "Adjust variable types or use type annotations matching operations.",
                                "source": "mypy",
                                "detection_source": "mypy Type Checker"
                            })
                    except Exception:
                        continue
    except Exception as e:
        sys.stderr.write(f"mypy execution warning: {e}\n")

    return findings


def get_semantic_issue_key(f):
    """
    Extract a normalized semantic issue key from finding attributes.
    Only exact duplicates on the same location/variable/rule will produce the same key.
    """
    text = (f.get("title", "") + " " + f.get("explanation", "") + " " + f.get("id", "") + " " + f.get("problematic_code", "")).lower()
    line = f.get("line", 1)
    col = f.get("column", 1)

    # 1. Undefined variable / name
    if "undefined" in text or "nameerror" in text or "f821" in text or "f822" in text or "f823" in text:
        var_match = re.search(r"'(.*?)'|\"(.*?)\"", text)
        var_name = (var_match.group(1) or var_match.group(2)) if var_match else ""
        return f"{line}_undefined_{var_name or col}"

    # 2. Unused import / variable
    if "unused" in text or "f841" in text or "f401" in text or "w0611" in text or "w0612" in text:
        var_match = re.search(r"'(.*?)'|\"(.*?)\"", text)
        var_name = (var_match.group(1) or var_match.group(2)) if var_match else ""
        return f"{line}_unused_{var_name or col}"

    # 3. Division by zero
    if "zerodivision" in text or "division by zero" in text:
        return f"{line}_{col}_div_by_zero"

    # 4. Index out of range
    if "indexerror" in text or "index out of range" in text:
        return f"{line}_{col}_index_error"

    # 4b. KeyError / missing dictionary key
    if "keyerror" in text or "missing dictionary key" in text or "ast_keyerr" in text:
        key_match = re.search(r"'(.*?)'|\"(.*?)\"", text)
        key_name = (key_match.group(1) or key_match.group(2)) if key_match else ""
        return f"{line}_{col}_keyerror_{key_name}"

    # 4c. AttributeError
    if "attributeerror" in text or "has no attribute" in text or "ast_attr" in text:
        attr_match = re.search(r"'(.*?)'|\"(.*?)\"", text)
        attr_name = (attr_match.group(1) or attr_match.group(2)) if attr_match else ""
        return f"{line}_{col}_attributeerror_{attr_name}"

    # 4d. ValueError
    if "valueerror" in text or "ast_val" in text:
        return f"{line}_{col}_valueerror"

    # 5. Type mismatch / incompatible operand types
    if "typeerror" in text or "incompatible" in text or "type error" in text:
        return f"{line}_{col}_type_error"

    # 6. Syntax error
    if "syntax" in text or "invalid syntax" in text:
        return f"{line}_{col}_syntax_error"

    # 7. Security vulnerabilities
    if "security" in text or f.get("category") == "SECURITY_ISSUES":
        sec_id = ""
        if "b105" in text or "password" in text or "secret" in text:
            sec_id = "secret"
        elif "b602" in text or "b603" in text or "command" in text or "subprocess" in text:
            sec_id = "cmd_injection"
        elif "b307" in text or "eval" in text:
            sec_id = "eval"
        elif "b608" in text or "sql" in text or "sqli" in text:
            sec_id = "sqli"
        elif "b303" in text or "b324" in text or "md5" in text or "sha1" in text or "crypto" in text:
            sec_id = "crypto_hash"
        return f"{line}_{col}_sec_{sec_id or f.get('id', '')}"

    # 8. Function Arguments
    if "missing required argument" in text or "too many arguments" in text or "ast_args" in text:
        return f"{line}_{col}_func_args_{f.get('title', '')}"

    # 9. Mutable Default Argument
    if "mutable default" in text or "ast_mut_def" in text:
        return f"{line}_{col}_mut_def"

    # 10. Identity Comparison with Literal
    if "identity comparison" in text or "is literal" in text or "ast_is_lit" in text:
        return f"{line}_{col}_is_lit"

    # 11. Async Race Condition
    if "shared mutable state" in text or "race condition" in text or "ast_async_race" in text:
        return f"{line}_{col}_async_race"

    # Fallback to normalized title + category + column
    title_norm = re.sub(r"[^a-z0-9]", "", f.get("title", "").lower())[:25]
    return f"{f.get('category')}_{line}_{col}_{title_norm}"


def deduplicate_findings(all_findings):
    """
    Deduplicates findings on the same line and same core defect while preserving
    the highest-priority source and details.
    """
    seen_keys = set()
    unique = []

    # Priority ranking for sources (Bandit > Pyflakes > AST > Ruff > mypy)
    SOURCE_PRIORITY = {
        "Bandit": 1,
        "Pyflakes": 2,
        "AST": 3,
        "Ruff": 4,
        "mypy": 5
    }

    SEVERITY_PRIORITY = {
        "CRITICAL": 1,
        "HIGH": 2,
        "MEDIUM": 3,
        "LOW": 4,
        "INFO": 5
    }

    # Sort so that highest severity and highest priority sources come first
    all_findings.sort(key=lambda f: (
        SEVERITY_PRIORITY.get(f.get("severity", "LOW"), 9),
        SOURCE_PRIORITY.get(f.get("source", "AST"), 9),
        f.get("line", 1),
        f.get("column", 1)
    ))

    for f in all_findings:
        dedup_key = get_semantic_issue_key(f)

        if dedup_key not in seen_keys:
            seen_keys.add(dedup_key)
            unique.append(f)

    # Sort by line and column
    unique.sort(key=lambda x: (x.get("line", 1), x.get("column", 1)))
    return unique


def analyze_python_code(code: str):
    code_lines = code.splitlines()
    all_findings = []

    # 1. AST Analysis
    ast_findings, tree = run_ast_analysis(code, code_lines)
    all_findings.extend(ast_findings)

    # Create temporary python file for external tool runners
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
        f.write(code)
        temp_file_path = f.name

    try:
        # 2. Pyflakes Analysis
        pyflakes_findings = run_pyflakes_analysis(temp_file_path, code_lines)
        all_findings.extend(pyflakes_findings)

        # 3. Bandit Security Analysis
        bandit_findings = run_bandit_analysis(temp_file_path, code_lines)
        all_findings.extend(bandit_findings)

        # 4. Ruff Linter & Bug Checks
        ruff_findings = run_ruff_analysis(temp_file_path, code_lines)
        all_findings.extend(ruff_findings)

        # 5. mypy Type Checks (if annotations or typing used)
        if "def " in code or ":" in code or "import " in code:
            mypy_findings = run_mypy_analysis(temp_file_path, code_lines)
            all_findings.extend(mypy_findings)

    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

    # Deduplicate and sort findings
    final_findings = deduplicate_findings(all_findings)
    return final_findings


if __name__ == "__main__":
    try:
        if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
            with open(sys.argv[1], "r", encoding="utf-8") as f:
                source_code = f.read()
        else:
            source_code = sys.stdin.read()

        results = analyze_python_code(source_code)
        sys.stdout.write(json.dumps(results, indent=2))
        sys.stdout.flush()
    except Exception as e:
        err_obj = [{
            "id": "py_engine_error",
            "category": "SYNTAX_ERRORS",
            "severity": "HIGH",
            "title": "Analysis Engine Exception",
            "line": 1,
            "column": 1,
            "problematicCode": "",
            "problematic_code": "",
            "explanation": f"Python analysis engine encountered an unhandled exception: {str(e)}",
            "recommendedFix": "Check source code formatting.",
            "recommended_fix": "Check source code formatting.",
            "source": "AST",
            "detection_source": "Python Engine Error"
        }]
        sys.stdout.write(json.dumps(err_obj, indent=2))
        sys.stdout.flush()
