import React, { useState, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table';
import { Paper, ProcessingStatus, PaperAnalysis } from '@/types';
import { Loader2, CheckCircle2, AlertCircle, MessageSquare, Pencil, Eye, Plus, X, Quote, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableProps {
  data: Paper[];
  onRowClick: (paper: Paper) => void;
  onPaperUpdate: (paperId: string, field: keyof PaperAnalysis, value: string) => void;
  onViewSource: (paper: Paper, field?: string, content?: string) => void;
  isCompact?: boolean;
  onTagAdd: (paperId: string, tag: string) => void;
  onTagRemove: (paperId: string, tag: string) => void;
  onViewCitation: (citation: string) => void;
  highlightedId?: string | null;
  onLinkClick?: (paper: Paper) => void;
  onDeletePapers: (paperIds: string[]) => void;
  onBatchTagAdd: (paperIds: string[], tag: string) => void;
  onBatchTagClear: (paperIds: string[]) => void;
}

const StatusIcon = ({ status, error }: { status: ProcessingStatus, error?: string }) => {
  switch (status) {
    case 'parsing':
    case 'analyzing':
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'error':
      return (
        <span title={error || '解析失败'}>
          <AlertCircle className="w-4 h-4 text-red-500" />
        </span>
      );
    default:
      return <div className="w-4 h-4 rounded-full border-2 border-gray-200" />;
  }
};

const TagsCell = ({ 
  tags, 
  onAddTag, 
  onRemoveTag 
}: { 
  tags: string[], 
  onAddTag: (tag: string) => void, 
  onRemoveTag: (tag: string) => void 
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTag, setNewTag] = useState("");

  const handleAdd = () => {
    if (newTag.trim()) {
      onAddTag(newTag.trim());
      setNewTag("");
      setIsAdding(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-1 items-center min-w-[100px]">
      {tags.map(tag => (
        <span key={tag} className="bg-blue-50 text-blue-700 border border-blue-100 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
          {tag}
          <button 
            onClick={(e) => { e.stopPropagation(); onRemoveTag(tag); }} 
            className="hover:text-blue-900 rounded-full hover:bg-blue-100 p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {isAdding ? (
        <div className="flex items-center gap-1">
            <input
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { 
                  if(e.key === 'Enter') handleAdd(); 
                  if(e.key === 'Escape') setIsAdding(false);
                }}
                className="w-24 text-xs border border-blue-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
                onClick={e => e.stopPropagation()}
                onBlur={() => {
                  if (newTag.trim()) handleAdd();
                  else setIsAdding(false);
                }}
                placeholder="New tag..."
            />
        </div>
      ) : (
        <button 
          onClick={(e) => { e.stopPropagation(); setIsAdding(true); }} 
          className="text-gray-400 hover:text-blue-600 p-1 hover:bg-gray-100 rounded-full transition-colors"
          title="Add Tag"
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
    </div>
  )
};

const EditableCell = ({
  value: initialValue,
  row,
  columnId,
  updateData,
  isEditable,
  onViewSource,
  allPapers,
  onLinkClick,
  isCompact,
}: {
  value: string;
  row: Paper;
  columnId: string;
  updateData: (paperId: string, field: keyof PaperAnalysis, value: string) => void;
  isEditable: boolean;
  onViewSource: () => void;
  allPapers: Paper[];
  onLinkClick: (paper: Paper) => void;
  isCompact?: boolean;
}) => {
  const [value, setValue] = useState(initialValue);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const onBlur = () => {
    setIsEditing(false);
    if (value !== initialValue) {
      updateData(row.id, columnId as keyof PaperAnalysis, value);
    }
  };

  const renderLinkedText = (text: string) => {
    if (!text) return text;

    let parts: (string | React.ReactNode)[] = [text];

    // 1. Link to other papers
    if (allPapers) {
      // Filter out the current paper to avoid self-linking
      const otherPapers = allPapers.filter(p => p.id !== row.id && (p.analysis?.title || p.fileName));
      
      if (otherPapers.length > 0) {
        // Sort by title length desc to match longest first
        const sortedPapers = [...otherPapers].sort((a, b) => {
          const titleA = a.analysis?.title || a.fileName;
          const titleB = b.analysis?.title || b.fileName;
          return titleB.length - titleA.length;
        });

        sortedPapers.forEach(paper => {
          const title = paper.analysis?.title || paper.fileName;
          if (title.length < 5) return; // Skip very short titles to avoid noise

          const newParts: (string | React.ReactNode)[] = [];
          parts.forEach(part => {
            if (typeof part === 'string') {
              // Escape regex special chars in title
              const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`(${escapedTitle})`, 'gi');
              const split = part.split(regex);

              split.forEach((s, i) => {
                if (s.toLowerCase() === title.toLowerCase()) {
                   newParts.push(
                     <span
                       key={`${paper.id}-${i}`}
                       className="text-blue-600 hover:underline cursor-pointer font-medium"
                       onClick={(e) => {
                         e.stopPropagation();
                         onLinkClick(paper);
                       }}
                       title={`Go to ${title}`}
                     >
                       {s}
                     </span>
                   );
                } else if (s !== "") {
                  newParts.push(s);
                }
              });
            } else {
              newParts.push(part);
            }
          });
          parts = newParts;
        });
      }
    }

    // 2. Parse Markdown bolding (**text**)
    const finalParts: (string | React.ReactNode)[] = [];
    parts.forEach((part, partIndex) => {
      if (typeof part === 'string') {
        const split = part.split(/(\*\*.*?\*\*)/g);
        split.forEach((s, i) => {
          if (s.startsWith('**') && s.endsWith('**') && s.length >= 4) {
             finalParts.push(<strong key={`bold-${partIndex}-${i}`}>{s.slice(2, -2)}</strong>);
          } else if (s !== "") {
             finalParts.push(s);
          }
        });
      } else {
        finalParts.push(part);
      }
    });

    return finalParts;
  };

  if (!isEditable) {
    return (
      <div 
        className={cn(
          "text-sm text-gray-600",
          isCompact ? "line-clamp-3" : "whitespace-pre-wrap"
        )} 
        title={isCompact ? value : undefined}
      >
        {renderLinkedText(value || '-')}
      </div>
    );
  }

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [isEditing, value]);

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onBlur}
        onClick={(e) => e.stopPropagation()}
        autoFocus
        className="w-full bg-white border border-blue-300 p-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none resize-none rounded-md shadow-sm overflow-hidden"
        style={{ minHeight: '4rem' }}
      />
    );
  }

  return (
    <div 
      className="group relative min-h-[3rem] p-1 rounded hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onViewSource();
      }}
    >
      <div className={cn(
        "text-sm text-gray-600 pr-6",
        isCompact ? "line-clamp-3" : "whitespace-pre-wrap"
      )}>
        {renderLinkedText(value || '-')}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        className="absolute top-1 right-1 p-1.5 bg-white text-gray-400 hover:text-blue-600 rounded shadow-sm border border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Edit"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );
};

