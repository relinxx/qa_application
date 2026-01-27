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
        return 'text-[#10b981]';
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-[#f59e0b]';
      case 'agent':
        return 'text-[#c084fc] font-semibold';
      case 'info':
        return 'text-[#06b6d4]';
      default:
        return 'text-gray-400';
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

  const getLogGlow = (type: LogMessage['type']) => {
    switch (type) {
      case 'success':
        return 'shadow-[0_0_8px_rgba(16,185,129,0.3)]';
      case 'error':
        return 'shadow-[0_0_8px_rgba(239,68,68,0.3)]';
      case 'warning':
        return 'shadow-[0_0_8px_rgba(245,158,11,0.3)]';
      case 'agent':
        return 'shadow-[0_0_8px_rgba(168,85,247,0.3)]';
      default:
        return '';
    }
  };

  return (
    <div className="w-full h-full flex flex-col glass rounded-xl overflow-hidden">
      <div
        ref={consoleRef}
        className="flex-1 p-4 overflow-y-auto font-mono text-sm scrollbar-thin"
        style={{ minHeight: '400px', maxHeight: '600px' }}
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 italic flex items-center gap-2">
            <span className="animate-pulse">▸</span>
            Waiting for agent to start...
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 p-2 rounded-lg transition-all hover:bg-white/5 ${getLogColor(log.type)}`}
              >
                <span className={`flex-shrink-0 ${getLogGlow(log.type)}`}>
                  {getLogIcon(log.type)}
                </span>
                {log.timestamp && (
                  <span className="text-gray-600 text-xs font-light flex-shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                )}
                <span className="flex-1 break-words leading-relaxed">
                  {log.message || log.error || JSON.stringify(log)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
