'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/hooks/useAuth';
import { useEffect, useState } from 'react';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner--lg"></div>
      </div>
    );
  }

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    { question: "How does ApplyAI analyze my resume?", answer: "We use advanced LLMs (like Gemini and Cohere) to securely extract structure, skills, and experience from your uploaded documents, turning them into a searchable semantic graph." },
    { question: "Is my data secure?", answer: "Yes. By using a 'Bring Your Own Key' (BYOK) model, your API requests go directly to the provider. We never store or train on your private conversation data." },
    { question: "What formats of resumes are supported?", answer: "We currently support PDF, TXT, DOC, and DOCX files up to 10MB in size." },
    { question: "Can I use both Gemini and Cohere?", answer: "Absolutely. You can provide keys for both and the system will intelligently route requests based on the specific analysis task." }
  ];

  return (
    <>
      <nav className="navbar" style={{ position: 'relative', zIndex: 50 }}>
        <div className="container navbar__inner">
          <div className="navbar__logo">
            Apply<span>AI</span>
          </div>
          <div className="navbar__actions">
            <Link href="/login" className="btn btn--ghost">
              Log in
            </Link>
             <Link href="/register" className="btn btn--primary">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main style={{ paddingBottom: 'var(--space-20)', position: 'relative', overflowX: 'clip' }}>
        
        {/* Global Page Floaters */}
        <div className="floating-doodle float-sway delay-6" style={{ top: '40%', left: '-5%', opacity: 0.8 }}>
          <Image src="/doodles/checkmarks.png" alt="" width={150} height={150} />
        </div>
        <div className="floating-doodle float-breathe delay-9" style={{ top: '65%', right: '-3%', opacity: 0.6 }}>
          <Image src="/doodles/sheet.png" alt="" width={200} height={200} />
        </div>

        {/* HERO SECTION */}
        <section className="hero" style={{ position: 'relative', overflow: 'visible' }}>
          
          {/* Hero Background Floating SVGs */}
          <div className="floating-doodle float-breathe delay-1" style={{ top: '10%', left: '25%' }}>
            <Image src="/doodles/star.svg" alt="" width={40} height={90} priority />
          </div>
          <div className="floating-doodle float-breathe delay-1" style={{ bottom: '10%', left: '25%' }}>
            <Image src="/doodles/star.svg" alt="" width={40} height={90} priority />
          </div>
          <div className="floating-doodle float-wiggle delay-2" style={{ top: '15%', left: '5%' }}>
            <Image src="/doodles/envelope.png" alt="" width={120} height={120} priority />
          </div>
          <div className="floating-doodle float-sway delay-4" style={{ bottom: '15%', left: '15%' }}>
            <Image src="/doodles/resume.png" alt="" width={160} height={160} priority />
          </div>
          <div className="floating-doodle float-breathe delay-1" style={{ top: '20%', right: '10%' }}>
            <Image src="/doodles/mailbox.png" alt="" width={130} height={130} priority />
          </div>
          <div className="floating-doodle float-breathe delay-1" style={{ top: '1%', left: '50%' }}>
            <Image src="/doodles/checkmarks.png" alt="" width={50} height={50} priority />
          </div>
          <div className="floating-doodle float-breathe delay-1" style={{ top: '10%', right: '25%' }}>
            <Image src="/doodles/star.svg" alt="" width={40} height={90} priority />
          </div>
          <div className="floating-doodle float-breathe delay-1" style={{ bottom: '10%', right: '25%' }}>
            <Image src="/doodles/star.svg" alt="" width={40} height={90} priority />
          </div>
          <div className="floating-doodle float-wiggle delay-5" style={{ bottom: '10%', right: '10%' }}>
            <Image src="/doodles/sheet.png" alt="" width={190} height={150} priority />
          </div>

          <div className="container" style={{ position: 'relative', zIndex: 10 }}>
            <div className="section__eyebrow hero__eyebrow">
              <span className="badge badge--blue">✦ Now in Beta</span>
            </div>
            <h1 className="hero__title">
              Your AI-powered <em>career</em> assistant.
            </h1>
            <p className="hero__subtitle">
              Get personalized career guidance powered by AI. Upload your resume, validate your API keys,
              and receive intelligent answers to accelerate your career growth.
            </p>
            <div className="hero__actions">
              <Link href="/register" className="btn btn--primary btn--lg">
                Start Free
              </Link>
              <Link href="/login" className="btn btn--secondary btn--lg">
                Sign In
              </Link>
            </div>
            <p className="hero__sub-note">Bring your own keys (Gemini & Cohere)</p>
          </div>
        </section>

        {/* HOW IT WORKS (STICKY CARD DECK) */}
        <section className="section" style={{ paddingBlock: 'var(--space-16)' }}>
          <div className="container" style={{ maxWidth: '1000px' }}>
            <div style={{ textAlign: 'center', marginBottom: 'var(--space-16)' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-semibold)' }}>How it works</h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-lg)', marginTop: 'var(--space-2)' }}>From setup to insights, we've made career prep delightfully simple.</p>
            </div>

            <div className="step-deck">
              {/* Step 1 */}
              <div className="step-card-sticky">
                <div className="step-card-sticky__number">01</div>
                <div className="step-card-sticky__content">
                  <span className="badge badge--blue" style={{ marginBottom: 'var(--space-4)' }}>SMART ANALYSIS</span>
                  <h3 className="step-card-sticky__title">Upload your resume.</h3>
                  <p className="step-card-sticky__desc">
                    Drop your resume in seconds. Our system automatically parses, chunks, and semantically embeds your background so its ready for AI interpretation. No manual data entry required.
                  </p>
                </div>
               
              </div>

              {/* Step 2 */}
              <div className="step-card-sticky">
                <div className="step-card-sticky__number">02</div>
                <div className="step-card-sticky__content">
                  <span className="badge badge--blue" style={{ marginBottom: 'var(--space-4)' }}>SECURE INTEGRATION</span>
                  <h3 className="step-card-sticky__title">Bring your keys.</h3>
                  <p className="step-card-sticky__desc">
                    Bring your own API keys for Gemini and Cohere. Your data stays entirely under your control. We never intercept, store, or train on your personal keys.
                  </p>
                </div>
               
              </div>

              {/* Step 3 */}
              <div className="step-card-sticky">
                <div className="step-card-sticky__number">03</div>
                <div className="step-card-sticky__content">
                  <span className="badge badge--blue" style={{ marginBottom: 'var(--space-4)' }}>REAL-TIME ANSWERS</span>
                  <h3 className="step-card-sticky__title">Get matched.</h3>
                  <p className="step-card-sticky__desc">
                    Ask natural questions about your career trajectory and get instant, personalized guidance informed directly by your profile and experience history.
                  </p>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* TESTIMONIAL GRID */}
        <section className="section section--alt" style={{ paddingBlock: 'var(--space-16)' }}>
          <div className="container">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 'var(--weight-semibold)', textAlign: 'center', marginBottom: 'var(--space-10)' }}>
              Why professionals love ApplyAI
            </h2>
            <div className="testimonial-grid">
              <div className="testimonial-card">
                 <p className="testimonial-card__text">"I couldn't figure out how my skills translated to a Product Manager role. Within 5 minutes, ApplyAI mapped my entire engineering background to pm-specific traits."</p>
                 <div className="testimonial-card__author">
                   <div className="testimonial-card__avatar">S</div>
                   <div>
                     <p className="testimonial-card__name">Sarah L.</p>
                     <p className="testimonial-card__role">Senior Engineer</p>
                   </div>
                 </div>
              </div>
              <div className="testimonial-card">
                 <p className="testimonial-card__text">"The fact that I can bring my own Gemini key means I have total control. It's fast, private, and incredibly accurate."</p>
                 <div className="testimonial-card__author">
                   <div className="testimonial-card__avatar" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)' }}>M</div>
                   <div>
                     <p className="testimonial-card__name">Mark R.</p>
                     <p className="testimonial-card__role">Data Analyst</p>
                   </div>
                 </div>
              </div>
              <div className="testimonial-card">
                 <p className="testimonial-card__text">"ApplyAI reviewed my resume against standard ATS rules and instantly pointed out three huge red flags missing from my work history."</p>
                 <div className="testimonial-card__author">
                   <div className="testimonial-card__avatar" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>J</div>
                   <div>
                     <p className="testimonial-card__name">James K.</p>
                     <p className="testimonial-card__role">Marketing Lead</p>
                   </div>
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="section" style={{ paddingBlock: 'var(--space-16)' }}>
          <div className="container" style={{ maxWidth: '800px' }}>
             <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 'var(--weight-semibold)', textAlign: 'center', marginBottom: 'var(--space-10)' }}>
               Frequently Asked Questions
             </h2>
             <div>
               {faqs.map((faq, index) => (
                 <div key={index} className={`faq-item ${openFaq === index ? 'open' : ''}`}>
                   <button className="faq-item__question" onClick={() => toggleFaq(index)}>
                     {faq.question}
                     <svg className="faq-item__chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                     </svg>
                   </button>
                   <div className="faq-item__answer">
                     {faq.answer}
                   </div>
                 </div>
               ))}
             </div>
          </div>
        </section>

      </main>

      {/* EPIC DARK VOID (CTA + FOOTER) */}
      <div className="section--epic-dark">
        <section className="epic-cta container">
          {/* CTA Floating Doodle */}
          <div className="floating-doodle float-sway delay-3" style={{ top: '10%', right: '15%' }}>
            {/* <Image src="/doodles/envelope.png" alt="" width={120} height={120} /> */}
          </div>
          
          <h2 className="epic-cta__title" style={{ color: '#FFFFFF' }}>Start your journey</h2>
          <p className="epic-cta__desc">It takes just 2 minutes to create your profile. Unlock your AI-powered career assistant today.</p>
          <Link href="/register" className="btn">
            Create Your Account &rarr;
          </Link>
        </section>

        <footer className="container">
          <div className="footer-grid">
            <div className="footer-grid__brand">
              <div className="navbar__logo" style={{ color: '#FFFFFF', padding: 0 }}>Apply<span>AI</span></div>
              <p>Your AI-powered career assistant. We help professionals extract, structure, and analyze their backgrounds with intelligence.</p>
            </div>
            <div>
              <h4 className="footer-grid__col-title">Product</h4>
              <ul className="footer-grid__links">
                <li><Link href="/dashboard">Dashboard</Link></li>
                <li><Link href="/dashboard/ingest">Upload Data</Link></li>
                <li><Link href="/dashboard/generate">Generate</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="footer-grid__col-title">Connect</h4>
              <ul className="footer-grid__links">
                <li><a href="#">Twitter</a></li>
                <li><a href="#">GitHub</a></li>
                <li><a href="#">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <div>© 2026 ApplyAI. All rights reserved.</div>
            <div>Designed with intelligence.</div>
          </div>
        </footer>
      </div>
    </>
  );
}
