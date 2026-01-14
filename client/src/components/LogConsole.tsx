'use client';

import { useEffect, useRef } from 'react';
import { LogMessage } from '@/lib/api';

interface LogConsoleProps {
  logs: LogMessage[];
}

export default function LogConsole({ logs }: LogConsoleProps) {
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogColor = (type: LogMessage['type']) => {
    switch (type) {
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'warning':
        return 'text-yellow-600';
      case 'agent':
        return 'text-blue-600 font-semibold';
      default:
        return 'text-gray-700';
    }
  };

  const getLogIcon = (type: LogMessage['type']) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'warning':
        return '⚠';
      case 'agent':
        return '🤖';
      default:
        return '•';
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="bg-gray-800 text-white px-4 py-2 rounded-t-lg flex items-center justify-between">
        <span className="font-mono text-sm font-semibold">Agent Console</span>
        <span className="text-xs text-gray-400">{logs.length} messages</span>
      </div>
      <div
        ref={consoleRef}
        className="flex-1 bg-gray-900 text-gray-100 p-4 rounded-b-lg overflow-y-auto font-mono text-sm"
        style={{ minHeight: '400px', maxHeight: '600px' }}
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 italic">Waiting for agent to start...</div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className={`mb-2 ${getLogColor(log.type)}`}
            >
              <span className="mr-2">{getLogIcon(log.type)}</span>
              {log.timestamp && (
                <span className="text-gray-500 text-xs mr-2">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              )}
              <span>{log.message || log.error || JSON.stringify(log)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
