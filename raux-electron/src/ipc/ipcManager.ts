import { ipcMain, WebContents } from 'electron';

export class IPCManager {
  private static instance: IPCManager;
  private renderers: Map<number, WebContents> = new Map();

  private constructor() {}

  public static getInstance(): IPCManager {
    if (!IPCManager.instance) {
      IPCManager.instance = new IPCManager();
    }
    return IPCManager.instance;
  }

  public registerRenderer(id: number, contents: WebContents): void {
    this.renderers.set(id, contents);
  }

  public unregisterRenderer(id: number): void {
    this.renderers.delete(id);
  }

  public unregisterAllRenderers(): void {
    this.renderers.clear();
  }

  public sendToAll(channel: string, ...args: any[]): void {
    // Early return if no renderers exist to prevent IPC errors
    if (this.renderers.size === 0) {
      return;
    }

    this.renderers.forEach((renderer, id) => {
      if (!renderer || renderer.isDestroyed()) {
        this.renderers.delete(id);
        return;
      }

      try {
        renderer.send(channel, ...args);
      } catch (err: any) {
        // Silently handle expected renderer disposal errors
        if (err?.message?.includes('Render frame was disposed') || 
            err?.message?.includes('WebFrameMain could be accessed') ||
            err?.message?.includes('Object has been destroyed')) {
          // Clean up silently - this is normal when windows close or navigate
          this.renderers.delete(id);
          return;
        }
        // Only log truly unexpected errors
        console.error(`IPC sendToAll error: ${err}`);
      }
    });
  }

  public sendTo(id: number, channel: string, ...args: any[]): void {
    const renderer = this.renderers.get(id);
    
    if (renderer && !renderer.isDestroyed()) {
      try {
        renderer.send(channel, ...args);
      } catch (err) {
        // Optionally log the error
        // console.error(`IPC sendTo error: ${err}`);
      }
    } else if (renderer && renderer.isDestroyed()) {
      this.renderers.delete(id);
    }
  }

  public on(channel: string, listener: (...args: any[]) => void): void {
    ipcMain.on(channel, (event, ...args) => {
      listener(...args);
    });
  }
}