export interface PaperAnalysis {
  title: string;
  summary: string;
  goal: string;
  content: string;
  method: string;
  outlook: string;
  reference_value: string;
  references?: string[];
  authors?: string[];
  year?: string;
  journal?: string;
  citation?: string;
}

export type ProcessingStatus = 'idle' | 'parsing' | 'analyzing' | 'completed' | 'error';

export interface Paper {
  id: string;
  fileName: string;
  fileSize: number;
  uploadDate: number;
  status: ProcessingStatus;
  text: string;
  analysis?: PaperAnalysis;
  error?: string;
  fileUrl?: string;
  tags?: string[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}
