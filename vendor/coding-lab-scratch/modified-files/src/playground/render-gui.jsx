/**
 * Modified for Coding Lab (AGPL-3.0):
 * Renders Scratch GUI without Scratch trademark top menu bar, disables remote Scratch links,
 * triggers defaultProject ("0") initialization on mount (matching upstream HashParserHOC
 * without ever loading remote Scratch project IDs), and attaches CodingLabBridge.
 */
import React from 'react';
import ReactDomClient from 'react-dom/client';
import {compose} from 'redux';
import {connect} from 'react-redux';
import AppStateHOC from '../lib/app-state-hoc.jsx';
import GUI from '../containers/gui.jsx';
import {defaultProjectId, setProjectId} from '../reducers/project-state';
import {attachCodingLabVm, notifyCodingLabProjectLoaded} from './coding-lab-bridge.js';

const DefaultProjectHOC = function (WrappedComponent) {
    class DefaultProjectComponent extends React.Component {
        componentDidMount () {
            this.props.setProjectId(defaultProjectId);
        }
        render () {
            const {
                setProjectId: _setProjectId,
                ...componentProps
            } = this.props;
            return <WrappedComponent {...componentProps} />;
        }
    }
    const mapDispatchToProps = dispatch => ({
        setProjectId: projectId => {
            dispatch(setProjectId(projectId));
        }
    });
    return connect(null, mapDispatchToProps)(DefaultProjectComponent);
};

export default appTarget => {
    GUI.setAppElement(appTarget);

    const WrappedGui = compose(
        AppStateHOC,
        DefaultProjectHOC
    )(GUI);

    const root = ReactDomClient.createRoot(appTarget);
    root.render(
        <WrappedGui
            menuBarHidden
            canEditTitle={false}
            canSave={false}
            canShare={false}
            canRemix={false}
            canCreateNew={false}
            canManageFiles={false}
            canUseCloud={false}
            backpackVisible={false}
            showComingSoon={false}
            onVmInit={attachCodingLabVm}
            onProjectLoaded={notifyCodingLabProjectLoaded}
        />
    );
};
