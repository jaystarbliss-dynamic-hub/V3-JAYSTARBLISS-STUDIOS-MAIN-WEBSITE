import React from 'react';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import Hero from '../components/Hero';
import CorePillars from '../components/home/CorePillars';
import FeaturedPrograms from '../components/home/FeaturedPrograms';
import FeaturedServices from '../components/home/FeaturedServices';
import FeaturedPortfolio from '../components/home/FeaturedPortfolio';

import LearningMethod from '../components/home/LearningMethod';
import AudiencePathways from '../components/home/AudiencePathways';
import FinalCTA from '../components/home/FinalCTA';

const Home: React.FC = () => {
  return (
    <MainLayout>
      <div className="jb-marketing-home">
        <SEO 
          title="Learn. Build. Create. Grow." 
          description="Jaystarbliss Studios empowers the next generation through practical tech education, coding programs for kids, and scalable software solutions in Lagos, Nigeria."
          keywords="Jaystarbliss Studios, coding for kids, robotics classes Lagos, tech education Nigeria, software development studio"
          canonical="https://jaystarbliss-studios.name.ng/"
        />
        <Hero />
        <CorePillars />
        <FeaturedPrograms />
        <FeaturedServices />
        <FeaturedPortfolio />
        <LearningMethod />
        <AudiencePathways />
        <FinalCTA />
      </div>
    </MainLayout>
  );
};

export default Home;
