'use client';

import { useState } from 'react';

interface SchemaUploadProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function SchemaUpload({ value, onChange, disabled }: SchemaUploadProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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
        <label className="block text-sm font-medium">
          Swagger/OpenAPI Schema (Optional)
        </label>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={disabled}
          className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      
      {isExpanded && (
        <div className="space-y-2">
          <input
            type="file"
            accept=".json,.yaml,.yml"
            onChange={handleFileUpload}
            disabled={disabled}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
          />
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="Paste Swagger/OpenAPI JSON schema here, or upload a file..."
            rows={8}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 ${
              disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            } font-mono text-sm`}
          />
        </div>
      )}
    </div>
  );
}
