// Global variables
let videoStream = null;
let quillEditor = null;
let capturedImageData = null;

// DOM Elements
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const startCameraBtn = document.getElementById('startCameraBtn');
const captureBtn = document.getElementById('captureBtn');
const retakeBtn = document.getElementById('retakeBtn');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const processBtn = document.getElementById('processBtn');
const retakeFromPreviewBtn = document.getElementById('retakeFromPreviewBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const editorSection = document.getElementById('editorSection');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const cameraSection = document.getElementById('cameraSection');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initEditor();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    startCameraBtn.addEventListener('click', initCamera);
    captureBtn.addEventListener('click', capturePhoto);
    retakeBtn.addEventListener('click', retakePhoto);
    retakeFromPreviewBtn.addEventListener('click', retakePhoto);
    processBtn.addEventListener('click', processImage);
    exportPdfBtn.addEventListener('click', exportToPDF);
}

// Get API key from localStorage or prompt user
function getApiKey() {
    let apiKey = localStorage.getItem('gcp_vision_api_key');
    
    if (!apiKey) {
        apiKey = prompt('Please enter your Google Cloud Vision API Key:');
        if (apiKey && apiKey.trim()) {
            apiKey = apiKey.trim();
            localStorage.setItem('gcp_vision_api_key', apiKey);
            showMessage('API key saved to local storage!', 'success');
        } else {
            return null;
        }
    }
    
    return apiKey;
}


// Initialize camera
async function initCamera() {
    try {
        // Check if browser supports getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Your browser does not support camera access');
        }

        // Request camera access
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment', // Prefer back camera on mobile
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });

        videoElement.srcObject = videoStream;
        startCameraBtn.classList.add('hidden');
        captureBtn.classList.remove('hidden');
        previewContainer.classList.add('hidden');
        editorSection.classList.add('hidden');
        hideError();

    } catch (error) {
        console.error('Error accessing camera:', error);
        showError(`Camera access failed: ${error.message}. Please ensure you have granted camera permissions and are using HTTPS or localhost.`);
    }
}

// Capture photo from video stream
function capturePhoto() {
    try {
        const video = videoElement;
        const canvas = canvasElement;
        
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64 image data
        capturedImageData = canvas.toDataURL('image/jpeg', 0.9);
        
        // Stop video stream
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        
        // Show preview
        previewImage.src = capturedImageData;
        previewContainer.classList.remove('hidden');
        captureBtn.classList.add('hidden');
        retakeBtn.classList.remove('hidden');
        videoElement.classList.add('hidden');
        
    } catch (error) {
        console.error('Error capturing photo:', error);
        showError('Failed to capture photo. Please try again.');
    }
}

// Retake photo
function retakePhoto() {
    // Stop any existing stream
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    
    // Reset UI
    previewContainer.classList.add('hidden');
    editorSection.classList.add('hidden');
    videoElement.classList.remove('hidden');
    startCameraBtn.classList.remove('hidden');
    captureBtn.classList.add('hidden');
    retakeBtn.classList.add('hidden');
    capturedImageData = null;
    hideError();
    
    // Reinitialize camera
    initCamera();
}

// Process image with OCR
async function processImage() {
    if (!capturedImageData) {
        showError('No image captured. Please capture a photo first.');
        return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        showError('API key is required to process the image.');
        return;
    }

    // Show loading indicator
    loadingIndicator.classList.remove('hidden');
    processBtn.disabled = true;
    hideError();

    try {
        // Convert base64 to base64 without data URL prefix
        const base64Image = capturedImageData.split(',')[1];

        // Prepare request to Google Cloud Vision API
        const requestBody = {
            requests: [
                {
                    image: {
                        content: base64Image
                    },
                    features: [
                        {
                            type: 'DOCUMENT_TEXT_DETECTION', // Better for handwritten text
                            maxResults: 1
                        }
                    ]
                }
            ]
        };

        // Make API request
        const response = await fetch(
            `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
        }

        const data = await response.json();
        
        // Extract text from response
        let extractedText = '';
        if (data.responses && data.responses[0] && data.responses[0].fullTextAnnotation) {
            extractedText = data.responses[0].fullTextAnnotation.text;
        } else if (data.responses && data.responses[0] && data.responses[0].textAnnotations) {
            // Fallback to textAnnotations if fullTextAnnotation is not available
            extractedText = data.responses[0].textAnnotations[0]?.description || '';
        }

        if (!extractedText || extractedText.trim() === '') {
            throw new Error('No text detected in the image. Please ensure the image contains handwritten text.');
        }

        // Display text in editor
        quillEditor.root.innerHTML = '';
        quillEditor.setText(extractedText);
        editorSection.classList.remove('hidden');
        
        // Scroll to editor
        editorSection.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('OCR Error:', error);
        showError(`OCR processing failed: ${error.message}`);
    } finally {
        loadingIndicator.classList.add('hidden');
        processBtn.disabled = false;
    }
}

// Initialize Quill rich text editor
function initEditor() {
    quillEditor = new Quill('#editor', {
        theme: 'snow',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'align': [] }],
                ['clean']
            ]
        },
        placeholder: 'Extracted text will appear here...'
    });
}

// Export to PDF
function exportToPDF() {
    try {
        // Get text content from editor (convert HTML to plain text)
        const editorContent = quillEditor.root.innerHTML;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = editorContent;
        const plainText = tempDiv.textContent || tempDiv.innerText || '';

        if (!plainText.trim()) {
            showError('No content to export. Please extract text first.');
            return;
        }

        // Create PDF using jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // Set font
        doc.setFont('helvetica');
        doc.setFontSize(12);

        // Split text into lines that fit the page width
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const maxWidth = pageWidth - (2 * margin);
        
        const lines = doc.splitTextToSize(plainText, maxWidth);
        let y = margin;
        const lineHeight = 7;

        // Add text to PDF
        lines.forEach((line) => {
            if (y + lineHeight > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }
            doc.text(line, margin, y);
            y += lineHeight;
        });

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `handwritten-note-${timestamp}.pdf`;

        // Save PDF
        doc.save(filename);
        
        showMessage('PDF exported successfully!', 'success');

    } catch (error) {
        console.error('PDF Export Error:', error);
        showError(`Failed to export PDF: ${error.message}`);
    }
}

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    errorMessage.classList.remove('success-message');
    errorMessage.classList.add('error-message');
    errorMessage.style.background = '#f8d7da';
    errorMessage.style.color = '#721c24';
    errorMessage.style.borderColor = '#f5c6cb';
}

// Show success message
function showMessage(message, type) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    if (type === 'success') {
        errorMessage.style.background = '#d4edda';
        errorMessage.style.color = '#155724';
        errorMessage.style.borderColor = '#c3e6cb';
    } else {
        showError(message);
    }
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        hideError();
    }, 3000);
}

// Hide error message
function hideError() {
    errorMessage.classList.add('hidden');
}

