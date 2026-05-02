import React, { useState, useEffect } from "react";
import { 
  Shield, 
  Zap, 
  Map as MapIcon, 
  Eye, 
  Lightbulb, 
  Store, 
  Users, 
  ArrowRight,
  Sparkles,
  ChevronRight
} from "lucide-react";
import logo from "./assets/logo.png";
import IntroAnimation from "./IntroAnimation";

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [showIntro, setShowIntro] = useState(true);

  const steps = [
    {
      title: "Welcome to SafeWalk",
      tagline: "Reclaim the Night",
      description: "60% of people feel more anxious walking home after 9 PM. SafeWalk changes the equation by routing for presence, not just minutes.",
      icon: <Shield size={48} className="onboarding-icon-main" />,
      image: logo
    },
    {
      title: "Natural Surveillance",
      tagline: "Safety in Numbers",
      description: "Our navigation favors 'Natural Surveillance': routes with active streetlights, consistent foot traffic, and open businesses.",
      icon: <Eye size={48} className="onboarding-icon-main" />,
      features: [
        { icon: <Lightbulb size={20} />, text: "Well-lit thoroughfares" },
        { icon: <Users size={20} />, text: "Higher pedestrian volume" },
        { icon: <Store size={20} />, text: "Late-night open storefronts" }
      ]
    },
    {
      title: "AI Reasoning",
      tagline: "Beyond Geometry",
      description: "Use our 'Reasoning' engine to understand WHY a route was chosen. We analyze urban density and business hours in real-time.",
      icon: <Sparkles size={48} className="onboarding-icon-main glow-accent" />
    },
    {
      title: "Community Protocols",
      tagline: "Our Safety Guide",
      description: "SafeWalk is a community effort. Follow these protocols for the best experience:",
      icon: <Users size={48} className="onboarding-icon-main" />,
      protocols: [
        "Report broken streetlights to help fellow walkers.",
        "Share your route with a trusted contact via GPS escort.",
        "Favor the green 'SafeWalk' path during late hours.",
        "Contribute data by marking active zones you encounter."
      ]
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const current = steps[step];

  if (showIntro) {
    return <IntroAnimation onComplete={() => setShowIntro(false)} />;
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <div className="onboarding-progress">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`progress-dot ${i <= step ? 'active' : ''}`}
              />
            ))}
          </div>
        </div>

        <div className="onboarding-content">
          <div className="onboarding-visual">
            {current.image ? (
              <img src={current.image} alt="Logo" className="onboarding-logo-large" />
            ) : (
              <div className="onboarding-icon-wrap">
                {current.icon}
              </div>
            )}
          </div>

          <div className="onboarding-text">
            <span className="onboarding-tagline">{current.tagline}</span>
            <h2 className="onboarding-title">{current.title}</h2>
            <p className="onboarding-desc">{current.description}</p>

            {current.features && (
              <div className="onboarding-features">
                {current.features.map((f, i) => (
                  <div key={i} className="feature-item">
                    {f.icon}
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>
            )}

            {current.protocols && (
              <div className="onboarding-protocols">
                {current.protocols.map((p, i) => (
                  <div key={i} className="protocol-item">
                    <div className="protocol-dot" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="onboarding-footer">
          <button className="btn-onboarding-next" onClick={handleNext}>
            {step === steps.length - 1 ? "Start Walking" : "Continue"}
            <ChevronRight size={18} />
          </button>
          {step < steps.length - 1 && (
            <button className="btn-onboarding-skip" onClick={onComplete}>
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
