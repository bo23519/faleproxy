const request = require('supertest');
const cheerio = require('cheerio');
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');
const fs = require('fs').promises;

describe('Integration Tests', () => {
  let app;
  let server;

  beforeAll(async () => {
    // Mock external HTTP requests
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
    nock.enableNetConnect('localhost');
    
    // Create a temporary test app file with modified port
    const appContent = await fs.readFile('app.js', 'utf8');
    const modifiedContent = appContent.replace('const PORT = 3001', 'const PORT = 0'); // 0 = random port
    await fs.writeFile('app.test.js', modifiedContent);
    
    // Load the app directly
    app = require('./app.test.js');
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 10000);

  afterAll(async () => {
    // Close the server
    if (app && app.close) {
      await new Promise(resolve => app.close(resolve));
    }
    
    // Clean up
    try {
      await fs.unlink('app.test.js');
      delete require.cache[require.resolve('./app.test.js')];
    } catch (err) {
      // Ignore errors
    }
    
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Setup mock for example.com
    const scope = nock('https://example.com')
      .get('/')
      .reply(200, sampleHtmlWithYale, {
        'Content-Type': 'text/html'
      });

    // Make a request to our proxy app using supertest
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'https://example.com/' })
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.content).toBeDefined();
    
    // Verify Yale has been replaced with Fale in text
    const $ = cheerio.load(response.body.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private Ivy League');
    
    // Verify URLs remain unchanged
    const links = $('a');
    let hasYaleUrl = false;
    links.each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) {
        hasYaleUrl = true;
      }
    });
    expect(hasYaleUrl).toBe(true);
    
    // Verify link text is changed
    expect($('a').first().text()).toBe('About Fale');
    
    // Verify the mock was called
    expect(scope.isDone()).toBe(true);
  }, 10000);

  test('Should handle invalid URLs', async () => {
    await request(app)
      .post('/fetch')
      .send({ url: 'not-a-valid-url' })
      .expect(500);
  });

  test('Should handle missing URL parameter', async () => {
    const response = await request(app)
      .post('/fetch')
      .send({})
      .expect(400);
    
    expect(response.body.error).toBe('URL is required');
  });

  test('Should handle non-existent domains', async () => {
    // Mock a failed request
    nock('https://thissitedoesnotexist12345.com')
      .get('/')
      .replyWithError('ENOTFOUND');

    await request(app)
      .post('/fetch')
      .send({ url: 'https://thissitedoesnotexist12345.com/' })
      .expect(500);
  });

  test('Should preserve HTML structure while replacing text', async () => {
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Yale University - Home</title>
      </head>
      <body>
        <div class="yale-content">
          <h1>Welcome to Yale</h1>
          <p>Yale University is great. Visit yale.edu for more info.</p>
          <a href="https://yale.edu">Yale Homepage</a>
          <img src="https://yale.edu/logo.png" alt="Yale Logo">
        </div>
      </body>
      </html>
    `;

    nock('https://test-yale-site.com')
      .get('/')
      .reply(200, testHtml, {
        'Content-Type': 'text/html'
      });

    const response = await request(app)
      .post('/fetch')
      .send({ url: 'https://test-yale-site.com/' })
      .expect(200);
    
    expect(response.body.success).toBe(true);
    
    const $ = cheerio.load(response.body.content);
    
    // Check text replacements
    expect($('title').text()).toBe('Fale University - Home');
    expect($('h1').text()).toBe('Welcome to Fale');
    expect($('p').text()).toContain('Fale University is great');
    
    // Check that URLs and attributes are preserved
    expect($('a').attr('href')).toBe('https://yale.edu');
    expect($('img').attr('src')).toBe('https://yale.edu/logo.png');
    expect($('img').attr('alt')).toBe('Yale Logo');
    
    // Check that HTML structure is preserved
    expect($('div.yale-content').length).toBe(1);
    expect($('body').children().length).toBe(1);
  });

  test('Should handle case variations of Yale', async () => {
    const caseTestHtml = `
      <html>
      <body>
        <p>YALE UNIVERSITY, Yale College, yale school of medicine</p>
        <span>Yale yale YALE</span>
      </body>
      </html>
    `;

    nock('https://case-test.com')
      .get('/')
      .reply(200, caseTestHtml, {
        'Content-Type': 'text/html'
      });

    const response = await request(app)
      .post('/fetch')
      .send({ url: 'https://case-test.com/' })
      .expect(200);
    
    const $ = cheerio.load(response.body.content);
    const text = $('body').text();
    
    // Check that all case variations are replaced
    expect(text).toContain('FALE UNIVERSITY');
    expect(text).toContain('Fale College');
    expect(text).toContain('fale school of medicine');
  });
});