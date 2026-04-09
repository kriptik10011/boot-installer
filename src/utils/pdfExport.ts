/**
 * PDF Export Utility — html2canvas + jsPDF pipeline
 *
 * Renders a DOM element to canvas, then paginates across A4 pages.
 * Supports custom filename and orientation.
 */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface ExportOptions {
  filename: string;
  orientation?: 'portrait' | 'landscape';
  scale?: number;
}

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 10;

/**
 * Export a DOM element to PDF.
 * Renders the element to canvas, then splits across A4 pages.
 */
export async function exportToPDF(
  element: HTMLElement,
  options: ExportOptions
): Promise<void> {
  const { filename, orientation = 'portrait', scale = 2 } = options;

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const isLandscape = orientation === 'landscape';
  const pageWidth = isLandscape ? A4_HEIGHT_MM : A4_WIDTH_MM;
  const pageHeight = isLandscape ? A4_WIDTH_MM : A4_HEIGHT_MM;

  const contentWidth = pageWidth - MARGIN_MM * 2;
  const contentHeight = pageHeight - MARGIN_MM * 2;

  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  let heightLeft = imgHeight;
  let position = MARGIN_MM;
  let page = 0;

  while (heightLeft > 0) {
    if (page > 0) {
      pdf.addPage();
    }

    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      MARGIN_MM,
      position - page * contentHeight,
      imgWidth,
      imgHeight,
      undefined,
      'FAST'
    );

    heightLeft -= contentHeight;
    page++;
    position = MARGIN_MM;
  }

  // Add page numbers
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(
      `Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
    pdf.text(
      `Generated ${new Date().toLocaleDateString()}`,
      pageWidth - MARGIN_MM,
      pageHeight - 5,
      { align: 'right' }
    );
  }

  pdf.save(filename);
}

/**
 * Trigger browser print dialog for a specific element.
 * Hides everything else via print CSS.
 */
export function triggerPrint(): void {
  window.print();
}
