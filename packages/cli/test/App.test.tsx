import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { App } from '../src/ui/App.js';

// Mock dependencies
vi.mock('../src/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    defaultModel: 'test-model',
    provider: 'anthropic'
  })
}));

describe('App Keyboard Shortcuts', () => {
  it('should switch mode on Shift+Tab', async () => {
    const { stdin, lastFrame } = render(<App mode="chat" permissionMode="ask" />);

    await new Promise(r => setTimeout(r, 100));
    let frame = lastFrame() || "";
    expect(frame).toContain('ask mode on');

    // Send Shift+Tab (ANSI \x1b[Z)
    stdin.write('\u001b[Z');

    await new Promise(r => setTimeout(r, 50));
    frame = lastFrame() || "";
    
    // Mode should be updated
    expect(frame).toContain('auto-edit mode on');
  });
});
