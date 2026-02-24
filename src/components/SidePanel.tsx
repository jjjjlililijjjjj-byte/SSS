import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, AlignLeft, Search, Download, ExternalLink, ChevronRight, ChevronLeft, Maximize2, Minimize2 } from 'lucide-react';
import { Paper } from '@/types';
import ReactMarkdown from 'react-markdown';

interface SidePanelProps {
  paper: Paper;
  title: string;
  highlightContent?: string;
  fileUrl?: string;
  onClose: () => void;
  isOpen: boolean;
}

export function SidePanel({ paper, title, highlightContent, fileUrl, onClose, isOpen }: SidePanelProps) {
  const [showPdf, setShowPdf] = useState(true);
  const [isReadableMode, setIsReadableMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pdfPage, setPdfPage] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset state when paper changes
  useEffect(() => {
    if (isOpen) {
      setShowPdf(!!fileUrl);
      setSearchTerm('');
      // Try to find page number if highlightContent is provided
      if (highlightContent && paper.text) {
        const pageMatch = findPageForText(paper.text, highlightContent);
        if (pageMatch) {
          setPdfPage(pageMatch);
        }
      } else {
        setPdfPage(1);
      }
    }
  }, [paper, highlightContent, fileUrl, isOpen]);

  // Helper to find page number
  const findPageForText = (fullText: string, searchText: string): number | null => {
    // This is a simplified heuristic. 
    // We assume fullText contains "--- PAGE N ---" markers from our PDF parser.
    // We search for a significant chunk of searchText in fullText.
    
    // 1. Try to find the exact text (or a large substring)
    const searchChunk = searchText.slice(0, 50).trim(); // Take first 50 chars
    if (!searchChunk) return null;

    const index = fullText.indexOf(searchChunk);
    if (index === -1) return null;

    // 2. Find the last "--- PAGE N ---" before this index
    const textBefore = fullText.slice(0, index);
    const pageMatches = [...textBefore.matchAll(/--- PAGE (\d+) ---/g)];
    
    if (pageMatches.length > 0) {
      return parseInt(pageMatches[pageMatches.length - 1][1], 10);
    }

    return 1;
  };

  const renderHighlightedText = () => {
    if (!paper.text) return <div className="text-gray-400 italic">No text content available.</div>;

    if (!highlightContent && !searchTerm) {
      return (
        <div className={`prose prose-sm max-w-none ${isReadableMode ? 'prose-lg' : ''}`}>
          <ReactMarkdown>{paper.text}</ReactMarkdown>
        </div>
      );
    }

    // Simple highlighting logic for text view
    const text = paper.text;
    const highlight = highlightContent || searchTerm;
    
    if (!highlight) return text;

    const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    
    return (
      <div className={`prose prose-sm max-w-none ${isReadableMode ? 'prose-lg' : ''}`}>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase() ? (
            <span key={i} className="bg-yellow-200 text-gray-900 font-medium px-0.5 rounded">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-y-0 right-0 bg-white shadow-2xl border-l border-gray-200 flex flex-col z-40 transform transition-all duration-300 ease-in-out ${isFullScreen ? 'w-full' : 'w-full md:w-[50%]'}`}>
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {fileUrl && (
            <>
              <button
                onClick={() => setShowPdf(!showPdf)}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium border ${
                  showPdf 
                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <FileText className="w-4 h-4" />
                {showPdf ? '查看文本' : '查看 PDF'}
              </button>
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                title={isFullScreen ? "退出全屏" : "全屏显示"}
              >
                {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 relative ${showPdf ? 'overflow-hidden' : 'overflow-auto bg-gray-50'}`}>
        {showPdf && fileUrl ? (
          <object
            data={`${fileUrl}#page=${pdfPage}`}
            type="application/pdf"
            className="w-full h-full block"
          >
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
              <p>无法直接显示 PDF。</p>
              <a 
                href={fileUrl} 
                download="paper.pdf"
                className="text-blue-600 hover:underline font-medium"
              >
                下载 PDF
              </a>
            </div>
          </object>
        ) : (
          <div className="p-8 max-w-3xl mx-auto bg-white min-h-full shadow-sm">
             {renderHighlightedText()}
          </div>
        )}
      </div>
    </div>
  );
}
