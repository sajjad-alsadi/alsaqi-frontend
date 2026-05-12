import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import api from '../services/api';
import { useTranslation } from 'react-i18next';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PdfViewerProps {
  url: string;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ url }) => {
  const { t } = useTranslation();
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [processedUrl, setProcessedUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl = '';
    setError(null);
    
    if (!url) {
      setProcessedUrl('');
      return;
    }

    // Clean up the URL in case it has whitespaces
    const cleanUrl = url.replace(/\s/g, '');
    
    // Check if the URL is actually a base64 string without the prefix
    const isBase64WithoutPrefix = !cleanUrl.startsWith('data:') && !cleanUrl.startsWith('http') && !cleanUrl.startsWith('/') && cleanUrl.length > 100;
    
    const fullUrl = isBase64WithoutPrefix ? `data:application/pdf;base64,${cleanUrl}` : cleanUrl;

    if (fullUrl.startsWith('data:')) {
      try {
        const base64Data = fullUrl.split(',')[1];
        if (!base64Data) {
          setError(t('invalidFileData'));
          setProcessedUrl('');
          return;
        }
        
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        // Check if it's actually a PDF by checking the magic number (%PDF-)
        // %PDF- is [37, 80, 68, 70, 45]
        // The PDF spec allows the magic number to be anywhere within the first 1024 bytes
        let hasMagicNumber = false;
        const searchLimit = Math.min(byteNumbers.length, 1024);
        for (let i = 0; i < searchLimit - 4; i++) {
          if (byteNumbers[i] === 37 && 
              byteNumbers[i+1] === 80 && 
              byteNumbers[i+2] === 68 && 
              byteNumbers[i+3] === 70 && 
              byteNumbers[i+4] === 45) {
            hasMagicNumber = true;
            break;
          }
        }

        if (hasMagicNumber) {
          const blob = new Blob([byteNumbers], { type: 'application/pdf' });
          objectUrl = URL.createObjectURL(blob);
          setProcessedUrl(objectUrl);
        } else {
          setError(t('invalidPdfFormat'));
          setProcessedUrl('');
        }
      } catch (e) {
        setError(t('errorProcessingFile'));
        setProcessedUrl('');
      }
    } else {
      // Fetch the URL and check magic number to prevent InvalidPDFException
      api.get(fullUrl, { responseType: 'blob' })
        .then(response => {
          const blob = response.data;
          const reader = new FileReader();
          reader.onloadend = () => {
            const arr = new Uint8Array(reader.result as ArrayBuffer);
            let hasMagicNumber = false;
            for (let i = 0; i < arr.length - 4; i++) {
              if (arr[i] === 37 && arr[i+1] === 80 && arr[i+2] === 68 && arr[i+3] === 70 && arr[i+4] === 45) {
                hasMagicNumber = true;
                break;
              }
            }
            
            if (hasMagicNumber) {
              const objUrl = URL.createObjectURL(blob);
              objectUrl = objUrl;
              setProcessedUrl(objUrl);
            } else {
              setError(t('invalidPdfFormat'));
              setProcessedUrl('');
            }
          };
          // Read up to 1024 bytes to find the magic number
          reader.readAsArrayBuffer(blob.slice(0, 1024));
        })
        .catch(e => {
          setError(t('errorLoadingFile'));
          setProcessedUrl('');
        });
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url, t]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
    setPageNumber(1);
  }

  const changePage = (offset: number) => {
    setPageNumber(prevPageNumber => prevPageNumber + offset);
  };

  const previousPage = () => changePage(-1);
  const nextPage = () => changePage(1);

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-main)] rounded-b-3xl overflow-hidden">
      <div className="flex items-center justify-between p-4 bg-[var(--color-card)] border-b border-[var(--color-border-soft)] shrink-0">
        <div className="flex items-center gap-2">
          <button 
            onClick={zoomOut}
            className="p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)] rounded-lg transition-colors"
            title={t('zoomOut')}
          >
            <ZoomOut size={20} />
          </button>
          <span className="text-sm font-medium text-[var(--color-text-muted)] min-w-[3rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button 
            onClick={zoomIn}
            className="p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)] rounded-lg transition-colors"
            title={t('zoomIn')}
          >
            <ZoomIn size={20} />
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={previousPage}
            className="p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} />
          </button>
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            {t('page')} {pageNumber || (numPages ? 1 : '--')} {t('of')} {numPages || '--'}
          </p>
          <button
            type="button"
            disabled={pageNumber >= (numPages || -1)}
            onClick={nextPage}
            className="p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-main)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 flex justify-center bg-[var(--color-bg-main)]">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-500 gap-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <p className="font-bold">{error}</p>
          </div>
        ) : processedUrl ? (
          <Document
            file={processedUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]"></div>
              </div>
            }
            error={
              <div className="flex flex-col items-center justify-center h-full text-red-500 gap-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">⚠️</span>
                </div>
                <p className="font-bold">{t('failedToLoadPdf')}</p>
              </div>
            }
          >
            <Page 
              pageNumber={pageNumber} 
              scale={scale} 
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-xl"
            />
          </Document>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
            {t('loadingFile')}
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfViewer;
