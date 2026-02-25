export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    // Dynamically import pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist');
    
    // Use the actual version from the library to ensure API and Worker versions match
    const version = pdfjsLib.version;
    // For version 4.x and above, use .mjs. For older versions, use .js
    const isESM = version.startsWith('4') || version.startsWith('5');
    const extension = isESM ? 'mjs' : 'js';
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.${extension}`;

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      // Add font data URL for better character support
      standardFontDataUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/standard_fonts/`,
      cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/cmaps/`,
      cMapPacked: true,
    });
    
    const pdf = await loadingTask.promise;
    
    const pagePromises = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      pagePromises.push(
        pdf.getPage(i).then(async (page) => {
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
          return `--- PAGE ${i} ---\n${pageText}\n\n`;
        })
      );
    }
    
    const pagesText = await Promise.all(pagePromises);
    const fullText = pagesText.join('');
    
    return fullText.trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    // Provide more context in the error
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`PDF 解析失败: ${errorMessage}`);
  }
}
