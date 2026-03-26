import electron from 'electron';
import type { HttpRequestSpec, HttpRequestResult, TotpCooldownInfo } from '../../types/http';

const { ipcRenderer } = electron;

const httpRequestAPI = {
    executeRequest: (spec: HttpRequestSpec): Promise<HttpRequestResult> =>
        ipcRenderer.invoke('http:execute-request', spec),

    getTotpCooldown: (sourceId: string): Promise<TotpCooldownInfo> =>
        ipcRenderer.invoke('http:get-totp-cooldown', sourceId),

    generateTotpPreview: (secret: string): Promise<string> =>
        ipcRenderer.invoke('http:generate-totp-preview', secret),
};

export default httpRequestAPI;
