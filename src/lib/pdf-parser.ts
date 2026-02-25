export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    // Dynamically import pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist');
    
    // Use the actual version from the library to ensure API and Worker versions match
    const version = pdfjsLib.version;
    // For version 4.x and above, use .mjs. For older versions, use .js
    const isESM = version.startsWith('4') || version.startsWith('5');
    const extension = isESM ? 'mjs' : 'js';
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.${extension}`;

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
    });
    
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' '); // Use space instead of newline for better flow
      fullText += `--- PAGE ${i} ---\n${pageText}\n\n`;
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    // Provide more context in the error
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`PDF 解析失败: ${errorMessage}`);
  }
}
