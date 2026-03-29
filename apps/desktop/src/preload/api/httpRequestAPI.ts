import electron from 'electron';
import type { HttpRequestResult, HttpRequestSpec, TotpCooldownInfo } from '../../types/http';

const { ipcRenderer } = electron;

const httpRequestAPI = {
  executeRequest: (spec: HttpRequestSpec): Promise<HttpRequestResult> =>
    ipcRenderer.invoke('http:execute-request', spec),

  getTotpCooldown: (workspaceId: string, sourceId: string): Promise<TotpCooldownInfo> =>
    ipcRenderer.invoke('http:get-totp-cooldown', workspaceId, sourceId),

  generateTotpPreview: (secret: string): Promise<string> => ipcRenderer.invoke('http:generate-totp-preview', secret),
};

export default httpRequestAPI;
