/**
 * Modified for Coding Lab (AGPL-3.0):
 * Configures ScratchStorage to load built-in library assets exclusively from
 * same-origin static/assets/ without calling projects.scratch.mit.edu or assets.scratch.mit.edu.
 */
import {ScratchStorage, Asset} from '@scratch/scratch-storage';
import defaultProject from './default-project';
import {GUIStorage, TranslatorFunction, VirtualMachine, GUICloudVariableProvider} from '../gui-config';
import {LegacyBackpackStorage} from './legacy-backpack-storage';
import CloudProvider from './cloud-provider';
import {buildLibraryAssetUrl} from './legacy-library-asset-url';

export class LegacyStorage implements GUIStorage {
    private projectHost?: string;
    private projectToken?: string;
    private assetHost?: string;
    private translator?: TranslatorFunction;

    readonly scratchStorage = new ScratchStorage();

    readonly backpackStorage = new LegacyBackpackStorage({
        readAuth () {
            return Promise.reject(new Error('Backpack disabled in Coding Lab'));
        }
    });

    readonly cloudVariables = {
        createProvider (
            cloudHost: string,
            vm: VirtualMachine,
            username: string,
            projectId: string
        ): GUICloudVariableProvider {
            return new CloudProvider(cloudHost, vm, username, projectId);
        }
    };

    constructor () {
        this.cacheDefaultProject(this.scratchStorage);
        this.addSelfHostedWebStores(this.scratchStorage);
    }

    setProjectHost (host: string): void {
        this.projectHost = host;
    }

    setProjectToken (token: string): void {
        this.projectToken = token;
    }

    setProjectMetadata (): void {
        // No remote Scratch project metadata requests
    }

    setAssetHost (host: string): void {
        this.assetHost = host;
    }

    getLibraryAssetUrl (assetId: string, dataFormat: string): string {
        return buildLibraryAssetUrl(assetId, dataFormat);
    }

    setTranslatorFunction (translator: TranslatorFunction): void {
        this.translator = translator;
        this.cacheDefaultProject(this.scratchStorage);
    }

    setBackpackHost (): void {
        // Backpack disabled in Coding Lab
    }

    saveProject (): Promise<{id: string | number;}> {
        return Promise.reject(new Error('Direct remote Scratch saving is disabled in Coding Lab.'));
    }

    private cacheDefaultProject (storage: ScratchStorage) {
        const defaultProjectAssets = defaultProject(this.translator);
        defaultProjectAssets.forEach(asset => storage.builtinHelper._store(
            storage.AssetType[asset.assetType],
            storage.DataFormat[asset.dataFormat],
            asset.data,
            asset.id
        ));
    }

    private addSelfHostedWebStores (storage: ScratchStorage) {
        const resolveAssetUrl = (relPath: string): string => {
            if (typeof window !== "undefined" && window.location && window.location.href) {
                try {
                    return new URL(relPath, window.location.href).href;
                } catch {
                    // fallback below
                }
            }
            return `/coding-lab-editor/${relPath}`;
        };
        storage.addWebStore(
            [storage.AssetType.ImageVector, storage.AssetType.ImageBitmap, storage.AssetType.Sound],
            (asset: Asset) => resolveAssetUrl(`static/assets/${asset.assetId}.${asset.dataFormat}`)
        );
        storage.addWebStore(
            [storage.AssetType.Sound],
            (asset: Asset) => resolveAssetUrl(`static/extension-assets/scratch3_music/${asset.assetId}.${asset.dataFormat}`)
        );
    }
}
