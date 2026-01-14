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

  const handleStart = () => {
    if (!url.trim()) {
      alert('Please enter a URL');
      return;
    }

    setIsRunning(true);
    setLogs([]);
    setTestFiles([]);

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

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            QA_APP
          </h1>
          <p className="text-gray-600">
            AI-Powered Automated QA Testing Agent
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="space-y-4">
            <UrlInput
              value={url}
              onChange={setUrl}
              disabled={isRunning}
            />
            <SchemaUpload
              value={schema}
              onChange={setSchema}
              disabled={isRunning}
            />
            <div className="flex gap-4">
              <button
                onClick={handleStart}
                disabled={isRunning || !url.trim()}
                className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                  isRunning || !url.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isRunning ? 'Running...' : 'Start Test Generation'}
              </button>
              {isRunning && (
                <button
                  onClick={handleStop}
                  className="px-6 py-3 rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Log Console */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <LogConsole logs={logs} />
        </div>

        {/* Test Results */}
        {testFiles.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Generated Test Files
            </h2>
            <ul className="space-y-2">
              {testFiles.map((file, index) => (
                <li
                  key={index}
                  className="flex items-center p-3 bg-gray-50 rounded-lg"
                >
                  <span className="text-green-600 mr-2">✓</span>
                  <code className="text-sm font-mono text-gray-800">{file}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
