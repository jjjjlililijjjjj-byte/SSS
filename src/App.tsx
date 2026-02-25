import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dropzone } from '@/components/Dropzone';
import { DataTable } from '@/components/DataTable';
import { ChatWindow } from '@/components/ChatWindow';
import { KnowledgeGraph } from '@/components/KnowledgeGraph';
import { SidePanel } from '@/components/SidePanel';
import { CitationModal } from '@/components/CitationModal';
import { Paper, ProcessingStatus, PaperAnalysis, BatchProgress } from '@/types';
import { extractTextFromPDF } from '@/lib/pdf-parser';
import { analyzePaper, setCustomApiKey } from '@/lib/gemini';
import { BookOpen, Github, Trash2, Download, Table as TableIcon, Network, Search, Minimize2, Maximize2, Loader2, CheckCircle2, AlertCircle, Key, Share2, Layers, Folder, Tag } from 'lucide-react';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

function App() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [highlightedPaperId, setHighlightedPaperId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('table');
  const [sourceModal, setSourceModal] = useState<{ paper: Paper, title: string, highlightContent?: string, fileUrl?: string } | null>(null);
  const [citationModal, setCitationModal] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [isGrouped, setIsGrouped] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    isProcessing: false,
  });

  // Load from local storage on mount
  useEffect(() => {
    const checkApiKey = async () => {
      // @ts-ignore
      if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
        setHasApiKey(true);
      } else if (process.env.GEMINI_API_KEY || process.env.API_KEY) {
        setHasApiKey(true);
      }
    };
    checkApiKey();

    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (shareId) {
      const loadShare = async () => {
        try {
          const response = await fetch(`/api/share/${shareId}`);
          if (response.ok) {
            const data = await response.json();
            setPapers(data);
            window.history.replaceState({}, '', window.location.pathname);
            alert('已成功加载分享的文献库');
          }
        } catch (error) {
          console.error('Load share failed:', error);
        }
      };
      loadShare();
    }

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
    if (!hasApiKey) {
      setShowApiKeyInput(true);
      alert('请先设置 API Key 以启动 AI 分析');
      return;
    }

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
    
    setBatchProgress({
      total: files.length,
      completed: 0,
      failed: 0,
      isProcessing: true,
    });

    // Process files in parallel
    const processFile = async (file: File, paperId: string) => {
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
        
        setBatchProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
      } catch (error) {
        const errorMsg = String(error);
        console.error(`Error processing file ${file.name}:`, error);
        setPapers(prev => prev.map(p => 
          p.id === paperId ? { ...p, status: 'error', error: errorMsg } : p
        ));
        setBatchProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
        
        // If it's a single file or small batch, alert the user
        if (files.length <= 3) {
          alert(`文件 "${file.name}" 解析失败:\n${errorMsg}`);
        }
      }
    };

    // Execute processing tasks with limited concurrency (4 at a time)
    const concurrencyLimit = 4;
    const tasks = files.map((file, i) => () => processFile(file, newPapers[i].id));
    
    const executeTasks = async () => {
      const results: Promise<void>[] = [];
      const executing = new Set<Promise<void>>();
      
      for (const task of tasks) {
        const p = Promise.resolve().then(() => task());
        results.push(p);
        executing.add(p);
        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);
        
        if (executing.size >= concurrencyLimit) {
          await Promise.race(executing);
        }
        
        // Add a small delay between starting tasks to avoid burst rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return Promise.all(results);
    };

    await executeTasks();
    
    // Reset batch progress after a delay
    setTimeout(() => {
      setBatchProgress(prev => ({ ...prev, isProcessing: false }));
    }, 3000);
  }, [hasApiKey]);

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

    // Helper to strip markdown bold syntax
    const stripMarkdown = (text: string) => {
      return text.replace(/\*\*(.*?)\*\*/g, '$1');
    };

    worksheet.columns = [
      { header: '标题', key: 'title', width: 30 },
      { header: '摘要', key: 'summary', width: 50 },
      { header: '研究目标', key: 'goal', width: 30 },
      { header: '研究内容', key: 'content', width: 50 },
      { header: '研究方法', key: 'method', width: 30 },
      { header: '未来展望', key: 'outlook', width: 30 },
      { header: '参考价值', key: 'reference_value', width: 30 },
    ];

    papers.forEach(p => {
      worksheet.addRow({
        title: stripMarkdown(p.analysis?.title || p.fileName),
        summary: stripMarkdown(p.analysis?.summary || ''),
        goal: stripMarkdown(p.analysis?.goal || ''),
        content: stripMarkdown(p.analysis?.content || ''),
        method: stripMarkdown(p.analysis?.method || ''),
        outlook: stripMarkdown(p.analysis?.outlook || ''),
        reference_value: stripMarkdown(p.analysis?.reference_value || ''),
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

  const handleDeletePapers = (paperIds: string[]) => {
    setPapers(prev => prev.filter(p => !paperIds.includes(p.id)));
    if (selectedPaper && paperIds.includes(selectedPaper.id)) {
      setSelectedPaper(null);
    }
  };

  const handleBatchTagAdd = (paperIds: string[], tag: string) => {
    setPapers(prev => prev.map(p => {
      if (paperIds.includes(p.id)) {
        const currentTags = p.tags || [];
        if (!currentTags.includes(tag)) {
          return { ...p, tags: [...currentTags, tag] };
        }
      }
      return p;
    }));
  };

  const handleBatchTagClear = (paperIds: string[]) => {
    setPapers(prev => prev.map(p => {
      if (paperIds.includes(p.id)) {
        return { ...p, tags: [] };
      }
      return p;
    }));
  };

  const handleSetApiKey = () => {
    if (tempApiKey.trim()) {
      setCustomApiKey(tempApiKey.trim());
      setHasApiKey(true);
      setShowApiKeyInput(false);
      alert('API Key 已设置');
    }
  };

  const handleOpenSelectKey = async () => {
    // @ts-ignore
    if (window.aistudio) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
      setShowApiKeyInput(false);
    }
  };

  const handleShare = async () => {
    if (papers.length === 0) return;
    setIsSharing(true);
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(papers.map(({ fileUrl, ...rest }) => rest))
      });
      const { id } = await response.json();
      const shareUrl = `${window.location.origin}?share=${id}`;
      await navigator.clipboard.writeText(shareUrl);
      alert('分享链接已复制到剪贴板！');
    } catch (error) {
      console.error('Share failed:', error);
      alert('分享失败，请稍后重试');
    } finally {
      setIsSharing(false);
    }
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
                  onClick={handleShare}
                  disabled={isSharing}
                  className="text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <Share2 className={cn("w-4 h-4", isSharing && "animate-spin")} />
                  {isSharing ? '分享中...' : '分享'}
                </button>
                <div className="h-4 w-px bg-gray-200" />
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

            <div className="relative">
              <button
                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                className={cn(
                  "p-2 rounded-full transition-all",
                  hasApiKey ? "text-green-500 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"
                )}
                title="设置 API Key"
              >
                <Key className="w-5 h-5" />
              </button>

              <AnimatePresence>
                {showApiKeyInput && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50"
                  >
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">API 设置</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1 block">
                          手动输入 Gemini API Key
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={tempApiKey}
                            onChange={(e) => setTempApiKey(e.target.value)}
                            placeholder="粘贴您的 API Key..."
                            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none"
                          />
                          <button
                            onClick={handleSetApiKey}
                            className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                      
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-gray-100"></span>
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase">
                          <span className="bg-white px-2 text-gray-400">或者</span>
                        </div>
                      </div>

                      <button
                        onClick={handleOpenSelectKey}
                        className="w-full py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                      >
                        使用平台 Key 选择器
                      </button>
                      
                      <p className="text-[10px] text-gray-400 leading-relaxed">
                        设置 API Key 后即可启动 AI 论文分析。您的 Key 仅保存在当前会话中。
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        <main className={`flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 transition-all duration-300 ${sourceModal ? 'mr-[50%] hidden md:block' : ''}`}>
          <div className="max-w-7xl mx-auto">
            {/* API Key Warning */}
            {!hasApiKey && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">Gemini API Key 未设置</h3>
                  <p className="text-xs text-amber-700 mt-1">
                    请点击右上角的钥匙图标设置 API Key，以启用 AI 论文分析功能。
                  </p>
                </div>
              </div>
            )}

            {/* Batch Progress Indicator */}
            <AnimatePresence>
              {batchProgress.isProcessing && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="mb-6 bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">
                        正在批量处理文献 ({batchProgress.completed + batchProgress.failed} / {batchProgress.total})
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-3 h-3" /> {batchProgress.completed} 成功
                      </span>
                      {batchProgress.failed > 0 && (
                        <span className="flex items-center gap-1 text-red-600">
                          <AlertCircle className="w-3 h-3" /> {batchProgress.failed} 失败
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="bg-blue-600 h-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                    <>
                      <button
                        onClick={() => setIsGrouped(!isGrouped)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                          isGrouped 
                            ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}
                        title={isGrouped ? "取消分类" : "按标签分类"}
                      >
                        <Layers className="w-4 h-4" />
                        分类视图
                      </button>
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
                    </>
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
                isGrouped ? (
                  <div className="space-y-8">
                    {(() => {
                      const grouped: Record<string, Paper[]> = {};
                      const uncategorized: Paper[] = [];

                      filteredPapers.forEach(paper => {
                        if (!paper.tags || paper.tags.length === 0) {
                          uncategorized.push(paper);
                        } else {
                          paper.tags.forEach(tag => {
                            if (!grouped[tag]) grouped[tag] = [];
                            grouped[tag].push(paper);
                          });
                        }
                      });

                      const sortedTags = Object.keys(grouped).sort();

                      return (
                        <>
                          {sortedTags.map(tag => (
                            <div key={tag} className="space-y-3">
                              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                <Tag className="w-5 h-5 text-blue-500" />
                                {tag}
                                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{grouped[tag].length}</span>
                              </h3>
                              <DataTable 
                                data={grouped[tag]} 
                                onRowClick={setSelectedPaper} 
                                onPaperUpdate={handlePaperUpdate}
                                onViewSource={handleViewSource}
                                isCompact={isCompactMode}
                                onTagAdd={handlePaperTagAdd}
                                onTagRemove={handlePaperTagRemove}
                                onViewCitation={handleViewCitation}
                                highlightedId={highlightedPaperId}
                                onLinkClick={handleLinkClick}
                                onDeletePapers={handleDeletePapers}
                                onBatchTagAdd={handleBatchTagAdd}
                                onBatchTagClear={handleBatchTagClear}
                              />
                            </div>
                          ))}
                          
                          {uncategorized.length > 0 && (
                            <div className="space-y-3">
                              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                <Folder className="w-5 h-5 text-gray-400" />
                                未分类
                                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{uncategorized.length}</span>
                              </h3>
                              <DataTable 
                                data={uncategorized} 
                                onRowClick={setSelectedPaper} 
                                onPaperUpdate={handlePaperUpdate}
                                onViewSource={handleViewSource}
                                isCompact={isCompactMode}
                                onTagAdd={handlePaperTagAdd}
                                onTagRemove={handlePaperTagRemove}
                                onViewCitation={handleViewCitation}
                                highlightedId={highlightedPaperId}
                                onLinkClick={handleLinkClick}
                                onDeletePapers={handleDeletePapers}
                                onBatchTagAdd={handleBatchTagAdd}
                                onBatchTagClear={handleBatchTagClear}
                              />
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
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
                    onDeletePapers={handleDeletePapers}
                    onBatchTagAdd={handleBatchTagAdd}
                    onBatchTagClear={handleBatchTagClear}
                  />
                )
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
