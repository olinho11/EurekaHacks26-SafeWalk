import React, { useState, useEffect } from 'react';
import './IntroAnimation.css';
import logo from './assets/logo.png';

const IntroAnimation = ({ onComplete }) => {
  const [stage, setStage] = useState(0); // 0: Google Maps, 1: Crossed, 2: SafeWalk Reveal

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 800),  // Strike-through
      setTimeout(() => setStage(2), 1800), // Reveal SafeWalk
      setTimeout(() => onComplete(), 3500) // Finish
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="intro-container">
      <div className={`intro-content stage-${stage}`}>
        <div className="google-wrap">
          <span className="google-text">Google Maps</span>
          <div className="strike-line" />
        </div>
        
        <div className="safewalk-reveal">
          <div className="logo-orb">
            <img src={logo} alt="SafeWalk" className="intro-logo-img" />
          </div>
          <h1 className="intro-brand-name">SafeWalk</h1>
          <p className="intro-tagline">Step into the light.</p>
        </div>
      </div>
    </div>
  );
};

export default IntroAnimation;
