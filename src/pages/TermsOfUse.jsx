import './Legal.css';

export default function TermsOfUse() {
  return (
    <div className="page-container legal-page">
      <article className="legal-card">
        <h1>Terms of Use</h1>
        <p className="legal-updated">Last updated: May 12, 2026</p>

        <section>
          <h2>1. Acceptance</h2>
          <p>
            By using NightLink, you agree to these terms. If you do not agree, do not use the service.
          </p>
        </section>

        <section>
          <h2>2. Accounts and access</h2>
          <p>
            You are responsible for your account credentials and activity under your account. Keep your login
            details secure.
          </p>
        </section>

        <section>
          <h2>3. AI insights and limitations</h2>
          <p>
            AI insights are informational only and are not medical, psychiatric, legal, or professional advice.
            Do not rely on NightLink for emergency or crisis support.
          </p>
        </section>

        <section>
          <h2>4. Billing and subscriptions</h2>
          <p>
            Paid credits and subscriptions are processed by Stripe. Pricing, renewal, and cancellation terms are
            shown at checkout. Premium features may change over time.
          </p>
        </section>

        <section>
          <h2>5. Acceptable use</h2>
          <ul>
            <li>Do not use NightLink for unlawful, abusive, or fraudulent activity.</li>
            <li>Do not attempt to disrupt, reverse engineer, or exploit the service.</li>
            <li>Do not upload content that violates others&apos; rights.</li>
          </ul>
        </section>

        <section>
          <h2>6. Termination</h2>
          <p>
            NightLink may suspend or terminate access for violations of these terms. You can delete your account
            from Settings at any time.
          </p>
        </section>

        <section>
          <h2>7. Contact</h2>
          <p>
            For policy questions, contact the NightLink support email listed in your app store listing or project
            documentation.
          </p>
        </section>
      </article>
    </div>
  );
}
