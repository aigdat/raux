# Loading Screen Implementation Plan

## Overview
Create a loading screen that appears immediately when RAUX Electron app starts, displaying real-time status messages during the installation and startup process.

## Tasks

### 1. Implement IPC Communication
- [x] Create an IPC Manager singleton class
- [x] Set up IPC channels between main process and renderer
- [x] Create message types for different status updates
- [x] Implement sending mechanism in main process
- [x] Implement receiving mechanism in renderer process
- [x] Centralize IPC channel names in a single class (IPCChannels)
- [x] Move all IPC-related files (ipcManager.ts, ipcChannels.ts, ipcTypes.ts) to src/ipc/

### 2. Modify Main Process (index.ts)
- [x] Update createWindow to show loading screen first
- [x] Create separate function for installation process
- [x] Add IPC message sending at key points in the installation

### 3. Update Installation Process
- [x] Modify python.install() to send progress updates
- [x] Modify raux.install() to send progress updates
- [x] Add progress reporting to wheel download and extraction
- [x] Add progress reporting to backend startup
- [x] Refactor pythonExec.ts and rauxSetup.ts to use a private ipcManager instance property for all IPC calls (DRY, clear)

### 4. Create Loading Screen UI
- [ ] Create HTML/CSS for a clean, professional loading screen
- [ ] Add status message area that can display multiple messages
- [ ] Design progress indicator (spinner or progress bar)
- [ ] Include RAUX branding elements

### 5. Transition Logic
- [ ] Implement smooth transition from loading screen to RAUX UI
- [ ] Add error handling that shows helpful messages if installation fails
- [ ] Create retry mechanism for failed steps

### 6. Testing
- [ ] Test on fresh install
- [ ] Test with pre-existing installation
- [ ] Test with various failure scenarios

## Implementation Details

### IPC Manager Singleton
```typescript
// ipcManager.ts - Main Process
import { ipcMain, WebContents } from 'electron';

export class IPCManager {
  private static instance: IPCManager;
  private renderers: Map<number, WebContents> = new Map();
  
  private constructor() {
    // Private constructor to enforce singleton
  }
  
  public static getInstance(): IPCManager {
    if (!IPCManager.instance) {
      IPCManager.instance = new IPCManager();
    }
    return IPCManager.instance;
  }
  
  // Register a renderer process to receive messages
  public registerRenderer(id: number, contents: WebContents): void {
    this.renderers.set(id, contents);
  }
  
  // Remove a renderer when window is closed
  public unregisterRenderer(id: number): void {
    this.renderers.delete(id);
  }
  
  // Send message to all renderers
  public sendToAll(channel: string, ...args: any[]): void {
    this.renderers.forEach(renderer => {
      renderer.send(channel, ...args);
    });
  }
  
  // Send message to specific renderer
  public sendTo(id: number, channel: string, ...args: any[]): void {
    const renderer = this.renderers.get(id);
    if (renderer) {
      renderer.send(channel, ...args);
    }
  }
  
  // Listen for messages from renderers
  public on(channel: string, listener: (...args: any[]) => void): void {
    ipcMain.on(channel, (event, ...args) => {
      listener(...args);
    });
  }
}

// Usage in main process
const ipcManager = IPCManager.getInstance();

// Renderer process counterpart (using contextBridge)
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ipc', {
  send: (channel: string, data: any) => {
    ipcRenderer.send(channel, data);
  },
  on: (channel: string, func: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
  invoke: (channel: string, data: any) => {
    return ipcRenderer.invoke(channel, data);
  }
});
```

### IPC Message Structure
```typescript
interface StatusMessage {
  type: 'info' | 'progress' | 'error' | 'success';
  message: string;
  progress?: number; // 0-100 for progress updates
  step?: string; // Current installation step
}
```

### Loading Screen Flow
1. Application starts → Show loading screen immediately
2. Begin installation process in background
3. Send status updates to loading screen as each step progresses
4. When installation completes, transition to RAUX UI
5. If errors occur, display error message with possible actions

### Message Channel Names
- `installation:status` - General status updates
- `installation:progress` - Progress percentage updates
- `installation:error` - Error notifications
- `installation:complete` - Installation completed
- `installation:retry` - Request to retry a failed step

### File Changes Required
- `index.ts`: Modify to show loading screen first and coordinate installation
- `pythonExec.ts`: Add progress reporting (now complete)
- `rauxSetup.ts`: Add progress reporting (now complete)
- Create new files:
  - `loadingScreen.html`: Loading screen UI
  - `loadingScreen.js`: Renderer process code
  - `ipcManager.ts`: IPC Manager singleton class implementation
  - `preload.ts`: Preload script for exposing IPC to renderer process
