import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  X,
  Lightbulb,
  Users,
  Store,
  Sparkles,
  Flag,
} from "lucide-react";
import logo from "./assets/logo.png";

const STEPS = [
  {
    eyebrow: "Welcome",
    title: "Navigation that favors\npresence over speed.",
    body: "60% of people feel anxious walking home after 9 PM. SafeWalk routes by lit streets, foot traffic, and open businesses — not just shortest time.",
    visual: "logo",
    image: logo,
  },
  {
    eyebrow: "How it works",
    title: "Compare two routes,\nside by side.",
    body: "We score every candidate against the same map context — lighting, amenities, foot traffic. The fastest path and the safest path appear together so you choose.",
    visual: "features",
    features: [
      { Icon: Lightbulb, label: "Streetlight density" },
      { Icon: Users,     label: "Pedestrian activity" },
      { Icon: Store,     label: "Open businesses" },
    ],
  },
  {
    eyebrow: "Reasoning",
    title: "Understand the why,\nnot just the line.",
    body: "Tap Reasoning on any route and Claude explains why it scored that way — what's nearby, what's missing, and when to take it.",
    visual: "icon",
    Icon: Sparkles,
  },
  {
    eyebrow: "Community",
    title: "Walk safer,\ntogether.",
    body: "Pin a streetlight outage or unsafe corner — every future walker sees a lower score in that area. No accounts, no tracking, no logins. Just shared awareness.",
    visual: "icon",
    Icon: Flag,
  },
];

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [introStage, setIntroStage] = useState(0); // 0: Google Maps, 1: Crossed, 2: SafeWalk

  useEffect(() => {
    // Intro sequence
    const timers = [
      setTimeout(() => setIntroStage(1), 1000), // Cross it out
      setTimeout(() => setIntroStage(2), 2000), // Show SafeWalk
      setTimeout(() => setShowIntro(false), 3800), // Show card
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") onComplete();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else onComplete();
  };
  const prev = () => { if (step > 0) setStep((s) => s - 1); };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  if (showIntro) {
    return (
      <div className="onboarding-overlay">
        <div className={`onboarding-intro stage-${introStage}`}>
          <div className="intro-google-wrap">
            <span className="google-maps-text">Google Maps</span>
            <div className="intro-strike" />
          </div>
          <div className="intro-safewalk-wrap">
            <img src={logo} alt="" className="intro-logo" />
            <span className="safewalk-text">SafeWalk</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onb-overlay">
      <div className="onb-card">
        <div className="onb-progress" aria-hidden="true">
          <div className="onb-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <button
          type="button"
          className="onb-dismiss"
          onClick={onComplete}
          aria-label="Skip onboarding"
        >
          <X size={16} strokeWidth={2.25} />
        </button>

        <div className="onb-meta">
          <span className="onb-step-num">
            {String(step + 1).padStart(2, "0")}
            <span className="onb-step-total"> / {String(STEPS.length).padStart(2, "0")}</span>
          </span>
          <span className="onb-eyebrow">{current.eyebrow}</span>
        </div>

        <div key={step} className="onb-body">
          <div className="onb-visual">
            {current.visual === "logo" ? (
              <div className="onb-logo-tile">
                <img src={logo} alt="SafeWalk" />
              </div>
            ) : current.visual === "features" ? (
              <div className="onb-feature-row">
                {current.features.map((f, i) => {
                  const Icon = f.Icon;
                  return (
                    <div key={i} className="onb-feature-tile">
                      <Icon size={20} strokeWidth={1.75} />
                      <span>{f.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="onb-icon-tile">
                <current.Icon size={32} strokeWidth={1.5} />
              </div>
            )}
          </div>

          <h1 className="onb-title">
            {current.title.split("\n").map((line, i) => (
              <span key={i} className="onb-title-line">{line}</span>
            ))}
          </h1>
          <p className="onb-desc">{current.body}</p>
        </div>

        <div className="onb-nav">
          <button
            type="button"
            className="onb-back"
            onClick={prev}
            disabled={step === 0}
          >
            <ArrowLeft size={14} strokeWidth={2.25} />
            Back
          </button>
          <button type="button" className="onb-next" onClick={next}>
            {isLast ? "Get started" : "Continue"}
            <ArrowRight size={14} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}
