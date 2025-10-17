import React, { useState, useRef } from 'react';
import { Upload, FileText, Image, Music, Video, Search, Trash2, Download, AlertCircle } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import './style.css';

interface UploadedFile {
  id: number;
  name: string;
  type: string;
  size: number;
  content: string | ArrayBuffer | null;
  category: 'text' | 'image' | 'audio' | 'video' | 'other';
  processedAt: string;
}

const MultimodalProcessor: React.FC = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [query, setQuery] = useState<string>('');
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [fileLink, setFileLink] = useState<string>(''); // New state for file link
  const [youtubeLink, setYoutubeLink] = useState<string>(''); // New state for YouTube link
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  GlobalWorkerOptions.workerSrc = `http://localhost:3000/pdf.worker.min.mjs`;

  const BACKEND_URL = 'http://localhost:5000/api/query';
  const UPLOAD_URL = 'http://localhost:5000/api/upload'; // New endpoint for file uploads

  const getFileCategory = (type: string, name: string): UploadedFile['category'] => {
    if (type.startsWith('text/') || name.match(/\.(txt|md|pdf|docx|pptx)$/i)) return 'text';
    if (type.startsWith('image/') || name.match(/\.(png|jpg|jpeg|gif|webp)$/i)) return 'image';
    if (type.startsWith('audio/') || name.match(/\.(mp3|wav|ogg)$/i)) return 'audio';
    if (type.startsWith('video/') || name.match(/\.(mp4|webm|mov)$/i)) return 'video';
    return 'other';
  };

  const processFile = async (file: File): Promise<UploadedFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const content = e.target?.result ?? null;

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          extractTextFromPdf(content as ArrayBuffer)
            .then(pdfText => {
              resolve({
                id: Date.now() + Math.random(),
                name: file.name,
                type: file.type,
                size: file.size,
                content: pdfText,
                category: getFileCategory(file.type, file.name),
                processedAt: new Date().toISOString()
              });
            })
            .catch(reject);
        } else {
          resolve({
            id: Date.now() + Math.random(),
            name: file.name,
            type: file.type,
            size: file.size,
            content,
            category: getFileCategory(file.type, file.name),
            processedAt: new Date().toISOString()
          });
        }
      };

      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));

      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        reader.readAsArrayBuffer(file);
      } else if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        reader.readAsText(file);
      } else if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  };

  // New function to extract text from PDF
  const extractTextFromPdf = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    const pdf = await getDocument(arrayBuffer).promise;
    let fullText = '';
    for (let i = 0; i < pdf.numPages; i++) {
      const page = await pdf.getPage(i + 1);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return fullText;
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleLinkSubmit = () => {
    setError('');
    if (fileLink && isValidUrl(fileLink)) {
      setFiles([
        {
          id: Date.now() + Math.random(),
          name: fileLink,
          type: fileLink.includes('youtube.com') || fileLink.includes('youtu.be') ? 'video/youtube' : 'application/octet-stream',
          size: 0, // Size unknown for links
          content: fileLink, // Store the link itself as content
          category: fileLink.includes('youtube.com') || fileLink.includes('youtu.be') ? 'video' : 'other',
          processedAt: new Date().toISOString(),
        },
      ]);
      setFileLink(''); // Clear input after submission
      setYoutubeLink('');
    } else if (youtubeLink && isValidUrl(youtubeLink)) {
      setFiles([
        {
          id: Date.now() + Math.random(),
          name: youtubeLink,
          type: 'video/youtube',
          size: 0,
          content: youtubeLink,
          category: 'video',
          processedAt: new Date().toISOString(),
        },
      ]);
      setYoutubeLink(''); // Clear input after submission
      setFileLink('');
    } else {
      setError('Please provide a valid file link or YouTube video link.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const uploadedFile = e.target.files[0];
    setError('');
    setFileLink(''); // Clear file link input
    setYoutubeLink(''); // Clear YouTube link input

    try {
      const processedFile = await processFile(uploadedFile);
      console.log("Processed File:", processedFile); // Debugging
      setFiles([processedFile]); // Set files to only the new one
      console.log("Files state after setFiles:", [processedFile]); // Debugging
    } catch (err: any) {
      setError(err.message);
    }
  };

  const removeFile = (id: number) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const buildContext = (files: UploadedFile[]) => {
    return files
      .map(file => {
        let fileContext = `File: ${file.name} (${file.category})\n`;

        if (file.category === 'text' && typeof file.content === 'string') {
          fileContext += `Content: ${file.content.substring(0, 2000)}...\n`;
        } else if (file.category === 'image') {
          fileContext += `Image file uploaded (visual content available)\n`;
        } else if (file.category === 'video') {
          fileContext += `YouTube Video Link: ${file.content} (visual and auditory content available)\n`;
        } else if (file.content && typeof file.content === 'string' && (file.content.startsWith('http://') || file.content.startsWith('https://'))) {
          fileContext += `File Link: ${file.content} (content available via link)\n`;
        } else {
          fileContext += `${file.category} file uploaded\n`;
        }

        return fileContext;
      })
      .join('\n---\n');
  };

  const handleQuery = async () => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    if (files.length === 0) {
      setError('Please upload at least one file');
      return;
    }

    setLoading(true);
    setError('');
    setResponse('');

    try {
      const context = buildContext(files);
      const prompt = `Context from uploaded files:\n${context}\n\nUser Query: ${query}\n\nProvide a natural language answer based on the context above.`;

      const apiResponse = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(errorData.error || `API Error: ${apiResponse.status}`);
      }

      const data = await apiResponse.json();
      setResponse(data.answer || 'No response generated');
    } catch (err: any) {
      setError(`Error processing query: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (category: UploadedFile['category']) => {
    switch (category) {
      case 'text': return <FileText className="w-5 h-5 text-blue-500" />;
      case 'image': return <Image className="w-5 h-5 text-green-500" />;
      case 'audio': return <Music className="w-5 h-5 text-purple-500" />;
      case 'video': return <Video className="w-5 h-5 text-red-500" />;
      default: return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const exportData = () => {
    const exportObj = {
      files: files.map(f => ({
        name: f.name,
        type: f.type,
        category: f.category,
        size: f.size,
        processedAt: f.processedAt
      })),
      query,
      response,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multimodal-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-3">Multimodal Data Processing System</h1>
          <p className="text-blue-200">Upload files, ask questions, get AI-powered answers</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <div className="lg:col-span-1 bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
            <label
              htmlFor="file-upload"
              className="cursor-pointer w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg transition-colors font-medium mb-4 flex items-center justify-center gap-2"
              aria-label="Choose files to upload"
            >
              <Upload className="w-5 h-5" />
              Upload Files
            </label>

            {(files.length === 0 && !fileLink && !youtubeLink) && (
              <input
                id="file-upload"
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept=".txt,.md,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.gif,.mp3,.wav,.mp4,.webm"
              />
            )}

           <div className="mb-4">
            <label htmlFor="file-link-textarea" className="sr-only">Enter file link</label>
            <textarea
              id="file-link-textarea"
              value={fileLink}
              onChange={(e) => setFileLink(e.target.value)}
              placeholder="Or paste file link (PDF, TXT, etc.)"
              className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 text-white placeholder-purple-200/70 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none transition duration-300"
              rows={2}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="youtube-link-textarea" className="sr-only">Enter YouTube link</label>
            <textarea
              id="youtube-link-textarea"
              value={youtubeLink}
              onChange={(e) => setYoutubeLink(e.target.value)}
              placeholder="Or paste YouTube video link"
              className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 text-white placeholder-purple-200/70 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none transition duration-300"
              rows={2}
            />
          </div>



            <button
              onClick={handleLinkSubmit}
              aria-label="Submit file or YouTube link"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg transition-colors font-medium mb-4"
            >
              Submit Link
            </button>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {files.map(file => (
                <div key={file.id} className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {getFileIcon(file.category)}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{file.name}</p>
                        <p className="text-blue-200 text-xs">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(file.id)}
                      aria-label={`Remove file ${file.name}`}
                      className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {files.length === 0 && (
              <div className="text-center py-8 text-blue-200 text-sm">No files uploaded yet</div>
            )}

            {files.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <button
                  onClick={exportData}
                  aria-label="Export uploaded files and query data"
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export Data
                </button>
              </div>
            )}
          </div>

          {/* Query and Response Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Query Input */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Search className="w-5 h-5" />
                Natural Language Query
              </h2>

              <label htmlFor="query-textarea" className="sr-only">Enter your question</label>
              <textarea
                id="query-textarea"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask anything about your uploaded files..."
                // className="w-full bg-white/5 border border-white/20 rounded-lg p-4 text-white placeholder-blue-200/50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={4}
              />

              <button
                onClick={handleQuery}
                disabled={loading || files.length === 0}
                aria-label="Submit query to AI backend"
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white py-3 px-6 rounded-lg transition-all font-medium flex items-center justify-center gap-2 mt-3"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Search Knowledge Base
                  </>
                )}
              </button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/20 backdrop-blur-lg border border-red-500/50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" />
                  <p className="text-red-100 text-sm">{error}</p>
                </div>
              </div>
            )}

            {/* Response Display */}
            {response && (
              <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4">Response</h2>
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <p className="text-blue-100 whitespace-pre-wrap">{response}</p>
                </div>
              </div>
            )}

            {/* Info Card */}
            <div className="bg-blue-500/20 backdrop-blur-lg border border-blue-500/50 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-300 flex-shrink-0 mt-0.5" />
                <div className="text-blue-100 text-sm">
                  <p className="font-medium mb-1">Backend Status:</p>
                  <p>✅ Backend is running on port 5000</p>
                  <p className="mt-2">The system uses your Node.js backend to securely call the Gemini API.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultimodalProcessor;
