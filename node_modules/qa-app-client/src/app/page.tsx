'use client';

import { useState } from 'react';
import UrlInput from '@/components/UrlInput';
import SchemaUpload from '@/components/SchemaUpload';
import LogConsole from '@/components/LogConsole';
import { startTestGeneration, LogMessage } from '@/lib/api';

export default function Home() {
  const [url, setUrl] = useState('');
  const [schema, setSchema] = useState('');
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [testFiles, setTestFiles] = useState<string[]>([]);
  const [abortController, setAbortController] = useState<(() => void) | null>(null);
  const [report, setReport] = useState<string | null>(null); // HTML content for DOCX-like download

  const handleStart = () => {
    if (!url.trim()) {
      alert('Please enter a URL');
      return;
    }

    setIsRunning(true);
    setLogs([]);
    setTestFiles([]);
    setReport(null);

    const cleanup = startTestGeneration(
      { url, schema: schema || undefined },
      (log) => {
        setLogs((prev) => [...prev, log]);
      },
      (result) => {
        setLogs((prev) => [...prev, result]);
        setIsRunning(false);
        if (result.testFiles) {
          setTestFiles(result.testFiles);
        }

        // Build comprehensive, non-technical HTML report
        const runTime = new Date();
        const safe = (value: string | undefined) =>
          (value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const allLogs = [...logs, result];
        
        // Analyze logs to extract meaningful information
        const extractSteps = (logs: LogMessage[]) => {
          const steps: Array<{step: number, action: string, time: string, status: string}> = [];
          let stepNum = 1;
          
          logs.forEach((log) => {
            if (log.type === 'agent' && log.message?.includes('Thinking')) {
              steps.push({
                step: stepNum++,
                action: 'Agent analyzing and planning next action',
                time: log.timestamp ? new Date(log.timestamp).toLocaleString() : '',
                status: 'In Progress'
              });
            } else if (log.type === 'info' && log.message?.includes('Executing tool')) {
              const toolMatch = log.message.match(/Executing tool: (\w+)/);
              const toolName = toolMatch ? toolMatch[1] : 'Unknown tool';
              let actionDesc = '';
              
              if (toolName.includes('navigate')) actionDesc = 'Navigating to a new page on the website';
              else if (toolName.includes('click')) actionDesc = 'Clicking on a button or link';
              else if (toolName.includes('fill')) actionDesc = 'Filling out a form field';
              else if (toolName.includes('snapshot')) actionDesc = 'Taking a snapshot of the current page';
              else if (toolName.includes('saveTestFile')) actionDesc = 'Creating a new test file';
              else if (toolName.includes('runPlaywrightTests')) actionDesc = 'Running the generated tests';
              else actionDesc = `Performing action: ${toolName}`;
              
              steps.push({
                step: stepNum++,
                action: actionDesc,
                time: log.timestamp ? new Date(log.timestamp).toLocaleString() : '',
                status: 'Completed'
              });
            } else if (log.type === 'success' && log.message?.includes('Test file saved')) {
              steps.push({
                step: stepNum++,
                action: 'Test file successfully created and saved',
                time: log.timestamp ? new Date(log.timestamp).toLocaleString() : '',
                status: 'Success'
              });
            } else if (log.type === 'error') {
              const errorMsg = log.message || log.error || JSON.stringify(log) || 'Unknown error';
              steps.push({
                step: stepNum++,
                action: `Error encountered: ${errorMsg}`,
                time: log.timestamp ? new Date(log.timestamp).toLocaleString() : '',
                status: 'Error'
              });
            }
          });
          
          return steps;
        };

        const extractWebsiteStructure = (logs: LogMessage[]) => {
          const structure: {pages: string[], features: string[], flows: string[]} = {
            pages: [],
            features: [],
            flows: []
          };
          
          // Look for navigation patterns
          const navLogs = logs.filter(l => l.message?.includes('navigate') || l.message?.includes('Navigating'));
          navLogs.forEach(log => {
            if (log.message?.includes('inventory')) structure.pages.push('Product Inventory Page');
            if (log.message?.includes('cart')) structure.pages.push('Shopping Cart Page');
            if (log.message?.includes('checkout')) structure.pages.push('Checkout Page');
            if (log.message?.includes('login')) structure.pages.push('Login Page');
          });
          
          // Look for features
          const clickLogs = logs.filter(l => l.message?.includes('click'));
          if (clickLogs.length > 0) structure.features.push('Interactive buttons and links');
          
          const fillLogs = logs.filter(l => l.message?.includes('fill'));
          if (fillLogs.length > 0) structure.features.push('Form inputs and data entry');
          
          // Look for flows
          if (logs.some(l => l.message?.includes('login'))) {
            structure.flows.push('User Login Flow');
          }
          if (logs.some(l => l.message?.includes('cart') || l.message?.includes('checkout'))) {
            structure.flows.push('Shopping and Purchase Flow');
          }
          
          return structure;
        };

        const steps = extractSteps(allLogs);
        const websiteStructure = extractWebsiteStructure(allLogs);
        
        // Count test results
        const testExecutionLogs = logs.filter(l => 
          l.message?.includes('Test execution') || l.message?.includes('tests')
        );
        const passedTests = testExecutionLogs.filter(l => l.type === 'success').length;
        const failedTests = testExecutionLogs.filter(l => l.type === 'warning' || l.type === 'error').length;

        const htmlParts: string[] = [];
        htmlParts.push('<!DOCTYPE html>');
        htmlParts.push('<html><head><meta charset="UTF-8"><title>QA_APP Test Report</title>');
        htmlParts.push(
          '<style>body{font-family:Segoe UI,Arial,sans-serif;font-size:11pt;color:#333;line-height:1.6;max-width:900px;margin:40px auto;padding:20px;} ' +
          'h1{color:#1e40af;border-bottom:3px solid #3b82f6;padding-bottom:10px;} ' +
          'h2{color:#2563eb;margin-top:30px;margin-bottom:15px;font-size:16pt;} ' +
          'h3{color:#3b82f6;margin-top:20px;margin-bottom:10px;font-size:14pt;} ' +
          'table{border-collapse:collapse;width:100%;margin:15px 0;} ' +
          'th,td{border:1px solid #d1d5db;padding:8px 12px;text-align:left;font-size:10pt;} ' +
          'th{background-color:#f3f4f6;font-weight:600;color:#111;} ' +
          '.meta-table th{width:180px;background:#e5e7eb;} ' +
          '.status-success{color:#059669;font-weight:600;} ' +
          '.status-error{color:#dc2626;font-weight:600;} ' +
          '.status-in-progress{color:#d97706;font-weight:600;} ' +
          'ul,ol{margin:10px 0;padding-left:25px;} ' +
          'li{margin:5px 0;} ' +
          '.summary-box{background:#eff6ff;border-left:4px solid #3b82f6;padding:15px;margin:20px 0;} ' +
          '.feature-list{background:#f9fafb;padding:15px;border-radius:5px;margin:10px 0;}</style>'
        );
        htmlParts.push('</head><body>');
        
        htmlParts.push('<h1>QA_APP Automated Test Report</h1>');
        
        htmlParts.push('<div class="summary-box">');
        htmlParts.push('<h2 style="margin-top:0;">Executive Summary</h2>');
        htmlParts.push(`<p><strong>Website Tested:</strong> ${safe(url)}</p>`);
        htmlParts.push(`<p><strong>Test Run Date:</strong> ${runTime.toLocaleDateString()} at ${runTime.toLocaleTimeString()}</p>`);
        htmlParts.push(`<p><strong>Overall Status:</strong> <span class="${result.success === false ? 'status-error' : 'status-success'}">${result.success === false ? 'Test Generation Incomplete' : 'Test Generation Completed Successfully'}</span></p>`);
        if (result.testFiles && result.testFiles.length > 0) {
          htmlParts.push(`<p><strong>Number of Test Files Created:</strong> ${result.testFiles.length}</p>`);
        }
        htmlParts.push('</div>');

        htmlParts.push('<h2>Website Structure Discovered</h2>');
        htmlParts.push('<p>During the exploration phase, the automated agent discovered the following structure of the website:</p>');
        
        if (websiteStructure.pages.length > 0) {
          htmlParts.push('<h3>Pages Found</h3>');
          htmlParts.push('<ul>');
          websiteStructure.pages.forEach(page => {
            htmlParts.push(`<li>${safe(page)}</li>`);
          });
          htmlParts.push('</ul>');
        }
        
        if (websiteStructure.features.length > 0) {
          htmlParts.push('<h3>Key Features Identified</h3>');
          htmlParts.push('<ul>');
          websiteStructure.features.forEach(feature => {
            htmlParts.push(`<li>${safe(feature)}</li>`);
          });
          htmlParts.push('</ul>');
        }
        
        if (websiteStructure.flows.length > 0) {
          htmlParts.push('<h3>User Flows Discovered</h3>');
          htmlParts.push('<ul>');
          websiteStructure.flows.forEach(flow => {
            htmlParts.push(`<li>${safe(flow)}</li>`);
          });
          htmlParts.push('</ul>');
        }

        htmlParts.push('<h2>Detailed Step-by-Step Process</h2>');
        htmlParts.push('<p>The following table shows every action the automated agent performed during this test run:</p>');
        
        if (steps.length > 0) {
          htmlParts.push('<table>');
          htmlParts.push('<tr><th>Step #</th><th>Action Performed</th><th>Time</th><th>Status</th></tr>');
          steps.forEach(step => {
            const statusClass = step.status === 'Success' ? 'status-success' : 
                              step.status === 'Error' ? 'status-error' : 'status-in-progress';
            htmlParts.push(
              `<tr><td>${step.step}</td><td>${safe(step.action)}</td><td>${safe(step.time)}</td><td class="${statusClass}">${safe(step.status)}</td></tr>`
            );
          });
          htmlParts.push('</table>');
        } else {
          htmlParts.push('<p><em>No detailed steps were captured in this run.</em></p>');
        }

        htmlParts.push('<h2>Test Files Generated</h2>');
        if (result.testFiles && result.testFiles.length > 0) {
          htmlParts.push('<p>The following test files were automatically created:</p>');
          htmlParts.push('<ul>');
          result.testFiles.forEach((f) => {
            const fileName = f.split(/[/\\]/).pop() || f;
            htmlParts.push(`<li><strong>${safe(fileName)}</strong></li>`);
          });
          htmlParts.push('</ul>');
        } else {
          htmlParts.push('<p><em>No test files were generated in this run. This may indicate that the exploration phase encountered issues before test generation could begin.</em></p>');
        }

        htmlParts.push('<h2>Test Results Analysis</h2>');
        if (testExecutionLogs.length > 0) {
          htmlParts.push(`<p><strong>Tests Executed:</strong> ${passedTests + failedTests}</p>`);
          htmlParts.push(`<p><strong>Tests Passed:</strong> <span class="status-success">${passedTests}</span></p>`);
          if (failedTests > 0) {
            htmlParts.push(`<p><strong>Tests Failed:</strong> <span class="status-error">${failedTests}</span></p>`);
          }
        } else {
          htmlParts.push('<p><em>No test execution results were captured. The tests may not have been run, or the execution phase did not complete.</em></p>');
        }

        htmlParts.push('<h2>Agent Analysis and Summary</h2>');
        if (result.message) {
          htmlParts.push('<div class="summary-box">');
          htmlParts.push(`<p>${safe(result.message).replace(/\n/g, '<br>')}</p>`);
          htmlParts.push('</div>');
        } else {
          htmlParts.push('<p><em>The agent did not provide a detailed summary for this run.</em></p>');
        }

        htmlParts.push('<h2>Recommendations</h2>');
        htmlParts.push('<ul>');
        if (result.success && result.testFiles && result.testFiles.length > 0) {
          htmlParts.push('<li>The test generation was successful. Review the generated test files to ensure they cover all critical user flows.</li>');
          htmlParts.push('<li>Consider running these tests regularly to catch any regressions in the website functionality.</li>');
        } else {
          htmlParts.push('<li>The test generation encountered issues. Review the step-by-step process above to identify where the process stopped.</li>');
          htmlParts.push('<li>Consider providing additional context or schema information if the website has complex authentication or business logic.</li>');
          htmlParts.push('<li>Try running the test generation again, as some issues may be transient.</li>');
        }
        htmlParts.push('</ul>');

        htmlParts.push('<hr style="margin:40px 0;border:none;border-top:1px solid #d1d5db;">');
        htmlParts.push(`<p style="color:#6b7280;font-size:9pt;text-align:center;">Report generated by QA_APP on ${runTime.toLocaleDateString()} at ${runTime.toLocaleTimeString()}</p>`);
        htmlParts.push('</body></html>');

        setReport(htmlParts.join(''));
        setAbortController(null);
      },
      (error) => {
        setLogs((prev) => [
          ...prev,
          {
            type: 'error',
            message: `Error: ${error.message}`,
            timestamp: new Date().toISOString(),
          },
        ]);
        setIsRunning(false);
        setAbortController(null);
      }
    );

    setAbortController(() => cleanup);
  };

  const handleStop = () => {
    if (abortController) {
      abortController();
      setLogs((prev) => [
        ...prev,
        {
          type: 'warning',
          message: 'Test generation stopped by user',
          timestamp: new Date().toISOString(),
        },
      ]);
      setIsRunning(false);
      setAbortController(null);
    }
  };

  const handleDownloadReport = () => {
    if (!report) return;
    // Generate a Word-readable .doc file using HTML content.
    // Word opens HTML just fine when served as application/msword.
    const blob = new Blob([report], {
      type: 'application/msword;charset=utf-8',
    });
    const urlObject = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = urlObject;
    a.download = `qa_app_test_report_${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(urlObject);
  };

  return (
    <main className="min-h-screen bg-dark-bg text-foreground relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-dark-bg via-dark-surface to-dark-bg pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-[#a855f7]/10 via-transparent to-[#06b6d4]/10 opacity-30 animate-pulse-slow" />
      </div>

      {/* Hero Section */}
      <div className="relative z-10 pt-12 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-3">
                <span className="gradient-text">QA_APP</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-400 font-light tracking-tight">
                Autonomous test generation and execution for any web application
              </p>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <div
                className={`glass rounded-full px-4 py-2 flex items-center gap-2 transition-all ${
                  isRunning ? 'neon-border-cyan shadow-neon-cyan' : ''
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isRunning
                      ? 'bg-[#06b6d4] shadow-[0_0_10px_rgba(6,182,212,0.8)] animate-pulse'
                      : 'bg-gray-500'
                  }`}
                />
                <span className="text-sm font-medium">
                  {isRunning ? 'Agent Running' : 'Idle'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="relative z-10 pb-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left column: Configuration Panel */}
            <section className="lg:col-span-2 space-y-5">
              {/* Configuration Card */}
              <div className="glass-elevated rounded-2xl p-6 space-y-6 glow-on-hover">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold mb-1">Target Configuration</h2>
                    <p className="text-sm text-gray-400 font-light">
                      Define the URL and optional schema for the agent to explore
                    </p>
                  </div>
                  <span className="hidden sm:inline-flex items-center rounded-full glass px-3 py-1 text-xs font-medium text-[#c084fc] neon-border">
                    Fully autonomous
                  </span>
                </div>

                <div className="space-y-5">
                  <UrlInput value={url} onChange={setUrl} disabled={isRunning} />
                  <SchemaUpload
                    value={schema}
                    onChange={setSchema}
                    disabled={isRunning}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-dark-border">
                  <button
                    onClick={handleStart}
                    disabled={isRunning || !url.trim()}
                    className={`inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition-all duration-300 ${
                      isRunning || !url.trim()
                        ? 'glass text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-[#a855f7] to-[#9333ea] text-white hover:shadow-neon-purple hover:scale-[1.02] active:scale-[0.98]'
                    }`}
                  >
                    {isRunning ? (
                      <>
                        <span className="mr-2 h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        Running…
                      </>
                    ) : (
                      <>
                        <span className="mr-2">▶</span>
                        Start Test Generation
                      </>
                    )}
                  </button>
                  {isRunning && (
                    <button
                      onClick={handleStop}
                      className="inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold glass text-gray-300 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all duration-300 neon-border"
                    >
                      Stop
                    </button>
                  )}
                  {report && !isRunning && (
                    <button
                      onClick={handleDownloadReport}
                      className="inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold glass text-[#06b6d4] hover:bg-[#06b6d4]/10 hover:text-[#22d3ee] hover:shadow-neon-cyan transition-all duration-300 neon-border-cyan"
                    >
                      <span className="mr-2">📥</span>
                      Download Report
                    </button>
                  )}
                </div>
              </div>

              {/* Generated Tests Card */}
              <div className="glass rounded-2xl p-5 space-y-4 glow-on-hover">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <span className="text-[#10b981]">●</span>
                    Generated Test Files
                  </h3>
                  <span className="text-xs text-gray-500 font-mono">
                    {testFiles.length} file{testFiles.length === 1 ? '' : 's'}
                  </span>
                </div>
                {testFiles.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">
                    No test files generated yet. Start a run to see results here.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                    {testFiles.map((file, idx) => (
                      <li
                        key={idx}
                        className="flex items-center gap-3 rounded-lg glass p-3 neon-border hover:bg-[#a855f7]/5 transition-all"
                      >
                        <span className="h-2 w-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                        <span className="font-mono text-sm text-gray-300 truncate flex-1">
                          {file}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Right column: Console */}
            <section className="lg:col-span-3">
              <div className="glass-strong rounded-2xl p-5 h-full flex flex-col glow-on-hover">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
                      <span className="text-[#06b6d4]">▸</span>
                      Agent Console
                    </h2>
                    <p className="text-sm text-gray-400 font-light">
                      Live stream of agent thoughts, tool calls, and test results
                    </p>
                  </div>
                  <span className="hidden sm:inline-flex rounded-full glass px-3 py-1.5 text-xs font-medium text-gray-300 neon-border">
                    {logs.length} messages
                  </span>
                </div>
                <div className="flex-1 min-h-[500px]">
                  <LogConsole logs={logs} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
