import {defineMessages} from 'react-intl';
import sharedMessages from '../shared-messages';
import {TranslatorFunction} from '../../gui-config';

const messages = defineMessages({
    pop: {
        defaultMessage: 'Pop',
        description: 'Name for the pop sound',
        id: 'gui.defaultProject.pop'
    },
    variable: {
        defaultMessage: 'my variable',
        description: 'Name for the default variable',
        id: 'gui.defaultProject.variable'
    }
});

const defaultTranslator: TranslatorFunction = msgObj => msgObj.defaultMessage;

const projectData = (translateFunction?: TranslatorFunction) => {
    const translator = translateFunction || defaultTranslator;
    return ({
        targets: [
            {
                isStage: true,
                name: 'Stage',
                variables: {
                    '`jEk@4|i[#Fk?(8x)AV.-my variable': [
                        translator(messages.variable),
                        0
                    ]
                },
                lists: {},
                broadcasts: {},
                blocks: {},
                currentCostume: 0,
                costumes: [
                    {
                        assetId: 'e13791391a2b30a11a5d166bc80e82fb',
                        name: translator(sharedMessages.backdrop, {index: 1}),
                        md5ext: 'e13791391a2b30a11a5d166bc80e82fb.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 240,
                        rotationCenterY: 180
                    }
                ],
                sounds: [
                    {
                        assetId: 'e5175042f2e763993167ce992ff80090',
                        name: translator(messages.pop),
                        dataFormat: 'wav',
                        format: '',
                        rate: 22050,
                        sampleCount: 1984,
                        md5ext: 'e5175042f2e763993167ce992ff80090.wav'
                    }
                ],
                volume: 100
            },
            {
                isStage: false,
                name: 'Robo',
                variables: {},
                lists: {},
                broadcasts: {},
                blocks: {},
                currentCostume: 0,
                costumes: [
                    {
                        assetId: 'e81fc6db1d209ac5bb8cf4e025f30dc7',
                        name: 'robo-idle',
                        bitmapResolution: 1,
                        md5ext: 'e81fc6db1d209ac5bb8cf4e025f30dc7.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 48,
                        rotationCenterY: 56
                    },
                    {
                        assetId: '511f0dbdf6ee052c96c14f1c95694114',
                        name: 'robo-wave',
                        bitmapResolution: 1,
                        md5ext: '511f0dbdf6ee052c96c14f1c95694114.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 48,
                        rotationCenterY: 56
                    }
                ],
                sounds: [
                    {
                        assetId: '1450ec8ca9e8f1321f5aee6c93a97512',
                        name: 'Beep',
                        dataFormat: 'wav',
                        format: '',
                        rate: 22050,
                        sampleCount: 3969,
                        md5ext: '1450ec8ca9e8f1321f5aee6c93a97512.wav'
                    }
                ],
                volume: 100,
                visible: true,
                x: 0,
                y: 0,
                size: 100,
                direction: 90,
                draggable: false,
                rotationStyle: 'all around'
            }
        ],
        meta: {
            semver: '3.0.0',
            vm: '15.3.0',
            agent: 'CodingLab-SelfHosted'
        }
    });
};

export default projectData;