export function DataTable({ 
  data, 
  onRowClick, 
  onPaperUpdate, 
  onViewSource, 
  isCompact = false, 
  onTagAdd, 
  onTagRemove, 
  onViewCitation,
  highlightedId,
  onLinkClick: onPaperLinkClick,
  onDeletePapers,
  onBatchTagAdd,
  onBatchTagClear
}: DataTableProps) {
  const [rowSelection, setRowSelection] = useState({});
  const [batchTag, setBatchTag] = useState("");
  const [isBatchTagging, setIsBatchTagging] = useState(false);

  const columns: ColumnDef<Paper>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ),
      size: 40,
    },
    {
      accessorKey: 'status',
      header: '',
      size: 40,
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <StatusIcon status={row.original.status} error={row.original.error} />
        </div>
      ),
    },
    {
      accessorKey: 'title',
      header: '标题',
      size: 200,
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <div 
            className={cn(
              "font-medium text-gray-900 cursor-pointer hover:text-blue-600 transition-colors",
              isCompact ? "truncate" : "whitespace-pre-wrap"
            )}
            title={isCompact ? (row.original.analysis?.title || row.original.fileName) : "点击查看全文"}
            onClick={(e) => {
              e.stopPropagation();
              onViewSource(row.original);
            }}
          >
            {row.original.analysis?.title || row.original.fileName}
          </div>
          <TagsCell 
            tags={row.original.tags || []} 
            onAddTag={(tag) => onTagAdd(row.original.id, tag)}
            onRemoveTag={(tag) => onTagRemove(row.original.id, tag)}
          />
        </div>
      ),
    },
    {
      accessorKey: 'summary',
      header: '摘要',
      size: 250,
      cell: ({ row }) => (
        <EditableCell
          value={row.original.analysis?.summary || ''}
          row={row.original}
          columnId="summary"
          updateData={onPaperUpdate}
          isEditable={row.original.status === 'completed'}
          onViewSource={() => onViewSource(row.original, 'Summary', row.original.analysis?.summary)}
          allPapers={data}
          onLinkClick={onPaperLinkClick || onRowClick}
          isCompact={isCompact}
        />
      ),
    },
    {
      accessorKey: 'goal',
      header: '研究目标',
      size: 200,
      cell: ({ row }) => (
        <EditableCell
          value={row.original.analysis?.goal || ''}
          row={row.original}
          columnId="goal"
          updateData={onPaperUpdate}
          isEditable={row.original.status === 'completed'}
          onViewSource={() => onViewSource(row.original, 'Goal', row.original.analysis?.goal)}
          allPapers={data}
          onLinkClick={onPaperLinkClick || onRowClick}
          isCompact={isCompact}
        />
      ),
    },
    {
      accessorKey: 'content',
      header: '研究内容',
      size: 250,
      cell: ({ row }) => (
        <EditableCell
          value={row.original.analysis?.content || ''}
          row={row.original}
          columnId="content"
          updateData={onPaperUpdate}
          isEditable={row.original.status === 'completed'}
          onViewSource={() => onViewSource(row.original, 'Content', row.original.analysis?.content)}
          allPapers={data}
          onLinkClick={onPaperLinkClick || onRowClick}
          isCompact={isCompact}
        />
      ),
    },
    {
      accessorKey: 'method',
      header: '研究方法',
      size: 200,
      cell: ({ row }) => (
        <EditableCell
          value={row.original.analysis?.method || ''}
          row={row.original}
          columnId="method"
          updateData={onPaperUpdate}
          isEditable={row.original.status === 'completed'}
          onViewSource={() => onViewSource(row.original, 'Method', row.original.analysis?.method)}
          allPapers={data}
          onLinkClick={onPaperLinkClick || onRowClick}
          isCompact={isCompact}
        />
      ),
    },
    {
      accessorKey: 'outlook',
      header: '展望',
      size: 200,
      cell: ({ row }) => (
        <EditableCell
          value={row.original.analysis?.outlook || ''}
          row={row.original}
          columnId="outlook"
          updateData={onPaperUpdate}
          isEditable={row.original.status === 'completed'}
          onViewSource={() => onViewSource(row.original, 'Outlook', row.original.analysis?.outlook)}
          allPapers={data}
          onLinkClick={onPaperLinkClick || onRowClick}
          isCompact={isCompact}
        />
      ),
    },
    {
      accessorKey: 'reference_value',
      header: '参考价值',
      size: 200,
      cell: ({ row }) => (
        <EditableCell
          value={row.original.analysis?.reference_value || ''}
          row={row.original}
          columnId="reference_value"
          updateData={onPaperUpdate}
          isEditable={row.original.status === 'completed'}
          onViewSource={() => onViewSource(row.original, 'Value', row.original.analysis?.reference_value)}
          allPapers={data}
          onLinkClick={onPaperLinkClick || onRowClick}
          isCompact={isCompact}
        />
      ),
    },
    {
      id: 'actions',
      size: 80,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRowClick(row.original);
            }}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-blue-600"
            title="Chat with Paper"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          {row.original.analysis?.citation && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewCitation(row.original.analysis!.citation!);
              }}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-blue-600"
              title="View Citation"
            >
              <Quote className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('确定要删除这篇文献吗？')) {
                onDeletePapers([row.original.id]);
              }
            }}
            className="p-2 hover:bg-red-50 rounded-full transition-colors text-gray-400 hover:text-red-600"
            title="Delete Paper"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data,
    columns,
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
  });

  const selectedRows = table.getSelectedRowModel().rows;

  return (
    <div className="space-y-4">
      {selectedRows.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-100 px-4 py-2 rounded-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-4">
            <span className="text-sm text-blue-700 font-medium">
              已选择 {selectedRows.length} 篇文献
            </span>
            
            {isBatchTagging ? (
              <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                <input
                  type="text"
                  value={batchTag}
                  onChange={(e) => setBatchTag(e.target.value)}
                  placeholder="输入标签..."
                  className="text-xs border border-blue-300 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 w-32"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (batchTag.trim()) {
                        onBatchTagAdd(selectedRows.map(r => r.original.id), batchTag.trim());
                        setBatchTag("");
                        setIsBatchTagging(false);
                      }
                    }
                    if (e.key === 'Escape') setIsBatchTagging(false);
                  }}
                />
                <button
                  onClick={() => {
                    if (batchTag.trim()) {
                      onBatchTagAdd(selectedRows.map(r => r.original.id), batchTag.trim());
                      setBatchTag("");
                      setIsBatchTagging(false);
                    }
                  }}
                  className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsBatchTagging(false)}
                  className="p-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsBatchTagging(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-blue-200 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  批量添加标签
                </button>
                <button
                  onClick={() => {
                    if (confirm(`确定要清空选中的 ${selectedRows.length} 篇文献的所有标签吗？`)) {
                      onBatchTagClear(selectedRows.map(r => r.original.id));
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <X className="w-4 h-4" />
                  清空标签
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              if (confirm(`确定要删除选中的 ${selectedRows.length} 篇文献吗？`)) {
                onDeletePapers(selectedRows.map(r => r.original.id));
                setRowSelection({});
              }
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            批量删除
          </button>
        </div>
      )}
      <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky top-0 bg-gray-50 z-10"
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                  暂无论文，请上传。
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  id={`paper-row-${row.original.id}`}
                  className={cn(
                    "hover:bg-gray-50/50 transition-all group",
                    highlightedId === row.original.id ? "bg-blue-50 ring-2 ring-blue-400 ring-inset z-10" : ""
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-4 py-3 align-top"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
}
