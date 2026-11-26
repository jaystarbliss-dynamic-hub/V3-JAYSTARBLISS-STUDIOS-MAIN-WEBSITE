import projectData from './project-data';
import {TranslatorFunction} from '../../gui-config';
import popWav from '!arraybuffer-loader!./e5175042f2e763993167ce992ff80090.wav?';
import beepWav from '!arraybuffer-loader!./1450ec8ca9e8f1321f5aee6c93a97512.wav?';
import backdrop from '!raw-loader!./e13791391a2b30a11a5d166bc80e82fb.svg?';
import costume1 from '!raw-loader!./e81fc6db1d209ac5bb8cf4e025f30dc7.svg?';
import costume2 from '!raw-loader!./511f0dbdf6ee052c96c14f1c95694114.svg?';

declare function require (path: 'fastestsmallesttextencoderdecoder'): {TextEncoder: typeof TextEncoder};

const defaultProject = (translator?: TranslatorFunction) => {
    let _TextEncoder: typeof TextEncoder;
    if (typeof TextEncoder === 'undefined') {
        _TextEncoder = require('fastestsmallesttextencoderdecoder').TextEncoder;
    } else {
        _TextEncoder = TextEncoder;
    }
    const encoder = new _TextEncoder();
    const projectJson = projectData(translator);

    return [{
        id: 0,
        assetType: 'Project',
        dataFormat: 'JSON',
        data: JSON.stringify(projectJson)
    }, {
        id: 'e5175042f2e763993167ce992ff80090',
        assetType: 'Sound',
        dataFormat: 'WAV',
        data: new Uint8Array(popWav)
    }, {
        id: '1450ec8ca9e8f1321f5aee6c93a97512',
        assetType: 'Sound',
        dataFormat: 'WAV',
        data: new Uint8Array(beepWav)
    }, {
        id: 'e13791391a2b30a11a5d166bc80e82fb',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(backdrop)
    }, {
        id: 'e81fc6db1d209ac5bb8cf4e025f30dc7',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(costume1)
    }, {
        id: '511f0dbdf6ee052c96c14f1c95694114',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(costume2)
    }];
};

export default defaultProject;
