import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Email, Document, renderToHtml, renderToJson, renderToPlainText } from '@unlayer/react-elements';
import { chromium } from 'playwright';

test('required public SDK and renderer exports load', () => {
  for (const api of [Mastra, Agent, createStep, createWorkflow, Email, Document, renderToHtml, renderToJson, renderToPlainText]) {
    assert.equal(typeof api, 'function');
  }
});

test('Chromium launches and closes', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  try {
    const page = await browser.newPage();
    await page.setContent('<h1>Offline preview ready</h1>');
    assert.equal(await page.locator('h1').innerText(), 'Offline preview ready');
  } finally { await browser.close(); }
});
