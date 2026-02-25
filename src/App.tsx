import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dropzone } from '@/components/Dropzone';
import { DataTable } from '@/components/DataTable';
import { ChatWindow } from '@/components/ChatWindow';
import { KnowledgeGraph } from '@/components/KnowledgeGraph';
import { SidePanel } from '@/components/SidePanel';
import { CitationModal } from '@/components/CitationModal';
import { Paper, ProcessingStatus, PaperAnalysis } from '@/types';
import { extractTextFromPDF } from '@/lib/pdf-parser';
import { analyzePaper } from '@/lib/gemini';
import { BookOpen, Github, Trash2, Download, Table as TableIcon, Network, Search, Minimize2, Maximize2 } from 'lucide-react';
import { saveAs } from 'file-saver';

function App() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [highlightedPaperId, setHighlightedPaperId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('table');
  const [sourceModal, setSourceModal] = useState<{ paper: Paper, title: string, highlightContent?: string, fileUrl?: string } | null>(null);
  const [citationModal, setCitationModal] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Load from local storage on mount
  useEffect(() => {
    const savedPapers = localStorage.getItem('scholartab-papers');
    if (savedPapers) {
      try {
        const parsedPapers = JSON.parse(savedPapers);
        // fileUrls from localStorage are invalid after reload, so we strip them
        // In a real app, we'd use IndexedDB or re-upload
        setPapers(parsedPapers.map((p: Paper) => ({ ...p, fileUrl: undefined })));
      } catch (e) {
        console.error('Failed to load papers from local storage', e);
      }
    }
  }, []);

  // Save to local storage whenever papers change
  useEffect(() => {
    // Don't save fileUrl to localStorage as object URLs are ephemeral
    const papersToSave = papers.map(({ fileUrl, ...rest }) => rest);
    localStorage.setItem('scholartab-papers', JSON.stringify(papersToSave));
  }, [papers]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    papers.forEach(p => p.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [papers]);

  const filteredPapers = useMemo(() => {
    let result = papers;

    if (selectedTag) {
      result = result.filter(p => p.tags?.includes(selectedTag));
    }

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(p => {
        const title = (p.analysis?.title || p.fileName).toLowerCase();
        const summary = (p.analysis?.summary || '').toLowerCase();
        return title.includes(lowerQuery) || summary.includes(lowerQuery);
      });
    }
    return result;
  }, [papers, searchQuery, selectedTag]);

  const handleFilesDrop = useCallback(async (files: File[]) => {
    const newPapers: Paper[] = files.map(file => ({
      id: crypto.randomUUID(),
      fileName: file.name,
      fileSize: file.size,
      uploadDate: Date.now(),
      status: 'parsing',
      text: '',
      fileUrl: URL.createObjectURL(file),
      tags: [],
    }));

    setPapers(prev => [...prev, ...newPapers]);

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const paperId = newPapers[i].id;

      try {
        // 1. Parse PDF
        const text = await extractTextFromPDF(file);
        
        setPapers(prev => prev.map(p => 
          p.id === paperId ? { ...p, status: 'analyzing', text } : p
        ));

        // 2. Analyze with AI
        const analysis = await analyzePaper(text);

        setPapers(prev => prev.map(p => 
          p.id === paperId ? { ...p, status: 'completed', analysis } : p
        ));

      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        setPapers(prev => prev.map(p => 
          p.id === paperId ? { ...p, status: 'error', error: String(error) } : p
        ));
      }
    }
  }, []);

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all papers?')) {
      setPapers([]);
      setSelectedPaper(null);
      localStorage.removeItem('scholartab-papers');
    }
  };

  const handleExport = async () => {
    if (papers.length === 0) return;

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Papers');

    worksheet.columns = [
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Summary', key: 'summary', width: 50 },
      { header: 'Goal', key: 'goal', width: 30 },
      { header: 'Content', key: 'content', width: 50 },
      { header: 'Method', key: 'method', width: 30 },
      { header: 'Outlook', key: 'outlook', width: 30 },
      { header: 'Value', key: 'reference_value', width: 30 },
    ];

    papers.forEach(p => {
      worksheet.addRow({
        title: p.analysis?.title || p.fileName,
        summary: p.analysis?.summary || '',
        goal: p.analysis?.goal || '',
        content: p.analysis?.content || '',
        method: p.analysis?.method || '',
        outlook: p.analysis?.outlook || '',
        reference_value: p.analysis?.reference_value || '',
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, 'scholartab_export.xlsx');
  };

  const handlePaperUpdate = (paperId: string, field: keyof PaperAnalysis, value: string) => {
    setPapers(prev => prev.map(p => {
      if (p.id === paperId && p.analysis) {
        return {
          ...p,
          analysis: {
            ...p.analysis,
            [field]: value
          }
        };
      }
      return p;
    }));
  };

  const handlePaperTagAdd = (paperId: string, tag: string) => {
    setPapers(prev => prev.map(p => {
      if (p.id === paperId) {
        const currentTags = p.tags || [];
        if (!currentTags.includes(tag)) {
          return { ...p, tags: [...currentTags, tag] };
        }
      }
      return p;
    }));
  };

  const handlePaperTagRemove = (paperId: string, tag: string) => {
    setPapers(prev => prev.map(p => {
      if (p.id === paperId) {
        return { ...p, tags: (p.tags || []).filter(t => t !== tag) };
      }
      return p;
    }));
  };

  const handleViewSource = (paper: Paper, field?: string, highlightContent?: string) => {
    const title = field 
      ? `Source Text for ${field} - ${paper.analysis?.title || paper.fileName}`
      : `Full Text - ${paper.analysis?.title || paper.fileName}`;
    
    // Only show PDF if we are viewing the full text (no specific field requested) and we have a fileUrl
    const fileUrl = !field ? paper.fileUrl : undefined;

    setSourceModal({ paper, title, highlightContent, fileUrl });
  };

  const handleViewCitation = (citation: string) => {
    setCitationModal(citation);
  };

  const handleLinkClick = (paper: Paper) => {
    setViewMode('table'); // Ensure we are in table view
    setHighlightedPaperId(paper.id);
    
    // Use a small timeout to ensure viewMode change has rendered if needed
    setTimeout(() => {
      const element = document.getElementById(`paper-row-${paper.id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    // Clear highlight after a while
    setTimeout(() => setHighlightedPaperId(null), 3000);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100 selection:text-blue-900 flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white p-1.5 rounded-lg">
              <BookOpen className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              ScholarTab
            </h1>
          </div>

          <div className="flex-1 max-w-lg mx-8">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all sm:text-sm"
                placeholder="搜索论文标题或摘要..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {papers.length > 0 && (
              <>
                <button
                  onClick={handleExport}
                  className="text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  导出
                </button>
                <div className="h-4 w-px bg-gray-200" />
                <button
                  onClick={handleClearAll}
                  className="text-sm font-medium text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  清空
                </button>
              </>
            )}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-900 transition-colors"
            >
              <Github className="w-5 h-5" />
            </a>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <main className={`flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 transition-all duration-300 ${sourceModal ? 'mr-[50%] hidden md:block' : ''}`}>
          <div className="max-w-7xl mx-auto">
            {/* Dropzone */}
            <section>
              <Dropzone onFilesDrop={handleFilesDrop} className="bg-white" />
            </section>

            {/* Content */}
            <section className="space-y-4 mt-8">
              {/* Tag Filter */}
              {allTags.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  <button
                    onClick={() => setSelectedTag(null)}
                    className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedTag === null
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    All
                  </button>
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                      className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                        selectedTag === tag
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  文献库
                  <span className="ml-2 text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {filteredPapers.length}
                  </span>
                </h2>
                
                <div className="flex items-center gap-4">
                  {viewMode === 'table' && (
                    <button
                      onClick={() => setIsCompactMode(!isCompactMode)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        isCompactMode 
                          ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                      }`}
                      title={isCompactMode ? "显示全文" : "紧凑视图"}
                    >
                      {isCompactMode ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                      {isCompactMode ? '展开' : '紧凑'}
                    </button>
                  )}

                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                      onClick={() => setViewMode('table')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        viewMode === 'table' 
                          ? 'bg-white text-gray-900 shadow-sm' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <TableIcon className="w-4 h-4" />
                      列表
                    </button>
                    <button
                      onClick={() => setViewMode('graph')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        viewMode === 'graph' 
                          ? 'bg-white text-gray-900 shadow-sm' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Network className="w-4 h-4" />
                      图谱
                    </button>
                  </div>
                </div>
              </div>
              
              {viewMode === 'table' ? (
                <DataTable 
                  data={filteredPapers} 
                  onRowClick={setSelectedPaper} 
                  onPaperUpdate={handlePaperUpdate}
                  onViewSource={handleViewSource}
                  isCompact={isCompactMode}
                  onTagAdd={handlePaperTagAdd}
                  onTagRemove={handlePaperTagRemove}
                  onViewCitation={handleViewCitation}
                  highlightedId={highlightedPaperId}
                  onLinkClick={handleLinkClick}
                />
              ) : (
                <KnowledgeGraph 
                  papers={filteredPapers} 
                  onNodeClick={setSelectedPaper} 
                />
              )}
            </section>
          </div>
        </main>

        {/* Side Panel */}
        {sourceModal && (
          <SidePanel
            isOpen={!!sourceModal}
            paper={sourceModal.paper}
            title={sourceModal.title}
            highlightContent={sourceModal.highlightContent}
            fileUrl={sourceModal.fileUrl}
            onClose={() => setSourceModal(null)}
          />
        )}
      </div>

      {/* Chat Window */}
      {selectedPaper && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in duration-200"
            onClick={() => setSelectedPaper(null)}
          />
          <ChatWindow 
            paper={selectedPaper} 
            onClose={() => setSelectedPaper(null)} 
          />
        </>
      )}

      {/* Citation Modal */}
      {citationModal && (
        <CitationModal
          citation={citationModal}
          onClose={() => setCitationModal(null)}
        />
      )}
    </div>
  );
}

export default App;
