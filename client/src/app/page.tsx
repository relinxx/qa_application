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

        // Build a simple HTML report suitable for opening in Word (DOCX-compatible)
        const runTime = new Date().toISOString();
        const safe = (value: string | undefined) =>
          (value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const recentLogs = [...logs, result].slice(-20);

        const htmlParts: string[] = [];
        htmlParts.push('<!DOCTYPE html>');
        htmlParts.push('<html><head><meta charset="UTF-8"><title>QA_APP Test Report</title>');
        htmlParts.push(
          '<style>body{font-family:Segoe UI,Arial,sans-serif;font-size:12pt;color:#111;} h1,h2,h3{color:#111;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ccc;padding:4px 6px;font-size:10pt;} .meta-table th{width:160px;background:#f3f3f3;text-align:left;}</style>'
        );
        htmlParts.push('</head><body>');
        htmlParts.push('<h1>QA_APP Test Run Report</h1>');
        htmlParts.push('<h2>Run Details</h2>');
        htmlParts.push('<table class="meta-table">');
        htmlParts.push(`<tr><th>URL</th><td>${safe(url)}</td></tr>`);
        htmlParts.push(`<tr><th>Time</th><td>${safe(runTime)}</td></tr>`);
        htmlParts.push(
          `<tr><th>Overall Status</th><td>${result.success === false ? 'Failed' : 'Completed'}</td></tr>`
        );
        htmlParts.push('</table>');

        htmlParts.push('<h2>Generated Test Files</h2>');
        if (result.testFiles && result.testFiles.length > 0) {
          htmlParts.push('<ul>');
          result.testFiles.forEach((f) => {
            htmlParts.push(`<li><code>${safe(f)}</code></li>`);
          });
          htmlParts.push('</ul>');
        } else {
          htmlParts.push('<p><em>No test files were generated in this run.</em></p>');
        }

        htmlParts.push('<h2>Agent Summary</h2>');
        htmlParts.push(
          `<p>${safe(result.message || 'No summary was returned by the agent.')}</p>`
        );

        htmlParts.push('<h2>Recent Log Messages</h2>');
        if (recentLogs.length === 0) {
          htmlParts.push('<p><em>No log messages available.</em></p>');
        } else {
          htmlParts.push('<table>');
          htmlParts.push('<tr><th>Type</th><th>Time</th><th>Message</th></tr>');
          recentLogs.forEach((l) => {
            htmlParts.push(
              `<tr><td>${safe(l.type)}</td><td>${safe(
                l.timestamp ? new Date(l.timestamp).toLocaleString() : ''
              )}</td><td>${safe(l.message || l.error || JSON.stringify(l))}</td></tr>`
            );
          });
          htmlParts.push('</table>');
        }

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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top gradient header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 pb-24">
        <div className="max-w-6xl mx-auto px-6 pt-8 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              QA_APP
            </h1>
            <p className="mt-1 text-sm md:text-base text-slate-100/80">
              Autonomous test generation and execution for any web application.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                isRunning
                  ? 'bg-emerald-900/70 text-emerald-100 border border-emerald-500/60'
                  : 'bg-slate-900/40 text-slate-100 border border-slate-300/40'
              }`}
            >
              <span className="mr-1 h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/70" />
              {isRunning ? 'Agent running' : 'Idle'}
            </span>
          </div>
        </div>
      </div>

      {/* Main content card area */}
      <div className="-mt-16 pb-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left column: config panel */}
            <section className="lg:col-span-2 space-y-4">
              <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl shadow-xl shadow-slate-950/40 p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Target Configuration</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Define the URL and optional schema for the agent to explore.
                    </p>
                  </div>
                  <span className="hidden sm:inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-[11px] font-medium text-slate-300 border border-slate-600/60">
                    Fully autonomous
                  </span>
                </div>

                <div className="space-y-4">
                  <UrlInput value={url} onChange={setUrl} disabled={isRunning} />
                  <SchemaUpload
                    value={schema}
                    onChange={setSchema}
                    disabled={isRunning}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-800">
                  <button
                    onClick={handleStart}
                    disabled={isRunning || !url.trim()}
                    className={`inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                      isRunning || !url.trim()
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 focus:ring-emerald-400'
                    }`}
                  >
                    {isRunning ? (
                      <>
                        <span className="mr-2 h-3 w-3 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
                        Running…
                      </>
                    ) : (
                      'Start test generation'
                    )}
                  </button>
                  {isRunning && (
                    <button
                      onClick={handleStop}
                      className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600/70 transition"
                    >
                      Stop
                    </button>
                  )}
                  {report && !isRunning && (
                    <button
                      onClick={handleDownloadReport}
                      className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium bg-slate-900 hover:bg-slate-800 text-slate-100 border border-slate-600/70 transition"
                    >
                      Download report
                    </button>
                  )}
                </div>
              </div>

              {/* Generated tests summary */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Generated Test Files
                  </h3>
                  <span className="text-xs text-slate-500">
                    {testFiles.length} file{testFiles.length === 1 ? '' : 's'}
                  </span>
                </div>
                {testFiles.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No test files generated yet. Start a run to see results here.
                  </p>
                ) : (
                  <ul className="space-y-1 max-h-40 overflow-y-auto text-xs">
                    {testFiles.map((file, idx) => (
                      <li
                        key={idx}
                        className="flex items-center gap-2 rounded-md bg-slate-950/40 border border-slate-800 px-3 py-2"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span className="font-mono text-slate-200 truncate">
                          {file}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Right column: console */}
            <section className="lg:col-span-3">
              <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl shadow-xl shadow-slate-950/40 p-4 md:p-5 h-full flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      Agent Console
                    </h2>
                    <p className="text-xs text-slate-500">
                      Live stream of agent thoughts, tool calls, and test results.
                    </p>
                  </div>
                  <span className="hidden sm:inline-flex rounded-full bg-slate-800 px-3 py-1 text-[11px] text-slate-300 border border-slate-600/60">
                    {logs.length} messages
                  </span>
                </div>
                <div className="flex-1 min-h-[380px]">
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
