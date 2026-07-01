
import * as pdfjsLib from 'pdfjs-dist';

// Robustly handle PDF.js import structure (Direct namespace vs .default)
const pdfjs: any = pdfjsLib;
const lib = pdfjs.GlobalWorkerOptions ? pdfjs : (pdfjs.default || {});

if (lib.GlobalWorkerOptions) {
    lib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
} else {
    console.warn("PDF.js GlobalWorkerOptions not found. PDF parsing might fail.");
}

export interface ExtractedJobItem {
    sNo: number;
    pieceNo: string;
    description: string; // e.g. "8mm"
    qty: number;
    widthMm: number;
    heightMm: number;
    services: string[];
}

export interface ExtractedJobOrder {
    clientName: string;
    projectName: string;
    joNumber: string;
    items: ExtractedJobItem[];
}

export const parseGlasscoJobOrder = async (file: File): Promise<ExtractedJobOrder> => {
    const arrayBuffer = await file.arrayBuffer();
    
    // Use the resolved lib object to call getDocument
    const getDoc = lib.getDocument;
    if (!getDoc) {
        throw new Error("PDF.js getDocument function not found.");
    }

    const pdf = await getDoc({ data: arrayBuffer }).promise;
    
    let clientName = '';
    let projectName = '';
    let joNumber = '';
    let allItems: ExtractedJobItem[] = [];
    
    // Context State for parsing lines
    let currentServices: string[] = []; 
    let currentThickness = '12mm'; // Default

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Flatten text items into lines based on Y-coordinate (roughly)
        const items = textContent.items as any[];
        // Sort by Y (descending) then X (ascending) to read top-down, left-right
        items.sort((a, b) => {
            if (Math.abs(a.transform[5] - b.transform[5]) > 5) {
                return b.transform[5] - a.transform[5]; // Different lines
            }
            return a.transform[4] - b.transform[4]; // Same line
        });

        // Group into strings
        let currentY = -1;
        let lineText = '';
        const lines: string[] = [];

        items.forEach(item => {
            if (currentY === -1 || Math.abs(item.transform[5] - currentY) > 5) {
                if (lineText) lines.push(lineText);
                lineText = item.str;
                currentY = item.transform[5];
            } else {
                lineText += ' ' + item.str;
            }
        });
        if (lineText) lines.push(lineText);

        // Parse Lines
        for (const line of lines) {
            const cleanLine = line.trim();
            
            // 1. Header Extraction
            if (cleanLine.includes('Client Name:')) {
                const match = cleanLine.match(/Client Name:\s*(.*?)($|\s{2,})/);
                if (match) clientName = match[1].trim();
            }
            if (cleanLine.includes('Project Name:')) {
                const match = cleanLine.match(/Project Name:\s*(.*?)($|\s{2,})/);
                if (match) projectName = match[1].trim();
            }
            if (cleanLine.includes('JO No:')) {
                const match = cleanLine.match(/JO No:\s*(.*?)($|\s{2,})/);
                if (match) joNumber = match[1].trim();
            }

            // 2. Section Header Detection (e.g. "8mm T/G+R/D")
            // Regex matches: "8mm" or "12mm" followed by services separated by + or space
            const sectionMatch = cleanLine.match(/^(\d+mm)\s+([A-Za-z\/\+]+)/);
            if (sectionMatch && !cleanLine.match(/^\d+\s+/)) { // Ensure it's not a data row starting with S.No
                currentThickness = sectionMatch[1];
                const serviceStr = sectionMatch[2];
                currentServices = [];
                
                if (serviceStr.includes('T/G')) currentServices.push('T/G');
                if (serviceStr.includes('R/D')) currentServices.push('R/D'); // Rough/Diamond Polish (Grinding)
                if (serviceStr.includes('P/E') || serviceStr.includes('P/F')) currentServices.push('P/E');
                if (serviceStr.includes('H/L') || serviceStr.includes('Hole')) currentServices.push('Holes');
                if (serviceStr.includes('Notch')) currentServices.push('Notch');
                if (serviceStr.includes('D/G')) currentServices.push('Double Glaze');
                
                // console.log(`Detected Section: ${currentThickness} with services: ${currentServices.join(', ')}`);
                continue;
            }

            // 3. Data Row Detection
            // Pattern: SNo PieceNo Thickness Qty Width Height SqFt
            // Example: "1 2274B/1 8mm 1 440 1958 9.27"
            // Flexible regex to allow variations
            const rowMatch = cleanLine.match(/^(\d+)\s+([A-Za-z0-9\/\-\.]+)\s+(\d+mm)\s+(\d+)\s+(\d+)\s+(\d+)/);
            
            if (rowMatch) {
                const sNo = parseInt(rowMatch[1]);
                const pieceNo = rowMatch[2];
                const thickness = rowMatch[3]; // Should match currentThickness usually
                const qty = parseInt(rowMatch[4]);
                const w = parseInt(rowMatch[5]);
                const h = parseInt(rowMatch[6]);

                allItems.push({
                    sNo,
                    pieceNo,
                    description: thickness,
                    qty,
                    widthMm: w,
                    heightMm: h,
                    services: [...currentServices]
                });
            }
        }
    }

    return {
        clientName,
        projectName,
        joNumber,
        items: allItems
    };
};
