/**
 * Modified for Coding Lab (AGPL-3.0):
 * Serves approved built-in library assets strictly from same-origin self-hosted static files
 * instead of https://cdn.assets.scratch.mit.edu.
 */
export const buildLibraryAssetUrl = (assetId: string, dataFormat: string, host?: string): string => {
    const cleanHost = host ? host.replace(/\/+$/, '') : '';
    if (cleanHost) {
        return `${cleanHost}/${assetId}.${dataFormat}`;
    }
    return `static/assets/${assetId}.${dataFormat}`;
};
