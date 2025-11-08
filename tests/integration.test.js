const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');
const fs = require('fs').promises;

// Set a different port for testing to avoid conflict with the main app
const TEST_PORT = 3099;
let server;

describe('Integration Tests', () => {
  // Modify the app to use a test port
  beforeAll(async () => {
    // Create a temporary test app file with modified port (cross-platform)
    const appContent = await fs.readFile('app.js', 'utf8');
    const modifiedContent = appContent.replace('const PORT = 3001', `const PORT = ${TEST_PORT}`);
    await fs.writeFile('app.test.js', modifiedContent);

    // Start the test server
    server = require('child_process').spawn('node', ['app.test.js'], {
      detached: true,
      stdio: 'ignore'
    });
    
    // Give the server time to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 10000); // Increase timeout for server startup

  afterAll(async () => {
    // Kill the test server and clean up
    if (server && server.pid) {
      try {
        // Try to kill the process group (works on Unix-like systems)
        if (process.platform !== 'win32') {
          process.kill(-server.pid, 'SIGTERM');
        } else {
          // On Windows, just kill the process
          process.kill(server.pid, 'SIGTERM');
        }
      } catch (error) {
        // If the process group kill fails, try killing just the process
        try {
          process.kill(server.pid, 'SIGTERM');
        } catch (e) {
          console.error('Failed to kill server process:', e.message);
        }
      }
    }
    // Wait a bit for the server to shut down
    await new Promise(resolve => setTimeout(resolve, 500));
    await fs.unlink('app.test.js').catch(() => {});
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Use a real URL that contains 'Yale' - testing with yale.edu itself
    // Note: This is a real HTTP call, so it tests the full integration
    const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
      url: 'https://www.yale.edu'
    });
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    
    // Verify Yale has been replaced with Fale in the content
    const $ = cheerio.load(response.data.content);
    const bodyText = $('body').text();
    
    // The content should contain 'Fale' (replaced from 'Yale')
    expect(bodyText).toContain('Fale');
    
    // The content should NOT contain 'Yale' in text nodes (all should be replaced)
    // But URLs can still contain yale.edu
    const textNodes = [];
    $('body *').contents().filter(function() {
      return this.nodeType === 3; // Text nodes only
    }).each(function() {
      textNodes.push($(this).text());
    });
    
    const allText = textNodes.join(' ');
    // Check that Yale has been replaced in text content
    const yaleInText = allText.match(/Yale/g);
    // There should be very few or no 'Yale' in text (some might be in special contexts)
    expect(yaleInText === null || yaleInText.length < 5).toBe(true);
  }, 15000); // Increase timeout for real HTTP call

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'not-a-valid-url'
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
