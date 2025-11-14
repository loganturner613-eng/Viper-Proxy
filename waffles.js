import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Basic Setup ---
const app = express();
const port = process.env.PORT || 3000; // Use port from hosting service or 3000
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Serve your HTML file ---
// This serves the viper-proxy.html file as the homepage
app.use(express.static(path.join(__dirname, '/')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'viper-proxy.html'));
});

// --- The Proxy Endpoint ---
// Your HTML file is already set up to send requests here.
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    res.status(400).send('ERROR: "url" query parameter is missing.');
    return;
  }

  console.log(`Proxying request for: ${targetUrl}`);

  try {
    // 1. Fetch the website
    const response = await fetch(targetUrl, {
      // Send headers from the user's browser
      headers: {
        'User-Agent': req.headers['user-agent'],
        'Accept': req.headers['accept'],
        'Accept-Language': req.headers['accept-language'],
      }
    });

    // --- NEW: Process Headers ---
    // Create a new headers object to send to the user
    const headers = {};
    response.headers.forEach((value, name) => {
      // These headers block iframe loading. We skip them.
      const lowerName = name.toLowerCase();
      if (lowerName === 'x-frame-options' || 
          lowerName === 'content-security-policy' || 
          lowerName.startsWith('x-content-security-policy')) {
        return; // Skip this header
      }
      
      // Also, rewrite cookie domain/path if needed (simplified)
      if (lowerName === 'set-cookie') {
        // This is complex, for now we just pass them
        // A full proxy would rewrite domain and path
      }

      headers[name] = value;
    });

    // 2. Get the content
    let data = await response.text();
    
    // --- NEW: Inject <base> tag ---
    // This makes relative links (like /search or images/logo.png) work.
    // It tells the browser to load those links from the targetUrl.
    const baseTag = `<base href="${targetUrl}">`;
    
    // Try to inject it into the <head> for proper HTML
    if (data.includes('<head>')) {
      data = data.replace('<head>', `<head>${baseTag}`);
    } else if (data.includes('<HEAD>')) {
      data = data.replace('<HEAD>', `<HEAD>${baseTag}`);
    } else {
      // If no <head>, just put it at the very start
      data = baseTag + data;
    }
    
    // 3. Send the content back to the user's iframe
    // Send the *new* filtered headers and the *modified* data
    res.set(headers);
    res.send(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send(`Server error: ${error.message}`);
  }
});

// --- Start the Server ---
app.listen(port, () => {
  console.log(`VIPER server running on http://localhost:${port}`);
});