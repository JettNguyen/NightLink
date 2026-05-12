import './Legal.css';

export default function PrivacyPolicy() {
  return (
    <div className="page-container legal-page">
      <article className="legal-card">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: May 12, 2026</p>

        <section>
          <h2>1. Data we collect</h2>
          <ul>
            <li>Account data: email, profile details, auth identifiers.</li>
            <li>User content: dreams, comments, reactions, and activity metadata.</li>
            <li>Device data for notifications where enabled (for example push tokens).</li>
          </ul>
        </section>

        <section>
          <h2>2. How we use data</h2>
          <ul>
            <li>Provide core features such as journals, social activity, and AI insights.</li>
            <li>Process payments and subscription status updates through Stripe.</li>
            <li>Protect the app, prevent abuse, and maintain reliability.</li>
          </ul>
        </section>

        <section>
          <h2>3. AI processing</h2>
          <p>
            Dream text submitted for AI insights is sent to external model providers to generate responses.
            Do not include highly sensitive personal information in prompts.
          </p>
        </section>

        <section>
          <h2>4. Data sharing</h2>
          <p>
            We share data only with service providers required to operate the app (for example Supabase and Stripe),
            or when required by law.
          </p>
        </section>

        <section>
          <h2>5. Retention and deletion</h2>
          <p>
            You can permanently delete your account from Settings. This removes your profile and associated app data
            from the NightLink database.
          </p>
        </section>

        <section>
          <h2>6. Your rights</h2>
          <p>
            Depending on your region, you may have rights to access, correct, or delete your personal data.
          </p>
        </section>
      </article>
    </div>
  );
}
