import React from 'react';
import { X, Copy, Check } from 'lucide-react';

interface CitationModalProps {
  citation: string;
  onClose: () => void;
}

export function CitationModal({ citation, onClose }: CitationModalProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(citation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 relative" onClick={e => e.stopPropagation()}>
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <h3 className="text-lg font-semibold text-gray-900 mb-4">GB/T 7714-2015 格式引文</h3>
        
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm text-gray-800 font-mono whitespace-pre-wrap break-words mb-4">
          {citation}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? '已复制' : '复制到剪贴板'}
          </button>
        </div>
      </div>
    </div>
  );
}
