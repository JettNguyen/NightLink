import { useNavigate } from 'react-router-dom';
import './Legal.css';

export default function TermsOfUse() {
  const navigate = useNavigate();
  return (
    <div className="page-container legal-page">
      <button type="button" className="legal-back-btn" onClick={() => navigate(-1)}>
        ← Back
      </button>
      <article className="legal-card">
        <h1>Terms of Use</h1>
        <p className="legal-updated">Last updated: May 14, 2026</p>

        <section>
          <h2>1. Acceptance</h2>
          <p>
            By using Nightlink, you agree to these terms. If you do not agree, do not use the service.
          </p>
        </section>

        <section>
          <h2>2. Eligibility and age requirement</h2>
          <p>
            You must be at least 13 years of age to create an account or use Nightlink. By creating an account,
            you confirm that you meet this requirement. Users under 13 are not permitted to use the service.
          </p>
        </section>

        <section>
          <h2>3. Accounts and access</h2>
          <p>
            You are responsible for your account credentials and activity under your account. Keep your login
            details secure.
          </p>
        </section>

        <section>
          <h2>4. AI insights and limitations</h2>
          <p>
            AI insights are informational only and are not medical, psychiatric, legal, or professional advice.
            Do not rely on Nightlink for emergency or crisis support.
          </p>
        </section>

        <section>
          <h2>5. Billing and subscriptions</h2>
          <p>
            Paid credits and subscriptions are processed by Stripe. Pricing, renewal, and cancellation terms are
            shown at checkout. Premium features may change over time.
          </p>
        </section>

        <section>
          <h2>6. Acceptable use</h2>
          <ul>
            <li>Do not use Nightlink for unlawful, abusive, or fraudulent activity.</li>
            <li>Do not attempt to disrupt, reverse engineer, or exploit the service.</li>
            <li>Do not upload content that violates others&apos; rights.</li>
            <li>Nightlink has zero tolerance for objectionable content, harassment, and abusive users.</li>
            <li>We may remove violating content and restrict or terminate accounts that break these rules.</li>
            <li>Safety reports are reviewed within 24 hours, and confirmed violations are removed promptly.</li>
          </ul>
        </section>

        <section>
          <h2>7. Termination</h2>
          <p>
            Nightlink may suspend or terminate access for violations of these terms. You can delete your account
            from Settings at any time.
          </p>
        </section>

        <section>
          <h2>8. Contact</h2>
          <p>
            For policy and safety reports, contact Jett Nguyen at jettuf26@gmail.com.
          </p>
        </section>
      </article>
    </div>
  );
}
