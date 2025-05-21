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

  public sendToAll(channel: string, ...args: any[]): void {
    this.renderers.forEach(renderer => {
      renderer.send(channel, ...args);
    });
  }

  public sendTo(id: number, channel: string, ...args: any[]): void {
    const renderer = this.renderers.get(id);
    if (renderer) {
      renderer.send(channel, ...args);
    }
  }

  public on(channel: string, listener: (...args: any[]) => void): void {
    ipcMain.on(channel, (event, ...args) => {
      listener(...args);
    });
  }
}