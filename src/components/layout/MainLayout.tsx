import React from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-brand-neutral dark:bg-slate-950 dark:text-white flex flex-col transition-colors duration-300">
      <Navbar />
      <main className="jb-public-content flex-grow flex flex-col w-full max-w-full overflow-x-hidden">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout;

