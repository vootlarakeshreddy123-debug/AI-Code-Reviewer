import { CodeReview, Project, CustomRule, GitHubRepo, DashboardStats, UserProfile, Language } from '../types';
import { MALE_AI_CHATBOT_AVATAR } from '../assets/avatar';

export const CODE_PRESETS: { label: string; language: Language; description: string; code: string }[] = [
  {
    label: 'Python - Undefined Variable [High Runtime Error Test]',
    language: 'python',
    description: 'Calculates price with undefined return variable final_total and print output',
    code: `def calculate_price(price, tax):\n    total = price + tax\n    return final_total\n\nprint(calculate_price(100, 20))\n`,
  },
  {
    label: 'Python - Division by Zero [Runtime Bug Test]',
    language: 'python',
    description: 'Deterministic ZeroDivisionError bug at runtime & print() debug artifact',
    code: `a = 10\nb = 0\nresult = a / b\nprint(result)\n`,
  },
  {
    label: 'Python - print("hello world") [Valid Code Test]',
    language: 'python',
    description: 'Valid code check — classified as 1 Debug Artifact (low), 0 Syntax Errors, 0 Bugs',
    code: `print("hello world")\n`,
  },
  {
    label: 'Python - FastAPI & Async SQL Injection',
    language: 'python',
    description: 'Vulnerable database query and missing async await locks',
    code: `from fastapi import FastAPI, Depends, HTTPException, Query
import sqlite3
import asyncio

app = FastAPI()

# Database connection pool mock
def get_db():
    return sqlite3.connect("production_app.db")

@app.get("/users/search")
async def search_users(username: str = Query(...), db = Depends(get_db)):
    cursor = db.cursor()
    # CRITICAL: Vulnerable to SQL Injection
    query = f"SELECT id, username, email, is_admin FROM users WHERE username = '{username}'"
    cursor.execute(query)
    results = cursor.fetchall()
    
    # PERFORMANCE & BUG: Unbounded payload without pagination
    users = []
    for row in results:
        users.append({
            "id": row[0],
            "username": row[1],
            "email": row[2],
            "is_admin": row[3]
        })
    return {"users": users, "count": len(users)}

@app.post("/analytics/track")
async def track_event(event_data: dict):
    # SECURITY: Log injection risk
    print(f"Tracking event raw payload: {event_data}")
    
    # BUG: Shared state mutation without asyncio Lock
    global global_counter
    current = global_counter
    await asyncio.sleep(0.001) # Simulates network delay
    global_counter = current + 1
    
    return {"status": "ok", "total": global_counter}
`,
  },
  {
    label: 'React / TypeScript - Memory Leak & Re-render Loop',
    language: 'typescript',
    description: 'Infinite hook dependencies, memory leaks, and XSS risks',
    code: `import React, { useState, useEffect, useCallback } from 'react';

interface UserFeedProps {
  userId: string;
  onUpdate: (data: any) => void;
}

export const UserFeedComponent: React.FC<UserFeedProps> = ({ userId, onUpdate }) => {
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [rawBioHtml, setRawBioHtml] = useState('<b>User Bio</b>');

  // CRITICAL BUG: Re-render infinite loop due to object reference in dependency
  const fetchParams = { id: userId, limit: 50 };

  useEffect(() => {
    let isMounted = true;
    
    // BUG & MEMORY LEAK: WebSocket connection created inside effect without cleanup
    const ws = new WebSocket('wss://api.example.com/live-feed');
    ws.onmessage = (event) => {
      const newItem = JSON.parse(event.data);
      setFeedItems((prev) => [...prev, newItem]);
    };

    fetch('/api/feed', {
      method: 'POST',
      body: JSON.stringify(fetchParams)
    })
      .then(res => res.json())
      .then(data => {
        if (isMounted) {
          setFeedItems(data);
          // WARNING: Calling parent callback on every effect execution
          onUpdate(data);
        }
      });

    // MISSING CLEANUP: ws.close() missing!
  }, [fetchParams, onUpdate]);

  return (
    <div className="feed-container">
      {/* CRITICAL SECURITY: DangerouslySetInnerHTML vulnerability */}
      <div dangerouslySetInnerHTML={{ __html: rawBioHtml }} />
      
      <input 
        type="text" 
        value={searchTerm} 
        onChange={(e) => setSearchTerm(e.target.value)} 
        placeholder="Search posts..."
      />

      <div className="feed-list">
        {feedItems.map((item, index) => (
          // STYLE & PERFORMANCE: Using array index as key
          <div key={index} className="card p-4 my-2">
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
`,
  },
  {
    label: 'Node.js / Express - JWT Hardcoded Secret & Race Condition',
    language: 'javascript',
    description: 'Hardcoded credentials, unhandled promises, insecure CORS',
    code: `const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

app.use(express.json());

// CRITICAL SECURITY: Hardcoded secret key
const JWT_SECRET = "super_secret_master_key_123456";

app.use((req, res, next) => {
  // CRITICAL SECURITY: Permissive wildcard CORS
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

app.post('/api/v1/auth/token', (req, res) => {
  const { username, role } = req.body;
  
  if (!username) {
    return res.status(400).json({ error: "Missing username" });
  }

  // SECURITY: Alg NONE attack vulnerability if token claims rely on unchecked user role
  const token = jwt.sign({ username, role: role || 'user' }, JWT_SECRET, {
    expiresIn: '30d' // Excessive token lifespan
  });

  res.json({ token });
});

app.get('/api/v1/data/async-fetch', async (req, res) => {
  // BUG: Missing try/catch in async route handler - causes unhandled promise rejection crash
  const data = await fetchExternalServiceData();
  res.json(data);
});

function fetchExternalServiceData() {
  return new Promise((resolve, reject) => {
    if (Math.random() < 0.3) {
      reject(new Error("External downstream service timed out"));
    } else {
      resolve({ success: true, timestamp: Date.now() });
    }
  });
}
`,
  },
  {
    label: 'Go - Concurrency Deadlock & Unchecked Error Handling',
    language: 'go',
    description: 'Unbuffered channel deadlocks, unhandled errors, and slice leaks',
    code: `package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type WorkerTask struct {
	ID    string \`json:"id"\`
	Data  string \`json:"data"\`
}

var globalResults = make([]string, 0)
var mu sync.Mutex

func ProcessTasks(tasks []WorkerTask) {
	// BUG: Unbuffered channel can block forever if workers encounter error
	ch := make(chan string)

	for _, task := range tasks {
		go func(t WorkerTask) {
			// CRITICAL: Panic in goroutine without recover will crash entire process
			if t.Data == "" {
				panic("empty task payload")
			}

			// Simulating processing
			time.Sleep(50 * time.Millisecond)
			ch <- fmt.Sprintf("Processed %s", t.ID)
		}(task)
	}

	// DEADLOCK RISK: Waiting for all goroutines without sync.WaitGroup
	for i := 0; i < len(tasks); i++ {
		res := <-ch
		mu.Lock()
		globalResults = append(globalResults, res)
		mu.Unlock()
	}
}

func HandleTaskHTTP(w http.ResponseWriter, r *http.Request) {
	var payload []WorkerTask
	// QUALITY: Unchecked json decoder error
	_ = json.NewDecoder(r.Body).Decode(&payload)

	go ProcessTasks(payload)

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("{\\"status\\":\\"submitted\\"}"))
}
`,
  },
  {
    label: 'Rust - Borrow Checker & Unsafe Block',
    language: 'rust',
    description: 'Borrow checker mutable aliasing violation and unsafe memory block',
    code: `pub fn process_data() {
    let mut s = String::from("hello");
    let r1 = &s;
    let r2 = &mut s; // ERROR: cannot borrow as mutable because it is also borrowed as immutable
    println!("{}, {}", r1, r2);
}

pub fn dangerous_raw_pointer() {
    let mut num = 42;
    let r = &mut num as *mut i32;
    unsafe {
        *r = 100;
    }
}
`,
  },
  {
    label: 'Java - JDBC SQL Injection & Resource Leak',
    language: 'java',
    description: 'String concatenation in SQL statement and unclosed connection',
    code: `import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class UserAuthService {
    public boolean checkLogin(String username, String password) throws Exception {
        Connection conn = DriverManager.getConnection("jdbc:mysql://localhost:3306/db", "root", "secret");
        Statement stmt = conn.createStatement();
        // CRITICAL: SQL Injection vulnerability
        String query = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'";
        ResultSet rs = stmt.executeQuery(query);
        return rs.next();
    }
}
`,
  },
  {
    label: 'C++20 - Buffer Overflow & Insecure gets()',
    language: 'cpp',
    description: 'Insecure gets() usage and unbound strcpy buffer overflow',
    code: `#include <iostream>
#include <cstring>
#include <cstdio>

void vulnerable_input() {
    char buffer[64];
    // CRITICAL: gets() allows unbounded buffer overflow
    gets(buffer);
    
    char dest[32];
    // SECURITY: strcpy buffer overflow risk
    strcpy(dest, buffer);
    printf("User input: %s\\n", dest);
}

int main() {
    vulnerable_input();
    return 0;
}
`,
  },
  {
    label: 'C# (.NET 8) - SQL Injection & BinaryFormatter',
    language: 'csharp',
    description: 'SqlCommand concatenation and obsolete BinaryFormatter deserialization',
    code: `using System;
using System.Data.SqlClient;
using System.IO;
using System.Runtime.Serialization.Formatters.Binary;

public class DataService {
    public void QueryUser(string input, byte[] payload) {
        using var conn = new SqlConnection("Server=myServerAddress;Database=myDataBase;Uid=myUsername;Pwd=myPassword;");
        conn.Open();
        // CRITICAL: SQL Injection
        var cmd = new SqlCommand("SELECT * FROM Orders WHERE CustomerId = " + input, conn);
        cmd.ExecuteNonQuery();

        // CRITICAL: Remote Code Execution via Insecure Deserialization
        var formatter = new BinaryFormatter();
        using var ms = new MemoryStream(payload);
        var obj = formatter.Deserialize(ms);
    }
}
`,
  },
  {
    label: 'PHP 8.3 - Command Injection & XSS',
    language: 'php',
    description: 'Unescaped system() call and direct reflected XSS echo',
    code: `<?php
$user_id = $_GET['id'];
$query = "SELECT * FROM accounts WHERE id = " . $user_id;
$result = mysqli_query($conn, $query);

// CRITICAL: Remote Command Execution via shell argument
$target = $_GET['ip'];
system("ping -c 4 " . $target);

// SECURITY: Reflected XSS
echo "Welcome user: " . $_GET['name'];
?>
`,
  },
  {
    label: 'Ruby 3.3 - eval() & Command Injection',
    language: 'ruby',
    description: 'Dynamic eval execution and string interpolation in system shell call',
    code: `def execute_action(user_input, branch_name)
  # CRITICAL: Remote Code Execution via eval
  eval(user_input)

  # CRITICAL: Command Injection via shell interpolation
  system("git checkout #{branch_name}")
end
`,
  },
  {
    label: 'HTML - Malformed Tags & Inline Script XSS',
    language: 'html',
    description: 'Unclosed tags, duplicate IDs, missing alt attributes, and inline javascript handlers',
    code: `<!DOCTYPE html>
<html lang="en">
<head>
    <title>Customer Dashboard</title>
</head>
<body>
    <div id="content_card">
        <h1>Welcome</h1>
        <!-- ERROR: Unclosed paragraph tag & inline XSS handler -->
        <p onclick="alert('clicked')">Click here for details
        
        <!-- ERROR: Duplicate ID -->
        <div id="content_card">
            <!-- ERROR: Missing required alt attribute -->
            <img src="/logo.png">
        </div>
        
        <!-- CRITICAL SECURITY: javascript: pseudo-protocol XSS -->
        <a href="javascript:doSomethingUnsafe()">Learn more</a>
    </div>
</body>
</html>
`,
  },
  {
    label: 'HTML - Clean Valid Markup [Valid Test]',
    language: 'html',
    description: 'Clean semantic HTML5 markup — should return 0 errors',
    code: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clean Example</title>
</head>
<body>
    <main>
        <h1>Hello World</h1>
        <p>This is a clean and accessible HTML5 document.</p>
        <img src="/avatar.jpg" alt="User profile avatar">
    </main>
</body>
</html>
`,
  }
];

export const INITIAL_USER: UserProfile = {
  id: 'usr_998122',
  name: 'Vootla Rakesh Reddy',
  email: 'vootlarakeshreddy123@gmail.com',
  role: 'Senior Staff Engineer / Security Lead',
  avatarUrl: MALE_AI_CHATBOT_AVATAR,
  githubUsername: 'arivera-dev',
  joinedAt: '2025-11-14T09:30:00Z',
  apiKey: 'ak_live_9f81a7d622b100984a1e9',
  preferences: {
    theme: 'dark',
    emailNotifications: true,
    autoFixSuggestions: true,
    strictSecurityMode: true,
    defaultLanguage: 'typescript'
  },
  stats: {
    reviewsSubmitted: 142,
    issuesFixed: 389,
    reputationScore: 98
  }
};

export const INITIAL_STATS: DashboardStats = {
  totalReviews: 128,
  avgReviewScore: 84.6,
  criticalIssues: 12,
  warnings: 48,
  suggestions: 104,
  activeProjects: 6,
  codeLinesAnalyzed: 284500,
  securityScoreTrend: 5.4
};

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj_pay_01',
    name: 'payment-gateway-service',
    description: 'High-throughput microservice handling PCI-DSS compliant payment processing and webhook integrations.',
    repoUrl: 'https://github.com/techcorp/payment-gateway-service',
    language: 'python',
    primaryBranch: 'main',
    totalReviews: 42,
    avgScore: 88,
    lastReviewAt: '2026-08-11T05:40:00Z',
    criticalIssuesCount: 2,
    openIssuesCount: 9,
    status: 'active',
    customRulesCount: 14,
    securityHealth: 'A'
  },
  {
    id: 'proj_auth_02',
    name: 'auth-identity-provider',
    description: 'OAuth2 and OIDC authentication server with multi-tenant RBAC and passkey session control.',
    repoUrl: 'https://github.com/techcorp/auth-identity-provider',
    language: 'typescript',
    primaryBranch: 'main',
    totalReviews: 38,
    avgScore: 76,
    lastReviewAt: '2026-08-10T18:15:00Z',
    criticalIssuesCount: 4,
    openIssuesCount: 16,
    status: 'active',
    customRulesCount: 18,
    securityHealth: 'B'
  },
  {
    id: 'proj_frontend_03',
    name: 'cloud-console-react',
    description: 'Next.js & React single-page admin portal for infrastructure monitoring and logs visualization.',
    repoUrl: 'https://github.com/techcorp/cloud-console-react',
    language: 'typescript',
    primaryBranch: 'develop',
    totalReviews: 29,
    avgScore: 91,
    lastReviewAt: '2026-08-09T14:20:00Z',
    criticalIssuesCount: 0,
    openIssuesCount: 5,
    status: 'active',
    customRulesCount: 8,
    securityHealth: 'A+'
  },
  {
    id: 'proj_ai_engine_04',
    name: 'recommendation-pipeline-go',
    description: 'Low-latency Go gRPC microservice streaming real-time product recommendations to mobile clients.',
    repoUrl: 'https://github.com/techcorp/recommendation-pipeline-go',
    language: 'go',
    primaryBranch: 'main',
    totalReviews: 12,
    avgScore: 68,
    lastReviewAt: '2026-08-08T11:05:00Z',
    criticalIssuesCount: 5,
    openIssuesCount: 21,
    status: 'syncing',
    customRulesCount: 10,
    securityHealth: 'C'
  },
  {
    id: 'proj_analytics_05',
    name: 'etl-data-warehouse-rust',
    description: 'High performance data pipeline ingesting clickstream events into clickhouse column stores.',
    repoUrl: 'https://github.com/techcorp/etl-data-warehouse-rust',
    language: 'rust',
    primaryBranch: 'main',
    totalReviews: 7,
    avgScore: 95,
    lastReviewAt: '2026-08-06T09:12:00Z',
    criticalIssuesCount: 0,
    openIssuesCount: 2,
    status: 'active',
    customRulesCount: 6,
    securityHealth: 'A+'
  }
];

export const INITIAL_REVIEWS: CodeReview[] = [
  {
    id: 'rev_hello_world',
    title: 'Python print("hello world") Sample Scan',
    language: 'python',
    code: 'print("hello world")\n',
    status: 'completed',
    overallScore: 98,
    projectId: undefined,
    projectName: 'Standalone Snippet',
    durationMs: 380,
    createdAt: '2026-08-11T07:15:00Z',
    linesOfCode: 1,
    commitHash: 'a9b8c7d',
    branch: 'main',
    author: {
      name: 'Vootla Rakesh Reddy',
      email: 'vootlarakeshreddy123@gmail.com',
      avatar: MALE_AI_CHATBOT_AVATAR
    },
    issueCounts: {
      critical: 0,
      warning: 0,
      suggestion: 0
    },
    metrics: {
      securityScore: 100,
      codeQualityScore: 98,
      performanceScore: 100,
      maintainabilityScore: 95
    },
    complexity: {
      timeComplexity: 'O(1)',
      spaceComplexity: 'O(1)',
      timeExplanation: 'Single statement standard output write executes in constant time.',
      spaceExplanation: 'No auxiliary memory allocated in stack or heap.',
      canBeImproved: false
    },
    scoreBreakdown: {
      correctness: 100,
      security: 100,
      performance: 100,
      maintainability: 95,
      codeQuality: 98
    },
    findings: [
      {
        id: 'find_hw_1',
        lineNumber: 1,
        category: 'debug',
        severity: 'low',
        title: 'Leftover Debug Output',
        explanation: 'print("hello world") is valid Python code. It is NOT a syntax error and NOT a bug.\n\nExplanation: This statement may have been used for debugging and could be removed or replaced with proper logging in production code.',
        codeSnippet: 'print("hello world")',
        recommendedFix: 'import logging\nlogging.info("hello world")',
        status: 'open'
      }
    ]
  },
  {
    id: 'rev_9001',
    title: 'FastAPI SQL Injection & Unhandled Async Lock',
    language: 'python',
    code: CODE_PRESETS[0].code,
    status: 'completed',
    overallScore: 62,
    projectId: 'proj_pay_01',
    projectName: 'payment-gateway-service',
    durationMs: 1420,
    createdAt: '2026-08-11T05:40:00Z',
    linesOfCode: 38,
    commitHash: '7f9a20b',
    branch: 'fix/user-search-api',
    author: {
      name: 'Vootla Rakesh Reddy',
      email: 'vootlarakeshreddy123@gmail.com',
      avatar: MALE_AI_CHATBOT_AVATAR
    },
    issueCounts: {
      critical: 2,
      warning: 2,
      suggestion: 3
    },
    metrics: {
      securityScore: 45,
      codeQualityScore: 68,
      performanceScore: 70,
      maintainabilityScore: 65
    },
    findings: [
      {
        id: 'find_01',
        lineNumber: 15,
        category: 'security',
        severity: 'critical',
        title: 'SQL Injection Vulnerability via String Formatting',
        explanation: 'Dynamic string interpolation directly inserts user-controlled `username` input into the raw SQL query string without parametrization or escaping.',
        codeSnippet: `query = f"SELECT id, username, email, is_admin FROM users WHERE username = '{username}'"`,
        recommendedFix: `query = "SELECT id, username, email, is_admin FROM users WHERE username = ?"\ncursor.execute(query, (username,))`,
        diffPatch: `- query = f"SELECT id, username, email, is_admin FROM users WHERE username = '{username}'"\n- cursor.execute(query)\n+ query = "SELECT id, username, email, is_admin FROM users WHERE username = ?"\n+ cursor.execute(query, (username,))`,
        status: 'open',
        ruleId: 'rule_sql_inject'
      },
      {
        id: 'find_02',
        lineNumber: 31,
        category: 'bug',
        severity: 'critical',
        title: 'Race Condition on Global Variable in Async Context',
        explanation: 'Modifying `global_counter` across async yield points without a synchronization primitive (`asyncio.Lock`) introduces subtle data corruption under concurrent load.',
        codeSnippet: `current = global_counter\nawait asyncio.sleep(0.001)\nglobal_counter = current + 1`,
        recommendedFix: `async with lock:\n    global_counter += 1`,
        diffPatch: `- global_counter = current + 1\n+ async with counter_lock:\n+     global_counter += 1`,
        status: 'open',
        ruleId: 'rule_race_cond'
      },
      {
        id: 'find_03',
        lineNumber: 20,
        category: 'performance',
        severity: 'high',
        title: 'Unbounded Query Result Set without Limit/Offset',
        explanation: 'Fetching all matching database records using `cursor.fetchall()` without `LIMIT` or pagination constraints can exhaust backend memory if the dataset scales.',
        codeSnippet: `results = cursor.fetchall()`,
        recommendedFix: `query += " LIMIT ? OFFSET ?"\ncursor.execute(query, (username, limit, offset))`,
        status: 'open'
      },
      {
        id: 'find_04',
        lineNumber: 28,
        category: 'security',
        severity: 'medium',
        title: 'Sensitive Data Log Injection Risk',
        explanation: 'Printing unsanitized `event_data` directly to stdout may leak user telemetry or tokens into central logging pipelines.',
        codeSnippet: `print(f"Tracking event raw payload: {event_data}")`,
        recommendedFix: `logger.info("Tracking event", extra={"event_id": event_data.get("id")})`,
        status: 'ignored'
      },
      {
        id: 'find_05',
        lineNumber: 10,
        category: 'quality',
        severity: 'low',
        title: 'Database connection created per request without connection pool',
        explanation: 'Creating a new sqlite3 file connection on every API request introduces heavy I/O overhead. Use a persistent connection pool.',
        codeSnippet: `def get_db(): return sqlite3.connect("production_app.db")`,
        recommendedFix: 'Use SQLAlchemy async engine sessionmaker or Tortoise ORM connection pool.',
        status: 'open'
      }
    ]
  },
  {
    id: 'rev_9002',
    title: 'React Custom Feed Memory Leak & XSS Vector',
    language: 'typescript',
    code: CODE_PRESETS[1].code,
    status: 'completed',
    overallScore: 71,
    projectId: 'proj_frontend_03',
    projectName: 'cloud-console-react',
    durationMs: 1890,
    createdAt: '2026-08-10T18:15:00Z',
    linesOfCode: 52,
    commitHash: 'e3a102c',
    branch: 'feat/user-feed-hook',
    author: {
      name: 'Sarah Chen',
      email: 'sarah.chen@techcorp.io',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80'
    },
    issueCounts: {
      critical: 1,
      warning: 3,
      suggestion: 2
    },
    metrics: {
      securityScore: 60,
      codeQualityScore: 72,
      performanceScore: 65,
      maintainabilityScore: 82
    },
    findings: [
      {
        id: 'find_11',
        lineNumber: 41,
        category: 'security',
        severity: 'critical',
        title: 'Cross-Site Scripting (XSS) via `dangerouslySetInnerHTML`',
        explanation: 'Rendering unsanitized HTML bio content directly into the DOM allows malicious scripts to execute within the victim browser context.',
        codeSnippet: `<div dangerouslySetInnerHTML={{ __html: rawBioHtml }} />`,
        recommendedFix: `import DOMPurify from 'dompurify';\n<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rawBioHtml) }} />`,
        diffPatch: `- <div dangerouslySetInnerHTML={{ __html: rawBioHtml }} />\n+ <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rawBioHtml) }} />`,
        status: 'open',
        ruleId: 'rule_no_xss'
      },
      {
        id: 'find_12',
        lineNumber: 17,
        category: 'bug',
        severity: 'high',
        title: 'Infinite Effect Re-Trigger Loop',
        explanation: 'Object literal `fetchParams` is recreated on every component render. Since it is listed in the `useEffect` dependency array, it creates an infinite request loop.',
        codeSnippet: `const fetchParams = { id: userId, limit: 50 };\nuseEffect(() => { ... }, [fetchParams])`,
        recommendedFix: `const fetchParams = useMemo(() => ({ id: userId, limit: 50 }), [userId]);`,
        status: 'open'
      },
      {
        id: 'find_13',
        lineNumber: 21,
        category: 'performance',
        severity: 'medium',
        title: 'Unclosed WebSocket Connection Leak',
        explanation: '`new WebSocket` is instantiated inside `useEffect` without returning a cleanup teardown function (`return () => ws.close()`).',
        codeSnippet: `const ws = new WebSocket('wss://api.example.com/live-feed');`,
        recommendedFix: `return () => { isMounted = false; ws.close(); };`,
        status: 'open'
      }
    ]
  },
  {
    id: 'rev_9003',
    title: 'Node.js JWT Hardcoded Key & Insecure Wildcard CORS',
    language: 'javascript',
    code: CODE_PRESETS[2].code,
    status: 'completed',
    overallScore: 54,
    projectId: 'proj_auth_02',
    projectName: 'auth-identity-provider',
    durationMs: 1150,
    createdAt: '2026-08-09T14:20:00Z',
    linesOfCode: 42,
    commitHash: '8b44c11',
    branch: 'security/jwt-middleware',
    author: {
      name: 'Marcus Vance',
      email: 'marcus.v@techcorp.io',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80'
    },
    issueCounts: {
      critical: 3,
      warning: 2,
      suggestion: 1
    },
    metrics: {
      securityScore: 35,
      codeQualityScore: 60,
      performanceScore: 78,
      maintainabilityScore: 55
    },
    findings: [
      {
        id: 'find_21',
        lineNumber: 8,
        category: 'security',
        severity: 'critical',
        title: 'Hardcoded Cryptographic Secret Key',
        explanation: 'Secret string `super_secret_master_key_123456` stored directly in source code will be committed to source control and exposed to attackers.',
        codeSnippet: `const JWT_SECRET = "super_secret_master_key_123456";`,
        recommendedFix: `const JWT_SECRET = process.env.JWT_SECRET_KEY;\nif (!JWT_SECRET) throw new Error("JWT_SECRET_KEY environment variable required");`,
        status: 'open',
        ruleId: 'rule_no_hardcoded_secret'
      },
      {
        id: 'find_22',
        lineNumber: 12,
        category: 'security',
        severity: 'critical',
        title: 'Overly Permissive CORS Policy (`Access-Control-Allow-Origin: *`)',
        explanation: 'Allowing all origin domains to send authenticated API requests enables cross-origin credential theft and CSRF attacks.',
        codeSnippet: `res.header("Access-Control-Allow-Origin", "*");`,
        recommendedFix: `const allowedOrigins = ['https://app.techcorp.io'];\nif (allowedOrigins.includes(req.headers.origin)) res.header("Access-Control-Allow-Origin", req.headers.origin);`,
        status: 'open'
      }
    ]
  }
];

export const INITIAL_CUSTOM_RULES: CustomRule[] = [
  {
    id: 'rule_sql_inject',
    name: 'Disallow Raw SQL Formatting',
    description: 'Enforces parameterized SQL queries across Python, Node.js, and Go database code to prevent injection attacks.',
    category: 'security',
    severity: 'critical',
    language: 'all',
    enabled: true,
    pattern: `SELECT.*%s|f"SELECT.*{.*}"|SELECT.*\\+\\s*\\w+`,
    totalHits: 42,
    createdAt: '2026-01-15T00:00:00Z'
  },
  {
    id: 'rule_no_xss',
    name: 'Ban `dangerouslySetInnerHTML`',
    description: 'Prevents raw HTML injection in React JSX components without explicit sanitization wrapper functions.',
    category: 'security',
    severity: 'critical',
    language: 'typescript',
    enabled: true,
    pattern: `dangerouslySetInnerHTML`,
    totalHits: 19,
    createdAt: '2026-02-01T00:00:00Z'
  },
  {
    id: 'rule_no_hardcoded_secret',
    name: 'Detect Hardcoded API Keys & JWT Secrets',
    description: 'Flags literal strings matching pattern entropy for JWT keys, AWS secrets, Stripe live keys, and bearer tokens.',
    category: 'security',
    severity: 'critical',
    language: 'all',
    enabled: true,
    pattern: `(secret|key|token|password)\\s*=\\s*["'][A-Za-z0-9_\\-]{12,}["']`,
    totalHits: 87,
    createdAt: '2026-01-10T00:00:00Z'
  },
  {
    id: 'rule_race_cond',
    name: 'Require Locks for Async Global Mutex',
    description: 'Warns when global Python/Node.js state variables are mutated inside async handlers without lock synchronization.',
    category: 'bug',
    severity: 'high',
    language: 'python',
    enabled: true,
    pattern: `global\\s+\\w+.*await`,
    totalHits: 11,
    createdAt: '2026-03-12T00:00:00Z'
  },
  {
    id: 'rule_no_console',
    name: 'Disallow Production Console Log Statements',
    description: 'Flag leftover debug `console.log` statements before merging pull requests into production branch.',
    category: 'quality',
    severity: 'low',
    language: 'typescript',
    enabled: false,
    pattern: `console\\.log\\(`,
    totalHits: 154,
    createdAt: '2026-02-20T00:00:00Z'
  }
];

