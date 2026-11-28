import React from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '../components/ui/SEO';
import CodingLabEditorHost from '../components/coding-lab/CodingLabEditorHost';
import { CODING_LAB_CONFIG } from '../config/codingLabConfig';

/**
 * Dedicated Full-Screen Coding Lab — Project Playground Mode.
 * Strictly local (.sb3 download/import + bounded IndexedDB device recovery).
 * Never writes project data to Firestore or uploads images to Cloudinary.
 */
const CodingLabPlaygroundPage: React.FC = () => {
  const navigate = useNavigate();

  if (!CODING_LAB_CONFIG.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Coding Lab Unavailable</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Coding Lab is currently disabled by platform configuration.
          </p>
          <button
            type="button"
            onClick={() => navigate('/portfolio')}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold cursor-pointer"
          >
            Return to Projects &amp; Showcase
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-slate-100">
      <SEO
        title="Coding Lab | Jaystarbliss Dynamic Institute"
        description="Build interactive visual programming projects in Coding Lab and save standard .sb3 project files directly to your computer."
      />
      <CodingLabEditorHost
        mode="playground"
        fullViewport
        onExit={() => navigate('/portfolio')}
        exitLabel="Projects & Showcase"
      />
    </div>
  );
};

export default CodingLabPlaygroundPage;
