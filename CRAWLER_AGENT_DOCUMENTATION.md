# Code Analyzer and Crawler Agent  

**Date:** December 2024  
**Technology Stack:** .NET 10, Blazor Server, Python, Node.js, TypeScript, Next.js

---

## Overview 

The platform is an automated software analysis, documentation, and testing solution designed to analyze application codebases and generate structured, comprehensive technical documentation. The generated documentation is then supplied to a crawler agent, which uses this information to navigate the application and automatically create and execute test cases based on the system's behavior. 

A Retrieval-Augmented Generation (RAG) approach is used to train the model for each specific system, ensuring that the crawler agent operates with contextual awareness of the application's architecture, features, and expected workflows. 

In essence, the analyzer agent extracts and structures knowledge from the codebase, while the crawler agent consumes this knowledge to perform intelligent, system-aware testing. The analyzer agent provides detailed metadata, such as application structure, APIs, data models, and routes, to the crawler agent, enabling it to dynamically execute relevant test cases with minimal manual configuration.

---

## Analyzer Agent 

### Supported Capabilities 

| Feature | Description |
|---------|-------------|
| **Supported Languages** | .NET (C#), Python |
| **Source Input** | Local directory or Git URL |
| **Git Providers** | GitHub, GitLab, Bitbucket, Azure DevOps |
| **Code Analysis** | Classes, methods, properties, interfaces, controllers |
| **API Discovery** | REST endpoints from controllers |
| **Database Analysis** | SQL Server schema extraction |
| **AI Enhancements** | Optional OpenAI-based summaries |

### Working 

It automatically scans codebases (C#/.NET or Python) from a local path or Git URL, extracts code structure including classes, methods, API endpoints, and optionally database schemas, then generates a comprehensive Markdown technical document, with an optional AI-powered summary using OpenAI GPT-4 for intelligent insights about the application's purpose and architecture.

---

## Crawler Agent 

### Supported Capabilities 

| Feature | Description |
|---------|-------------|
| **Web Application Support** | Any web application accessible via URL |
| **Browser Automation** | Playwright-based browser control via Model Context Protocol (MCP) |
| **Autonomous Exploration** | AI-driven site discovery without manual test step input |
| **Test Generation** | Automatic Playwright test suite creation in TypeScript/JavaScript |
| **Test Execution** | Automated test execution with real-time results |
| **Schema Integration** | Optional Swagger/OpenAPI schema input for enhanced context |
| **User Flow Discovery** | Automatic identification of critical user journeys, error scenarios, and edge cases |
| **Test Reporting** | Comprehensive test reports with step-by-step analysis and website structure documentation |

### Working 

It autonomously navigates web applications using Playwright MCP tools, systematically explores site structure by mapping pages, routes, and interactive elements, then automatically generates comprehensive Playwright test suites covering critical user flows (positive paths, negative paths, and edge cases) based on discovery findings. The agent executes the generated tests and produces detailed test reports in human-readable format, streaming all actions and results in real-time via Server-Sent Events (SSE).