export const INITIAL_GITHUB_REPOS: GitHubRepo[] = [
  {
    id: 'gh_01',
    name: 'payment-gateway-service',
    fullName: 'techcorp/payment-gateway-service',
    isPrivate: true,
    defaultBranch: 'main',
    isConnected: true,
    autoReviewPr: true,
    starsCount: 14,
    lastSyncedAt: '2026-08-11T06:00:00Z',
    openPullRequestsCount: 3
  },
  {
    id: 'gh_02',
    name: 'auth-identity-provider',
    fullName: 'techcorp/auth-identity-provider',
    isPrivate: true,
    defaultBranch: 'main',
    isConnected: true,
    autoReviewPr: true,
    starsCount: 32,
    lastSyncedAt: '2026-08-11T05:30:00Z',
    openPullRequestsCount: 5
  },
  {
    id: 'gh_03',
    name: 'cloud-console-react',
    fullName: 'techcorp/cloud-console-react',
    isPrivate: false,
    defaultBranch: 'develop',
    isConnected: true,
    autoReviewPr: false,
    starsCount: 128,
    lastSyncedAt: '2026-08-10T22:10:00Z',
    openPullRequestsCount: 2
  },
  {
    id: 'gh_04',
    name: 'recommendation-pipeline-go',
    fullName: 'techcorp/recommendation-pipeline-go',
    isPrivate: true,
    defaultBranch: 'main',
    isConnected: false,
    autoReviewPr: false,
    starsCount: 8,
    lastSyncedAt: '2026-08-01T10:00:00Z',
    openPullRequestsCount: 1
  }
];
