const request = require('supertest');
const cheerio = require('cheerio');
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');
const app = require('../app');

describe('Integration Tests', () => {
  beforeAll(() => {
    // Disable real HTTP requests
    nock.disableNetConnect();
    // Allow localhost connections for supertest
    nock.enableNetConnect('127.0.0.1');
  });

  afterAll(() => {
    // Re-enable real HTTP requests
    nock.cleanAll();
    nock.enableNetConnect();
  });

  afterEach(() => {
    // Clean up any remaining mocks after each test
    nock.cleanAll();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Mock the external HTTP request
    nock('https://example.com')
      .get('/')
      .reply(200, sampleHtmlWithYale);
    
    // Make a request to our proxy app using supertest
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'https://example.com/' })
      .expect(200);
    
    expect(response.body.success).toBe(true);
    
    // Verify Yale has been replaced with Fale in text
    const $ = cheerio.load(response.body.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');
    
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
  });

  test('Should handle invalid URLs', async () => {
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'not-a-valid-url' })
      .expect(500);
    
    expect(response.body.error).toBeDefined();
  });

  test('Should handle missing URL parameter', async () => {
    const response = await request(app)
      .post('/fetch')
      .send({})
      .expect(400);
    
    expect(response.body.error).toBe('URL is required');
  });
});
