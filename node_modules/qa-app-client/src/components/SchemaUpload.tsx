'use client';

import { useState } from 'react';

interface SchemaUploadProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function SchemaUpload({ value, onChange, disabled }: SchemaUploadProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        onChange(content);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-semibold text-gray-300">
          Swagger/OpenAPI Schema <span className="text-gray-600 font-normal">(Optional)</span>
        </label>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={disabled}
          className="text-xs font-medium text-[#c084fc] hover:text-[#a855f7] disabled:text-gray-600 transition-colors flex items-center gap-1"
        >
          {isExpanded ? (
            <>
              <span>▲</span> Collapse
            </>
          ) : (
            <>
              <span>▼</span> Expand
            </>
          )}
        </button>
      </div>
      
      {isExpanded && (
        <div className="space-y-3">
          <div className="relative">
            <input
              type="file"
              accept=".json,.yaml,.yml"
              onChange={handleFileUpload}
              disabled={disabled}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:glass file:text-[#06b6d4] file:neon-border-cyan file:cursor-pointer hover:file:bg-[#06b6d4]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />
          </div>
          <div className="relative">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={disabled}
              placeholder="Paste Swagger/OpenAPI JSON schema here, or upload a file..."
              rows={8}
              className={`w-full px-4 py-3 glass rounded-lg font-mono text-xs transition-all duration-300 scrollbar-thin ${
                isFocused
                  ? 'neon-border-cyan focus:shadow-neon-cyan'
                  : 'neon-border'
              } ${
                disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-white/5 focus:bg-white/5'
              } text-gray-300 placeholder:text-gray-600`}
            />
            {isFocused && (
              <div className="absolute inset-0 rounded-lg pointer-events-none neon-border-cyan opacity-50 animate-pulse" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
