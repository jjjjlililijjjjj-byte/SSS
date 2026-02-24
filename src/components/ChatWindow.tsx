import React, { useState, useRef, useEffect } from 'react';
import { Paper, ChatMessage } from '@/types';
import { chatWithPaper } from '@/lib/gemini';
import { X, Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

interface ChatWindowProps {
  paper: Paper;
  onClose: () => void;
}

export function ChatWindow({ paper, onClose }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', content: `你好！我已经阅读了 "${paper.analysis?.title || paper.fileName}". 你可以问我任何关于这篇论文的问题。` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    
    // Capture current history for API call
    const currentHistory = [...messages];
    
    // Update UI state
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Add placeholder for streaming response
      // We don't add it to history passed to API, only to UI state later
      
      let responseText = '';
      
      await chatWithPaper(
        paper.text,
        currentHistory, // Pass history BEFORE the new user message
        text,
        (chunk) => {
          responseText = chunk;
          setMessages(prev => {
            const newMessages = [...prev];
            // If the last message is from model (streaming), update it
            // If not (first chunk), add it
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg.role === 'model' && lastMsg !== userMessage && lastMsg !== messages[0]) {
               // This logic is tricky because we might have multiple model messages.
               // Better: check if we already added the response placeholder.
            }
            
            // Simplified approach:
            // We know we added userMessage. The next one should be model response.
            // But we haven't added the placeholder yet in this logic.
            
            // Let's just rebuild the array for simplicity in this demo
            return [...currentHistory, userMessage, { role: 'model', content: chunk }];
          });
        }
      );
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'model', content: '抱歉，我遇到了一些问题。请重试。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const QuickAction = ({ label, prompt }: { label: string, prompt: string }) => (
    <button
      onClick={() => handleSend(prompt)}
      disabled={isLoading}
      className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center"
    >
      <Sparkles className="w-3 h-3 mr-1" />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-white shadow-2xl border-l border-gray-200 flex flex-col z-50 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex-1 min-w-0 mr-4">
          <h3 className="font-semibold text-gray-900 truncate" title={paper.analysis?.title || paper.fileName}>
            {paper.analysis?.title || paper.fileName}
          </h3>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Bot className="w-3 h-3" /> AI 助手
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/30">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              "flex gap-3 max-w-[90%]",
              msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm",
              msg.role === 'user' ? "bg-gray-900 text-white" : "bg-white text-blue-600 border border-gray-100"
            )}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={cn(
              "p-3 rounded-2xl text-sm leading-relaxed shadow-sm break-words",
              msg.role === 'user' 
                ? "bg-gray-900 text-white rounded-tr-none" 
                : "bg-white text-gray-800 border border-gray-100 rounded-tl-none"
            )}>
              {msg.role === 'model' ? (
                <div className="markdown-body prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2">
                   <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 max-w-[90%]">
             <div className="w-8 h-8 rounded-full bg-white text-blue-600 border border-gray-100 flex items-center justify-center flex-shrink-0 shadow-sm">
               <Bot className="w-4 h-4" />
             </div>
             <div className="p-3 rounded-2xl rounded-tl-none bg-white border border-gray-100 shadow-sm flex items-center">
               <Loader2 className="w-4 h-4 animate-spin text-blue-500 mr-2" />
               <span className="text-xs text-gray-400">思考中...</span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-t border-gray-100 bg-white flex gap-2 overflow-x-auto no-scrollbar pb-2">
        <QuickAction label="解释公式" prompt="请解释这篇论文中的核心公式。" />
        <QuickAction label="总结数据" prompt="请总结实验数据和结果。" />
        <QuickAction label="局限性" prompt="这项研究有什么局限性？" />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-100 bg-white pb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="关于这篇论文的问题..."
            className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-sm transition-all outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
