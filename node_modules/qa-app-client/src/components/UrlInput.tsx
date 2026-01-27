'use client';

import { useState } from 'react';

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function UrlInput({ value, onChange, disabled }: UrlInputProps) {
  const [error, setError] = useState<string>('');
  const [isFocused, setIsFocused] = useState(false);

  const validateUrl = (url: string) => {
    if (!url.trim()) {
      setError('URL is required');
      return false;
    }

    try {
      new URL(url);
      setError('');
      return true;
    } catch (e) {
      setError('Invalid URL format');
      return false;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    if (newValue) {
      validateUrl(newValue);
    } else {
      setError('');
    }
  };

  const handleBlur = () => {
    validateUrl(value);
    setIsFocused(false);
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  return (
    <div className="w-full">
      <label htmlFor="url" className="block text-sm font-semibold mb-2 text-gray-300">
        Target URL
      </label>
      <div className="relative">
        <input
          id="url"
          type="url"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          disabled={disabled}
          placeholder="https://demo.realworld.io"
          className={`w-full px-4 py-3 glass rounded-lg font-mono text-sm transition-all duration-300 ${
            error
              ? 'neon-border border-red-500/50 focus:border-red-500 focus:shadow-[0_0_15px_rgba(239,68,68,0.3)]'
              : isFocused
              ? 'neon-border-cyan focus:shadow-neon-cyan'
              : 'neon-border'
          } ${
            disabled
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-white/5 focus:bg-white/5'
          } text-gray-200 placeholder:text-gray-600`}
        />
        {isFocused && !error && (
          <div className="absolute inset-0 rounded-lg pointer-events-none neon-border-cyan opacity-50 animate-pulse" />
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
          <span>✗</span>
          {error}
        </p>
      )}
    </div>
  );
}
