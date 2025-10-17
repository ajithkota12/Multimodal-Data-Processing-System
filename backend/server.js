// server.js - Backend API Proxy Server
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const mongoose = require('mongoose'); // Import Mongoose

const app = express();
const PORT = 5000;

// MongoDB Connection
const MONGODB_URI = 'mongodb://localhost:27017/multimodal'; // Replace with your MongoDB Atlas connection string
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB Connected...'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Mongoose Schema for Interactions
const interactionSchema = new mongoose.Schema({
  file: {
    type: new mongoose.Schema({
      name: String,
      type: String,
      size: Number,
      category: String,
      content: String, // Storing extracted text content or link URL
      processedAt: Date,
      url: String, // New field for storing the URL if it's a link
    }),
    _id: false,
  },
  query: String,
  response: String,
  timestamp: { type: Date, default: Date.now },
});

const Interaction = mongoose.model('Interaction', interactionSchema);

// IMPORTANT: Replace with your actual Gemini API key
const GEMINI_API_KEY = 'your_gemini_api';
const GEMINI_MODEL_ID = 'gemini-2.0-flash'; // Valid model ID
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent`;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Query endpoint - Proxy to Gemini API
app.post('/api/query', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const fileContextMatch = prompt.match(/Context from uploaded files:\n([\s\S]*?)\n\nUser Query: ([\s\S]*)/);
    let fileData = null;
    let userQuery = prompt;

    if (fileContextMatch && fileContextMatch[1] && fileContextMatch[2]) {
      const fileContentString = fileContextMatch[1];
      userQuery = fileContextMatch[2];

      const fileNameAndCategoryMatch = fileContentString.match(/File: (.*?) \((.*?)\)/);
      if (fileNameAndCategoryMatch) {
        fileData = {
          name: fileNameAndCategoryMatch[1],
          category: fileNameAndCategoryMatch[2],
          content: null, // Initialize content as null
        };

        // Extract content based on category
        if (fileData.category === 'text' && fileContentString.includes('Content:')) {
          const contentStartIndex = fileContentString.indexOf('Content:') + 'Content:'.length;
          const contentEndIndex = fileContentString.indexOf('...', contentStartIndex);
          if (contentStartIndex !== -1) {
            fileData.content = fileContentString.substring(contentStartIndex, contentEndIndex !== -1 ? contentEndIndex : fileContentString.length).trim();
          }
        } else if (fileData.category === 'image') {
          fileData.content = 'Image file uploaded (visual content available)';
        } else if (fileData.category === 'audio') {
          fileData.content = 'Audio file uploaded (auditory content available)';
        } else if (fileData.category === 'video') {
          fileData.content = 'Video file uploaded (visual and auditory content available)';
        } else {
          fileData.content = `${fileData.category} file uploaded`;
        }
      }
    }

    console.log('Received query:', userQuery.substring(0, 100) + '...');

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      return res.status(response.status).json({ error: 'Failed to get response from AI', details: errorText });
    }

    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

    // Save interaction to MongoDB
    const newInteraction = new Interaction({
      file: fileData,
      query: userQuery,
      response: answer,
    });
    await newInteraction.save();

    console.log('Response generated successfully');
    res.json({ answer });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/query`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
});
