/**
 * CodingLabBridge (AGPL-3.0)
 * Connects the live Scratch 3 VM & Storage inside the self-hosted editor frame
 * to the parent Jaystarbliss CodingLabEditorHost via strict same-origin postMessage.
 */

const APPROVED_BUILTIN_SOUNDS = new Set([
    'e5175042f2e763993167ce992ff80090',
    '1450ec8ca9e8f1321f5aee6c93a97512',
    '4b9eae9db84564f51368814c36f35ab6',
    'bb1f074639abfce05131800c8b9c24a0',
    '5ffc326fe264d9ce014ddd75930789b4',
    'edafb27294c0115f2ca0ec5c4560d691',
    '014d87e46df94905b3e00370603b9669',
    'a1faa5bfd5ab17b5fd4915950073375a',
    'de280ecd71afb5f55857e7612762fd58',
    'cab4d5cce51c39509023f20a187e4314',
    '8de24527bbeed75201332bf3bf22d877',
    'e3cc9f337e896df1e87089922eed1f97',
    '2b3df1181b3f2dd4713de27cc61b2a7c',
    '6e93e8c19e26b261bff2b34b59c23fe1',
    '83a9787d4cb6f3b7632b4ddfebf74367'
]);

let activeVm = null;
let isReadOnly = false;
let isInternalLoading = false;
let projectLoaded = false;
let readySent = false;
let readyFallbackTimer = null;
let changeDebounceTimer = null;
let vmPatched = false;

function postToParent(payload, transfer = []) {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
    try {
        window.parent.postMessage(payload, window.location.origin, transfer);
    } catch {
        // Ignore if parent frame is navigating
    }
}

function emitReady() {
    if (!activeVm) return;
    readySent = true;
    if (readyFallbackTimer) {
        clearTimeout(readyFallbackTimer);
        readyFallbackTimer = null;
    }
    postToParent({
        type: 'CODING_LAB_READY',
        version: '15.3.0',
        approvedSoundCount: APPROVED_BUILTIN_SOUNDS.size,
        hasStage: Boolean(activeVm.runtime && activeVm.runtime.getTargetForStage && activeVm.runtime.getTargetForStage())
    });
}

function applyReadOnlyMode(readOnly) {
    isReadOnly = Boolean(readOnly);
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('coding-lab-readonly', isReadOnly);
    }
}

export function notifyCodingLabProjectLoaded() {
    projectLoaded = true;
    if (activeVm) {
        emitReady();
    }
}

export function attachCodingLabVm(vm) {
    if (!vm || activeVm === vm) return;
    activeVm = vm;

    // Enforce v1 sound policy at VM layer: block microphone recordings & non-approved custom sounds
    if (!vmPatched && typeof vm.addSound === 'function') {
        vmPatched = true;
        const origAddSound = vm.addSound.bind(vm);
        vm.addSound = function guardedAddSound(soundObject, optTargetId) {
            const md5 = String(soundObject?.md5 || soundObject?.md5ext || soundObject?.assetId || '')
                .split('.')[0]
                .toLowerCase();
            if (!isInternalLoading && md5 && !APPROVED_BUILTIN_SOUNDS.has(md5)) {
                return Promise.reject(new Error('Custom audio uploads and microphone recordings are disabled in Coding Lab.'));
            }
            return origAddSound(soundObject, optTargetId);
        };
    }

    vm.on('PROJECT_CHANGED', () => {
        if (isInternalLoading || isReadOnly || !projectLoaded) return;
        if (changeDebounceTimer) clearTimeout(changeDebounceTimer);
        changeDebounceTimer = setTimeout(() => {
            postToParent({
                type: 'CODING_LAB_PROJECT_CHANGED',
                timestamp: Date.now()
            });
        }, 700);
    });

    if (projectLoaded || (vm.runtime && vm.runtime.getTargetForStage && vm.runtime.getTargetForStage())) {
        projectLoaded = true;
        emitReady();
    } else {
        readyFallbackTimer = setTimeout(() => {
            if (!readySent) {
                projectLoaded = true;
                emitReady();
            }
        }, 3500);
    }
}

if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('readonly') === '1') {
        applyReadOnlyMode(true);
    }

    window.addEventListener('message', async event => {
        if (event.origin !== window.location.origin) return;
        const msg = event.data;
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

        if (msg.type === 'CODING_LAB_PING') {
            if (activeVm && (projectLoaded || readySent)) {
                emitReady();
            }
            return;
        }

        if (msg.type === 'CODING_LAB_SET_READ_ONLY') {
            applyReadOnlyMode(Boolean(msg.readOnly));
            return;
        }

        if (!activeVm) {
            if (msg.requestId) {
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: false,
                    error: 'Scratch VM is still initializing.'
                });
            }
            return;
        }

        if (msg.type === 'CODING_LAB_LOAD_SB3') {
            try {
                isInternalLoading = true;
                activeVm.stopAll();
                await activeVm.loadProject(msg.buffer);
                projectLoaded = true;
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: true
                });
            } catch (err) {
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err)
                });
            } finally {
                setTimeout(() => {
                    isInternalLoading = false;
                }, 400);
            }
            return;
        }

        if (msg.type === 'CODING_LAB_EXPORT_SB3') {
            try {
                const sb3ArrayBuffer = await activeVm.saveProjectSb3('arraybuffer');
                const projectJsonString = activeVm.toJSON();
                postToParent(
                    {
                        type: 'CODING_LAB_RESPONSE',
                        requestId: msg.requestId,
                        ok: true,
                        sb3Buffer: sb3ArrayBuffer,
                        projectJsonString
                    },
                    [sb3ArrayBuffer]
                );
            } catch (err) {
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err)
                });
            }
            return;
        }

        if (msg.type === 'CODING_LAB_GET_JSON') {
            try {
                const projectJsonString = activeVm.toJSON();
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: true,
                    projectJsonString
                });
            } catch (err) {
                postToParent({
                    type: 'CODING_LAB_RESPONSE',
                    requestId: msg.requestId,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err)
                });
            }
            return;
        }
    });
}
