import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, FileText, Search, ChevronUp, ChevronDown, AlignLeft } from 'lucide-react';

interface SourceModalProps {
  title: string;
  content: string;
  highlightContent?: string;
  fileUrl?: string;
  onClose: () => void;
}

const STOP_WORDS = new Set(['the', 'and', 'is', 'in', 'at', 'of', 'to', 'for', 'with', 'on', 'by', 'an', 'a', 'it', 'this', 'that', 'are', 'was', 'were', 'as', 'from', 'be', 'or', 'not', 'but', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find']);

export function SourceModal({ title, content, highlightContent, fileUrl, onClose }: SourceModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [isReadableMode, setIsReadableMode] = useState(false);
  const [showPdf, setShowPdf] = useState(!!fileUrl);
  const [pdfPage, setPdfPage] = useState<number>(1);
  const contentRef = useRef<HTMLDivElement>(null);

  // Extract keywords from highlightContent
  const keywords = useMemo(() => {
    if (!highlightContent) return [];
    // Remove punctuation and split
    const words = highlightContent.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    
    // Return unique words
    return Array.from(new Set(words));
  }, [highlightContent]);

  // Calculate the best matching page
  useEffect(() => {
    if (!content || keywords.length === 0) return;

    // Find the section with the highest density of keywords
    const lowerContent = content.toLowerCase();
    let maxScore = 0;
    let bestIndex = 0;

    // We scan the content in chunks or look for keyword occurrences
    // Simple approach: Find all keyword indices, find the densest cluster
    const indices: number[] = [];
    keywords.forEach(keyword => {
      let pos = lowerContent.indexOf(keyword);
      while (pos !== -1) {
        indices.push(pos);
        pos = lowerContent.indexOf(keyword, pos + 1);
      }
    });

    if (indices.length === 0) return;

    indices.sort((a, b) => a - b);

    // Find the 1000-char window with most keywords
    const windowSize = 1000;
    for (let i = 0; i < indices.length; i++) {
      let currentScore = 0;
      const start = indices[i];
      const end = start + windowSize;
      
      for (let j = i; j < indices.length; j++) {
        if (indices[j] <= end) {
          currentScore++;
        } else {
          break;
        }
      }

      if (currentScore > maxScore) {
        maxScore = currentScore;
        bestIndex = start;
      }
    }

    // Find the page number preceding the bestIndex
    const textBefore = content.substring(0, bestIndex);
    const pageMatches = [...textBefore.matchAll(/--- PAGE (\d+) ---/g)];
    
    if (pageMatches.length > 0) {
      const lastMatch = pageMatches[pageMatches.length - 1];
      const pageNum = parseInt(lastMatch[1], 10);
      setPdfPage(pageNum);
    }
  }, [content, keywords]);

  const displayContent = useMemo(() => {
    if (!content) return '';
    if (!isReadableMode) return content;
    // Replace single newlines with spaces, preserve multiple newlines (paragraphs)
    // Look for newline not preceded by newline and not followed by newline
    return content.replace(/([^\n])\n(?=[^\n])/g, '$1 ');
  }, [content, isReadableMode]);

  // Function to highlight text
  const renderHighlightedText = () => {
    if (!displayContent) return null;

    // If no keywords and no search term, return plain text
    if (keywords.length === 0 && !searchTerm) {
      return <div className="whitespace-pre-wrap font-sans text-base text-gray-800 leading-8 tracking-normal">{displayContent}</div>;
    }

    // Combine search term and keywords for regex
    // We prioritize search term for navigation
    let searchRegex: RegExp | null = null;
    if (searchTerm) {
      const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Allow matching across newlines/spaces
      const flexibleTerm = escapedTerm.replace(/\s+/g, '[\\s\\n]+');
      searchRegex = new RegExp(`(${flexibleTerm})`, 'gi');
    }
    
    // For keywords, we just want to highlight them visually
    // Create a regex that matches any of the keywords
    const keywordRegex = keywords.length > 0 
      ? new RegExp(`\\b(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi') 
      : null;

    const parts = [];
    
    // 1. Find all matches for search term and keywords.
    const matches: { start: number, end: number, type: 'search' | 'keyword', text: string }[] = [];

    if (searchRegex) {
      let match;
      while ((match = searchRegex.exec(displayContent)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length, type: 'search', text: match[0] });
      }
    }

    if (keywordRegex) {
      let match;
      while ((match = keywordRegex.exec(displayContent)) !== null) {
        // Avoid overlapping with search matches (search matches take precedence)
        const isOverlapping = matches.some(m => 
          m.type === 'search' && 
          ((match!.index >= m.start && match!.index < m.end) || 
           (match!.index + match![0].length > m.start && match!.index + match![0].length <= m.end))
        );
        
        if (!isOverlapping) {
          matches.push({ start: match.index, end: match.index + match[0].length, type: 'keyword', text: match[0] });
        }
      }
    }

    // Sort matches
    matches.sort((a, b) => a.start - b.start);

    // Build elements
    let currentIndex = 0;
    matches.forEach((match, i) => {
      // Add text before match
      if (match.start > currentIndex) {
        parts.push(displayContent.substring(currentIndex, match.start));
      }

      // Add match
      parts.push(
        <mark 
          key={i} 
          className={match.type === 'search' 
            ? "bg-yellow-300 text-gray-900 rounded-sm" 
            : "bg-blue-100 text-blue-900 rounded-sm px-0.5 font-medium"
          }
          id={match.type === 'search' ? `match-${matches.filter(m => m.type === 'search' && m.start < match.start).length}` : undefined}
        >
          {match.text}
        </mark>
      );

      currentIndex = match.end;
    });

    // Add remaining text
    if (currentIndex < displayContent.length) {
      parts.push(displayContent.substring(currentIndex));
    }

    return <div className="whitespace-pre-wrap font-sans text-base text-gray-800 leading-8 tracking-normal">{parts}</div>;
  };

  // Update total matches count for search
  useEffect(() => {
    if (!searchTerm) {
      setTotalMatches(0);
      setCurrentMatch(0);
      return;
    }
    const regex = new RegExp(searchTerm, 'gi');
    const count = (displayContent.match(regex) || []).length;
    setTotalMatches(count);
    setCurrentMatch(count > 0 ? 1 : 0);
  }, [searchTerm, displayContent]);

  // Scroll to match
  useEffect(() => {
    if (totalMatches > 0 && currentMatch > 0) {
      const el = document.getElementById(`match-${currentMatch - 1}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMatch, totalMatches]);

  const nextMatch = () => {
    if (totalMatches === 0) return;
    setCurrentMatch(prev => (prev % totalMatches) + 1);
  };

  const prevMatch = () => {
    if (totalMatches === 0) return;
    setCurrentMatch(prev => (prev - 2 + totalMatches) % totalMatches + 1);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-white rounded-t-xl z-10">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-blue-100 p-2 rounded-lg text-blue-600 flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-lg text-gray-900 truncate">{title}</h3>
              {keywords.length > 0 && !showPdf && (
                <p className="text-xs text-blue-600 flex items-center gap-1">
                  <span className="font-medium">高亮显示摘要中的关键词</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* PDF Toggle */}
            {fileUrl && (
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
            )}

            {/* View Mode Toggle (Only for text mode) */}
            {!showPdf && (
              <button
                onClick={() => setIsReadableMode(!isReadableMode)}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium border ${
                  isReadableMode 
                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                title={isReadableMode ? "切换到原始布局" : "切换到阅读布局"}
              >
                <AlignLeft className="w-4 h-4" />
                {isReadableMode ? '阅读模式' : '原始模式'}
              </button>
            )}

            {/* Search Bar (Only for text mode) */}
            {!showPdf && (
              <div className="relative flex items-center">
                <Search className="w-4 h-4 absolute left-3 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="查找..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-20 py-1.5 bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 rounded-lg text-sm transition-all outline-none border w-64"
                />
                {totalMatches > 0 && (
                  <div className="absolute right-2 flex items-center gap-1 text-xs text-gray-500">
                    <span>{currentMatch}/{totalMatches}</span>
                    <div className="flex gap-0.5">
                      <button onClick={prevMatch} className="p-0.5 hover:bg-gray-200 rounded"><ChevronUp className="w-3 h-3" /></button>
                      <button onClick={nextMatch} className="p-0.5 hover:bg-gray-200 rounded"><ChevronDown className="w-3 h-3" /></button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button 
              onClick={onClose} 
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={`flex-1 p-0 bg-gray-50/50 relative ${showPdf ? 'overflow-hidden' : 'overflow-auto'}`}>
          {showPdf && fileUrl ? (
            <object
              data={`${fileUrl}${pdfPage > 1 ? `#page=${pdfPage}` : ''}`}
              type="application/pdf"
              className="w-full h-full block"
            >
              <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                <p>Unable to display PDF directly.</p>
                <a 
                  href={fileUrl} 
                  download="paper.pdf"
                  className="text-blue-600 hover:underline font-medium"
                >
                  Download PDF
                </a>
              </div>
            </object>
          ) : (
            <div className="bg-white shadow-sm border-x p-12 min-h-full max-w-4xl mx-auto" ref={contentRef}>
              {renderHighlightedText()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
