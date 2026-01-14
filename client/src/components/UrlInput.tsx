'use client';

import { useState } from 'react';

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function UrlInput({ value, onChange, disabled }: UrlInputProps) {
  const [error, setError] = useState<string>('');

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
  };

  return (
    <div className="w-full">
      <label htmlFor="url" className="block text-sm font-medium mb-2">
        Target URL
      </label>
      <input
        id="url"
        type="url"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder="https://demo.realworld.io"
        className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? 'border-red-500' : 'border-gray-300'
        } ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
      />
      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
