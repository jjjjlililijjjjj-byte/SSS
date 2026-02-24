import React, { useCallback, useState } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropzoneProps {
  onFilesDrop: (files: File[]) => void;
  className?: string;
}

export function Dropzone({ onFilesDrop, className }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf'
    ).slice(0, 50);
    
    if (files.length > 0) {
      onFilesDrop(files);
    }
  }, [onFilesDrop]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(
        file => file.type === 'application/pdf'
      ).slice(0, 50);
      if (files.length > 0) {
        onFilesDrop(files);
      }
    }
    // Reset input value to allow selecting the same file again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onFilesDrop]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={cn(
        "border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer",
        isDragging 
          ? "border-blue-500 bg-blue-50/50 scale-[1.01]" 
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50",
        className
      )}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        className="hidden"
        multiple
        accept=".pdf,application/pdf"
      />
      <div className="flex flex-col items-center gap-4">
        <div className={cn(
          "p-4 rounded-full transition-colors",
          isDragging ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
        )}>
          <Upload className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-gray-900">
            拖拽 PDF 文件到这里
          </h3>
          <p className="text-sm text-gray-500">
            支持多文件上传 (最多 50 个). 仅支持 PDF.
          </p>
        </div>
      </div>
    </div>
  );
}
